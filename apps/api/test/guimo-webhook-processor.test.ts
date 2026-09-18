import { describe, expect, it, vi } from "vitest";
import { GuimoAdapterError } from "../src/guimo/guimo.adapter";
import { GuimoWebhookProcessor } from "../src/guimo/guimo-webhook.processor";
import { GuimoWebhookQueueService } from "../src/guimo/guimo-webhook-queue.service";
import { GuimoService } from "../src/guimo/guimo.service";

const workspaceId = "workspace-guimo";
const job = { id: "job-guimo", name: "process-stage-movement", attemptsMade: 0, data: { eventId: "event-guimo", workspaceId } } as any;

function activeIntegration(service: any) {
  return {
    id: "integration-guimo", workspaceId, status: "active", qualifiedStageId: "qualified", qualifiedStageName: null,
    purchaseStageId: null, purchaseStageName: null, purchaseCurrency: null, purchaseValueUnit: null,
    rules: [],
    ...service.encryptHeaders({ authorization: "[REDACTED]" }),
  };
}

function processorHarness(adapterFailure?: Error) {
  const originalKey = process.env.GUIMO_CRM_ENCRYPTION_KEY;
  process.env.GUIMO_CRM_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
  const updates: any[] = [];
  const prisma: any = {
    guimoWebhookEvent: {
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }) => { updates.push(data); return data; }),
    },
    lead: { findFirst: vi.fn(async () => ({ id: "lead-guimo", campaignId: null, adSetId: null, adId: null, ctwaClid: null })) },
    webhookLog: { create: vi.fn() },
    integrationLog: { create: vi.fn(async () => ({ id: "integration-log" })) },
    diagnosticEvent: { create: vi.fn() },
    jobAttempt: { create: vi.fn() },
  };
  const adapter = { getContact: vi.fn(async () => { if (adapterFailure) throw adapterFailure; return { phone: "5511999999999@s.whatsapp.net" }; }), getNegotiation: vi.fn() };
  const conversions = { recordExternalConversion: vi.fn(async () => ({ deliveryStatus: "not_ready", conversionEventLogId: "conversion" })) };
  const service: any = new GuimoService(prisma, {} as any, {} as any, adapter as any, conversions as any, {} as any);
  prisma.guimoWebhookEvent.findFirst.mockResolvedValue({ id: job.data.eventId, workspaceId, dedupeKey: "guimo:dedupe", contactId: "contact", negotiationId: "negotiation", stageId: "qualified", stageName: "Qualified", previousStageId: "other", previousStageName: "Other", createdAt: new Date(), integration: activeIntegration(service) });
  return { originalKey, prisma, adapter, conversions, processor: new GuimoWebhookProcessor(service, prisma), updates };
}

describe("Guimo webhook queue processor", () => {
  it("enqueues a retryable queue job with a deterministic Guimo id", async () => {
    const queue = { add: vi.fn(async () => ({ id: "queued-guimo" })) };
    const service = new GuimoWebhookQueueService(queue as any);
    await expect(service.enqueue("event-guimo", workspaceId)).resolves.toBe("queued-guimo");
    expect(queue.add).toHaveBeenCalledWith("process-stage-movement", { eventId: "event-guimo", workspaceId }, expect.objectContaining({ attempts: 3, backoff: { type: "exponential", delay: 30_000 } }));
  });

  it("processes a successful job, transitions the event, and records a redacted Guimo JobAttempt", async () => {
    const harness = processorHarness();
    try {
      await expect(harness.processor.process(job)).resolves.toEqual({ status: "processed", errorCode: null });
      expect(harness.updates).toContainEqual(expect.objectContaining({ status: "processed", eventType: "QualifiedLead", errorCode: null, processedAt: expect.any(Date) }));
      const attempt = harness.prisma.jobAttempt.create.mock.calls[0][0].data;
      expect(attempt).toMatchObject({ source: "guimo", status: "processed", relatedEntityId: "event-guimo" });
      expect(attempt.summaryPayload).toEqual({ status: "processed", errorCode: null });
      expect(JSON.stringify(attempt.summaryPayload)).not.toContain("[REDACTED]");
    } finally {
      if (harness.originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY;
      else process.env.GUIMO_CRM_ENCRYPTION_KEY = harness.originalKey;
    }
  });

  it("matches an active rule by normalized name and uses its fixed value without CRM value lookup", async () => {
    const harness = processorHarness();
    try {
      const event = await harness.prisma.guimoWebhookEvent.findFirst();
      event.stageName = "  venda   fechada ";
      event.integration.rules = [{ id: "rule-fixed", stageName: "Venda Fechada", eventName: "Purchase", valueMode: "fixed", fixedValueCents: 1250, active: true }];
      await expect(harness.processor.process(job)).resolves.toEqual({ status: "processed", errorCode: null });
      expect(harness.updates).toContainEqual(expect.objectContaining({ eventType: "Purchase" }));
      expect(harness.adapter.getNegotiation).not.toHaveBeenCalled();
      expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(expect.objectContaining({ eventName: "Purchase", valueCents: 1250, currency: "BRL" }));
    } finally {
      if (harness.originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY;
      else process.env.GUIMO_CRM_ENCRYPTION_KEY = harness.originalKey;
    }
  });

  it("uses CRM negotiation value for a dynamic Purchase rule and ignores inactive rules", async () => {
    const harness = processorHarness();
    try {
      const event = await harness.prisma.guimoWebhookEvent.findFirst();
      event.stageName = "Venda";
      event.integration.purchaseCurrency = "BRL";
      event.integration.purchaseValueUnit = "major";
      event.integration.rules = [{ id: "rule-dynamic", stageName: "Venda", eventName: "Purchase", valueMode: "dynamic", fixedValueCents: null, active: true }];
      harness.adapter.getNegotiation.mockResolvedValue({ value: 19.9 });
      await expect(harness.processor.process(job)).resolves.toEqual({ status: "processed", errorCode: null });
      expect(harness.adapter.getNegotiation).toHaveBeenCalled();
      expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(expect.objectContaining({ valueCents: 1990, currency: "BRL" }));

      event.integration.rules[0].active = false;
      await expect(harness.processor.process(job)).resolves.toEqual({ status: "ignored", errorCode: "stage_not_configured" });
    } finally {
      if (harness.originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY;
      else process.env.GUIMO_CRM_ENCRYPTION_KEY = harness.originalKey;
    }
  });

  it("blocks a dynamic Purchase rule without configured currency and unit", async () => {
    const harness = processorHarness();
    try {
      const event = await harness.prisma.guimoWebhookEvent.findFirst();
      event.stageName = "Venda";
      event.integration.rules = [{ id: "rule-dynamic", stageName: "Venda", eventName: "Purchase", valueMode: "dynamic", fixedValueCents: null, active: true }];
      harness.adapter.getNegotiation.mockResolvedValue({ value: 19.9 });
      await expect(harness.processor.process(job)).resolves.toEqual({ status: "blocked", errorCode: "purchase_currency_or_unit_not_configured" });
      expect(harness.conversions.recordExternalConversion).not.toHaveBeenCalled();
    } finally {
      if (harness.originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY;
      else process.env.GUIMO_CRM_ENCRYPTION_KEY = harness.originalKey;
    }
  });

  it("records a redacted failed attempt and lets a retryable adapter failure reach BullMQ", async () => {
    const harness = processorHarness(new GuimoAdapterError("guimo_timeout", "CRM timed out"));
    try {
      await expect(harness.processor.process(job)).rejects.toMatchObject({ code: "guimo_timeout" });
      expect(harness.updates).toContainEqual({ status: "failed", errorCode: "guimo_timeout" });
      const attempt = harness.prisma.jobAttempt.create.mock.calls[0][0].data;
      expect(attempt).toMatchObject({ source: "guimo", status: "failed" });
      expect(attempt.summaryPayload).toEqual({ errorCode: "GuimoAdapterError" });
      expect(JSON.stringify(attempt.summaryPayload)).not.toContain("CRM timed out");
    } finally {
      if (harness.originalKey === undefined) delete process.env.GUIMO_CRM_ENCRYPTION_KEY;
      else process.env.GUIMO_CRM_ENCRYPTION_KEY = harness.originalKey;
    }
  });
});
