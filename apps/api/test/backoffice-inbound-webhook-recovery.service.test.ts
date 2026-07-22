import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { BackofficeInboundWebhookRecoveryService } from "../src/inbound-webhooks/backoffice-inbound-webhook-recovery.service";
import { InboundWebhookChannelRoutesService } from "../src/inbound-webhooks/inbound-webhook-channel-routes.service";
import { InboundWebhookProductionQueueService } from "../src/inbound-webhooks/inbound-webhook-production-queue.service";

const connectionActivatedAt = new Date("2026-07-21T12:00:00.000Z");
const channelActivatedAt = new Date("2026-07-21T12:05:00.000Z");

function connectionRecord() {
  return {
    id: "connection_1",
    workspaceId: "workspace_1",
    provider: "umbler" as const,
    displayName: "Umbler Comercial",
    status: "production" as const,
    productionActivatedAt: connectionActivatedAt,
    lastDeliveryAt: new Date("2026-07-21T13:00:00.000Z"),
    lastSuccessfulParseAt: new Date("2026-07-21T13:00:00.000Z"),
    createdAt: new Date("2026-07-20T12:00:00.000Z"),
    updatedAt: new Date("2026-07-21T13:00:00.000Z"),
    workspace: {
      id: "workspace_1",
      name: "Cliente Teste",
    },
    parserRelease: {
      version: "v1",
      status: "certified" as const,
    },
    channels: [
      {
        id: "channel_1",
        channelName: "Comercial",
        connectedPhone: "+5511999999999",
        status: "active" as const,
        productionActivatedAt: channelActivatedAt,
      },
    ],
  };
}

function runtimeEnvironment(productionEnabled = true) {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "https://api.example.com",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_PRODUCTION_ENABLED: productionEnabled ? "true" : "false",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64"),
  };
}

function createHarness(options?: {
  countResults?: number[];
  productionEnabled?: boolean;
}) {
  const counts = [...(options?.countResults ?? [])];
  const prisma = {
    inboundWebhookConnection: {
      findFirst: vi.fn(async () => connectionRecord()),
    },
    inboundWebhookEvent: {
      count: vi.fn(async () => counts.shift() ?? 0),
      findMany: vi.fn(async () => [
        { id: "event_1", workspaceId: "workspace_1" },
        { id: "event_2", workspaceId: "workspace_1" },
      ]),
    },
    inboundWebhookProductionItem: {
      createMany: vi.fn(async () => ({ count: 2 })),
      findMany: vi.fn(async () => [
        { id: "production_item_1", workspaceId: "workspace_1" },
        { id: "production_item_2", workspaceId: "workspace_1" },
      ]),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: "audit_1" })),
    },
  };
  const channelRoutes = {
    reevaluateOpenEvents: vi.fn(async () => 2),
  };
  const queue = {
    enqueueItem: vi.fn(async () => ({ status: "queued" as const })),
  };
  const service = new BackofficeInboundWebhookRecoveryService(
    prisma as unknown as PrismaService,
    channelRoutes as unknown as InboundWebhookChannelRoutesService,
    queue as unknown as InboundWebhookProductionQueueService,
    runtimeEnvironment(options?.productionEnabled ?? true),
  );

  return { channelRoutes, prisma, queue, service };
}

const actor = {
  id: "platform_owner_1",
  email: "owner@wpptrack.com",
  role: "platform_owner" as const,
};

describe("backoffice inbound webhook production recovery service", () => {
  it("separates historical events from post-activation production gaps", async () => {
    const harness = createHarness({
      countResults: [20, 12, 1, 5, 5],
    });

    const preview = await harness.service.getPreview("connection_1");

    expect(preview).toMatchObject({
      workspace: { id: "workspace_1", name: "Cliente Teste" },
      productionEnabled: true,
      counts: {
        totalCtwa: 20,
        historical: 8,
        routeUnresolved: 1,
        unavailable: 1,
        alreadyQueued: 5,
        eligible: 5,
      },
      channels: [
        expect.objectContaining({
          id: "channel_1",
          displayName: "Comercial",
          eligible: 5,
        }),
      ],
    });
    expect(harness.prisma.inboundWebhookEvent.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        connectionId: "connection_1",
        channelId: "channel_1",
        delivery: {
          firstReceivedAt: { gte: channelActivatedAt },
        },
      }),
    });
  });

  it("requires the exact connection name before touching routes or queues", async () => {
    const harness = createHarness();

    await expect(
      harness.service.authorizeRecovery({
        connectionId: "connection_1",
        channelId: "channel_1",
        confirmation: "Umbler errado",
        selection: "canary_1",
        actor,
        sourceIp: "203.0.113.10",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.channelRoutes.reevaluateOpenEvents).not.toHaveBeenCalled();
    expect(harness.queue.enqueueItem).not.toHaveBeenCalled();
  });

  it("re-evaluates the route and enqueues an idempotent production canary", async () => {
    const harness = createHarness();

    const result = await harness.service.authorizeRecovery({
      connectionId: "connection_1",
      channelId: "channel_1",
      confirmation: "Umbler Comercial",
      selection: "canary_5",
      actor,
      sourceIp: "203.0.113.10",
    });

    expect(harness.channelRoutes.reevaluateOpenEvents).toHaveBeenCalledWith(
      "workspace_1",
      "channel_1",
    );
    expect(harness.prisma.inboundWebhookEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({
          classification: "eligible_route_resolved",
          replayItem: null,
          productionItem: null,
          delivery: expect.objectContaining({
            firstReceivedAt: { gte: channelActivatedAt },
            encryptedPayload: { not: null },
          }),
        }),
      }),
    );
    expect(
      harness.prisma.inboundWebhookProductionItem.createMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([
          expect.objectContaining({ eventId: "event_1", status: "queued" }),
        ]),
      }),
    );
    expect(harness.queue.enqueueItem).toHaveBeenCalledTimes(2);
    expect(harness.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "platform_owner_1",
        action: "inbound_webhook.production_recovery.authorize",
        resultStatus: "queued",
      }),
    });
    expect(result).toEqual({
      connectionId: "connection_1",
      channelId: "channel_1",
      selection: "canary_5",
      selected: 2,
      persisted: 2,
      queued: 2,
      existing: 0,
      queueFailures: 0,
    });
  });

  it("keeps recovery blocked when the production flag is off", async () => {
    const harness = createHarness({ productionEnabled: false });

    await expect(
      harness.service.authorizeRecovery({
        connectionId: "connection_1",
        channelId: "channel_1",
        confirmation: "Umbler Comercial",
        selection: "canary_1",
        actor,
        sourceIp: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.channelRoutes.reevaluateOpenEvents).not.toHaveBeenCalled();
  });
});
