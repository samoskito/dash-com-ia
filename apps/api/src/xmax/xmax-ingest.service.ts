import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { Prisma, type XmaxAccount } from "@prisma/client";
import {
  hashNormalizedPhone,
  normalizePhoneIdentityWithCountry,
} from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  parseXmaxContactWebhook,
  type ParsedXmaxContactWebhook,
} from "./xmax-contact.parser";
import { XmaxCredentialEncryptionService } from "./xmax-credential-encryption.service";
import { mapXmaxTagsToEvent } from "./xmax-event-mapper";
import {
  XmaxProductionService,
  type XmaxProductionResult,
} from "./xmax-production.service";
import {
  XmaxAdapter,
  XmaxAdapterError,
  type XmaxGetContactResult,
} from "./xmax.adapter";

const publicNotFoundMessage = "Webhook nao encontrado";
const MAX_BODY_BYTES = 64 * 1024;

// Bounded multi-queue fallback (getContact fan-out) — see
// docs/spikes/2026-08-21-xmax-multi-queue-fallback.md. Kept small on purpose:
// this is a last-resort resolver, not a primary routing path.
const FALLBACK_MAX_ACCOUNTS = 12;
const FALLBACK_CONCURRENCY = 3;
const FALLBACK_PER_CALL_TIMEOUT_MS = 4_000;
const FALLBACK_BUDGET_MS = 9_000;

type FallbackResolution = {
  account: XmaxAccount;
  contact: XmaxGetContactResult;
};

export type XmaxIngestInput = {
  accountId: string;
  token: unknown;
  contentType: string | undefined;
  providerAttempt: unknown;
  rawBody: Buffer | undefined;
};

export type XmaxGlobalIngestInput = {
  ingressId: string;
  token: unknown;
  contentType: string | undefined;
  providerAttempt: unknown;
  rawBody: Buffer | undefined;
};

export type XmaxIngestResult = {
  status:
    | "observed"
    | "discarded"
    | "duplicate"
    | "failed"
    | "accepted";
  eventName?: string;
  reasonCode?: string;
  shadowMode: boolean;
  production?: XmaxProductionResult;
};

type BodyGuardResult =
  | { ok: true; body: unknown }
  | {
      ok: false;
      reasonCode: "empty_body" | "payload_too_large" | "invalid_json";
    };

@Injectable()
export class XmaxIngestService {
  private readonly logger = new Logger(XmaxIngestService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(XmaxCredentialEncryptionService)
    private readonly credentials: XmaxCredentialEncryptionService,
    @Inject(XmaxAdapter) private readonly adapter: XmaxAdapter,
    @Inject(XmaxProductionService)
    private readonly production: XmaxProductionService,
  ) {}

  /** Legacy / compat path: one URL per account, `:accountId` in the path. */
  async ingest(input: XmaxIngestInput): Promise<XmaxIngestResult> {
    const account = await this.prisma.xmaxAccount.findFirst({
      where: {
        id: input.accountId,
        status: "active",
      },
    });

    // Uniform 404 — never leak whether the account exists.
    if (!account) {
      throw new NotFoundException(publicNotFoundMessage);
    }

    const token = this.readToken(input.token);
    if (
      !this.credentials.matchesWebhookSecret(token, account.webhookSecretHash)
    ) {
      throw new NotFoundException(publicNotFoundMessage);
    }

    const providerAttempt = this.parseAttempt(input.providerAttempt);
    const guard = this.checkBodyGuards(input.rawBody);
    if (!guard.ok) {
      return this.recordAndReturn(account, {
        status: "discarded",
        reasonCode: guard.reasonCode,
        ingressKey: this.guardIngressKey(guard.reasonCode, input.rawBody),
        providerAttempt,
      });
    }

    const parsed = parseXmaxContactWebhook(guard.body, input.rawBody);
    if (!parsed.ok) {
      return this.recordAndReturn(account, {
        status: "discarded",
        reasonCode: parsed.reason,
        ingressKey: `parse:${this.hash(input.rawBody!)}`,
        providerAttempt,
      });
    }

    return this.processResolvedAccount(account, parsed.value, providerAttempt);
  }

  /**
   * Global ingress path: one URL for the whole XMAX tenant, `Queue_id` in the
   * body selects the account. Auth happens against the ingress — before any
   * routing, before any database write. `Queue_id` is only a lookup key: the
   * outbound getContact call always uses `account.queueId` from config, never
   * the payload.
   *
   * If `Queue_id` is missing or does not resolve to an active account, we
   * fall back to a bounded getContact fan-out across the ingress's other
   * active accounts (source of truth = XMAX itself) rather than discarding —
   * see docs/spikes/2026-08-21-xmax-multi-queue-fallback.md.
   */
  async ingestGlobal(input: XmaxGlobalIngestInput): Promise<XmaxIngestResult> {
    const ingress = await this.prisma.xmaxIngress.findFirst({
      where: { id: input.ingressId, status: "active" },
    });

    // Uniform 404 — never leak whether the ingress exists.
    if (!ingress) {
      throw new NotFoundException(publicNotFoundMessage);
    }

    const token = this.readToken(input.token);
    if (
      !this.credentials.matchesWebhookSecret(token, ingress.webhookSecretHash)
    ) {
      throw new NotFoundException(publicNotFoundMessage);
    }

    const providerAttempt = this.parseAttempt(input.providerAttempt);
    const bodyBytes = input.rawBody?.length ?? 0;

    const guard = this.checkBodyGuards(input.rawBody);
    if (!guard.ok) {
      this.logIngressDiscard(ingress.id, guard.reasonCode, bodyBytes);
      return { status: "discarded", reasonCode: guard.reasonCode, shadowMode: true };
    }

    const parsed = parseXmaxContactWebhook(guard.body, input.rawBody);
    if (!parsed.ok) {
      this.logIngressDiscard(ingress.id, parsed.reason, bodyBytes);
      return { status: "discarded", reasonCode: parsed.reason, shadowMode: true };
    }

    // Auth + parse(contactId) succeeded — touch lastWebhookAt now, before
    // queue resolution, so the ops stale detector reflects real traffic even
    // when Queue_id is missing/wrong or every fallback account misses.
    await this.prisma.xmaxIngress.update({
      where: { id: ingress.id },
      data: { lastWebhookAt: new Date() },
    });

    const queueId = parsed.value.queueId;

    // Fast path: single indexed lookup — never a scan — when Queue_id is
    // present and matches an active account under this ingress.
    const fastAccount = queueId
      ? await this.prisma.xmaxAccount.findFirst({
          where: { ingressId: ingress.id, queueId, status: "active" },
        })
      : null;

    if (fastAccount) {
      return this.processResolvedAccount(
        fastAccount,
        parsed.value,
        providerAttempt,
      );
    }

    // Fallback: bounded getContact fan-out across this ingress's other
    // active accounts. Cheap (max ~9 accounts, low concurrency, hard budget)
    // and fail-closed — never a DB lead scan.
    const fallback = await this.resolveAccountViaFallback(
      ingress.id,
      parsed.value.contactId,
    );

    if (fallback) {
      this.logger.log(
        JSON.stringify({
          event: "xmax_ingress.queue_resolved_via_fallback",
          ingressId: ingress.id,
          accountId: fallback.account.id,
          queueId: fallback.account.queueId,
          queueIdInPayloadHash: queueId
            ? createHash("sha256").update(queueId).digest("hex").slice(0, 16)
            : undefined,
        }),
      );
      return this.processResolvedAccount(
        fallback.account,
        parsed.value,
        providerAttempt,
        fallback.contact,
      );
    }

    // No account claims this contact anywhere in the tenant. Distinguish the
    // two discard reasons for ops: a wrong/unknown Queue_id vs. one that was
    // simply never sent.
    const reasonCode = queueId ? "queue_unresolved" : "contact_not_found_in_tenant";
    this.logIngressDiscard(ingress.id, reasonCode, bodyBytes, queueId);
    return { status: "discarded", reasonCode, shadowMode: true };
  }

  /**
   * Last-resort resolver when Queue_id is missing or doesn't match an active
   * account: ask XMAX itself which account owns this contact, bounded and
   * cheap. Loads at most FALLBACK_MAX_ACCOUNTS active accounts for this
   * ingress, then fans out getContact with low concurrency, a per-call
   * timeout, and a hard overall budget; stops at the first account that
   * returns a valid contact.
   */
  private async resolveAccountViaFallback(
    ingressId: string,
    contactId: string,
  ): Promise<FallbackResolution | null> {
    const accounts = await this.prisma.xmaxAccount.findMany({
      where: { ingressId, status: "active" },
      take: FALLBACK_MAX_ACCOUNTS,
    });
    if (accounts.length === 0) {
      return null;
    }

    const deadline = Date.now() + FALLBACK_BUDGET_MS;
    let nextIndex = 0;
    let winner: FallbackResolution | null = null;

    const worker = async (): Promise<void> => {
      for (;;) {
        if (winner || Date.now() >= deadline) {
          return;
        }
        const index = nextIndex++;
        if (index >= accounts.length) {
          return;
        }
        const account = accounts[index];

        let apiKey: string;
        try {
          apiKey = this.credentials.decrypt({
            apiKeyEncrypted: account.apiKeyEncrypted,
            apiKeyIv: account.apiKeyIv,
            apiKeyTag: account.apiKeyTag,
          });
        } catch {
          continue;
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          return;
        }

        try {
          const contact = await this.adapter.getContact({
            baseUrl: account.baseUrl,
            // From CONFIG, never from the payload — same rule as the fast path.
            queueId: account.queueId,
            apiKey,
            contactId,
            timeoutMs: Math.min(FALLBACK_PER_CALL_TIMEOUT_MS, remainingMs),
          });
          if (!winner) {
            winner = { account, contact };
          }
        } catch {
          // Not found / error on this account — try the next one.
        }
      }
    };

    const workerCount = Math.min(FALLBACK_CONCURRENCY, accounts.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return winner;
  }

  /**
   * Shared tail for both ingest paths: decrypt, getContact (always with
   * account.queueId from config), map tags, paid-only gate, semantic dedup,
   * persist, production emit. Kept as one method so the two entry points can
   * never diverge in behavior.
   */
  private async processResolvedAccount(
    account: XmaxAccount,
    parsed: ParsedXmaxContactWebhook,
    providerAttempt: number | null,
    prefetchedContact?: XmaxGetContactResult,
  ): Promise<XmaxIngestResult> {
    const { contactId, phoneHint, name } = parsed;

    // XMAX contact-edit webhooks often repeat the same body; tags change only on
    // getContact. Never short-circuit on body hash — each delivery must re-fetch.
    // ingressKey is unique per delivery (body hash + nonce) for audit only.
    // Real anti-replay is semantic dedup (accountId+contactId+eventName).
    const bodyHash = parsed.ingressKey;
    const ingressKey = `${bodyHash}:${Date.now().toString(36)}:${randomBytes(4).toString("hex")}`;

    // Touch lastWebhookAt early so ops can see deliveries even if getContact fails.
    await this.prisma.xmaxAccount.update({
      where: { id: account.id },
      data: { lastWebhookAt: new Date() },
    });

    let contact: XmaxGetContactResult;
    if (prefetchedContact) {
      // Already resolved via the fallback fan-out — don't call getContact
      // twice (budget + rate limit); just record the account as fresh.
      contact = prefetchedContact;
      await this.prisma.xmaxAccount.update({
        where: { id: account.id },
        data: {
          lastSuccessfulGetContact: new Date(),
          lastErrorCode: null,
        },
      });
    } else {
      let apiKey: string;
      try {
        apiKey = this.credentials.decrypt({
          apiKeyEncrypted: account.apiKeyEncrypted,
          apiKeyIv: account.apiKeyIv,
          apiKeyTag: account.apiKeyTag,
        });
      } catch {
        return this.recordAndReturn(account, {
          status: "failed",
          reasonCode: "credential_decrypt_failed",
          ingressKey,
          contactId,
          providerAttempt,
        });
      }

      try {
        contact = await this.adapter.getContact({
          baseUrl: account.baseUrl,
          // From CONFIG, never from the payload — the payload is a selector only.
          queueId: account.queueId,
          apiKey,
          contactId,
        });
      } catch (error) {
        const code =
          error instanceof XmaxAdapterError ? error.code : "xmax_network_error";
        await this.prisma.xmaxAccount.update({
          where: { id: account.id },
          data: {
            lastErrorCode: code,
          },
        });
        return this.recordAndReturn(account, {
          status: "failed",
          reasonCode: code,
          ingressKey,
          contactId,
          providerAttempt,
        });
      }

      await this.prisma.xmaxAccount.update({
        where: { id: account.id },
        data: {
          lastSuccessfulGetContact: new Date(),
          lastErrorCode: null,
        },
      });
    }

    const eventName = mapXmaxTagsToEvent(contact.tagIds, {
      qualifiedLeadTagIds: account.qualifiedLeadTagIds,
      purchaseTagIds: account.purchaseTagIds,
    });

    if (!eventName) {
      return this.recordAndReturn(account, {
        status: "discarded",
        reasonCode: "no_mapped_tag",
        ingressKey,
        contactId,
        tagIds: contact.tagIds,
        phoneNormalized: normalizePhoneIdentityWithCountry(
          contact.number ?? phoneHint,
          account.defaultCountryCode,
        ),
        providerAttempt,
        rawSummary: {
          name: contact.name ?? name ?? null,
          tagCount: contact.tagIds.length,
        },
      });
    }

    const phoneNormalized = normalizePhoneIdentityWithCountry(
      contact.number ?? phoneHint,
      account.defaultCountryCode,
    );
    const phoneHash = hashNormalizedPhone(phoneNormalized);

    // C2 paid-only: production accounts must not burn semantic dedup or create
    // leads/conversions when the phone is not already a paid lead in-base.
    if (this.production.isProductionEnabled(account)) {
      if (!phoneNormalized || !phoneHash) {
        return this.recordAndReturn(account, {
          status: "discarded",
          reasonCode: "missing_phone",
          eventName,
          ingressKey,
          contactId,
          tagIds: contact.tagIds,
          providerAttempt,
        });
      }

      const paid = await this.production.findPaidLead(
        account.workspaceId,
        phoneHash,
      );
      if (!paid.ok) {
        return this.recordAndReturn(account, {
          status: "discarded",
          reasonCode: paid.reasonCode,
          eventName,
          ingressKey,
          contactId,
          tagIds: contact.tagIds,
          phoneNormalized,
          providerAttempt,
          rawSummary: {
            name: contact.name ?? name ?? null,
            paidOnlyGate: true,
          },
        });
      }
    }

    // Semantic dedup: 1 event per contact+eventName forever.
    // Only reached for shadow-only accounts OR production with paid lead.
    const existingSemantic = await this.prisma.xmaxContactEventDedup.findUnique(
      {
        where: {
          accountId_contactId_eventName: {
            accountId: account.id,
            contactId,
            eventName,
          },
        },
      },
    );
    if (existingSemantic) {
      return this.recordAndReturn(account, {
        status: "duplicate",
        reasonCode: "semantic_duplicate",
        eventName,
        ingressKey,
        contactId,
        tagIds: contact.tagIds,
        phoneNormalized,
        providerAttempt,
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.xmaxContactEventDedup.create({
          data: {
            accountId: account.id,
            contactId,
            eventName,
          },
        });
        await tx.xmaxShadowEvent.create({
          data: {
            workspaceId: account.workspaceId,
            accountId: account.id,
            contactId,
            eventName,
            phoneNormalized: phoneNormalized ?? null,
            phoneHash: phoneHash ?? null,
            status: "observed",
            reasonCode: "shadow_observed",
            ingressKey,
            providerAttempt,
            tagIds: contact.tagIds,
            rawSummary: {
              name: contact.name ?? name ?? null,
              shadowMode: account.shadowMode,
              capiSendEnabled: account.capiSendEnabled,
            },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return {
          status: "duplicate",
          eventName,
          reasonCode: "race_duplicate",
          shadowMode: account.shadowMode,
        };
      }
      this.logger.warn("xmax_shadow_persist_failed");
      return this.recordAndReturn(account, {
        status: "failed",
        reasonCode: "persist_failed",
        eventName,
        ingressKey,
        contactId,
        tagIds: contact.tagIds,
        phoneNormalized,
        providerAttempt,
      });
    }

    let productionResult: XmaxProductionResult | undefined;
    if (
      this.production.isProductionEnabled(account) &&
      phoneNormalized &&
      phoneHash
    ) {
      try {
        productionResult = await this.production.emit({
          account,
          contactId,
          eventName,
          phoneNormalized,
          phoneHash,
          contactName: contact.name ?? name ?? null,
          tagIds: contact.tagIds,
        });
      } catch {
        this.logger.warn("xmax_production_emit_failed");
        productionResult = {
          attempted: true,
          reasonCode: "production_emit_failed",
        };
      }
    }

    return {
      status: "observed",
      eventName,
      reasonCode: productionResult?.queued
        ? "production_queued"
        : productionResult?.attempted
          ? (productionResult.reasonCode ?? "production_recorded")
          : "shadow_observed",
      shadowMode: account.shadowMode,
      production: productionResult,
    };
  }

  private readToken(token: unknown): string | undefined {
    return typeof token === "string" && token.trim() ? token.trim() : undefined;
  }

  private checkBodyGuards(rawBody: Buffer | undefined): BodyGuardResult {
    if (!rawBody || rawBody.length === 0) {
      return { ok: false, reasonCode: "empty_body" };
    }
    if (rawBody.length > MAX_BODY_BYTES) {
      return { ok: false, reasonCode: "payload_too_large" };
    }
    try {
      return { ok: true, body: JSON.parse(rawBody.toString("utf8")) };
    } catch {
      return { ok: false, reasonCode: "invalid_json" };
    }
  }

  private guardIngressKey(
    reasonCode: "empty_body" | "payload_too_large" | "invalid_json",
    rawBody: Buffer | undefined,
  ): string {
    if (reasonCode === "empty_body") return "empty";
    if (reasonCode === "payload_too_large") {
      return `oversized:${rawBody?.length ?? 0}`;
    }
    return `badjson:${this.hash(rawBody!)}`;
  }

  /** No account is resolved yet — log only, no PII, no DB write. */
  private logIngressDiscard(
    ingressId: string,
    reasonCode: string,
    bodyBytes: number,
    queueId?: string,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: "xmax_ingress.queue_unresolved",
        ingressId,
        reasonCode,
        bodyBytes,
        queueIdHash: queueId
          ? createHash("sha256").update(queueId).digest("hex").slice(0, 16)
          : undefined,
      }),
    );
  }

  private async recordAndReturn(
    account: {
      id: string;
      workspaceId: string;
      shadowMode?: boolean;
    },
    input: {
      status: "observed" | "discarded" | "duplicate" | "failed";
      reasonCode: string;
      ingressKey: string;
      eventName?: string;
      contactId?: string;
      tagIds?: string[];
      phoneNormalized?: string;
      providerAttempt?: number | null;
      rawSummary?: Prisma.InputJsonValue;
    },
  ): Promise<XmaxIngestResult> {
    try {
      await this.prisma.xmaxShadowEvent.create({
        data: {
          workspaceId: account.workspaceId,
          accountId: account.id,
          contactId: input.contactId ?? null,
          eventName: input.eventName ?? null,
          phoneNormalized: input.phoneNormalized ?? null,
          phoneHash: hashNormalizedPhone(input.phoneNormalized) ?? null,
          status: input.status,
          reasonCode: input.reasonCode,
          ingressKey: input.ingressKey,
          providerAttempt: input.providerAttempt ?? null,
          tagIds: input.tagIds ?? [],
          rawSummary: input.rawSummary,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return {
          status: "duplicate",
          eventName: input.eventName,
          reasonCode: "transport_duplicate",
          shadowMode: account.shadowMode ?? true,
        };
      }
      this.logger.warn("xmax_shadow_log_failed");
    }

    return {
      status: input.status,
      eventName: input.eventName,
      reasonCode: input.reasonCode,
      shadowMode: account.shadowMode ?? true,
    };
  }

  private parseAttempt(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    return null;
  }

  private hash(buf: Buffer): string {
    return createHash("sha256").update(buf).digest("hex").slice(0, 32);
  }
}
