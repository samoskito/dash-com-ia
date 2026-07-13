import { describe, expect, it, vi } from "vitest";
import { ExternalSyncService } from "../src/external-data/external-sync.service";
import type {
  ExternalEventRow,
  ExternalLeadRow
} from "../src/external-data/external-mysql.adapter";

const eventRow: ExternalEventRow = {
  externalRowId: "42",
  dedupeKey: "kinbox:qualified:5511999999999",
  provider: "kinbox_mysql",
  eventType: "qualified_lead",
  sourceEventName: "EnvioProposta",
  externalEventId: null,
  externalLeadId: "lead_external_1",
  transactionId: null,
  phone: "5511999999999",
  occurredAt: "2026-07-11 15:00:00.000",
  eventLocalDate: "2026-07-11",
  adId: null,
  adSetId: null,
  campaignId: null,
  ctwaClid: null,
  sourceUrl: null,
  valueCents: null,
  currency: null,
  valueSource: null,
  duplicateCount: 0,
  updatedAt: "2026-07-11 15:00:01.000"
};

const leadRow: ExternalLeadRow = {
  externalRowId: "lead-row-42",
  externalLeadId: "lead_external_1",
  phone: "5511999999999",
  name: "Lead real",
  email: null,
  city: null,
  state: null,
  country: null,
  firstMessageAt: "2026-07-11 15:00:00.000",
  lastMessageAt: "2026-07-11 15:00:00.000",
  qualifiedAt: null,
  purchasedAt: null,
  adId: "ad_1",
  ctwaClid: "ctwa_1",
  sourceUrl: "https://example.test/ad",
  status: "Entrou em contato",
  updatedAt: "2026-07-11 15:00:01.000"
};

describe("ExternalSyncService", () => {
  it("persists each event page before advancing the independent event cursor", async () => {
    const eventWithAd: ExternalEventRow = {
      ...eventRow,
      adId: "ad_1"
    };
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => ({
          id: "connector_1",
          workspaceId: "workspace_1",
          provider: "kinbox_mysql",
          status: "active",
          timezone: "America/Sao_Paulo",
          sslMode: "required",
          credentialsEncrypted: "encrypted",
          credentialsIv: "iv",
          credentialsTag: "tag",
          shadowMode: true,
          capiSendEnabled: false,
          purchaseAverageValueCents: 400_000,
          defaultCurrency: "BRL"
        })),
        update: vi.fn(async () => ({}))
      },
      integrationLog: {
        create: vi.fn(async () => ({ id: "integration_1" })),
        update: vi.fn(async () => ({}))
      },
      metaAd: {
        findMany: vi.fn(async () => [
          {
            adId: "ad_1",
            campaignId: "campaign_1",
            adSetId: "adset_1"
          }
        ])
      },
      externalSyncCursor: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({}))
      },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations)
      )
    };
    const encryption = {
      decrypt: vi.fn(() => ({
        host: "mysql.internal",
        port: 3306,
        database: "tracking",
        username: "reader",
        password: "secret"
      }))
    };
    const adapter = {
      readEventsPage: vi
        .fn()
        .mockResolvedValueOnce([eventWithAd])
        .mockResolvedValueOnce([]),
      readLeadsPage: vi.fn()
    };
    const ingestion = {
      reconcileLegacyOrphanPromotions: vi.fn(async () => ({
        reconciled: 0,
        rejected: 0
      })),
      ingest: vi.fn(async () => ({
        externalRowId: "42",
        status: "imported" as const,
        leadId: "lead_1",
        conversionEventLogId: "conversion_1",
        queued: false,
        errorCode: null
      }))
    };
    const service = new ExternalSyncService(
      prisma as never,
      {} as never,
      encryption as never,
      adapter as never,
      ingestion as never
    );
    const result = await service.syncConnector("connector_1", ["events"]);

    expect(result.counts).toEqual({
      read: 1,
      imported: 1,
      duplicates: 0,
      rejected: 0,
      queued: 0,
      removed: 0
    });
    expect(ingestion.ingest.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.externalSyncCursor.upsert.mock.invocationCallOrder[0]!
    );
    expect(prisma.externalSyncCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          connectorId_stream: {
            connectorId: "connector_1",
            stream: "events"
          }
        },
        update: expect.objectContaining({ lastExternalId: "42" })
      })
    );
    expect(adapter.readLeadsPage).not.toHaveBeenCalled();
    expect(ingestion.reconcileLegacyOrphanPromotions).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "connector_1",
        workspaceId: "workspace_1"
      })
    );
    expect(prisma.metaAd.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        adId: { in: ["ad_1"] }
      },
      select: {
        adId: true,
        campaignId: true,
        adSetId: true
      }
    });
    expect(ingestion.ingest).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        adId: "ad_1",
        campaignId: "campaign_1",
        adSetId: "adset_1"
      })
    );
  });

  it("refreshes lead projections without moving cursors or duplicate counters", async () => {
    const historicalLeadRow: ExternalLeadRow = {
      ...leadRow,
      firstMessageAt: "2026-07-11 00:00:00.000",
      qualifiedAt: "2026-07-11 00:00:00.000",
      purchasedAt: "2026-07-12 00:00:00.000"
    };
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => ({
          id: "connector_1",
          workspaceId: "workspace_1",
          provider: "kinbox_mysql",
          status: "active",
          timezone: "America/Sao_Paulo",
          sslMode: "required",
          credentialsEncrypted: "encrypted",
          credentialsIv: "iv",
          credentialsTag: "tag",
          shadowMode: true,
          capiSendEnabled: false,
          purchaseAverageValueCents: 400_000,
          defaultCurrency: "BRL"
        })),
        update: vi.fn(async () => ({}))
      },
      integrationLog: {
        create: vi.fn(async () => ({ id: "integration_1" })),
        update: vi.fn(async () => ({}))
      },
      metaAd: {
        findMany: vi.fn(async () => [
          {
            adId: "ad_1",
            campaignId: "campaign_1",
            adSetId: "adset_1"
          }
        ])
      },
      lead: { update: vi.fn(async () => ({})) },
      externalIngestionRecord: {
        findUnique: vi.fn(),
        findMany: vi.fn(async () => []),
        upsert: vi.fn(async () => ({}))
      },
      externalSyncCursor: {
        findUnique: vi.fn(),
        upsert: vi.fn()
      },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations)
      )
    };
    const leadsService = {
      upsertFromWhatsappWebhook: vi.fn(async () => ({ id: "lead_1" }))
    };
    const adapter = {
      readLeadsPage: vi
        .fn()
        .mockResolvedValueOnce([historicalLeadRow])
        .mockResolvedValueOnce([]),
      readEventsPage: vi.fn()
    };
    const eventIngestion = {
      ingest: vi.fn(async (_connector: unknown, row: ExternalEventRow) => ({
        externalRowId: row.externalRowId,
        status: "imported" as const,
        leadId: "lead_1",
        conversionEventLogId: `conversion_${row.eventType}`,
        queued: false,
        errorCode: null
      }))
    };
    const service = new ExternalSyncService(
      prisma as never,
      leadsService as never,
      {
        decrypt: vi.fn(() => ({
          host: "mysql.internal",
          port: 3306,
          database: "tracking",
          username: "reader",
          password: "secret"
        }))
      } as never,
      adapter as never,
      eventIngestion as never
    );

    const result = await service.syncConnector("connector_1", ["leads"], {
      projectionRefresh: true
    });

    expect(result.counts.imported).toBe(1);
    expect(leadsService.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "5511999999999",
        adId: "ad_1",
        campaignId: "campaign_1",
        adSetId: "adset_1",
        firstMessageAt: new Date("2026-07-11T03:00:00.000Z")
      })
    );
    expect(prisma.metaAd.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.externalIngestionRecord.findUnique).not.toHaveBeenCalled();
    expect(prisma.externalIngestionRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.externalIngestionRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          duplicateCount: expect.anything()
        })
      })
    );
    expect(prisma.externalIngestionRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          connectorId: "connector_1",
          stream: "leads",
          lastReceivedAt: { lt: expect.any(Date) }
        })
      })
    );
    expect(prisma.externalSyncCursor.findUnique).not.toHaveBeenCalled();
    expect(prisma.externalSyncCursor.upsert).not.toHaveBeenCalled();
    expect(eventIngestion.ingest).toHaveBeenCalledTimes(2);
    expect(eventIngestion.ingest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "connector_1", shadowMode: true }),
      expect.objectContaining({
        eventType: "qualified_lead",
        occurredAt: "2026-07-11T03:00:00.000Z",
        eventLocalDate: "2026-07-11"
      }),
      { deliveryStatus: "imported", updateLeadStatus: false }
    );
    expect(eventIngestion.ingest).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({
        eventType: "purchase",
        occurredAt: "2026-07-12T03:00:00.000Z",
        eventLocalDate: "2026-07-12"
      }),
      { deliveryStatus: "imported", updateLeadStatus: false }
    );
  });

  it("removes externally owned leads missing from a completed full reimport", async () => {
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => ({
          id: "connector_1",
          workspaceId: "workspace_1",
          provider: "kinbox_mysql",
          status: "active",
          timezone: "America/Sao_Paulo",
          sslMode: "required",
          credentialsEncrypted: "encrypted",
          credentialsIv: "iv",
          credentialsTag: "tag",
          shadowMode: true,
          capiSendEnabled: false,
          purchaseAverageValueCents: null,
          defaultCurrency: "BRL"
        })),
        update: vi.fn(async () => ({}))
      },
      integrationLog: {
        create: vi.fn(async () => ({ id: "integration_1" })),
        update: vi.fn(async () => ({}))
      },
      externalIngestionRecord: {
        findMany: vi.fn(async () => [
          { id: "ingestion_stale", leadId: "lead_stale" }
        ]),
        count: vi.fn(async () => 0),
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      lead: {
        findFirst: vi.fn(async () => ({ id: "lead_stale" })),
        delete: vi.fn(async () => ({ id: "lead_stale" }))
      },
      conversionEventLog: {
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations)
      )
    };
    const adapter = {
      readLeadsPage: vi.fn(async () => []),
      readEventsPage: vi.fn()
    };
    const service = new ExternalSyncService(
      prisma as never,
      {} as never,
      {
        decrypt: vi.fn(() => ({
          host: "mysql.internal",
          port: 3306,
          database: "tracking",
          username: "reader",
          password: "secret"
        }))
      } as never,
      adapter as never,
      {} as never
    );

    const result = await service.syncConnector("connector_1", ["leads"], {
      projectionRefresh: true
    });

    expect(result.counts).toMatchObject({ read: 0, removed: 1 });
    expect(prisma.externalIngestionRecord.count).toHaveBeenCalledWith({
      where: {
        id: { notIn: ["ingestion_stale"] },
        stream: "leads",
        leadId: "lead_stale",
        status: { not: "removed" }
      }
    });
    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: {
        id: "lead_stale",
        workspaceId: "workspace_1",
        source: "external_mysql"
      },
      select: { id: true }
    });
    expect(prisma.conversionEventLog.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", leadId: "lead_stale" },
      data: expect.objectContaining({
        status: "skipped",
        leadId: null,
        errorCode: "ExternalLeadRemovedAtSource"
      })
    });
    expect(prisma.lead.delete).toHaveBeenCalledWith({
      where: { id: "lead_stale" }
    });
    expect(prisma.externalIngestionRecord.updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["ingestion_stale"] } },
      data: expect.objectContaining({
        status: "removed",
        leadId: null,
        errorCode: "ExternalLeadRemovedAtSource"
      })
    });
  });

  it("keeps a lead that still has another current source row", async () => {
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => ({
          id: "connector_1",
          workspaceId: "workspace_1",
          provider: "kinbox_mysql",
          status: "active",
          timezone: "America/Sao_Paulo",
          sslMode: "required",
          credentialsEncrypted: "encrypted",
          credentialsIv: "iv",
          credentialsTag: "tag",
          shadowMode: true,
          capiSendEnabled: false,
          purchaseAverageValueCents: null,
          defaultCurrency: "BRL"
        })),
        update: vi.fn(async () => ({}))
      },
      integrationLog: {
        create: vi.fn(async () => ({ id: "integration_1" })),
        update: vi.fn(async () => ({}))
      },
      externalIngestionRecord: {
        findMany: vi.fn(async () => [
          { id: "ingestion_stale", leadId: "lead_shared" }
        ]),
        count: vi.fn(async () => 1),
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      lead: {
        findFirst: vi.fn(),
        delete: vi.fn()
      },
      conversionEventLog: { updateMany: vi.fn() },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations)
      )
    };
    const service = new ExternalSyncService(
      prisma as never,
      {} as never,
      {
        decrypt: vi.fn(() => ({
          host: "mysql.internal",
          port: 3306,
          database: "tracking",
          username: "reader",
          password: "secret"
        }))
      } as never,
      { readLeadsPage: vi.fn(async () => []) } as never,
      {} as never
    );

    const result = await service.syncConnector("connector_1", ["leads"], {
      projectionRefresh: true
    });

    expect(result.counts.removed).toBe(0);
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.delete).not.toHaveBeenCalled();
    expect(prisma.conversionEventLog.updateMany).not.toHaveBeenCalled();
  });

  it("projects a purchase from every changed lead during incremental sync", async () => {
    const purchasedLeadRow: ExternalLeadRow = {
      ...leadRow,
      purchasedAt: "2026-07-12 00:00:00.000",
      status: "Comprou",
    };
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => ({
          id: "connector_1",
          workspaceId: "workspace_1",
          provider: "kinbox_mysql",
          status: "active",
          timezone: "America/Sao_Paulo",
          sslMode: "required",
          credentialsEncrypted: "encrypted",
          credentialsIv: "iv",
          credentialsTag: "tag",
          shadowMode: true,
          capiSendEnabled: false,
          purchaseAverageValueCents: 400_000,
          defaultCurrency: "BRL",
        })),
        update: vi.fn(async () => ({})),
      },
      integrationLog: {
        create: vi.fn(async () => ({ id: "integration_1" })),
        update: vi.fn(async () => ({})),
      },
      metaAd: {
        findMany: vi.fn(async () => [
          {
            adId: "ad_1",
            campaignId: "campaign_1",
            adSetId: "adset_1",
          },
        ]),
      },
      lead: { update: vi.fn(async () => ({})) },
      externalIngestionRecord: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
      },
      externalSyncCursor: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const leadsService = {
      upsertFromWhatsappWebhook: vi.fn(async () => ({ id: "lead_1" })),
    };
    const adapter = {
      readLeadsPage: vi
        .fn()
        .mockResolvedValueOnce([purchasedLeadRow])
        .mockResolvedValueOnce([]),
      readEventsPage: vi.fn(),
    };
    const eventIngestion = {
      ingest: vi.fn(async (_connector: unknown, row: ExternalEventRow) => ({
        externalRowId: row.externalRowId,
        status: "imported" as const,
        leadId: "lead_1",
        conversionEventLogId: "conversion_purchase",
        queued: false,
        errorCode: null,
      })),
    };
    const service = new ExternalSyncService(
      prisma as never,
      leadsService as never,
      {
        decrypt: vi.fn(() => ({
          host: "mysql.internal",
          port: 3306,
          database: "tracking",
          username: "reader",
          password: "secret",
        })),
      } as never,
      adapter as never,
      eventIngestion as never,
    );

    const result = await service.syncConnector("connector_1", ["leads"]);

    expect(result.counts).toMatchObject({ read: 1, imported: 1, rejected: 0 });
    expect(prisma.externalIngestionRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.externalSyncCursor.upsert).toHaveBeenCalled();
    expect(eventIngestion.ingest).toHaveBeenCalledOnce();
    expect(eventIngestion.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "connector_1",
        purchaseAverageValueCents: 400_000,
      }),
      expect.objectContaining({
        eventType: "purchase",
        occurredAt: "2026-07-12T03:00:00.000Z",
        eventLocalDate: "2026-07-12",
        valueCents: null,
      }),
      { deliveryStatus: "imported", updateLeadStatus: false },
    );
  });
});
