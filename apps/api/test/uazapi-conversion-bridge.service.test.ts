import { beforeEach, describe, expect, it, vi } from "vitest";
import { UazapiConversionBridgeService } from "../src/inbound-webhooks/uazapi-conversion-bridge.service";

describe("UazapiConversionBridgeService", () => {
  const prisma = {
    inboundWebhookChannel: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const service = new UazapiConversionBridgeService(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing bridge when the channel is already linked", async () => {
    prisma.inboundWebhookChannel.findUnique.mockResolvedValue({
      id: "channel_1",
      connectionId: "connection_1",
      workspaceId: "workspace_1",
    });

    await expect(
      service.ensureBridge({
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD Bento",
        providerInstanceId: "prov_1",
      }),
    ).resolves.toEqual({
      connectionId: "connection_1",
      channelId: "channel_1",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not reuse a bridge from another workspace", async () => {
    prisma.inboundWebhookChannel.findUnique.mockResolvedValue({
      id: "channel_x",
      connectionId: "connection_x",
      workspaceId: "other_workspace",
    });
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        inboundWebhookChannel: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "channel_new" }),
        },
        inboundWebhookParserRelease: {
          upsert: vi.fn().mockResolvedValue({ id: "release_1" }),
        },
        inboundWebhookConnection: {
          create: vi.fn().mockResolvedValue({ id: "connection_new" }),
        },
      }),
    );

    await expect(
      service.ensureBridge({
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD Bento",
        providerInstanceId: "prov_1",
      }),
    ).resolves.toEqual({
      connectionId: "connection_new",
      channelId: "channel_new",
    });
  });
});

type RetireHarnessOptions = {
  channel?: {
    id: string;
    connectionId: string;
    connection: { status: string; productionActivatedAt: Date | null };
  } | null;
  claimedCount?: number;
  ruleConfigs?: Array<{ id: string }>;
  retiredChannels?: Array<{ id: string }>;
};

function createRetireHarness(options: RetireHarnessOptions = {}) {
  const transaction = {
    inboundWebhookChannel: {
      findFirst: vi.fn().mockResolvedValue(
        options.channel === undefined
          ? {
              id: "channel_old",
              connectionId: "connection_old",
              connection: {
                status: "observation",
                productionActivatedAt: null,
              },
            }
          : options.channel,
      ),
      findMany: vi
        .fn()
        .mockResolvedValue(options.retiredChannels ?? [{ id: "channel_old" }]),
    },
    inboundWebhookConnection: {
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: options.claimedCount ?? 1 }),
    },
    providerConversionRuleConfig: {
      findMany: vi.fn().mockResolvedValue(options.ruleConfigs ?? []),
      update: vi.fn().mockResolvedValue({}),
    },
    providerConversionRuleChannel: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" }),
    },
  };
  const prisma = {
    inboundWebhookChannel: { findUnique: vi.fn(), findMany: vi.fn() },
    whatsappSeat: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (client: unknown) => unknown) =>
      fn(transaction),
    ),
  };
  const service = new UazapiConversionBridgeService(prisma as never);

  return { prisma, service, transaction };
}

describe("UazapiConversionBridgeService.retireBridge", () => {
  it("soft-removes the connection without deleting the channel", async () => {
    const harness = createRetireHarness();

    const retirement = await harness.service.retireBridge({
      workspaceId: "workspace_1",
      whatsappInstanceId: "instance_old",
      reason: "uazapi_instance_removed_by_user",
      actorUserId: "user_1",
    });

    expect(retirement).toMatchObject({
      whatsappInstanceId: "instance_old",
      connectionId: "connection_old",
      channelId: "channel_old",
      migratedToConnectionId: null,
      migratedRuleIds: [],
    });
    const [claim] =
      harness.transaction.inboundWebhookConnection.updateMany.mock.calls[0];
    expect(claim.where).toMatchObject({
      id: "connection_old",
      workspaceId: "workspace_1",
      removedAt: null,
    });
    expect(claim.data.status).toBe("paused");
    expect(claim.data.removedAt).toBeInstanceOf(Date);
    expect(harness.transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("is scoped to the workspace of the caller", async () => {
    const harness = createRetireHarness();

    await harness.service.retireBridge({
      workspaceId: "workspace_1",
      whatsappInstanceId: "instance_old",
      reason: "reconcile",
    });

    expect(
      harness.transaction.inboundWebhookChannel.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace_1",
          whatsappInstanceId: "instance_old",
        },
      }),
    );
  });

  it("refuses to retire a connection promoted to production", async () => {
    const harness = createRetireHarness({
      channel: {
        id: "channel_old",
        connectionId: "connection_old",
        connection: {
          status: "production",
          productionActivatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      },
    });

    await expect(
      harness.service.retireBridge({
        workspaceId: "workspace_1",
        whatsappInstanceId: "instance_old",
        reason: "reconcile",
      }),
    ).resolves.toBeNull();
    expect(
      harness.transaction.inboundWebhookConnection.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("returns null when the connection was already retired", async () => {
    const harness = createRetireHarness({ claimedCount: 0 });

    await expect(
      harness.service.retireBridge({
        workspaceId: "workspace_1",
        whatsappInstanceId: "instance_old",
        reason: "reconcile",
      }),
    ).resolves.toBeNull();
    expect(harness.transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it("moves the rules of the retired connection onto the live bridge", async () => {
    const harness = createRetireHarness({ ruleConfigs: [{ id: "rule_ic" }] });

    const retirement = await harness.service.retireBridge({
      workspaceId: "workspace_1",
      whatsappInstanceId: "instance_old",
      reason: "reconcile",
      migrateTo: { connectionId: "connection_live", channelId: "channel_live" },
    });

    expect(retirement?.migratedRuleIds).toEqual(["rule_ic"]);
    expect(
      harness.transaction.providerConversionRuleConfig.update,
    ).toHaveBeenCalledWith({
      where: { id: "rule_ic" },
      data: { connectionId: "connection_live" },
    });
    expect(
      harness.transaction.providerConversionRuleChannel.createMany,
    ).toHaveBeenCalledWith({
      data: [
        {
          workspaceId: "workspace_1",
          providerRuleId: "rule_ic",
          channelId: "channel_live",
        },
      ],
      skipDuplicates: true,
    });
  });

  // Foz: the rule was re-pointed at the live connection but kept a scope row on
  // the retired connection's channel, and "Envio ativo" then died on that orphan
  // with "Recurso de webhook nao encontrado".
  it("prunes the rule channel scopes that point at the retired connection", async () => {
    const harness = createRetireHarness({ ruleConfigs: [{ id: "rule_ic" }] });

    const retirement = await harness.service.retireBridge({
      workspaceId: "workspace_1",
      whatsappInstanceId: "instance_old",
      reason: "reconcile",
      migrateTo: { connectionId: "connection_live", channelId: "channel_live" },
    });

    expect(
      harness.transaction.providerConversionRuleChannel.deleteMany,
    ).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        channelId: { in: ["channel_old"] },
      },
    });
    expect(retirement?.prunedChannelScopes).toBe(1);
  });

  it("prunes the orphan scopes even when there is no live bridge to migrate to", async () => {
    const harness = createRetireHarness();

    await harness.service.retireBridge({
      workspaceId: "workspace_1",
      whatsappInstanceId: "instance_old",
      reason: "uazapi_instance_removed_by_user",
    });

    expect(
      harness.transaction.providerConversionRuleChannel.deleteMany,
    ).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        channelId: { in: ["channel_old"] },
      },
    });
  });
});

type ReconcileChannel = {
  id: string;
  connectionId: string;
  whatsappInstanceId: string;
  connection: { status: string; productionActivatedAt: Date | null };
};

type ReconcileSeat = {
  whatsappInstanceId: string;
  status: string;
  activatedAt: Date | null;
  reservationExpiresAt: Date | null;
};

function createReconcileHarness(
  channels: ReconcileChannel[],
  seats: ReconcileSeat[],
) {
  const prisma = {
    inboundWebhookChannel: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue(channels),
    },
    whatsappSeat: {
      findMany: vi.fn().mockResolvedValue(seats),
    },
    $transaction: vi.fn(),
  };
  const service = new UazapiConversionBridgeService(prisma as never);
  const retireBridge = vi
    .spyOn(service, "retireBridge")
    .mockImplementation(async (input) => ({
      whatsappInstanceId: input.whatsappInstanceId,
      connectionId: `connection_of_${input.whatsappInstanceId}`,
      channelId: `channel_of_${input.whatsappInstanceId}`,
      migratedToConnectionId: input.migrateTo?.connectionId ?? null,
      migratedRuleIds: [],
      prunedChannelScopes: 0,
    }));

  return { prisma, retireBridge, service };
}

const observationConnection = {
  status: "observation",
  productionActivatedAt: null,
};

describe("UazapiConversionBridgeService.reconcileWorkspaceBridges", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("retires the abandoned QR attempt and migrates its rules to the connected number", async () => {
    // Foz: instance_a was provisioned, never scanned, its seat reservation
    // expired; instance_b was provisioned two hours later and connected.
    const harness = createReconcileHarness(
      [
        {
          id: "channel_a",
          connectionId: "connection_a",
          whatsappInstanceId: "instance_a",
          connection: observationConnection,
        },
        {
          id: "channel_b",
          connectionId: "connection_b",
          whatsappInstanceId: "instance_b",
          connection: observationConnection,
        },
      ],
      [
        {
          whatsappInstanceId: "instance_a",
          status: "released",
          activatedAt: null,
          reservationExpiresAt: null,
        },
        {
          whatsappInstanceId: "instance_b",
          status: "active",
          activatedAt: new Date("2026-08-20T13:20:00.000Z"),
          reservationExpiresAt: null,
        },
      ],
    );

    const retirements = await harness.service.reconcileWorkspaceBridges(
      "workspace_1",
      now,
    );

    expect(retirements).toHaveLength(1);
    expect(harness.retireBridge).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      whatsappInstanceId: "instance_a",
      reason: "uazapi_bridge_superseded_by_connected_instance",
      migrateTo: { connectionId: "connection_b", channelId: "channel_b" },
    });
  });

  it("keeps both origins when the workspace really runs two numbers", async () => {
    const harness = createReconcileHarness(
      [
        {
          id: "channel_a",
          connectionId: "connection_a",
          whatsappInstanceId: "instance_a",
          connection: observationConnection,
        },
        {
          id: "channel_b",
          connectionId: "connection_b",
          whatsappInstanceId: "instance_b",
          connection: observationConnection,
        },
      ],
      [
        {
          whatsappInstanceId: "instance_a",
          status: "active",
          activatedAt: new Date("2026-08-01T10:00:00.000Z"),
          reservationExpiresAt: null,
        },
        {
          whatsappInstanceId: "instance_b",
          status: "active",
          activatedAt: new Date("2026-08-20T13:20:00.000Z"),
          reservationExpiresAt: null,
        },
      ],
    );

    await expect(
      harness.service.reconcileWorkspaceBridges("workspace_1", now),
    ).resolves.toEqual([]);
    expect(harness.retireBridge).not.toHaveBeenCalled();
  });

  it("leaves a QR flow that is still running alone", async () => {
    const harness = createReconcileHarness(
      [
        {
          id: "channel_a",
          connectionId: "connection_a",
          whatsappInstanceId: "instance_a",
          connection: observationConnection,
        },
        {
          id: "channel_b",
          connectionId: "connection_b",
          whatsappInstanceId: "instance_b",
          connection: observationConnection,
        },
      ],
      [
        {
          whatsappInstanceId: "instance_a",
          status: "reserved",
          activatedAt: null,
          reservationExpiresAt: new Date("2026-08-24T12:10:00.000Z"),
        },
        {
          whatsappInstanceId: "instance_b",
          status: "active",
          activatedAt: new Date("2026-08-20T13:20:00.000Z"),
          reservationExpiresAt: null,
        },
      ],
    );

    await expect(
      harness.service.reconcileWorkspaceBridges("workspace_1", now),
    ).resolves.toEqual([]);
    expect(harness.retireBridge).not.toHaveBeenCalled();
  });

  it("does nothing when no bridge holds a seat", async () => {
    const harness = createReconcileHarness(
      [
        {
          id: "channel_a",
          connectionId: "connection_a",
          whatsappInstanceId: "instance_a",
          connection: observationConnection,
        },
        {
          id: "channel_b",
          connectionId: "connection_b",
          whatsappInstanceId: "instance_b",
          connection: observationConnection,
        },
      ],
      [],
    );

    await expect(
      harness.service.reconcileWorkspaceBridges("workspace_1", now),
    ).resolves.toEqual([]);
    expect(harness.retireBridge).not.toHaveBeenCalled();
  });

  it("never retires a bridge already promoted to production", async () => {
    const harness = createReconcileHarness(
      [
        {
          id: "channel_a",
          connectionId: "connection_a",
          whatsappInstanceId: "instance_a",
          connection: {
            status: "production",
            productionActivatedAt: new Date("2026-08-02T00:00:00.000Z"),
          },
        },
        {
          id: "channel_b",
          connectionId: "connection_b",
          whatsappInstanceId: "instance_b",
          connection: observationConnection,
        },
      ],
      [
        {
          whatsappInstanceId: "instance_a",
          status: "released",
          activatedAt: null,
          reservationExpiresAt: null,
        },
        {
          whatsappInstanceId: "instance_b",
          status: "active",
          activatedAt: new Date("2026-08-20T13:20:00.000Z"),
          reservationExpiresAt: null,
        },
      ],
    );

    await expect(
      harness.service.reconcileWorkspaceBridges("workspace_1", now),
    ).resolves.toEqual([]);
    expect(harness.retireBridge).not.toHaveBeenCalled();
  });

  it("only looks at uazapi bridges that are still listed for the workspace", async () => {
    const harness = createReconcileHarness([], []);

    await harness.service.reconcileWorkspaceBridges("workspace_1", now);

    expect(harness.prisma.inboundWebhookChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace_1",
          whatsappInstanceId: { not: null },
          connection: { provider: "uazapi", removedAt: null },
        },
      }),
    );
  });
});
