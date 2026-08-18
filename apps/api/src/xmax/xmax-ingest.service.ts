import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  hashNormalizedPhone,
  normalizePhoneIdentityWithCountry,
} from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseXmaxContactWebhook } from "./xmax-contact.parser";
import { XmaxCredentialEncryptionService } from "./xmax-credential-encryption.service";
import { mapXmaxTagsToEvent } from "./xmax-event-mapper";
import { XmaxAdapter, XmaxAdapterError } from "./xmax.adapter";

const publicNotFoundMessage = "Webhook nao encontrado";
const MAX_BODY_BYTES = 64 * 1024;

export type XmaxIngestInput = {
  accountId: string;
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
  shadowMode: true;
};

@Injectable()
export class XmaxIngestService {
  private readonly logger = new Logger(XmaxIngestService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(XmaxCredentialEncryptionService)
    private readonly credentials: XmaxCredentialEncryptionService,
    @Inject(XmaxAdapter) private readonly adapter: XmaxAdapter,
  ) {}

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

    const token =
      typeof input.token === "string" && input.token.trim()
        ? input.token.trim()
        : undefined;
    if (
      !this.credentials.matchesWebhookSecret(token, account.webhookSecretHash)
    ) {
      throw new NotFoundException(publicNotFoundMessage);
    }

    if (!input.rawBody || input.rawBody.length === 0) {
      return this.recordAndReturn(account, {
        status: "discarded",
        reasonCode: "empty_body",
        ingressKey: "empty",
        providerAttempt: this.parseAttempt(input.providerAttempt),
      });
    }

    if (input.rawBody.length > MAX_BODY_BYTES) {
      return this.recordAndReturn(account, {
        status: "discarded",
        reasonCode: "payload_too_large",
        ingressKey: `oversized:${input.rawBody.length}`,
        providerAttempt: this.parseAttempt(input.providerAttempt),
      });
    }

    let body: unknown;
    try {
      body = JSON.parse(input.rawBody.toString("utf8"));
    } catch {
      return this.recordAndReturn(account, {
        status: "discarded",
        reasonCode: "invalid_json",
        ingressKey: `badjson:${this.hash(input.rawBody)}`,
        providerAttempt: this.parseAttempt(input.providerAttempt),
      });
    }

    const parsed = parseXmaxContactWebhook(body, input.rawBody);
    if (!parsed.ok) {
      return this.recordAndReturn(account, {
        status: "discarded",
        reasonCode: parsed.reason,
        ingressKey: `parse:${this.hash(input.rawBody)}`,
        providerAttempt: this.parseAttempt(input.providerAttempt),
      });
    }

    const { contactId, phoneHint, name, ingressKey } = parsed.value;
    const providerAttempt = this.parseAttempt(input.providerAttempt);

    // Transport dedup: same ingressKey on this account → duplicate (no re-processing).
    const existingIngress = await this.prisma.xmaxShadowEvent.findUnique({
      where: {
        accountId_ingressKey: {
          accountId: account.id,
          ingressKey,
        },
      },
      select: { id: true, status: true, eventName: true, reasonCode: true },
    });
    if (existingIngress) {
      return {
        status: "duplicate",
        eventName: existingIngress.eventName ?? undefined,
        reasonCode: existingIngress.reasonCode ?? "transport_duplicate",
        shadowMode: true,
      };
    }

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

    let contact;
    try {
      contact = await this.adapter.getContact({
        baseUrl: account.baseUrl,
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
          lastWebhookAt: new Date(),
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
        lastWebhookAt: new Date(),
        lastSuccessfulGetContact: new Date(),
        lastErrorCode: null,
      },
    });

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

    // Semantic dedup: 1 event per contact+eventName forever.
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
        phoneNormalized: normalizePhoneIdentityWithCountry(
          contact.number ?? phoneHint,
          account.defaultCountryCode,
        ),
        providerAttempt,
      });
    }

    const phoneNormalized = normalizePhoneIdentityWithCountry(
      contact.number ?? phoneHint,
      account.defaultCountryCode,
    );
    const phoneHash = hashNormalizedPhone(phoneNormalized);

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
              shadowMode: true,
              capiSendEnabled: false,
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
          shadowMode: true,
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

    // X1: shadow only — never enqueue CAPI / never create conversion rows.
    return {
      status: "observed",
      eventName,
      reasonCode: "shadow_observed",
      shadowMode: true,
    };
  }

  private async recordAndReturn(
    account: {
      id: string;
      workspaceId: string;
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
          shadowMode: true,
        };
      }
      this.logger.warn("xmax_shadow_log_failed");
    }

    return {
      status: input.status,
      eventName: input.eventName,
      reasonCode: input.reasonCode,
      shadowMode: true,
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
