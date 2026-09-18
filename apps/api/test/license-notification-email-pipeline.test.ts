import { describe, expect, it, vi } from "vitest";
import { EmailConfigurationService } from "../src/email/email-configuration.service";
import { EmailDeliveryAuditService } from "../src/email/email-delivery-audit.service";
import { EmailEnvelopeCryptoService } from "../src/email/email-envelope-crypto.service";
import { EmailQueueService } from "../src/email/email-queue.service";
import { LicenseNotificationService } from "../src/licensing/license-notification.service";

/**
 * Regression coverage for the prod incident: license `cmt1xtzxq2snqqr2dohl94caa`
 * had a LicenseDeliveryArtifact but ZERO AuditLog rows for template
 * `license_key_delivery`, while other templates queued+audited fine.
 *
 * Root cause: EmailEnvelopeCryptoService.encrypt() validates the envelope
 * with Zod BEFORE EmailQueueService.enqueue() ever queues the job or writes
 * an audit row. license-notification.service.ts fed env-driven fields
 * (repoUrl/supportEmail/productName) straight from process.env into that
 * envelope with no sanitization beyond "is it empty" — an invalid (but
 * non-empty) value threw a ZodError out of encrypt(), which was swallowed by
 * a bare try/catch with no queueing and no audit trail.
 *
 * Unlike license-notification.service.test.ts (which mocks EmailQueueService
 * entirely and therefore never exercises the real Zod schema), these tests
 * wire the real EmailEnvelopeCryptoService + EmailQueueService + real
 * EmailDeliveryAuditService against a fake Prisma, so they would have failed
 * against the pre-fix code.
 */

function smtpEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:3000",
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "smtp-relay.brevo.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "smtp-password-private",
    EMAIL_FROM_NAME: "WppTrack",
    EMAIL_FROM_ADDRESS: "noreply@rastrack.app",
    EMAIL_REPLY_TO: "suporte@rastrack.app",
    ...overrides,
  };
}

function buildPipeline(env: Record<string, string | undefined>) {
  const bullQueue = {
    add: vi.fn(async (_name: string, _payload: unknown, options: { jobId: string }) => ({
      id: options.jobId,
    })),
  };
  const auditRows: Record<string, unknown>[] = [];
  const prisma = {
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        auditRows.push(data);
        return data;
      }),
    },
    license: { findUnique: vi.fn() },
    licenseDeliveryArtifact: {
      upsert: vi.fn(async () => undefined),
      findUnique: vi.fn(async () => null),
    },
  };
  const configuration = new EmailConfigurationService(env);
  const crypto = new EmailEnvelopeCryptoService(configuration);
  const audit = new EmailDeliveryAuditService(prisma as never);
  const emailQueue = new EmailQueueService(bullQueue as never, configuration, crypto, audit);

  const deliverySecrets = {
    encrypt: vi.fn(() => ({ ciphertext: "c", iv: "iv", authTag: "tag" })),
    decrypt: vi.fn(),
  };
  const whatsapp = { isConfigured: vi.fn(() => false), sendLicenseKey: vi.fn(async () => true) };

  const service = new LicenseNotificationService(
    prisma as never,
    emailQueue as never,
    deliverySecrets as never,
    whatsapp as never,
    env,
  );

  return { service, bullQueue, auditRows, crypto };
}

const license = {
  id: "lic_prod_1",
  keyPrefix: "PALMUP-A766",
  buyerEmail: "dericsoncalari@gmail.com",
  buyerName: "Dericson",
  expiresAt: new Date("2027-08-19T00:00:00.000Z"),
  issuedAt: new Date("2026-08-19T00:00:00.000Z"),
};

const RAW_KEY = "PALMUP-A766-XXXX-YYYY-ZZZZ";

describe("LicenseNotificationService + real email pipeline (license_key_delivery zero-audit regression)", () => {
  it("enqueues and audits a queued row through the real crypto/queue/audit stack with valid env", async () => {
    const { service, bullQueue, auditRows } = buildPipeline(
      smtpEnv({
        LICENSE_NOTIFY_REPO_URL: "https://github.com/samoskito/nod-rastrackdash-wpp",
        LICENSE_NOTIFY_SUPPORT_EMAIL: "suporte@palmup.com.br",
      }),
    );

    const result = await service.notifyLicenseIssued({
      license,
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("queued");
    expect(bullQueue.add).toHaveBeenCalledTimes(1);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      action: "email.delivery_queued",
      targetType: "EmailDelivery",
    });
    expect((auditRows[0].afterSummary as Record<string, unknown>).template).toBe(
      "license_key_delivery",
    );
    expect(JSON.stringify(auditRows[0])).not.toContain(RAW_KEY);
  });

  it("no longer throws out of encrypt() before queueing when LICENSE_NOTIFY_REPO_URL is an invalid URL (the exact prod scenario)", async () => {
    const { service, bullQueue, auditRows } = buildPipeline(
      smtpEnv({ LICENSE_NOTIFY_REPO_URL: "not-a-valid-url" }),
    );

    const result = await service.notifyLicenseIssued({
      license,
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("queued");
    expect(bullQueue.add).toHaveBeenCalledTimes(1);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: "email.delivery_queued" });
  });

  it("no longer throws when LICENSE_NOTIFY_SUPPORT_EMAIL is an invalid email", async () => {
    const { service, bullQueue, auditRows } = buildPipeline(
      smtpEnv({ LICENSE_NOTIFY_SUPPORT_EMAIL: "not-an-email" }),
    );

    const result = await service.notifyLicenseIssued({
      license,
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("queued");
    expect(bullQueue.add).toHaveBeenCalledTimes(1);
    expect(auditRows).toHaveLength(1);
  });

  it("still writes a failed audit row (fail-closed) when a genuine Zod validation error survives sanitization", async () => {
    const { service, bullQueue, auditRows } = buildPipeline(smtpEnv());
    // keyPrefix comes from the license record, not from a sanitized env var,
    // so a control character here is a real, unpreventable Zod rejection.
    // This proves the EmailQueueService fail-closed audit-on-failure path.
    const badLicense = { ...license, keyPrefix: "bad\nprefix" };

    const result = await service.notifyLicenseIssued({
      license: badLicense,
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("failed");
    expect(bullQueue.add).not.toHaveBeenCalled();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: "email.delivery_failed" });
    expect((auditRows[0].afterSummary as Record<string, unknown>).errorCode).toBe(
      "zod_envelope",
    );
  });

  it("round-trips the expiresAt ISO string (toISOString()) through the real datetime({offset:true}) schema", async () => {
    const { service, crypto, bullQueue } = buildPipeline(smtpEnv());

    const result = await service.notifyLicenseIssued({
      license,
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("queued");
    const payload = bullQueue.add.mock.calls[0]?.[1] as Record<string, unknown>;
    const decrypted = crypto.decrypt(payload as never, payload as never);
    expect(decrypted.template).toBe("license_key_delivery");
    if (decrypted.template === "license_key_delivery") {
      expect(decrypted.data.expiresAt).toBe(license.expiresAt.toISOString());
    }
  });
});
