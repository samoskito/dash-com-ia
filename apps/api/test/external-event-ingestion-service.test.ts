import { describe, expect, it, vi } from "vitest";
import {
  ExternalEventIngestionService,
  type ExternalEventConnectorContext,
} from "../src/external-data/external-event-ingestion.service";
import type { ExternalEventRow } from "../src/external-data/external-mysql.adapter";

const connector: ExternalEventConnectorContext = {
  id: "connector_1",
  workspaceId: "workspace_1",
  provider: "kinbox_mysql",
  timezone: "America/Sao_Paulo",
  shadowMode: true,
  capiSendEnabled: false,
  capiCutovers: [],
  purchaseAverageValueCents: 400_000,
  defaultCurrency: "BRL",
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
  updatedAt: "2026-07-11 14:00:01.000",
};

function createHarness(overrides?: {
  shadowMode?: boolean;
  capiSendEnabled?: boolean;
  enqueueError?: Error;
  leadCtwaClid?: string | null;
  capiCutovers?: ExternalEventConnectorContext["capiCutovers"];
}) {
  const leadCtwaClid =
    overrides?.leadCtwaClid === undefined
      ? "ctwa_1"
      : overrides.leadCtwaClid;
  const prisma = {
    externalIngestionRecord: {
      findUnique: vi.fn(
        async (): Promise<{
          id: string;
          status: string;
          leadId: string | null;
          conversionEventLogId: string | null;
          duplicateCount: number;
          errorCode: string | null;
        } | null> => null,
      ),
      findFirst: vi.fn(
        async (): Promise<{ leadId: string | null } | null> => null,
      ),
      findMany: vi.fn(
        async (): Promise<
          Array<{
            id: string;
            eventType: string;
            conversionEventLogId: string | null;
            summaryPayload: unknown;
          }>
        > => [],
      ),
      create: vi.fn(async () => ({ id: "ingestion_1" })),
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({})),
    },
    lead: {
      findUnique: vi.fn(async () => ({
        id: "lead_1",
        phoneHash: "phone_hash_1",
        campaignId: null,
        adSetId: null,
        adId: "120012345678",
        ctwaClid: leadCtwaClid,
      })),
      findFirst: vi.fn(async () => ({
        id: "lead_1",
        phoneHash: "phone_hash_1",
        campaignId: null,
        adSetId: null,
        adId: "120012345678",
        ctwaClid: leadCtwaClid,
      })),
      findMany: vi.fn(async (): Promise<Array<{ id: string }>> => []),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      delete: vi.fn(async () => ({})),
    },
    conversionEventLog: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const leadsService = {
    upsertFromWhatsappWebhook: vi.fn(async () => ({ id: "lead_1" })),
  };
  const conversionEventsService = {
    recordExternalConversion: vi.fn(
      async (input: { deliveryStatus?: string }) => ({
        conversionEventLogId: "conversion_1",
        status: "created" as const,
        deliveryStatus: input.deliveryStatus ?? "ready_to_send",
      }),
    ),
  };
  const conversionQueue = {
    enqueueSend: overrides?.enqueueError
      ? vi.fn(async () => Promise.reject(overrides.enqueueError))
      : vi.fn(async () => ({ status: "queued" })),
  };
  const service = new ExternalEventIngestionService(
    prisma as never,
    leadsService as never,
    conversionEventsService as never,
    conversionQueue as never,
  );

  return {
    connector: {
      ...connector,
      shadowMode: overrides?.shadowMode ?? connector.shadowMode,
      capiSendEnabled: overrides?.capiSendEnabled ?? connector.capiSendEnabled,
      capiCutovers: overrides?.capiCutovers ?? connector.capiCutovers,
    },
    conversionEventsService,
    conversionQueue,
    leadsService,
    prisma,
    service,
  };
}

describe("ExternalEventIngestionService", () => {
  it("persists an estimated Kinbox purchase without enqueueing CAPI in shadow mode", async () => {
    const harness = createHarness();
    const result = await harness.service.ingest(harness.connector, row);

    expect(result).toMatchObject({
      status: "imported",
      queued: false,
      conversionEventLogId: "conversion_1",
    });
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
    expect(
      harness.leadsService.upsertFromWhatsappWebhook,
    ).not.toHaveBeenCalled();
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Purchase",
        valueCents: 400_000,
        valueSource: "configured_average",
        currency: "BRL",
        sourcePayload: expect.objectContaining({
          schema: "external_event_row_v1",
          externalRowId: "101",
          phone: "***9999",
          phoneRedacted: true,
          adId: "120012345678",
          ctwaClid: "ctwa_1"
        })
      }),
    );
    expect(harness.prisma.externalIngestionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summaryPayload: expect.objectContaining({
            sourcePayload: expect.objectContaining({
              provider: "kinbox_mysql",
              phone: "***9999"
            })
          })
        })
      })
    );
  });

  it("prefers the workspace purchase defaults over the connector fallback", async () => {
    const harness = createHarness();

    await harness.service.ingest(
      {
        ...harness.connector,
        purchaseDefaultValueCents: 250_000,
        purchaseDefaultCurrency: "USD",
        purchaseDefaultContentName: "Plano premium",
      },
      row,
    );

    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Purchase",
        valueCents: 250_000,
        valueSource: "configured_average",
        currency: "USD",
        contentName: "Plano premium",
      }),
    );
  });

  it("keeps the Kinbox external id as metadata and attaches the event only to the real phone lead", async () => {
    const harness = createHarness();
    const qualifiedRow: ExternalEventRow = {
      ...row,
      externalRowId: "qualified_30884074",
      dedupeKey: "kinbox:qualified:554888685127",
      eventType: "qualified_lead",
      sourceEventName: "EnvioProposta",
      externalLeadId: "30884074",
      phone: "554888685127",
      valueCents: null,
      currency: null,
      valueSource: null,
    };

    const result = await harness.service.ingest(
      harness.connector,
      qualifiedRow,
    );

    expect(result).toMatchObject({ status: "imported", leadId: "lead_1" });
    expect(harness.leadsService.upsertFromWhatsappWebhook).not.toHaveBeenCalled();
    expect(harness.prisma.externalIngestionRecord.findFirst).not.toHaveBeenCalled();
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead_1",
        phoneHash: "phone_hash_1",
        eventName: "QualifiedLead",
      }),
    );
    expect(harness.prisma.externalIngestionRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: "lead_1",
        summaryPayload: expect.objectContaining({
          externalLeadId: "30884074",
        }),
      }),
    });
  });

  it("rejects a downstream event that does not match an existing lead", async () => {
    const harness = createHarness();
    const result = await harness.service.ingest(harness.connector, {
      ...row,
      externalRowId: "102",
      dedupeKey: "kinbox:qualified:20260712",
      eventType: "qualified_lead",
      externalLeadId: null,
      phone: "20260712",
    });

    expect(result).toMatchObject({
      status: "rejected",
      leadId: null,
      conversionEventLogId: null,
      queued: false,
      errorCode: "ExternalLeadNotMatched",
    });
    expect(
      harness.leadsService.upsertFromWhatsappWebhook,
    ).not.toHaveBeenCalled();
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).not.toHaveBeenCalled();
    expect(harness.prisma.externalIngestionRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "rejected",
          errorCode: "ExternalLeadNotMatched",
        }),
      }),
    );
  });

  it("matches a downstream event by the imported external lead id", async () => {
    const harness = createHarness();
    harness.prisma.externalIngestionRecord.findFirst.mockResolvedValueOnce({
      leadId: "lead_1",
    });

    const result = await harness.service.ingest(harness.connector, {
      ...row,
      externalRowId: "103",
      dedupeKey: "kinbox:qualified:30843618",
      eventType: "qualified_lead",
      phone: "30843618",
    });

    expect(result).toMatchObject({ status: "imported", leadId: "lead_1" });
    expect(
      harness.prisma.externalIngestionRecord.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stream: "leads",
          summaryPayload: {
            path: ["externalLeadId"],
            equals: "30843618",
          },
        }),
      }),
    );
    expect(
      harness.leadsService.upsertFromWhatsappWebhook,
    ).not.toHaveBeenCalled();
  });

  it("retries an unmatched event after its lead becomes available", async () => {
    const harness = createHarness();
    harness.prisma.externalIngestionRecord.findUnique.mockResolvedValueOnce({
      id: "ingestion_rejected",
      status: "rejected",
      leadId: null,
      conversionEventLogId: null,
      duplicateCount: 0,
      errorCode: "ExternalLeadNotMatched",
    });

    const result = await harness.service.ingest(harness.connector, row);

    expect(result).toMatchObject({ status: "imported", leadId: "lead_1" });
    expect(
      harness.prisma.externalIngestionRecord.create,
    ).not.toHaveBeenCalled();
    expect(harness.prisma.externalIngestionRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ingestion_rejected" },
        data: expect.objectContaining({
          status: "imported",
          leadId: "lead_1",
          conversionEventLogId: "conversion_1",
          errorCode: null,
        }),
      }),
    );
  });

  it("reassigns legacy orphan events to the imported lead and removes the bogus lead", async () => {
    const harness = createHarness();
    harness.prisma.lead.findMany.mockResolvedValueOnce([{ id: "lead_orphan" }]);
    harness.prisma.externalIngestionRecord.findMany.mockResolvedValueOnce([
      {
        id: "ingestion_orphan",
        eventType: "qualified_lead",
        conversionEventLogId: "conversion_orphan",
        summaryPayload: { externalLeadId: "30843618" },
      },
    ]);
    harness.prisma.externalIngestionRecord.findFirst.mockResolvedValueOnce({
      leadId: "lead_1",
    });

    const result = await harness.service.reconcileLegacyOrphanPromotions(
      harness.connector,
    );

    expect(result).toEqual({ reconciled: 1, rejected: 0 });
    expect(harness.prisma.externalIngestionRecord.update).toHaveBeenCalledWith({
      where: { id: "ingestion_orphan" },
      data: {
        leadId: "lead_1",
        errorCode: null,
        errorMessage: null,
      },
    });
    expect(harness.prisma.conversionEventLog.update).toHaveBeenCalledWith({
      where: { id: "conversion_orphan" },
      data: {
        leadId: "lead_1",
        phoneHash: "phone_hash_1",
        customerIdentityKey: "phone_hash_1",
      },
    });
    expect(harness.prisma.lead.delete).toHaveBeenCalledWith({
      where: { id: "lead_orphan" },
    });
  });

  it("skips legacy orphan events that have no imported lead match", async () => {
    const harness = createHarness();
    harness.prisma.lead.findMany.mockResolvedValueOnce([{ id: "lead_orphan" }]);
    harness.prisma.externalIngestionRecord.findMany.mockResolvedValueOnce([
      {
        id: "ingestion_orphan",
        eventType: "purchase",
        conversionEventLogId: "conversion_orphan",
        summaryPayload: { externalLeadId: "missing_lead" },
      },
    ]);

    const result = await harness.service.reconcileLegacyOrphanPromotions(
      harness.connector,
    );

    expect(result).toEqual({ reconciled: 0, rejected: 1 });
    expect(harness.prisma.externalIngestionRecord.update).toHaveBeenCalledWith({
      where: { id: "ingestion_orphan" },
      data: expect.objectContaining({
        status: "rejected",
        leadId: null,
        errorCode: "ExternalLeadNotMatched",
      }),
    });
    expect(harness.prisma.conversionEventLog.update).toHaveBeenCalledWith({
      where: { id: "conversion_orphan" },
      data: expect.objectContaining({
        status: "skipped",
        leadId: null,
        errorCode: "ExternalLeadNotMatched",
      }),
    });
    expect(harness.prisma.lead.delete).toHaveBeenCalledWith({
      where: { id: "lead_orphan" },
    });
  });

  it("keeps a persisted event pending when the CAPI queue is temporarily unavailable", async () => {
    const harness = createHarness({
      shadowMode: false,
      capiSendEnabled: true,
      enqueueError: new Error("redis unavailable"),
    });
    const result = await harness.service.ingest(harness.connector, row);

    expect(result).toMatchObject({
      status: "imported",
      queued: false,
      errorCode: "ExternalCapiQueueFailed",
    });
    expect(harness.prisma.externalIngestionRecord.update).toHaveBeenCalledWith({
      where: { id: "ingestion_1" },
      data: expect.objectContaining({
        status: "pending_delivery",
        errorCode: "ExternalCapiQueueFailed",
      }),
    });
    expect(
      harness.prisma.externalIngestionRecord.upsert,
    ).not.toHaveBeenCalled();
  });

  it("records a historical milestone as imported without enqueueing CAPI", async () => {
    const harness = createHarness({ shadowMode: false, capiSendEnabled: true });
    const result = await harness.service.ingest(harness.connector, row, {
      deliveryStatus: "imported",
      updateLeadStatus: false,
    });

    expect(result).toMatchObject({ status: "imported", queued: false });
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryStatus: "imported" }),
    );
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
    expect(harness.prisma.lead.update).not.toHaveBeenCalled();
  });

  it("keeps a pre-cutover event as shadow evidence", async () => {
    const harness = createHarness({
      capiCutovers: [
        {
          eventType: "purchase",
          activatedAt: new Date("2026-07-11T15:00:00.000Z"),
        },
      ],
    });

    const result = await harness.service.ingest(harness.connector, row);

    expect(result).toMatchObject({ status: "imported", queued: false });
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryStatus: "shadow_observed" }),
    );
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
  });

  it("queues only events occurring after the cutover for that event type", async () => {
    const harness = createHarness({
      capiCutovers: [
        {
          eventType: "purchase",
          activatedAt: new Date("2026-07-11T13:00:00.000Z"),
        },
      ],
    });

    const result = await harness.service.ingest(harness.connector, row);

    expect(result).toMatchObject({ status: "imported", queued: true });
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).toHaveBeenCalledWith(
      expect.not.objectContaining({ deliveryStatus: "shadow_observed" }),
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledWith(
      "conversion_1",
    );
  });

  it("keeps an external event without ctwa_clid out of the CAPI queue", async () => {
    const harness = createHarness({
      shadowMode: false,
      capiSendEnabled: true,
      leadCtwaClid: null,
    });

    const result = await harness.service.ingest(harness.connector, {
      ...row,
      ctwaClid: null,
    });

    expect(result).toMatchObject({ status: "imported", queued: false });
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        ctwaClid: null,
        deliveryStatus: "not_eligible",
      }),
    );
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
  });

  it("filters a Kinbox conversation without ctwa_clid before any business storage", async () => {
    const harness = createHarness({
      shadowMode: false,
      capiSendEnabled: true,
      leadCtwaClid: null,
    });
    const result = await harness.service.ingest(harness.connector, {
      ...row,
      externalRowId: "organic_conversation_1",
      provider: "meta_whatsapp_official",
      eventType: "conversation_started",
      externalEventId: "wamid.organic",
      transactionId: null,
      ctwaClid: null,
      valueCents: null,
      currency: null,
      valueSource: null,
    });

    expect(result).toEqual({
      externalRowId: "organic_conversation_1",
      status: "filtered",
      leadId: null,
      conversionEventLogId: null,
      queued: false,
      errorCode: null,
    });
    expect(
      harness.prisma.externalIngestionRecord.findUnique,
    ).not.toHaveBeenCalled();
    expect(
      harness.leadsService.upsertFromWhatsappWebhook,
    ).not.toHaveBeenCalled();
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).not.toHaveBeenCalled();
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
  });

  it("uses the row provider policy so another integration can keep same-day transactions", async () => {
    const firstHarness = createHarness();
    const secondHarness = createHarness();
    const providerRow = {
      ...row,
      provider: "commerce_provider",
      transactionId: "order_1",
    };

    await firstHarness.service.ingest(firstHarness.connector, providerRow);
    await secondHarness.service.ingest(secondHarness.connector, {
      ...providerRow,
      externalRowId: "102",
      transactionId: "order_2",
    });

    const firstCalls = firstHarness.conversionEventsService
      .recordExternalConversion.mock.calls as unknown as Array<
      [Record<string, string>]
    >;
    const secondCalls = secondHarness.conversionEventsService
      .recordExternalConversion.mock.calls as unknown as Array<
      [Record<string, string>]
    >;
    const firstInput = firstCalls[0]?.[0];
    const secondInput = secondCalls[0]?.[0];

    if (!firstInput || !secondInput) {
      throw new Error("Expected both provider events to be recorded");
    }

    expect(firstInput.sourceTrigger).toBe("external_mysql:commerce_provider");
    expect(firstInput.dedupeKey).not.toBe(secondInput.dedupeKey);
  });

  it("ingests a Meta conversation and queues LeadSubmitted through WppTrack after cutover", async () => {
    const harness = createHarness({
      capiCutovers: [
        {
          eventType: "conversation_started",
          activatedAt: new Date("2026-07-11T13:00:00.000Z"),
        },
      ],
    });
    const conversationRow: ExternalEventRow = {
      ...row,
      dedupeKey: "meta:conversation:123456789000000:wamid.test",
      provider: "meta_whatsapp_official",
      eventType: "conversation_started",
      sourceEventName: "messages",
      externalEventId: "wamid.test",
      transactionId: null,
      valueCents: null,
      currency: null,
      valueSource: null,
    };

    const result = await harness.service.ingest(
      { ...harness.connector, provider: "meta_whatsapp_official" },
      conversationRow,
    );

    expect(result).toMatchObject({
      status: "imported",
      queued: true,
      conversionEventLogId: "conversion_1",
    });
    expect(harness.leadsService.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "external_mysql",
        phone: conversationRow.phone,
        ctwaClid: conversationRow.ctwaClid,
        recordMessageTimestamps: true,
      }),
    );
    expect(
      harness.conversionEventsService.recordExternalConversion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "LeadSubmitted",
        sourceEventId: "wamid.test",
        sourceTrigger: "external_mysql:meta_whatsapp_official",
      }),
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledWith(
      "conversion_1",
    );
  });
});
