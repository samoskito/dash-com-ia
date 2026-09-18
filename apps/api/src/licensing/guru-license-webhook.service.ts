import { createHash, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma, type License, type LicenseInterval, type LicenseStatus } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  RUNTIME_ENV,
  type RuntimeEnv,
} from "../common/runtime/runtime.module";
import { LicenseNotificationService } from "./license-notification.service";
import { LicensingService } from "./licensing.service";

const PROVIDER = "guru";
const DEFAULT_PRODUCT_SKU = "rastrackdash_annual";
const DEFAULT_INTERVAL: LicenseInterval = "annual";
const UNKNOWN_TRANSACTION_ID = "unknown";
const UNKNOWN_EVENT_TYPE = "unknown";
const INVALID_EVENT_TYPE_PREFIX = "invalid:";
const TERMINAL_SUCCESS_STATUSES = new Set([
  "license_issued",
  "license_renewed",
  "license_revoked",
  "ignored_unknown",
  "ignored_duplicate_license",
]);
const RETRYABLE_STATUSES = new Set(["pending", "error", "signature_invalid"]);

// Includes Digital Manager Guru subscription status labels (PT + EN).
const PURCHASE_EVENTS = new Set([
  "purchase_approved",
  "purchase",
  "paid",
  "approved",
  "subscription_created",
  "ativa",
  "active",
  "iniciada",
  "started",
  "trial",
]);
const RENEWAL_EVENTS = new Set([
  "renewal_approved",
  "renewed",
  "subscription_renewed",
  "recurrent_payment",
  "renovada",
]);
const REFUND_EVENTS = new Set([
  "refund",
  "refunded",
  "payment_refunded",
  "cancelada",
  "canceled",
  "cancelled",
  "expirada",
  "expired",
  "inativa",
  "inactive",
]);
const CHARGEBACK_EVENTS = new Set(["chargeback", "chargedback"]);
// "atrasada" is overdue — do not revoke automatically (stays unknown/ignored).

const SENSITIVE_KEY = /password|secret|token|authorization|api[_-]?key|rawkey/i;
const MAX_SANITIZE_DEPTH = 4;
const MAX_SANITIZE_KEYS = 40;
const MAX_SANITIZE_ARRAY = 20;
const MAX_SANITIZE_STRING = 512;
const MAX_SANITIZE_JSON = 8192;

export type GuruWebhookHandleResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type NormalizedGuruEvent = {
  eventType: string;
  externalTransactionId: string | undefined;
  buyerEmail: string | undefined;
  buyerName: string | undefined;
  phone: string | undefined;
  productSku: string;
  interval: LicenseInterval;
};

type MappedKind = "purchase" | "renewal" | "refund" | "chargeback" | "unknown";

type WebhookEventRow = { id: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function nestedString(
  record: Record<string, unknown>,
  parent: string,
  child: string,
): string | undefined {
  const nested = record[parent];
  if (!isRecord(nested)) {
    return undefined;
  }
  return asNonEmptyString(nested[child]);
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = asNonEmptyString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function parseInterval(value: unknown): LicenseInterval {
  if (value === "monthly" || value === "semiannual" || value === "annual") {
    return value;
  }
  return DEFAULT_INTERVAL;
}

function mapEventKind(eventType: string): MappedKind {
  if (PURCHASE_EVENTS.has(eventType)) {
    return "purchase";
  }
  if (RENEWAL_EVENTS.has(eventType)) {
    return "renewal";
  }
  if (REFUND_EVENTS.has(eventType)) {
    return "refund";
  }
  if (CHARGEBACK_EVENTS.has(eventType)) {
    return "chargeback";
  }
  return "unknown";
}

function addInterval(start: Date, interval: LicenseInterval): Date {
  const expires = new Date(start.getTime());
  if (interval === "monthly") {
    expires.setUTCMonth(expires.getUTCMonth() + 1);
    return expires;
  }
  if (interval === "semiannual") {
    expires.setUTCMonth(expires.getUTCMonth() + 6);
    return expires;
  }
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  return expires;
}

function laterDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function isUniqueConstraint(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function secretsMatch(
  expected: string | undefined,
  received: string | undefined,
): boolean {
  const expectedHash = createHash("sha256")
    .update(expected ?? "", "utf8")
    .digest();
  const receivedHash = createHash("sha256")
    .update(received ?? "", "utf8")
    .digest();
  const equal = timingSafeEqual(expectedHash, receivedHash);
  return Boolean(expected && received && equal);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_SANITIZE_DEPTH) {
    return undefined;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return Number.isFinite(value as number) || value === null || typeof value === "boolean"
      ? value
      : undefined;
  }
  if (typeof value === "string") {
    return value.length > MAX_SANITIZE_STRING
      ? value.slice(0, MAX_SANITIZE_STRING)
      : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SANITIZE_ARRAY)
      .map((item) => sanitizeValue(item, depth + 1));
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value).slice(0, MAX_SANITIZE_KEYS)) {
    if (SENSITIVE_KEY.test(key)) {
      continue;
    }
    const cleaned = sanitizeValue(nested, depth + 1);
    if (cleaned !== undefined) {
      sanitized[key] = cleaned;
    }
  }
  return sanitized;
}

function asInputJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function sanitizePayload(body: unknown): Prisma.InputJsonObject {
  const sanitized = sanitizeValue(body, 0);
  if (!isRecord(sanitized)) {
    return {};
  }
  try {
    const encoded = JSON.stringify(sanitized);
    if (encoded.length > MAX_SANITIZE_JSON) {
      return { truncated: true };
    }
    return asInputJsonObject(sanitized);
  } catch {
    return { truncated: true };
  }
}

function deepString(
  record: Record<string, unknown>,
  path: string[],
): string | undefined {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return asNonEmptyString(current);
}

function normalizePhone(record: Record<string, unknown>): string | undefined {
  // Digital Manager Guru: subscriber.phone_local_code + subscriber.phone_number
  const local =
    nestedString(record, "subscriber", "phone_local_code") ??
    nestedString(record, "contact", "phone_local_code");
  const number =
    nestedString(record, "subscriber", "phone_number") ??
    nestedString(record, "contact", "phone_number") ??
    nestedString(record, "subscriber", "phone") ??
    nestedString(record, "contact", "phone") ??
    firstString(record, ["phone", "whatsapp"]);
  if (!number) {
    return undefined;
  }
  const digitsNumber = number.replace(/\D/g, "");
  const digitsLocal = (local ?? "").replace(/\D/g, "");
  if (!digitsNumber) {
    return undefined;
  }
  if (digitsLocal && !digitsNumber.startsWith(digitsLocal)) {
    return `${digitsLocal}${digitsNumber}`;
  }
  return digitsNumber;
}

function normalizeInterval(record: Record<string, unknown>): LicenseInterval {
  const direct = parseInterval(record.interval);
  if (record.interval === "monthly" || record.interval === "semiannual" || record.interval === "annual") {
    return direct;
  }
  const intervalType =
    deepString(record, ["product", "offer", "plan", "interval_type"]) ??
    deepString(record, ["next_product", "offer", "plan", "interval_type"]);
  if (intervalType === "year" || intervalType === "yearly" || intervalType === "annual") {
    return "annual";
  }
  if (intervalType === "month" || intervalType === "monthly") {
    return "monthly";
  }
  if (intervalType === "semiannual" || intervalType === "semester") {
    return "semiannual";
  }
  return DEFAULT_INTERVAL;
}

/**
 * Digital Manager Guru subscription webhooks look like:
 * {
 *   id/subscription_code: "sub_...",
 *   last_status: "active"|"inactive"|...,
 *   webhook_type: "subscription",
 *   subscriber: { email, name, phone_local_code, phone_number },
 *   current_invoice: { status: "paid" },
 *   last_transaction: { status: "approved", contact: {...} }
 * }
 * Root `status`/`eventType` are often absent — do not rely on them alone.
 */
function resolveGuruEventType(record: Record<string, unknown>): string {
  const lastStatus = (
    firstString(record, ["last_status", "status", "eventType", "type", "event"]) ??
    ""
  ).toLowerCase();
  const txnStatus = (
    deepString(record, ["last_transaction", "status"]) ?? ""
  ).toLowerCase();
  const invoiceStatus = (
    deepString(record, ["current_invoice", "status"]) ?? ""
  ).toLowerCase();
  const canceledAt =
    deepString(record, ["dates", "canceled_at"]) ??
    deepString(record, ["cancelled_by", "date"]);
  const hasCancelMarker = Boolean(canceledAt && canceledAt.trim());

  // Explicit cancellation / expiry always wins.
  if (
    hasCancelMarker ||
    ["cancelada", "canceled", "cancelled", "expirada", "expired"].includes(
      lastStatus,
    )
  ) {
    return lastStatus || "cancelada";
  }

  // Happy-path subscription labels from Guru UI/API.
  if (
    ["ativa", "active", "iniciada", "started", "trial", "trialing"].includes(
      lastStatus,
    )
  ) {
    return lastStatus;
  }

  // Paid/approved money movement => issue even if last_status is still settling
  // (real payload observed: last_status=inactive + invoice paid + txn approved).
  if (
    txnStatus === "approved" ||
    txnStatus === "paid" ||
    invoiceStatus === "paid"
  ) {
    // inactive without cancel markers after a paid invoice still means access granted.
    if (!lastStatus || lastStatus === "inactive" || lastStatus === "inativa") {
      return "approved";
    }
    return lastStatus;
  }

  if (lastStatus) {
    return lastStatus;
  }
  return UNKNOWN_EVENT_TYPE;
}

function normalizeEvent(body: unknown): NormalizedGuruEvent {
  const record = isRecord(body) ? body : {};
  const eventType = resolveGuruEventType(record);

  const externalTransactionId =
    firstString(record, [
      "subscription_code",
      "id",
      "transactionId",
      "transaction_id",
      "externalTransactionId",
      "internal_id",
    ]) ??
    nestedString(record, "payment", "id") ??
    nestedString(record, "subscription", "id") ??
    nestedString(record, "last_transaction", "id") ??
    deepString(record, ["current_invoice", "subscription_id"]);

  const buyerEmail =
    nestedString(record, "subscriber", "email") ??
    nestedString(record, "contact", "email") ??
    deepString(record, ["last_transaction", "contact", "email"]) ??
    firstString(record, ["email", "buyerEmail"]);

  const buyerName =
    nestedString(record, "subscriber", "name") ??
    deepString(record, ["last_transaction", "contact", "name"]) ??
    firstString(record, ["name", "buyerName"]);

  const phone = normalizePhone(record) ??
    deepString(record, ["last_transaction", "contact", "phone_number"]);

  const productSku =
    firstString(record, ["productSku", "product_sku"]) ??
    deepString(record, ["product", "offer", "id"]) ??
    deepString(record, ["product", "marketplace_id"]) ??
    DEFAULT_PRODUCT_SKU;

  return {
    eventType,
    externalTransactionId,
    buyerEmail,
    buyerName,
    phone,
    productSku,
    interval: normalizeInterval(record),
  };
}

function safeBody(resultStatus: string, extra?: Record<string, unknown>) {
  const body: Record<string, unknown> = { resultStatus, ...extra };
  delete body.rawKey;
  delete body.rawkey;
  return body;
}

@Injectable()
export class GuruLicenseWebhookService {
  private readonly logger = new Logger(GuruLicenseWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licensing: LicensingService,
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
    // Required, not @Optional(): LicensingModule always provides
    // LicenseNotificationService, and an @Optional() dependency here let a
    // future DI misconfiguration silently drop notify() to a no-op (see
    // license-notification-di.test.ts for the sibling incident this class
    // of bug caused in LicenseNotificationService itself). Failing to
    // resolve this now throws at boot instead of silently skipping every
    // license delivery.
    @Inject(LicenseNotificationService)
    private readonly notifications: LicenseNotificationService,
  ) {}

  async handle(
    body: unknown,
    secretHeader: string | undefined,
  ): Promise<GuruWebhookHandleResult> {
    const normalized = normalizeEvent(body);
    const sanitized = sanitizePayload(body);
    const signatureValid = secretsMatch(
      this.env.GURU_WEBHOOK_SECRET,
      secretHeader,
    );

    if (!signatureValid) {
      await this.persistEvent({
        eventType: `${INVALID_EVENT_TYPE_PREFIX}${normalized.eventType}`,
        externalTransactionId:
          normalized.externalTransactionId ?? UNKNOWN_TRANSACTION_ID,
        signatureValid: false,
        resultStatus: "signature_invalid",
        processedAt: new Date(),
        rawPayloadSanitized: sanitized,
      });
      this.logger.warn("guru_webhook_signature_invalid");
      return {
        httpStatus: 401,
        body: safeBody("signature_invalid"),
      };
    }

    if (!normalized.externalTransactionId) {
      await this.persistEvent({
        eventType: normalized.eventType,
        externalTransactionId: UNKNOWN_TRANSACTION_ID,
        signatureValid: true,
        resultStatus: "error",
        processedAt: new Date(),
        rawPayloadSanitized: sanitized,
      });
      return {
        httpStatus: 400,
        body: safeBody("error", { message: "externalTransactionId is required" }),
      };
    }

    const created = await this.persistEvent({
      eventType: normalized.eventType,
      externalTransactionId: normalized.externalTransactionId,
      signatureValid: true,
      resultStatus: "pending",
      rawPayloadSanitized: sanitized,
    });

    if (created === "duplicate") {
      return {
        httpStatus: 200,
        body: safeBody("ignored_duplicate"),
      };
    }

    if (created === null) {
      this.logger.warn("guru_webhook_event_persist_failed");
      return {
        httpStatus: 500,
        body: safeBody("error"),
      };
    }

    try {
      return await this.dispatch(created, normalized);
    } catch {
      this.logger.warn("guru_webhook_handle_failed");
      await this.finalizeEvent(created.id, "error");
      return {
        httpStatus: 500,
        body: safeBody("error"),
      };
    }
  }

  private async dispatch(
    event: WebhookEventRow,
    normalized: NormalizedGuruEvent,
  ): Promise<GuruWebhookHandleResult> {
    const kind = mapEventKind(normalized.eventType);

    if (kind === "purchase") {
      const issued = await this.licensing.issueLicenseForPurchase({
        buyerEmail: normalized.buyerEmail,
        buyerName: normalized.buyerName,
        guruTransactionId: normalized.externalTransactionId,
        productSku: normalized.productSku,
        interval: normalized.interval,
      });
      // Only the first issue delivers email/WA. Later status webhooks
      // (Iniciada → Ativa, retries) reuse the license and must NOT renotify.
      if (issued.created && issued.rawKey) {
        await this.notify(issued, normalized.phone);
        await this.finalizeEvent(event.id, "license_issued");
        return {
          httpStatus: 200,
          body: safeBody("license_issued"),
        };
      }
      await this.finalizeEvent(event.id, "ignored_duplicate_license");
      return {
        httpStatus: 200,
        body: safeBody("ignored_duplicate_license"),
      };
    }

    if (kind === "renewal") {
      const license = await this.findLicense(normalized);
      if (!license) {
        await this.finalizeEvent(event.id, "error");
        return {
          httpStatus: 200,
          body: safeBody("error"),
        };
      }
      const interval = parseInterval(license.interval);
      const start = laterDate(new Date(), license.expiresAt);
      await this.prisma.license.update({
        where: { id: license.id },
        data: { expiresAt: addInterval(start, interval) },
      });
      await this.finalizeEvent(event.id, "license_renewed");
      return {
        httpStatus: 200,
        body: safeBody("license_renewed"),
      };
    }

    if (kind === "refund" || kind === "chargeback") {
      const license = await this.findLicense(normalized);
      if (!license) {
        await this.finalizeEvent(event.id, "error");
        return {
          httpStatus: 200,
          body: safeBody("error"),
        };
      }
      const status: LicenseStatus = kind === "refund" ? "refunded" : "chargeback";
      await this.prisma.license.update({
        where: { id: license.id },
        data: {
          status,
          revokedAt: new Date(),
        },
      });
      await this.finalizeEvent(event.id, "license_revoked");
      return {
        httpStatus: 200,
        body: safeBody("license_revoked"),
      };
    }

    await this.finalizeEvent(event.id, "ignored_unknown");
    return {
      httpStatus: 200,
      body: safeBody("ignored_unknown"),
    };
  }

  private async notify(
    issued: { license: License; rawKey: string | null },
    phoneE164: string | undefined,
  ): Promise<void> {
    if (!issued.rawKey) {
      // Should not happen from dispatch()'s current call site (it only
      // calls notify() when rawKey is truthy), but guard defensively so a
      // future refactor can't silently drop delivery without a trace.
      // Never log the key itself — id/prefix only.
      this.logger.warn(
        `guru_webhook_notify_skipped license=${issued.license.id} keyPrefix=${issued.license.keyPrefix} reason=missing_raw_key`,
      );
      return;
    }
    try {
      const result = await this.notifications.notifyLicenseIssued({
        license: {
          id: issued.license.id,
          keyPrefix: issued.license.keyPrefix,
          buyerEmail: issued.license.buyerEmail,
          buyerName: issued.license.buyerName,
          expiresAt: issued.license.expiresAt,
          issuedAt: issued.license.issuedAt,
        },
        rawKey: issued.rawKey,
        phoneE164: phoneE164 ?? null,
        reason: "issue",
      });
      // Delivery status/reason codes only — never the raw key or buyer PII.
      this.logger.log(
        `guru_webhook_notify_result license=${issued.license.id} email=${result.email} emailReason=${result.emailReason ?? "none"} whatsapp=${result.whatsapp} whatsappReason=${result.whatsappReason ?? "none"}`,
      );
    } catch {
      this.logger.warn(`guru_webhook_notify_failed license=${issued.license.id}`);
    }
  }

  private async findLicense(
    normalized: NormalizedGuruEvent,
  ): Promise<License | null> {
    const byTransaction = await this.prisma.license.findUnique({
      where: { guruTransactionId: normalized.externalTransactionId },
    });
    if (byTransaction) {
      return byTransaction;
    }
    if (!normalized.buyerEmail) {
      return null;
    }
    return this.prisma.license.findFirst({
      where: {
        buyerEmail: normalized.buyerEmail,
        productSku: normalized.productSku,
        status: "active",
      },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    });
  }

  private async persistEvent(data: {
    eventType: string;
    externalTransactionId: string;
    signatureValid: boolean;
    resultStatus: string;
    processedAt?: Date;
    rawPayloadSanitized: Prisma.InputJsonObject;
  }): Promise<WebhookEventRow | "duplicate" | null> {
    try {
      return await this.prisma.licenseWebhookEvent.create({
        data: {
          provider: PROVIDER,
          eventType: data.eventType,
          externalTransactionId: data.externalTransactionId,
          signatureValid: data.signatureValid,
          resultStatus: data.resultStatus,
          processedAt: data.processedAt,
          rawPayloadSanitized: data.rawPayloadSanitized,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        return this.resolveDuplicateEvent(
          data.eventType,
          data.externalTransactionId,
        );
      }
      this.logger.warn("guru_webhook_event_persist_failed");
      return null;
    }
  }

  private async resolveDuplicateEvent(
    eventType: string,
    externalTransactionId: string,
  ): Promise<WebhookEventRow | "duplicate" | null> {
    try {
      const existing = await this.prisma.licenseWebhookEvent.findFirst({
        where: {
          provider: PROVIDER,
          eventType,
          externalTransactionId,
        },
        select: { id: true, resultStatus: true, signatureValid: true },
      });
      if (!existing) {
        this.logger.warn("guru_webhook_event_persist_failed");
        return null;
      }
      if (
        existing.signatureValid === false ||
        RETRYABLE_STATUSES.has(existing.resultStatus)
      ) {
        return { id: existing.id };
      }
      if (TERMINAL_SUCCESS_STATUSES.has(existing.resultStatus)) {
        return "duplicate";
      }
      this.logger.warn("guru_webhook_event_persist_failed");
      return null;
    } catch {
      this.logger.warn("guru_webhook_event_persist_failed");
      return null;
    }
  }

  private async finalizeEvent(
    eventId: string,
    resultStatus: string,
  ): Promise<void> {
    try {
      await this.prisma.licenseWebhookEvent.update({
        where: { id: eventId },
        data: {
          processedAt: new Date(),
          resultStatus,
        },
      });
    } catch {
      this.logger.warn("guru_webhook_event_finalize_failed");
    }
  }
}
