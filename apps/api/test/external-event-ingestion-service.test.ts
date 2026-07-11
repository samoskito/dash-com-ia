import { describe, expect, it, vi } from "vitest";
import { ExternalEventIngestionService } from "../src/external-data/external-event-ingestion.service";
import type { ExternalEventRow } from "../src/external-data/external-mysql.adapter";

const connector = {
  id: "connector_1",
  workspaceId: "workspace_1",
  provider: "kinbox_mysql",
  timezone: "America/Sao_Paulo",
  shadowMode: true,
  capiSendEnabled: false,
  purchaseAverageValueCents: 400_000,
  defaultCurrency: "BRL"
};

const row: ExternalEventRow = {
  externalRowId: "101",
  dedupeKey: "kinbox:purchase:5511999999999:2026-07-11",
  provider: "kinbox_mysql",
  eventType: "purchase",
  sourceEventName: "ClienteComprou",
  externalEventId: null,
  externalLeadId: "30843618",
  transactionId: null,
  phone: "5511999999999",
  occurredAt: "2026-07-11 14:00:00.000",
  eventLocalDate: "2026-07-11",
  adId: "120012345678",
  adSetId: null,
  campaignId: null,
  ctwaClid: "ctwa_1",
  sourceUrl: null,
  valueCents: null,
  currency: null,
  valueSource: null,
  duplicateCount: 0,
  updatedAt: "2026-07-11 14:00:01.000"
};

function createHarness(overrides?: {
  shadowMode?: boolean;
  capiSendEnabled?: boolean;
  enqueueError?: Error;
}) {
  const prisma = {
    externalIngestionRecord: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "ingestion_1" })),
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({}))
    },
    lead: {
      findUnique: vi.fn(async () => ({
        id: "lead_1",
        phoneHash: "phone_hash_1",
        campaignId: null,
        adSetId: null,
        adId: "120012345678",
        ctwaClid: "ctwa_1"
      })),
      update: vi.fn(async () => ({}))
    }
  };
  const leadsService = {
    upsertFromWhatsappWebhook: vi.fn(async () => ({ id: "lead_1" }))
  };
  const conversionEventsService = {
    recordExternalConversion: vi.fn(async () => ({
      conversionEventLogId: "conversion_1",
      status: "created" as const,
      deliveryStatus: "ready_to_send"
    }))
  };
  const conversionQueue = {
    enqueueSend: overrides?.enqueueError
      ? vi.fn(async () => Promise.reject(overrides.enqueueError))
      : vi.fn(async () => ({ status: "queued" }))
  };
  const service = new ExternalEventIngestionService(
    prisma as never,
    leadsService as never,
    conversionEventsService as never,
    conversionQueue as never
  );

  return {
    connector: {
      ...connector,
      shadowMode: overrides?.shadowMode ?? connector.shadowMode,
      capiSendEnabled: overrides?.capiSendEnabled ?? connector.capiSendEnabled
    },
    conversionEventsService,
    conversionQueue,
    prisma,
    service
  };
}

describe("ExternalEventIngestionService", () => {
  it("persists an estimated Kinbox purchase without enqueueing CAPI in shadow mode", async () => {
    const harness = createHarness();
    const result = await harness.service.ingest(harness.connector, row);

    expect(result).toMatchObject({
      status: "imported",
      queued: false,
      conversionEventLogId: "conversion_1"
    });
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
    expect(
      harness.conversionEventsService.recordExternalConversion
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Purchase",
        valueCents: 400_000,
        valueSource: "configured_average",
        currency: "BRL"
      })
    );
  });

  it("keeps a persisted event pending when the CAPI queue is temporarily unavailable", async () => {
    const harness = createHarness({
      shadowMode: false,
      capiSendEnabled: true,
      enqueueError: new Error("redis unavailable")
    });
    const result = await harness.service.ingest(harness.connector, row);

    expect(result).toMatchObject({
      status: "imported",
      queued: false,
      errorCode: "ExternalCapiQueueFailed"
    });
    expect(harness.prisma.externalIngestionRecord.update).toHaveBeenCalledWith({
      where: { id: "ingestion_1" },
      data: expect.objectContaining({
        status: "pending_delivery",
        errorCode: "ExternalCapiQueueFailed"
      })
    });
    expect(harness.prisma.externalIngestionRecord.upsert).not.toHaveBeenCalled();
  });

  it("uses the row provider policy so another integration can keep same-day transactions", async () => {
    const firstHarness = createHarness();
    const secondHarness = createHarness();
    const providerRow = {
      ...row,
      provider: "commerce_provider",
      transactionId: "order_1"
    };

    await firstHarness.service.ingest(firstHarness.connector, providerRow);
    await secondHarness.service.ingest(secondHarness.connector, {
      ...providerRow,
      externalRowId: "102",
      transactionId: "order_2"
    });

    const firstCalls = firstHarness.conversionEventsService.recordExternalConversion.mock
      .calls as unknown as Array<[Record<string, string>]>;
    const secondCalls = secondHarness.conversionEventsService.recordExternalConversion.mock
      .calls as unknown as Array<[Record<string, string>]>;
    const firstInput = firstCalls[0]?.[0];
    const secondInput = secondCalls[0]?.[0];

    if (!firstInput || !secondInput) {
      throw new Error("Expected both provider events to be recorded");
    }

    expect(firstInput.sourceTrigger).toBe("external_mysql:commerce_provider");
    expect(firstInput.dedupeKey).not.toBe(secondInput.dedupeKey);
  });
});
