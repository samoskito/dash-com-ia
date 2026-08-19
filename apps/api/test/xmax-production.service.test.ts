import { beforeEach, describe, expect, it, vi } from "vitest";
import { XmaxProductionService } from "../src/xmax/xmax-production.service";

describe("xmax production service", () => {
  let prisma: any;
  let leads: { upsertFromWhatsappWebhook: ReturnType<typeof vi.fn> };
  let conversions: { recordExternalConversion: ReturnType<typeof vi.fn> };
  let queue: { enqueueSend: ReturnType<typeof vi.fn> };
  let service: XmaxProductionService;

  const account = {
    id: "acc_1",
    workspaceId: "ws_1",
    shadowMode: false,
    capiSendEnabled: true,
    purchaseValueCents: 25000,
    purchaseCurrency: "BRL",
    defaultCountryCode: "55",
  };

  beforeEach(() => {
    prisma = {
      lead: {
        findUnique: vi.fn(async () => null),
      },
    };
    leads = {
      upsertFromWhatsappWebhook: vi.fn(async () => ({ id: "lead_1" })),
    };
    conversions = {
      recordExternalConversion: vi.fn(async () => ({
        conversionEventLogId: "log_1",
        status: "created",
        deliveryStatus: "pending_meta_context",
      })),
    };
    queue = {
      enqueueSend: vi.fn(async () => ({
        conversionEventLogId: "log_1",
        jobId: "job_1",
        status: "queued",
      })),
    };
    service = new XmaxProductionService(
      prisma,
      leads as never,
      conversions as never,
      queue as never,
    );
  });

  it("is disabled while shadowMode is true", () => {
    expect(
      service.isProductionEnabled({ ...account, shadowMode: true }),
    ).toBe(false);
  });

  it("is disabled when capiSendEnabled is false", () => {
    expect(
      service.isProductionEnabled({ ...account, capiSendEnabled: false }),
    ).toBe(false);
  });

  it("upserts lead and records conversion without enqueue when CTWA missing", async () => {
    const result = await service.emit({
      account,
      contactId: "41854",
      eventName: "QualifiedLead",
      phoneNormalized: "5511953016170",
      phoneHash: "hash_1",
      contactName: "Samuel",
      tagIds: ["55"],
    });

    expect(leads.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        source: "xmax",
        phoneHash: "hash_1",
        preserveExistingSource: true,
      }),
    );
    expect(conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "QualifiedLead",
        businessSource: "organic",
        sourceTrigger: "xmax_tag",
        adId: null,
        ctwaClid: null,
      }),
    );
    expect(queue.enqueueSend).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      attempted: true,
      leadId: "lead_1",
      queued: false,
      deliveryStatus: "pending_meta_context",
    });
  });

  it("reuses lead CTWA attribution and enqueues when ready_to_send", async () => {
    prisma.lead.findUnique.mockResolvedValueOnce({
      id: "lead_1",
      adId: "ad_9",
      adSetId: "adset_9",
      campaignId: "cmp_9",
      ctwaClid: "ctwa_9",
    });
    conversions.recordExternalConversion.mockResolvedValueOnce({
      conversionEventLogId: "log_ready",
      status: "created",
      deliveryStatus: "ready_to_send",
    });

    const result = await service.emit({
      account,
      contactId: "41854",
      eventName: "Purchase",
      phoneNormalized: "5511953016170",
      phoneHash: "hash_1",
      tagIds: ["55", "56"],
    });

    expect(conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Purchase",
        businessSource: "paid",
        adId: "ad_9",
        ctwaClid: "ctwa_9",
        valueCents: 25000,
        currency: "BRL",
        valueSource: "configured_average",
      }),
    );
    expect(queue.enqueueSend).toHaveBeenCalledWith("log_ready", "ws_1");
    expect(result).toMatchObject({
      attempted: true,
      queued: true,
      reasonCode: "production_queued",
    });
  });

  it("does not attempt production when flags are off", async () => {
    const result = await service.emit({
      account: { ...account, shadowMode: true },
      contactId: "41854",
      eventName: "Purchase",
      phoneNormalized: "5511953016170",
      phoneHash: "hash_1",
      tagIds: ["56"],
    });
    expect(result).toEqual({ attempted: false, reasonCode: "shadow_only" });
    expect(leads.upsertFromWhatsappWebhook).not.toHaveBeenCalled();
  });
});
