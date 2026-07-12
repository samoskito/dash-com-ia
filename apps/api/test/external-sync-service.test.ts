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
        .mockResolvedValueOnce([eventRow])
        .mockResolvedValueOnce([]),
      readLeadsPage: vi.fn()
    };
    const ingestion = {
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
      queued: 0
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
  });

  it("refreshes lead projections without moving cursors or duplicate counters", async () => {
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
      lead: { update: vi.fn(async () => ({})) },
      externalIngestionRecord: {
        findUnique: vi.fn(),
        upsert: vi.fn()
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
        .mockResolvedValueOnce([leadRow])
        .mockResolvedValueOnce([]),
      readEventsPage: vi.fn()
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
      {} as never
    );

    const result = await service.syncConnector("connector_1", ["leads"], {
      projectionRefresh: true
    });

    expect(result.counts.imported).toBe(1);
    expect(leadsService.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "5511999999999" })
    );
    expect(prisma.externalIngestionRecord.findUnique).not.toHaveBeenCalled();
    expect(prisma.externalIngestionRecord.upsert).not.toHaveBeenCalled();
    expect(prisma.externalSyncCursor.findUnique).not.toHaveBeenCalled();
    expect(prisma.externalSyncCursor.upsert).not.toHaveBeenCalled();
  });
});
