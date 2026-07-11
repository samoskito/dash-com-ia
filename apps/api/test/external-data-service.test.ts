import { describe, expect, it, vi } from "vitest";
import { ExternalDataService } from "../src/external-data/external-data.service";

describe("ExternalDataService", () => {
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
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      "strong-password"
    );
  });
});
