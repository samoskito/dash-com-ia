import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ExternalDataService } from "../src/external-data/external-data.service";

describe("ExternalDataService", () => {
  it("lists connectors with aggregated ingestion totals", async () => {
    const now = new Date("2026-07-11T15:00:00.000Z");
    const prisma = {
      externalDataConnector: {
        findMany: vi.fn(async () => [
          {
            id: "connector_1",
            workspaceId: "workspace_1",
            name: "Cliente Barbieri",
            provider: "kinbox_mysql",
            status: "active",
            timezone: "America/Sao_Paulo",
            sslMode: "required",
            credentialsEncrypted: "ciphertext",
            credentialsIv: "iv",
            credentialsTag: "tag",
            syncEnabled: true,
            shadowMode: true,
            capiSendEnabled: false,
            purchaseAverageValueCents: 400_000,
            defaultCurrency: "BRL",
            lastConnectionTestAt: now,
            lastConnectionStatus: "connected",
            lastSyncStartedAt: now,
            lastSyncCompletedAt: now,
            lastSyncStatus: "completed",
            lastSyncErrorCode: null,
            cursors: [
              {
                stream: "events",
                lastExternalId: "event_3",
                lastUpdatedAt: now,
                lastSyncedAt: now
              }
            ],
            createdAt: now,
            updatedAt: now
          }
        ])
      },
      externalIngestionRecord: {
        findMany: vi.fn(async () => [
          {
            connectorId: "connector_1",
            eventType: "conversation_started",
            conversionEventLogId: "conversion_1"
          },
          {
            connectorId: "connector_1",
            eventType: "qualified_lead",
            conversionEventLogId: "conversion_2"
          },
          {
            connectorId: "connector_1",
            eventType: "purchase",
            conversionEventLogId: "conversion_3"
          }
        ]),
        groupBy: vi.fn(
          async (args: {
            by: string[];
            where?: Record<string, unknown>;
          }): Promise<Array<Record<string, unknown>>> => {
            if (args.by.includes("eventType")) {
              if (args.by.includes("status")) {
                return [
                  ...["conversation_started", "qualified_lead", "purchase"].map((eventType) => ({
                    connectorId: "connector_1",
                    eventType,
                    status: "imported",
                    errorCode: null,
                    _count: { _all: 1 },
                    _sum: { duplicateCount: 0 },
                    _min: { occurredAt: now },
                    _max: { occurredAt: now }
                  })),
                  {
                    connectorId: "connector_1",
                    eventType: "qualified_lead",
                    status: "duplicate",
                    errorCode: null,
                    _count: { _all: 1 },
                    _sum: { duplicateCount: 1 },
                    _min: { occurredAt: now },
                    _max: { occurredAt: now }
                  },
                  {
                    connectorId: "connector_1",
                    eventType: "qualified_lead",
                    status: "rejected",
                    errorCode: "ExternalLeadNotMatched",
                    _count: { _all: 5 },
                    _sum: { duplicateCount: 0 },
                    _min: { occurredAt: now },
                    _max: { occurredAt: now }
                  },
                  {
                    connectorId: "connector_1",
                    eventType: "purchase",
                    status: "rejected",
                    errorCode: "ExternalLeadNotMatched",
                    _count: { _all: 1 },
                    _sum: { duplicateCount: 0 },
                    _min: { occurredAt: now },
                    _max: { occurredAt: now }
                  }
                ];
              }

              if (args.where?.externalRowId) {
                return [];
              }

              return ["conversation_started", "qualified_lead", "purchase"].map((eventType) => ({
                connectorId: "connector_1",
                eventType,
                _count: { _all: 1 }
              }));
            }

            if (args.by.includes("connectorId")) {
              return [
                {
                  connectorId: "connector_1",
                  status: "imported",
                  errorCode: null,
                  _count: { _all: 116 },
                  _sum: { duplicateCount: 2 }
                },
                {
                  connectorId: "connector_1",
                  status: "rejected",
                  errorCode: "ExternalLeadNotMatched",
                  _count: { _all: 1 },
                  _sum: { duplicateCount: 0 }
                },
                {
                  connectorId: "connector_1",
                  status: "removed",
                  errorCode: "ExternalLeadRemovedAtSource",
                  _count: { _all: 4 },
                  _sum: { duplicateCount: 9 }
                }
              ];
            }

            return [];
          }
        )
      },
      conversionEventLog: {
        groupBy: vi.fn(async () => [
          ...[
            ["LeadSubmitted", "conversation_started"],
            ["QualifiedLead", "qualified_lead"],
            ["Purchase", "purchase"]
          ].map(([eventName]) => ({
            externalConnectorId: "connector_1",
            eventName,
            status: "ready_to_send",
            businessSource: "paid",
            _count: { _all: 1 }
          })),
          {
            externalConnectorId: "connector_1",
            eventName: "QualifiedLead",
            status: "not_eligible",
            businessSource: "paid",
            _count: { _all: 1 }
          }
        ])
      },
      metaIntegration: {
        findMany: vi.fn(async () => [
          {
            workspaceId: "workspace_1",
            status: "connected",
            encryptedAccessToken: "encrypted-token"
          }
        ])
      },
      metaConversionDestination: {
        findMany: vi.fn(async () => [
          {
            workspaceId: "workspace_1",
            status: "configured",
            pixelId: "pixel_1",
            pageId: "page_1"
          }
        ])
      }
    };
    const service = new ExternalDataService(prisma as never, {} as never, {} as never, {} as never);

    const compatibleResult = await service.listConnectors();

    expect(compatibleResult[0]).toMatchObject({ id: "connector_1" });
    expect(prisma.externalIngestionRecord.groupBy).not.toHaveBeenCalled();
    expect(prisma.externalIngestionRecord.findMany).not.toHaveBeenCalled();

    const result = await service.listConnectors(undefined, true);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      connector: {
        id: "connector_1",
        lastSyncStatus: "completed"
      },
      totals: {
        imported: 116,
        duplicates: 2,
        rejected: 1,
        quarantined: 1,
        failed: 0,
        pending: 0
      },
      reconciliation: {
        state: "ready",
        readyForCutover: true,
        blockers: [],
        events: expect.arrayContaining([
          expect.objectContaining({
            eventType: "qualified_lead",
            sourceRows: 7,
            acceptedRows: 2,
            operationalRows: 1,
            expectedMatchedRows: 1,
            matchedRows: 2,
            notEligibleRows: 1,
            blockedDeliveryRows: 0,
            rejectedRows: 5,
            quarantinedRows: 5,
            blockingRejectedRows: 0
          }),
          expect.objectContaining({
            eventType: "purchase",
            sourceRows: 2,
            acceptedRows: 1,
            operationalRows: 1,
            expectedMatchedRows: 1,
            matchedRows: 1,
            rejectedRows: 1,
            quarantinedRows: 1,
            blockingRejectedRows: 0
          })
        ])
      }
    });
    expect(prisma.externalIngestionRecord.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["connectorId", "status", "errorCode"],
        where: { connectorId: { in: ["connector_1"] } }
      })
    );
    expect(prisma.conversionEventLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              externalConnectorId: "connector_1",
              id: { in: ["conversion_1", "conversion_2", "conversion_3"] }
            }
          ]
        })
      })
    );
    expect(prisma.externalIngestionRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.metaIntegration.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.metaConversionDestination.findMany).toHaveBeenCalledTimes(1);

    const originalGroupBy = prisma.externalIngestionRecord.groupBy.getMockImplementation();
    prisma.externalIngestionRecord.groupBy.mockImplementation(async (args) => {
      const groups = await originalGroupBy!(args);
      if (args.by.includes("eventType") && args.by.includes("status")) {
        return [
          ...groups,
          {
            connectorId: "connector_1",
            eventType: "qualified_lead",
            status: "rejected",
            errorCode: "ExternalPayloadInvalid",
            _count: { _all: 1 },
            _sum: { duplicateCount: 0 },
            _min: { occurredAt: now },
            _max: { occurredAt: now }
          }
        ];
      }
      return groups;
    });

    const blockedResult = await service.listConnectors(undefined, true);

    expect(blockedResult[0]).toMatchObject({
      reconciliation: {
        state: "blocked",
        readyForCutover: false,
        events: expect.arrayContaining([
          expect.objectContaining({
            eventType: "qualified_lead",
            blockingRejectedRows: 1
          })
        ]),
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: "REJECTED_QUALIFIED_LEAD" })
        ])
      }
    });
  });

  it("keeps collecting when only a quarantined purchase was observed", async () => {
    const now = new Date("2026-07-12T20:00:00.000Z");
    const connector = {
      id: "connector_1",
      workspaceId: "workspace_1",
      name: "Cliente Barbieri",
      provider: "kinbox_mysql",
      status: "active",
      timezone: "America/Sao_Paulo",
      sslMode: "required",
      credentialsEncrypted: "ciphertext",
      credentialsIv: "iv",
      credentialsTag: "tag",
      syncEnabled: true,
      shadowMode: true,
      capiSendEnabled: false,
      purchaseAverageValueCents: 400_000,
      defaultCurrency: "BRL",
      lastConnectionTestAt: now,
      lastConnectionStatus: "connected",
      lastSyncStartedAt: now,
      lastSyncCompletedAt: now,
      lastSyncStatus: "completed",
      lastSyncErrorCode: null,
      cursors: [
        {
          stream: "events",
          lastExternalId: "event_2",
          lastUpdatedAt: now,
          lastSyncedAt: now
        }
      ],
      createdAt: now,
      updatedAt: now
    };
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => connector)
      },
      externalIngestionRecord: {
        findMany: vi.fn(async () => [
          {
            connectorId: "connector_1",
            eventType: "conversation_started",
            conversionEventLogId: "conversion_1"
          },
          {
            connectorId: "connector_1",
            eventType: "qualified_lead",
            conversionEventLogId: "conversion_2"
          }
        ]),
        groupBy: vi.fn(async (args: { by: string[]; where?: Record<string, unknown> }) => {
          if (args.by.includes("eventType")) {
            if (args.by.includes("status")) {
              return [
                ...["conversation_started", "qualified_lead"].map((eventType) => ({
                  connectorId: "connector_1",
                  eventType,
                  status: "imported",
                  errorCode: null,
                  _count: { _all: 1 },
                  _sum: { duplicateCount: 0 },
                  _min: { occurredAt: now },
                  _max: { occurredAt: now }
                })),
                {
                  connectorId: "connector_1",
                  eventType: "purchase",
                  status: "rejected",
                  errorCode: "ExternalLeadNotMatched",
                  _count: { _all: 1 },
                  _sum: { duplicateCount: 0 },
                  _min: { occurredAt: now },
                  _max: { occurredAt: now }
                }
              ];
            }
            if (args.where?.externalRowId) {
              return [];
            }
            return ["conversation_started", "qualified_lead"].map((eventType) => ({
              connectorId: "connector_1",
              eventType,
              _count: { _all: 1 }
            }));
          }
          return [];
        })
      },
      conversionEventLog: {
        groupBy: vi.fn(async () => [
          {
            externalConnectorId: "connector_1",
            eventName: "LeadSubmitted",
            status: "ready_to_send",
            businessSource: "paid",
            _count: { _all: 1 }
          },
          {
            externalConnectorId: "connector_1",
            eventName: "QualifiedLead",
            status: "ready_to_send",
            businessSource: "paid",
            _count: { _all: 1 }
          }
        ])
      },
      metaIntegration: {
        findMany: vi.fn(async () => [
          {
            workspaceId: "workspace_1",
            status: "connected",
            encryptedAccessToken: "encrypted-token"
          }
        ])
      },
      metaConversionDestination: {
        findMany: vi.fn(async () => [
          {
            workspaceId: "workspace_1",
            status: "configured",
            pixelId: "pixel_1",
            pageId: "page_1"
          }
        ])
      }
    };
    const service = new ExternalDataService(prisma as never, {} as never, {} as never, {} as never);

    const health = await service.getHealth("connector_1");

    expect(health.reconciliation).toMatchObject({
      state: "collecting",
      readyForCutover: false,
      events: expect.arrayContaining([
        expect.objectContaining({
          eventType: "purchase",
          sourceRows: 1,
          acceptedRows: 0,
          operationalRows: 0,
          rejectedRows: 1,
          quarantinedRows: 1,
          blockingRejectedRows: 0
        })
      ])
    });
    expect(health.reconciliation?.blockers.map((blocker) => blocker.code)).toEqual([
      "EVENT_NOT_OBSERVED_PURCHASE"
    ]);
  });

  it("creates an encrypted connector and never returns credential material", async () => {
    const now = new Date("2026-07-11T15:00:00.000Z");
    const prisma = {
      workspace: {
        findUnique: vi.fn(async () => ({ id: "workspace_1" }))
      },
      externalDataConnector: {
        create: vi.fn(async ({ data }) => ({
          id: "connector_1",
          ...data,
          status: "draft",
          lastConnectionTestAt: null,
          lastConnectionStatus: null,
          lastSyncStartedAt: null,
          lastSyncCompletedAt: null,
          lastSyncStatus: null,
          lastSyncErrorCode: null,
          cursors: [],
          createdAt: now,
          updatedAt: now
        }))
      },
      auditLog: { create: vi.fn(async () => ({})) }
    };
    const encryption = {
      encrypt: vi.fn(() => ({
        credentialsEncrypted: "ciphertext",
        credentialsIv: "iv",
        credentialsTag: "tag"
      }))
    };
    const service = new ExternalDataService(
      prisma as never,
      encryption as never,
      {} as never,
      {} as never
    );
    const result = await service.createConnector(
      {
        workspaceId: "workspace_1",
        name: "Cliente Barbieri",
        provider: "kinbox_mysql",
        timezone: "America/Sao_Paulo",
        sslMode: "required",
        credentials: {
          host: "mysql.internal",
          port: 3306,
          database: "tracking",
          username: "wpptrack_reader",
          password: "strong-password"
        },
        syncEnabled: false,
        shadowMode: true,
        capiSendEnabled: false,
        purchaseAverageValueCents: 400_000,
        defaultCurrency: "BRL"
      },
      "admin_1"
    );

    expect(result).toMatchObject({
      id: "connector_1",
      hasCredentials: true,
      shadowMode: true
    });
    expect(JSON.stringify(result)).not.toContain("strong-password");
    expect(JSON.stringify(result)).not.toContain("ciphertext");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin_1",
        action: "external_connector.created"
      })
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain("strong-password");
  });

  it("does not activate synchronization before a successful connection test", async () => {
    const now = new Date("2026-07-11T15:00:00.000Z");
    const update = vi.fn();
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => ({
          id: "connector_1",
          workspaceId: "workspace_1",
          name: "Cliente Barbieri",
          provider: "kinbox_mysql",
          status: "draft",
          timezone: "America/Sao_Paulo",
          sslMode: "required",
          credentialsEncrypted: "ciphertext",
          credentialsIv: "iv",
          credentialsTag: "tag",
          syncEnabled: false,
          shadowMode: true,
          capiSendEnabled: false,
          purchaseAverageValueCents: null,
          defaultCurrency: "BRL",
          lastConnectionTestAt: null,
          lastConnectionStatus: null,
          lastSyncStartedAt: null,
          lastSyncCompletedAt: null,
          lastSyncStatus: null,
          lastSyncErrorCode: null,
          cursors: [],
          createdAt: now,
          updatedAt: now
        })),
        update
      }
    };
    const service = new ExternalDataService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.updateConnector("connector_1", { status: "active", syncEnabled: true }, "admin_1")
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it("queues an idempotent lead projection refresh", async () => {
    const enqueueSync = vi.fn(async () => ({
      connectorId: "connector_1",
      streams: ["leads"] as const,
      jobId: "external-data-sync_connector_1_leads",
      status: "queued" as const
    }));
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => ({
          id: "connector_1",
          workspaceId: "workspace_1",
          status: "active",
          lastSyncStatus: "completed",
          cursors: []
        }))
      },
      auditLog: { create: vi.fn(async () => ({})) }
    };
    const service = new ExternalDataService(
      prisma as never,
      {} as never,
      {} as never,
      { enqueueSync } as never
    );

    const result = await service.enqueueLeadsReimport("connector_1", "admin_1");

    expect(enqueueSync).toHaveBeenCalledWith({
      connectorId: "connector_1",
      streams: ["leads"],
      projectionRefresh: true,
      requestedByUserId: "admin_1"
    });
    expect(result.status).toBe("queued");
  });
});
