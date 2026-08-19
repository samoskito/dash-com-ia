import { beforeEach, describe, expect, it, vi } from "vitest";
import { XmaxProductionService } from "../src/xmax/xmax-production.service";

describe("xmax production service", () => {
  let prisma: any;
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

  it("does not create lead or conversion when phone is not in base", async () => {
    const result = await service.emit({
      account,
      contactId: "41854",
      eventName: "QualifiedLead",
      phoneNormalized: "5511953016170",
      phoneHash: "hash_1",
      contactName: "Samuel",
      tagIds: ["55"],
    });

    expect(result).toEqual({
      attempted: true,
      reasonCode: "no_paid_lead",
    });
    expect(conversions.recordExternalConversion).not.toHaveBeenCalled();
    expect(queue.enqueueSend).not.toHaveBeenCalled();
  });

  it("does not convert when lead exists without adId+ctwaClid", async () => {
    prisma.lead.findUnique.mockResolvedValueOnce({
      id: "lead_organic",
      adId: null,
      adSetId: null,
      campaignId: null,
      ctwaClid: null,
    });

    const result = await service.emit({
      account,
      contactId: "41854",
      eventName: "Purchase",
      phoneNormalized: "5511953016170",
      phoneHash: "hash_1",
      tagIds: ["56"],
    });

    expect(result).toEqual({
      attempted: true,
      reasonCode: "lead_missing_attribution",
    });
    expect(conversions.recordExternalConversion).not.toHaveBeenCalled();
    expect(queue.enqueueSend).not.toHaveBeenCalled();
  });

  it("reuses paid lead CTWA attribution and enqueues when ready_to_send", async () => {
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
        leadId: "lead_1",
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
      leadId: "lead_1",
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
    expect(conversions.recordExternalConversion).not.toHaveBeenCalled();
  });
});
