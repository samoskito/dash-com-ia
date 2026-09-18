import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { GuimoService } from "../src/guimo/guimo.service";
import { GUIMO_BAD_TOKEN_RATE_LIMIT, GuimoWebhookRateLimitService } from "../src/guimo/guimo-webhook-rate-limit.service";
import { CLIENT_SWAP_WIPE_DELEGATES } from "../src/workspaces/client-swap/client-swap.service";

const active = { id: "g1", workspaceId: "ws-a", status: "active", webhookSecretHash: "", qualifiedStageId: "2", qualifiedStageName: null, purchaseStageId: null, purchaseStageName: null, purchaseCurrency: null, purchaseValueUnit: null, crmHeadersEncrypted: null, crmHeadersIv: null, crmHeadersTag: null };
const rateLimit = () => ({ assertAllowed: vi.fn(), recordBadToken: vi.fn() });
const serviceFor = (prisma: any, queue: any = {}, limiter: any = rateLimit()) => new GuimoService(prisma, queue, {} as any, {} as any, {} as any, limiter);

describe("Guimo ingress safety", () => {
  it("lists only a workspace's safe integration fields", async () => {
    const createdAt = new Date("2026-08-31T10:00:00.000Z");
    const prisma: any = {
      guimoIntegration: {
        findMany: vi.fn(async () => [{ ...active, webhookVersion: "v1", crmHeadersEncrypted: "ciphertext", crmHeadersIv: "iv", crmHeadersTag: "tag", webhookSecretHash: "hash", createdAt, updatedAt: createdAt }]),
      },
    };
    const result = await serviceFor(prisma).list("ws-a");
    expect(prisma.guimoIntegration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "ws-a" }, orderBy: { createdAt: "desc" }, select: expect.not.objectContaining({ webhookSecretHash: expect.anything() }) }));
    expect(result[0]).toMatchObject({ id: "g1", hasCrmHeaders: true, createdAt: createdAt.toISOString() });
    expect(JSON.stringify(result)).not.toMatch(/secret|hash|encrypted|headersIv|headersTag/i);
  });
  it("rotates an integration token inside its workspace without auditing or exposing a raw token field", async () => {
    const current: any = { ...active, webhookVersion: "v1", createdAt: new Date(), updatedAt: new Date() };
    const prisma: any = {
      guimoIntegration: {
        findFirst: vi.fn(async () => current),
        update: vi.fn(async ({ data }) => ({ ...current, ...data })),
      },
      auditLog: { create: vi.fn(async () => undefined) },
    };
    const result = await serviceFor(prisma).rotateWebhookToken("ws-a", "g1", "user-a");
    expect(prisma.guimoIntegration.findFirst).toHaveBeenCalledWith({ where: { id: "g1", workspaceId: "ws-a" } });
    expect(prisma.guimoIntegration.update.mock.calls[0][0].data.webhookSecretHash).toBeTruthy();
    // The result must only ever expose the complete URL/path, never a raw
    // token field a caller could log or copy on its own.
    expect(result).not.toHaveProperty("webhookToken");
    const token = new URL(result.webhookPath, "http://localhost").searchParams.get("token");
    expect(token).toHaveLength(43);
    expect(JSON.stringify(prisma.auditLog.create.mock.calls[0][0])).not.toContain(token);
    // URL-only contract: the rotated token must be embedded in webhookPath so a
    // copy-pasted URL alone is enough for Guimo to authenticate (no header).
    expect(result.webhookPath).toBe(`/webhooks/guimo/v1/g1?token=${encodeURIComponent(token!)}`);
  });
  it("keeps provisioning blocked when CRM auth headers are supplied but cannot be encrypted", async () => {
    const originalKey = process.env.GUIMO_CRM_ENCRYPTION_KEY;
    const originalApiPublicUrl = process.env.API_PUBLIC_URL;
    process.env.GUIMO_CRM_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    process.env.API_PUBLIC_URL = "https://api.example.com";
    const prisma = { guimoIntegration: { create: vi.fn(async ({ data }) => ({ id: "g1", webhookVersion: "v1", ...data })) }, auditLog: { create: vi.fn() } };
    const service = serviceFor(prisma);
    const result = await service.provision("ws-a", "user-a", { qualifiedStageId: "2", crmHeaders: { Host: "bad", Authorization: "[REDACTED]" } });
    expect(result.status).toBe("blocked");
    expect(result).not.toHaveProperty("webhookToken");
    const token = new URL(result.webhookPath, "http://localhost").searchParams.get("token");
    expect(result.webhookUrl).toBe(`https://api.example.com/webhooks/guimo/v1/g1?token=${encodeURIComponent(token!)}`);
    expect(result.webhookPath).toBe(`/webhooks/guimo/v1/g1?token=${encodeURIComponent(token!)}`);
    const data = prisma.guimoIntegration.create.mock.calls[0][0].data;
    expect(data.crmHeadersEncrypted).toBeUndefined();
    expect(JSON.stringify(prisma.auditLog.create.mock.calls[0][0])).not.toContain("[REDACTED]");
    if (originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY;
    else process.env.GUIMO_CRM_ENCRYPTION_KEY = originalKey;
    if (originalApiPublicUrl === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = originalApiPublicUrl;
  });
  it("activates credentials-only provisioning without legacy stages or purchase configuration", async () => {
    const originalKey = process.env.GUIMO_CRM_ENCRYPTION_KEY;
    process.env.GUIMO_CRM_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const prisma: any = { guimoIntegration: { create: vi.fn(async ({ data }) => ({ id: "g1", webhookVersion: "v1", ...data })) }, auditLog: { create: vi.fn() } };
    try {
      const result = await serviceFor(prisma).provision("ws-a", "user-a", { crmHeaders: { authorization: "[REDACTED]" } });
      expect(result).toMatchObject({ status: "active" });
      expect(prisma.guimoIntegration.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "active", qualifiedStageId: null, purchaseStageName: null, purchaseCurrency: null, purchaseValueUnit: null }) }));
      // The URL-only webhook capability must never leak the CRM credential
      // used for the outbound Guimo API call.
      expect(result.webhookPath).not.toContain("[REDACTED]");
      expect(result.webhookPath).not.toMatch(/authorization/i);
    } finally { if (originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY; else process.env.GUIMO_CRM_ENCRYPTION_KEY = originalKey; }
  });
  it("activates a URL-only provisioning with an empty payload (webhook capability alone is enough)", async () => {
    const prisma: any = { guimoIntegration: { create: vi.fn(async ({ data }) => ({ id: "g1", webhookVersion: "v1", ...data })) }, auditLog: { create: vi.fn() } };
    const result = await serviceFor(prisma).provision("ws-a", "user-a", {});
    expect(result.status).toBe("active");
    expect(prisma.guimoIntegration.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }));
    expect(result).not.toHaveProperty("webhookToken");
    expect(result.webhookPath).toMatch(/^\/webhooks\/guimo\/v1\/g1\?token=.+/);
  });
  it("never requires CRM credentials to resume a paused integration", async () => {
    const current: any = { ...active, status: "paused", crmHeadersEncrypted: null, crmHeadersIv: null, crmHeadersTag: null, webhookVersion: "v1", createdAt: new Date(), updatedAt: new Date() };
    const prisma: any = {
      guimoIntegration: {
        findFirst: vi.fn(async () => current),
        update: vi.fn(async ({ data }) => ({ ...current, ...data })),
      },
      auditLog: { create: vi.fn(async () => undefined) },
    };
    const result = await serviceFor(prisma).setActive("ws-a", "g1", "user-a", true);
    expect(result.status).toBe("active");
    expect(prisma.guimoIntegration.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status: "active" } });
  });
  it("keeps a credentials-configured integration active after clearing legacy stages", async () => {
    const originalKey = process.env.GUIMO_CRM_ENCRYPTION_KEY;
    process.env.GUIMO_CRM_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const now = new Date();
    const current: any = { ...active, qualifiedStageId: "qualified", purchaseStageName: "Purchase", crmHeadersEncrypted: "ciphertext", crmHeadersIv: "iv", crmHeadersTag: "tag", webhookVersion: "v1", createdAt: now, updatedAt: now, rules: [] };
    const prisma: any = { guimoIntegration: { findFirst: vi.fn(async () => current), update: vi.fn(async ({ data }) => ({ ...current, ...data })) }, auditLog: { create: vi.fn() } };
    try {
      const result = await serviceFor(prisma).update("ws-a", "g1", "user-a", { qualifiedStageId: null, purchaseStageName: null });
      expect(result.status).toBe("active");
      expect(prisma.guimoIntegration.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ qualifiedStageId: null, purchaseStageName: null, status: "active" }) }));
    } finally { if (originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY; else process.env.GUIMO_CRM_ENCRYPTION_KEY = originalKey; }
  });
  it("keeps a URL-only integration active when editing fields that are not CRM headers", async () => {
    const now = new Date();
    const current: any = { ...active, status: "active", crmHeadersEncrypted: null, crmHeadersIv: null, crmHeadersTag: null, webhookVersion: "v1", createdAt: now, updatedAt: now, rules: [] };
    const prisma: any = { guimoIntegration: { findFirst: vi.fn(async () => current), update: vi.fn(async ({ data }) => ({ ...current, ...data })) }, auditLog: { create: vi.fn() } };
    const result = await serviceFor(prisma).update("ws-a", "g1", "user-a", { purchaseStageName: "Venda Fechada" });
    expect(result.status).toBe("active");
    expect(prisma.guimoIntegration.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ purchaseStageName: "Venda Fechada", status: "active" }) }));
  });
  it("keeps authenticating an integration provisioned before the URL-only contract, unchanged schema", async () => {
    // `receive` only ever compares a hash of whatever token string it is given
    // against the stored webhookSecretHash; it does not know or care whether
    // the caller (controller) sourced that string from a header or the query
    // string. So a pre-existing integration's stored hash keeps working with
    // zero migration once the controller starts reading `?token=`.
    const prisma: any = { guimoIntegration: { findUnique: vi.fn() }, guimoWebhookEvent: { create: vi.fn().mockResolvedValue({ id: "event-a" }), update: vi.fn() }, webhookLog: { create: vi.fn() } };
    const service: any = serviceFor(prisma, { enqueue: vi.fn().mockResolvedValue("job-a") });
    active.webhookSecretHash = service.hash("legacy-token");
    prisma.guimoIntegration.findUnique.mockResolvedValue(active);
    const result = await service.receive("g1", "legacy-token", { id_negociacao: 1, id_contato: 2, estagio_novo: { id: 3, nome: "Q" } });
    expect(result.status).toBe("accepted");
  });
  it("fails closed for a wrong webhook token before parsing or writes", async () => {
    const prisma = { guimoIntegration: { findUnique: vi.fn().mockResolvedValue(active) } };
    const limiter = rateLimit(); const service = serviceFor(prisma, {}, limiter);
    await expect(service.receive("g1", "wrong", {})).rejects.toMatchObject({ status: 404 });
    expect(prisma.guimoIntegration.findUnique).toHaveBeenCalled();
    expect(limiter.recordBadToken).toHaveBeenCalledWith(active);
  });
  it("has a deterministic integration-scoped provisional key and does not retain it in diagnostics", async () => {
    const hash = (service: any, value: string) => service.hash(value);
    const prisma = { guimoIntegration: { findUnique: vi.fn() }, guimoWebhookEvent: { create: vi.fn().mockResolvedValue({ id: "event-a" }), update: vi.fn() }, webhookLog: { create: vi.fn() } };
    const service: any = serviceFor(prisma);
    active.webhookSecretHash = hash(service, "ok"); prisma.guimoIntegration.findUnique.mockResolvedValue(active);
    service.queue.enqueue = vi.fn().mockResolvedValue("job-a");
    const result = await service.receive("g1", "ok", { id_negociacao: 1, id_contato: 2, estagio_novo: { id: 3, nome: "Q" } });
    expect(result.status).toBe("accepted");
    expect(prisma.guimoWebhookEvent.create.mock.calls[0][0].data.dedupeKey).toBe("guimo:ws-a:g1:1:2:3");
  });
  it("never keeps raw telephone values in webhook summaries", async () => {
    const webhookLog = { create: vi.fn().mockResolvedValue({}) };
    const service: any = serviceFor({ webhookLog });
    await service.logWebhook("ws-a", "dedupe", "accepted", { stageId: "2", contactId: "9" });
    expect(webhookLog.create.mock.calls[0][0].data.summaryPayload).not.toHaveProperty("phone");
    expect(webhookLog.create.mock.calls[0][0].data.idempotencyKey).toBeUndefined();
  });
  it("includes both Guimo tables in the client-swap wipe order", () => {
    expect(CLIENT_SWAP_WIPE_DELEGATES).toContain("guimoWebhookEvent");
    expect(CLIENT_SWAP_WIPE_DELEGATES).toContain("guimoIntegration");
  });
  it("blocks provisioning when the encryption key is not a Base64 32-byte key", async () => {
    const originalKey = process.env.GUIMO_CRM_ENCRYPTION_KEY;
    process.env.GUIMO_CRM_ENCRYPTION_KEY = "not-a-key";
    const prisma = { guimoIntegration: { create: vi.fn(async ({ data }) => ({ id: "g1", webhookVersion: "v1", ...data })) }, auditLog: { create: vi.fn() } };
    try {
      await expect(serviceFor(prisma).provision("ws-a", "user-a", { qualifiedStageId: "2", crmHeaders: { authorization: "[REDACTED]" } })).resolves.toMatchObject({ status: "blocked" });
      expect(prisma.guimoIntegration.create.mock.calls[0][0].data.crmHeadersEncrypted).toBeUndefined();
    } finally { if (originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY; else process.env.GUIMO_CRM_ENCRYPTION_KEY = originalKey; }
  });
  it("marks an event recoverably failed when enqueue fails after create", async () => {
    const prisma: any = { guimoIntegration: { findUnique: vi.fn() }, guimoWebhookEvent: { create: vi.fn(async () => ({ id: "event-a", workspaceId: "ws-a", integrationId: "g1", dedupeKey: "key" })), update: vi.fn() }, webhookLog: { create: vi.fn() } };
    const queue = { enqueue: vi.fn(async () => { throw new Error("redis unavailable"); }) };
    const service: any = serviceFor(prisma, queue); active.webhookSecretHash = service.hash("ok"); prisma.guimoIntegration.findUnique.mockResolvedValue(active);
    await expect(service.receive("g1", "ok", { id_negociacao: 1, id_contato: 2, estagio_novo: { id: 3, nome: "Q" } })).rejects.toThrow("redis unavailable");
    expect(prisma.guimoWebhookEvent.update).toHaveBeenCalledWith({ where: { id: "event-a" }, data: { status: "failed", errorCode: "enqueue_failed", jobId: null } });
  });
  it("returns duplicate without re-enqueueing an already processed event", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
    const prisma: any = { guimoIntegration: { findUnique: vi.fn() }, guimoWebhookEvent: { create: vi.fn(async () => { throw duplicate; }), findUnique: vi.fn(async () => ({ id: "event-a", integrationId: "g1", status: "processed", jobId: "job-a" })) } };
    const queue = { enqueue: vi.fn() }; const service: any = serviceFor(prisma, queue); active.webhookSecretHash = service.hash("ok"); prisma.guimoIntegration.findUnique.mockResolvedValue(active);
    await expect(service.receive("g1", "ok", { id_negociacao: 1, id_contato: 2, estagio_novo: { id: 3, nome: "Q" } })).resolves.toEqual({ status: "duplicate" });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
  it("re-enqueues an accepted but unqueued duplicate for the same integration", async () => {
    const event = { id: "event-a", workspaceId: "ws-a", integrationId: "g1", dedupeKey: "key", status: "accepted", jobId: null };
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
    const prisma: any = { guimoIntegration: { findUnique: vi.fn() }, guimoWebhookEvent: { create: vi.fn(async () => { throw duplicate; }), findUnique: vi.fn(async () => event), update: vi.fn() }, webhookLog: { create: vi.fn() } };
    const queue = { enqueue: vi.fn(async () => "job-a") }; const service: any = serviceFor(prisma, queue); active.webhookSecretHash = service.hash("ok"); prisma.guimoIntegration.findUnique.mockResolvedValue(active);
    await expect(service.receive("g1", "ok", { id_negociacao: 1, id_contato: 2, estagio_novo: { id: 3, nome: "Q" } })).resolves.toEqual({ status: "accepted" });
    expect(queue.enqueue).toHaveBeenCalledWith("event-a", "ws-a");
    expect(prisma.guimoWebhookEvent.update).toHaveBeenCalledWith({ where: { id: "event-a" }, data: { jobId: "job-a", status: "queued", errorCode: null } });
  });
  it("uses durable integration-scoped bad-token limits and fails closed", async () => {
    const prisma: any = { guimoWebhookRateLimit: { findFirst: vi.fn(async () => ({ id: "limit" })), updateMany: vi.fn(), upsert: vi.fn() } };
    const limiter = new GuimoWebhookRateLimitService(prisma);
    await expect(limiter.assertAllowed(active as any)).rejects.toMatchObject({ status: 404 });
    prisma.guimoWebhookRateLimit.findFirst.mockResolvedValue(null);
    await limiter.recordBadToken(active as any);
    expect(prisma.guimoWebhookRateLimit.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { integrationId: "g1" }, create: expect.objectContaining({ workspaceId: "ws-a", integrationId: "g1", attempts: 1 }), update: { attempts: { increment: 1 } } }));
    expect(GUIMO_BAD_TOKEN_RATE_LIMIT.MAX_BAD_TOKEN_ATTEMPTS).toBeGreaterThan(0);
  });
});
