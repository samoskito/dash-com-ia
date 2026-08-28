import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { GuimoService } from "../src/guimo/guimo.service";
import { GUIMO_BAD_TOKEN_RATE_LIMIT, GuimoWebhookRateLimitService } from "../src/guimo/guimo-webhook-rate-limit.service";
import { CLIENT_SWAP_WIPE_DELEGATES } from "../src/workspaces/client-swap/client-swap.service";

const active = { id: "g1", workspaceId: "ws-a", status: "active", webhookSecretHash: "", qualifiedStageId: "2", qualifiedStageName: null, purchaseStageId: null, purchaseStageName: null, purchaseCurrency: null, purchaseValueUnit: null, crmHeadersEncrypted: null, crmHeadersIv: null, crmHeadersTag: null };
const rateLimit = () => ({ assertAllowed: vi.fn(), recordBadToken: vi.fn() });
const serviceFor = (prisma: any, queue: any = {}, limiter: any = rateLimit()) => new GuimoService(prisma, queue, {} as any, {} as any, {} as any, limiter);

describe("Guimo ingress safety", () => {
  it("keeps provisioning blocked unless valid CRM auth headers can be encrypted", async () => {
    const originalKey = process.env.GUIMO_CRM_ENCRYPTION_KEY;
    process.env.GUIMO_CRM_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const prisma = { guimoIntegration: { create: vi.fn(async ({ data }) => ({ id: "g1", webhookVersion: "v1", ...data })) }, auditLog: { create: vi.fn() } };
    const service = serviceFor(prisma);
    const result = await service.provision("ws-a", "user-a", { qualifiedStageId: "2", crmHeaders: { Host: "bad", Authorization: "[REDACTED]" } });
    expect(result.status).toBe("blocked");
    const data = prisma.guimoIntegration.create.mock.calls[0][0].data;
    expect(data.crmHeadersEncrypted).toBeUndefined();
    expect(JSON.stringify(prisma.auditLog.create.mock.calls[0][0])).not.toContain("[REDACTED]");
    if (originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY;
    else process.env.GUIMO_CRM_ENCRYPTION_KEY = originalKey;
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
