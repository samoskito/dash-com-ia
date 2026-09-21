import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { InboundWebhookConnectionsService } from "../src/inbound-webhooks/inbound-webhook-connections.service";

const timestamp = new Date("2026-07-17T18:30:00.000Z");
const parserRelease = {
  id: "parser_umbler_v1",
  provider: "umbler" as const,
  version: "v1",
  status: "observation_only" as const,
  certifiedByUserId: null,
  certifiedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const connection = {
  id: "connection_1",
  workspaceId: "workspace_1",
  provider: "umbler" as const,
  displayName: "Umbler Comercial",
  parserReleaseId: parserRelease.id,
  secretHash: "hash",
  status: "observation" as const,
  createdByUserId: "user_1",
  lastDeliveryAt: timestamp,
  lastSuccessfulParseAt: timestamp,
  removedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  parserRelease,
};
const uazapiConnection = {
  ...connection,
  provider: "uazapi" as const,
  displayName: "UAZAPI Comercial",
  lastDeliveryAt: null as Date | null,
  lastSuccessfulParseAt: null as Date | null,
  parserRelease: {
    ...parserRelease,
    id: "parser_uazapi_v1",
    provider: "uazapi" as const,
  },
};

type OverviewTestConnection = typeof connection | typeof uazapiConnection;

function createService(
  enabled = true,
  activeConnection: OverviewTestConnection = connection,
) {
  const prisma = {
    inboundWebhookParserRelease: {
      findMany: vi.fn(async () => [
        {
          provider: "umbler",
          status: parserRelease.status,
        },
        {
          provider: "gupshup",
          status: "observation_only",
        },
        {
          provider: "datacrazy",
          status: "observation_only",
        },
      ]),
    },
    inboundWebhookConnection: {
      findFirst: vi.fn(async ({ where }) =>
        where.id === activeConnection.id &&
        where.workspaceId === activeConnection.workspaceId
          ? activeConnection
          : null,
      ),
    },
    inboundWebhookChannel: {
      findFirst: vi.fn(async ({ where }) =>
        where.workspaceId === "workspace_1" &&
        where.connectionId === activeConnection.id
          ? { whatsappInstanceId: "instance_a" }
          : null,
      ),
    },
    inboundWebhookEvent: {
      groupBy: vi.fn(async () => [
        {
          classification: "eligible_route_resolved",
          _count: { _all: 4 },
        },
        {
          classification: "eligible_route_unresolved",
          _count: { _all: 2 },
        },
        {
          classification: "ignored_no_ctwa",
          _count: { _all: 8 },
        },
      ]),
    },
    inboundWebhookDelivery: {
      findMany: vi.fn(async () => [
        {
          attemptCount: 3,
          classification: "eligible_route_unresolved",
        },
        {
          attemptCount: 2,
          classification: "invalid_payload",
        },
        {
          attemptCount: 1,
          classification: "invalid_payload",
        },
      ]),
    },
    lead: {
      count: vi.fn(
        async ({ where }: { where: { whatsappInstanceId?: string } }) =>
          where.whatsappInstanceId === "instance_a"
            ? 3
            : where.whatsappInstanceId === "instance_b"
              ? 17
              : 20,
      ) as ReturnType<typeof vi.fn>,
    },
    webhookLog: {
      findFirst: vi.fn(
        async ({ where }: { where: { whatsappInstanceId?: string } }) =>
          where.whatsappInstanceId === "instance_a"
            ? { receivedAt: new Date("2026-07-20T10:00:00.000Z") }
            : { receivedAt: new Date("2026-07-21T10:00:00.000Z") },
      ) as ReturnType<typeof vi.fn>,
    },
  };
  const service = new InboundWebhookConnectionsService(
    prisma as unknown as PrismaService,
    enabled
      ? {
          NODE_ENV: "test",
          API_PUBLIC_URL: "http://localhost:3333",
          INBOUND_WEBHOOKS_ENABLED: "true",
          INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString(
            "base64",
          ),
        }
      : {
          NODE_ENV: "test",
          INBOUND_WEBHOOKS_ENABLED: "false",
        },
  );

  return { prisma, service };
}

describe("inbound webhook connection overview", () => {
  it("reports feature capabilities without credentials or webhook secrets", async () => {
    const { service } = createService();

    const capabilities = await service.getCapabilities();

    expect(capabilities).toEqual({
      enabled: true,
      productionEnabled: false,
      providers: [
        {
          provider: "umbler",
          parserVersion: "v1",
          parserReleaseStatus: "observation_only",
          creationEnabled: true,
        },
        {
          provider: "payt",
          parserVersion: "v1",
          parserReleaseStatus: null,
          creationEnabled: false,
        },
        {
          provider: "gupshup",
          parserVersion: "v1",
          parserReleaseStatus: "observation_only",
          creationEnabled: true,
        },
        {
          provider: "datacrazy",
          parserVersion: "v1",
          parserReleaseStatus: "observation_only",
          creationEnabled: true,
        },
      ],
    });
    expect(JSON.stringify(capabilities)).not.toContain("secret");
    expect(JSON.stringify(capabilities)).not.toContain("token");
  });

  it("keeps the provider visible but disables creation behind the feature gate", async () => {
    const { service } = createService(false);

    await expect(service.getCapabilities()).resolves.toEqual({
      enabled: false,
      productionEnabled: false,
      providers: [
        expect.objectContaining({
          provider: "umbler",
          creationEnabled: false,
        }),
        expect.objectContaining({
          provider: "payt",
          creationEnabled: false,
        }),
        expect.objectContaining({
          provider: "gupshup",
          creationEnabled: false,
        }),
        expect.objectContaining({
          provider: "datacrazy",
          creationEnabled: false,
        }),
      ],
    });
  });

  it("returns redacted observation counters for one tenant connection", async () => {
    const { prisma, service } = createService();

    const overview = await service.getOverview("workspace_1", "connection_1");

    expect(overview.connection.id).toBe("connection_1");
    expect(overview.counters).toEqual({
      eligibleRouted: 4,
      eligibleUnresolved: 2,
      ignoredNoCtwa: 8,
      duplicate: 3,
      invalid: 2,
    });
    expect(prisma.inboundWebhookEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace_1",
          connectionId: "connection_1",
        },
      }),
    );
    expect(JSON.stringify(overview)).not.toContain("secretHash");
    expect(JSON.stringify(overview)).not.toContain("encryptedPayload");
  });

  it("does not reveal a connection from another workspace", async () => {
    const { service } = createService();

    await expect(
      service.getOverview("workspace_2", "connection_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getOverview("workspace_2", "missing_connection"),
    ).rejects.toMatchObject({
      message: "Conexao de webhook nao encontrada",
    });
  });

  it("uses the bridged UAZAPI instance's materialized CTWA leads and logs instead of another instance", async () => {
    const { prisma, service } = createService(true, uazapiConnection);

    const overview = await service.getOverview("workspace_1", "connection_1");

    expect(overview.counters).toEqual({
      eligibleRouted: 3,
      eligibleUnresolved: 0,
      ignoredNoCtwa: 0,
      duplicate: 0,
      invalid: 0,
    });
    expect(overview.connection.lastDeliveryAt).toBe("2026-07-20T10:00:00.000Z");
    expect(prisma.inboundWebhookChannel.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        connectionId: "connection_1",
        whatsappInstanceId: { not: null },
      },
      select: { whatsappInstanceId: true },
    });
    expect(prisma.lead.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        whatsappInstanceId: "instance_a",
        source: "uazapi",
        ctwaClid: { not: null },
      },
    });
    expect(prisma.webhookLog.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        whatsappInstanceId: "instance_a",
        source: "uazapi",
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      select: { receivedAt: true },
    });
    expect(prisma.inboundWebhookEvent.groupBy).not.toHaveBeenCalled();
    expect(prisma.inboundWebhookDelivery.findMany).not.toHaveBeenCalled();
  });

  it("keeps an empty UAZAPI instance at zero without falling back to other instances", async () => {
    const { prisma, service } = createService(true, uazapiConnection);
    prisma.lead.count.mockResolvedValueOnce(0);
    prisma.webhookLog.findFirst.mockResolvedValueOnce(null);

    const overview = await service.getOverview("workspace_1", "connection_1");

    expect(overview.counters).toEqual({
      eligibleRouted: 0,
      eligibleUnresolved: 0,
      ignoredNoCtwa: 0,
      duplicate: 0,
      invalid: 0,
    });
    expect(overview.connection.lastDeliveryAt).toBeNull();
    expect(prisma.lead.count.mock.calls[0][0].where).toMatchObject({
      workspaceId: "workspace_1",
      whatsappInstanceId: "instance_a",
    });
  });

  it("does not reveal a UAZAPI connection from another workspace", async () => {
    const { prisma, service } = createService(true, uazapiConnection);

    await expect(
      service.getOverview("workspace_2", "connection_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lead.count).not.toHaveBeenCalled();
    expect(prisma.webhookLog.findFirst).not.toHaveBeenCalled();
  });
});
