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

  const licenses = new Map<string, Record<string, unknown>>([
    [
      "lic_1",
      {
        id: "lic_1",
        keyPrefix: "PALMUP-ABCD",
        buyerEmail: "aluno@example.com",
        buyerName: "Aluno",
        expiresAt: new Date("2027-08-19T00:00:00.000Z"),
        issuedAt: new Date("2026-08-19T00:00:00.000Z"),
      },
    ],
  ]);

  const prisma = {
    license: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return licenses.get(where.id) ?? null;
      }),
    },
    licenseDeliveryArtifact: {
      upsert: vi.fn(async ({ where, create }: { where: { licenseId: string }; create: Record<string, unknown> }) => {
        artifacts.set(where.licenseId, create);
        return create;
      }),
      findUnique: vi.fn(async ({ where }: { where: { licenseId: string } }) => {
        return artifacts.get(where.licenseId) ?? null;
      }),
    },
  };

  const deliverySecrets = {
    encrypt: vi.fn((licenseId: string, rawKey: string) => ({
      ciphertext: Buffer.from(`${licenseId}:${rawKey}`).toString("base64"),
      iv: "iv",
      authTag: "tag",
    })),
    decrypt: vi.fn((licenseId: string, artifact: { ciphertext: string }) => {
      const decoded = Buffer.from(artifact.ciphertext, "base64").toString("utf8");
      const prefix = `${licenseId}:`;
      if (!decoded.startsWith(prefix)) {
        throw new Error("bad aad");
      }
      return decoded.slice(prefix.length);
    }),
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

  it("resends from a valid delivery artifact without returning the raw key", async () => {
    const { service, emailQueue, deliverySecrets, artifacts } = createHarness();
    await service.storeDeliveryArtifact(
      "lic_1",
      RAW_KEY,
      new Date("2026-08-19T00:00:00.000Z"),
    );
    // ensure artifact shape includes expiresAt future
    const stored = artifacts.get("lic_1") as Record<string, unknown>;
    expect(stored.expiresAt).toBeInstanceOf(Date);

    const result = await service.resendDelivery({ licenseId: "lic_1" });
    expect(result.email).toBe("queued");
    expect(result.licenseId).toBe("lic_1");
    expect(deliverySecrets.decrypt).toHaveBeenCalled();
    expect(emailQueue.enqueue).toHaveBeenCalled();
    const payload = emailQueue.enqueue.mock.calls.at(-1)?.[0] as {
      action: { version: string };
      envelope: { data: { licenseKey: string } };
    };
    expect(payload.action.version.startsWith("resend:")).toBe(true);
    expect(payload.envelope.data.licenseKey).toBe(RAW_KEY);
    expect(JSON.stringify(result)).not.toContain(RAW_KEY);
  });

  it("returns 409 when the delivery artifact is missing", async () => {
    const { service } = createHarness();
    await expect(service.resendDelivery({ licenseId: "lic_1" })).rejects.toMatchObject({
      response: { code: "license_key_unrecoverable" },
      status: 409,
    });
  });

  it("returns 409 when the delivery artifact is expired", async () => {
    const { service, artifacts } = createHarness();
    artifacts.set("lic_1", {
      licenseId: "lic_1",
      ciphertext: Buffer.from("lic_1:" + RAW_KEY).toString("base64"),
      iv: "iv",
      authTag: "tag",
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    await expect(service.resendDelivery({ licenseId: "lic_1" })).rejects.toMatchObject({
      response: { code: "license_key_unrecoverable" },
      status: 409,
    });
  });

