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
            cursors: [],
            createdAt: now,
            updatedAt: now,
          },
        ]),
      },
      externalIngestionRecord: {
        groupBy: vi.fn(async () => [
          {
            connectorId: "connector_1",
            status: "imported",
            _count: { _all: 116 },
            _sum: { duplicateCount: 2 },
          },
          {
            connectorId: "connector_1",
            status: "rejected",
            _count: { _all: 1 },
            _sum: { duplicateCount: 0 },
          },
          {
            connectorId: "connector_1",
            status: "removed",
            _count: { _all: 4 },
            _sum: { duplicateCount: 9 },
          },
        ]),
      },
    };
    const service = new ExternalDataService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const compatibleResult = await service.listConnectors();

    expect(compatibleResult[0]).toMatchObject({ id: "connector_1" });
    expect(prisma.externalIngestionRecord.groupBy).not.toHaveBeenCalled();

    const result = await service.listConnectors(undefined, true);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      connector: {
        id: "connector_1",
        lastSyncStatus: "completed",
      },
      totals: {
        imported: 116,
        duplicates: 2,
        rejected: 1,
        pending: 0,
      },
    });
    expect(prisma.externalIngestionRecord.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["connectorId", "status"],
        where: { connectorId: { in: ["connector_1"] } },
      }),
    );
  });

  it("creates an encrypted connector and never returns credential material", async () => {
    const now = new Date("2026-07-11T15:00:00.000Z");
    const prisma = {
      workspace: {
        findUnique: vi.fn(async () => ({ id: "workspace_1" })),
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
          updatedAt: now,
        })),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const encryption = {
      encrypt: vi.fn(() => ({
        credentialsEncrypted: "ciphertext",
        credentialsIv: "iv",
        credentialsTag: "tag",
      })),
    };
    const service = new ExternalDataService(
      prisma as never,
      encryption as never,
      {} as never,
      {} as never,
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
          password: "strong-password",
        },
        syncEnabled: false,
        shadowMode: true,
        capiSendEnabled: false,
        purchaseAverageValueCents: 400_000,
        defaultCurrency: "BRL",
      },
      "admin_1",
    );

    expect(result).toMatchObject({
      id: "connector_1",
      hasCredentials: true,
      shadowMode: true,
    });
    expect(JSON.stringify(result)).not.toContain("strong-password");
    expect(JSON.stringify(result)).not.toContain("ciphertext");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin_1",
        action: "external_connector.created",
      }),
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      "strong-password",
    );
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
          updatedAt: now,
        })),
        update,
      },
    };
    const service = new ExternalDataService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateConnector(
        "connector_1",
        { status: "active", syncEnabled: true },
        "admin_1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it("queues an idempotent lead projection refresh", async () => {
    const enqueueSync = vi.fn(async () => ({
      connectorId: "connector_1",
      streams: ["leads"] as const,
      jobId: "external-data-sync_connector_1_leads",
      status: "queued" as const,
    }));
    const prisma = {
      externalDataConnector: {
        findUnique: vi.fn(async () => ({
          id: "connector_1",
          workspaceId: "workspace_1",
          status: "active",
          lastSyncStatus: "completed",
          cursors: [],
        })),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const service = new ExternalDataService(
      prisma as never,
      {} as never,
      {} as never,
      { enqueueSync } as never,
    );

    const result = await service.enqueueLeadsReimport("connector_1", "admin_1");

    expect(enqueueSync).toHaveBeenCalledWith({
      connectorId: "connector_1",
      streams: ["leads"],
      projectionRefresh: true,
      requestedByUserId: "admin_1",
    });
    expect(result.status).toBe("queued");
  });
});
