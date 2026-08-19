import { describe, expect, it, vi } from "vitest";
import { LicenseNotificationService } from "../src/licensing/license-notification.service";

const RAW_KEY = "PALMUP-ABCD-1234-EFGH-5678";

function baseLicense(overrides: Partial<{
  buyerEmail: string | null;
  buyerName: string | null;
}> = {}) {
  return {
    id: "lic_1",
    keyPrefix: "PALMUP-ABCD",
    buyerEmail: "aluno@example.com",
    buyerName: "Aluno",
    expiresAt: new Date("2027-08-19T00:00:00.000Z"),
    issuedAt: new Date("2026-08-19T00:00:00.000Z"),
    ...overrides,
  };
}

function createHarness(options: { emailEnabled?: boolean } = {}) {
  const artifacts = new Map<string, Record<string, unknown>>();

  const prisma = {
    licenseDeliveryArtifact: {
      upsert: vi.fn(async ({ where, create }: { where: { licenseId: string }; create: Record<string, unknown> }) => {
        artifacts.set(where.licenseId, create);
        return create;
      }),
    },
  };

  const deliverySecrets = {
    encrypt: vi.fn((licenseId: string, rawKey: string) => ({
      ciphertext: `ct:${licenseId}:${rawKey}`,
      iv: "iv",
      authTag: "tag",
    })),
  };

  const emailQueue = {
    isEnabled: vi.fn(() => options.emailEnabled ?? true),
    enqueue: vi.fn(async (_input: Record<string, unknown>) => ({
      deliveryId: "d1",
      jobId: "j1",
      status: "queued" as const,
    })),
  };

  const whatsapp = {
    isConfigured: vi.fn(() => false),
    sendLicenseKey: vi.fn(async () => true),
  };

  const service = new LicenseNotificationService(
    prisma as never,
    emailQueue as never,
    deliverySecrets as never,
    whatsapp as never,
    {},
  );

  return { service, prisma, deliverySecrets, emailQueue, whatsapp, artifacts };
}

describe("LicenseNotificationService", () => {
  it("stores the delivery artifact on issue using the delivery secret encryption", async () => {
    const { service, deliverySecrets, prisma } = createHarness();

    await service.storeDeliveryArtifact("lic_1", RAW_KEY, new Date("2026-08-19T00:00:00.000Z"));

    expect(deliverySecrets.encrypt).toHaveBeenCalledWith("lic_1", RAW_KEY);
    expect(prisma.licenseDeliveryArtifact.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.licenseDeliveryArtifact.upsert.mock.calls[0]?.[0] as {
      where: { licenseId: string };
      create: { expiresAt: Date };
    };
    expect(call.where).toEqual({ licenseId: "lic_1" });
    expect(call.create.expiresAt.toISOString()).toBe("2026-08-26T00:00:00.000Z");
  });

  it("queues the license email when the buyer has an email and email is enabled", async () => {
    const { service, emailQueue, prisma } = createHarness();

    const result = await service.notifyLicenseIssued({
      license: baseLicense(),
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("queued");
    expect(emailQueue.enqueue).toHaveBeenCalledTimes(1);
    const input = emailQueue.enqueue.mock.calls[0]?.[0] as {
      workspaceId: string | null;
      action: { type: string; id: string; version: string };
      envelope: { template: string; data: { licenseKey: string } };
    };
    expect(input.workspaceId).toBeNull();
    expect(input.action).toEqual({
      type: "License",
      id: "lic_1",
      version: "issue:2026-08-19T00:00:00.000Z",
    });
    expect(input.envelope.template).toBe("license_key_delivery");
    expect(input.envelope.data.licenseKey).toBe(RAW_KEY);
    // artifact stored because reason === issue
    expect(prisma.licenseDeliveryArtifact.upsert).toHaveBeenCalledTimes(1);
  });

  it("skips email when there is no buyer email", async () => {
    const { service, emailQueue } = createHarness();

    const result = await service.notifyLicenseIssued({
      license: baseLicense({ buyerEmail: null }),
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("skipped");
    expect(emailQueue.enqueue).not.toHaveBeenCalled();
  });

  it("skips email when the email queue is disabled", async () => {
    const { service, emailQueue } = createHarness({ emailEnabled: false });

    const result = await service.notifyLicenseIssued({
      license: baseLicense(),
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("skipped");
    expect(emailQueue.enqueue).not.toHaveBeenCalled();
  });

  it("returns failed and does not throw when the email queue throws", async () => {
    const { service, emailQueue } = createHarness();
    emailQueue.enqueue.mockRejectedValueOnce(new Error("queue down"));

    const result = await service.notifyLicenseIssued({
      license: baseLicense(),
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.email).toBe("failed");
  });

  it("skips whatsapp when no phone is provided", async () => {
    const { service, whatsapp } = createHarness();

    const result = await service.notifyLicenseIssued({
      license: baseLicense(),
      rawKey: RAW_KEY,
      reason: "issue",
    });

    expect(result.whatsapp).toBe("skipped");
    expect(whatsapp.sendLicenseKey).not.toHaveBeenCalled();
  });

  it("skips whatsapp when not configured even with a phone", async () => {
    const { service, whatsapp } = createHarness();

    const result = await service.notifyLicenseIssued({
      license: baseLicense(),
      rawKey: RAW_KEY,
      phoneE164: "+5511999998888",
      reason: "issue",
    });

    expect(result.whatsapp).toBe("skipped");
    expect(whatsapp.sendLicenseKey).not.toHaveBeenCalled();
  });

  it("sends whatsapp when configured and a phone is provided", async () => {
    const { service, whatsapp } = createHarness();
    whatsapp.isConfigured.mockReturnValue(true);

    const result = await service.notifyLicenseIssued({
      license: baseLicense(),
      rawKey: RAW_KEY,
      phoneE164: "+5511999998888",
      reason: "issue",
    });

    expect(result.whatsapp).toBe("sent");
    expect(whatsapp.sendLicenseKey).toHaveBeenCalledWith(
      "+5511999998888",
      expect.stringContaining(RAW_KEY),
    );
  });

  it("does not store a delivery artifact on resend", async () => {
    const { service, prisma } = createHarness();

    await service.notifyLicenseIssued({
      license: baseLicense(),
      rawKey: RAW_KEY,
      reason: "resend",
      resendNonce: "nonce-1",
    });

    expect(prisma.licenseDeliveryArtifact.upsert).not.toHaveBeenCalled();
  });

  it("never throws even if the delivery artifact upsert fails", async () => {
    const { service, prisma } = createHarness();
    prisma.licenseDeliveryArtifact.upsert.mockRejectedValueOnce(new Error("db down"));

    await expect(
      service.notifyLicenseIssued({
        license: baseLicense(),
        rawKey: RAW_KEY,
        reason: "issue",
      }),
    ).resolves.toMatchObject({ email: "queued" });
  });
});
