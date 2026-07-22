import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import type { InboundWebhookProductionQueueService } from "../src/inbound-webhooks/inbound-webhook-production-queue.service";
import { InboundWebhookProductionIntakeService } from "../src/inbound-webhooks/inbound-webhook-production-intake.service";

function productionEnvironment() {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_PRODUCTION_ENABLED: "true",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
  };
}

function candidate(input: {
  id: string;
  receivedAt: string;
  connectionActivatedAt?: string;
  channelActivatedAt?: string;
  connectionStatus?: string;
  channelStatus?: string;
}) {
  return {
    id: input.id,
    workspaceId: "workspace_1",
    delivery: {
      firstReceivedAt: new Date(input.receivedAt),
    },
    connection: {
      status: input.connectionStatus ?? "production",
      removedAt: null,
      productionActivatedAt: new Date(
        input.connectionActivatedAt ?? "2026-07-21T12:00:00.000Z",
      ),
      parserRelease: { status: "certified" },
    },
    channel: {
      status: input.channelStatus ?? "active",
      productionActivatedAt: new Date(
        input.channelActivatedAt ?? "2026-07-21T12:00:00.000Z",
      ),
    },
  };
}

describe("inbound webhook production intake", () => {
  it("queues only events received after activation on active validated channels", async () => {
    const events = [
      candidate({
        id: "event_live",
        receivedAt: "2026-07-21T12:00:01.000Z",
      }),
      candidate({
        id: "event_history",
        receivedAt: "2026-07-21T11:59:59.000Z",
      }),
      candidate({
        id: "event_md1_paused",
        receivedAt: "2026-07-21T12:00:02.000Z",
        channelStatus: "paused",
      }),
    ];
    const createMany = vi.fn(async ({ data }) => ({ count: data.length }));
    const prisma = {
      inboundWebhookEvent: {
        findMany: vi.fn(async () => events),
      },
      inboundWebhookProductionItem: {
        createMany,
        findMany: vi.fn(async () => [
          { id: "production_item_live", workspaceId: "workspace_1" },
        ]),
      },
    };
    const queue = {
      enqueueItem: vi.fn(async () => ({ status: "created" as const })),
    };
    const service = new InboundWebhookProductionIntakeService(
      prisma as unknown as PrismaService,
      queue as unknown as InboundWebhookProductionQueueService,
      productionEnvironment(),
    );

    const result = await service.enqueueDelivery({
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      deliveryId: "delivery_1",
    });

    expect(result).toEqual({
      eligible: 1,
      persisted: 1,
      queued: 1,
      existing: 0,
      queueFailures: 0,
      providerEligible: 0,
      providerQueued: 0,
      providerExisting: 0,
      providerQueueFailures: 0,
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId: "event_live",
          workspaceId: "workspace_1",
          status: "queued",
        }),
      ],
      skipDuplicates: true,
    });
    expect(queue.enqueueItem).toHaveBeenCalledWith({
      productionItemId: "production_item_live",
      workspaceId: "workspace_1",
    });
  });

  it("keeps the live path inert while its production feature flag is disabled", async () => {
    const prisma = {
      inboundWebhookEvent: { findMany: vi.fn() },
    };
    const queue = { enqueueItem: vi.fn() };
    const service = new InboundWebhookProductionIntakeService(
      prisma as unknown as PrismaService,
      queue as unknown as InboundWebhookProductionQueueService,
      {
        NODE_ENV: "test",
        API_PUBLIC_URL: "http://localhost:3333",
        INBOUND_WEBHOOKS_ENABLED: "true",
        INBOUND_WEBHOOK_PRODUCTION_ENABLED: "false",
        INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
      },
    );

    expect(
      await service.enqueueDelivery({
        workspaceId: "workspace_1",
        connectionId: "connection_1",
        deliveryId: "delivery_1",
      }),
    ).toEqual({
      eligible: 0,
      persisted: 0,
      queued: 0,
      existing: 0,
      queueFailures: 0,
      providerEligible: 0,
      providerQueued: 0,
      providerExisting: 0,
      providerQueueFailures: 0,
    });
    expect(prisma.inboundWebhookEvent.findMany).not.toHaveBeenCalled();
    expect(queue.enqueueItem).not.toHaveBeenCalled();
  });

  it("recovers eligible provider conversions with deterministic queue jobs", async () => {
    const prisma = {
      inboundWebhookProductionItem: {
        findMany: vi.fn(async () => []),
      },
      providerConversionRuleExecution: {
        findMany: vi.fn(async () => [
          { id: "provider_execution_1", workspaceId: "workspace_1" },
          { id: "provider_execution_2", workspaceId: "workspace_2" },
        ]),
      },
    };
    const queue = {
      enqueueItem: vi.fn(),
      enqueueProviderConversion: vi
        .fn()
        .mockResolvedValueOnce({ status: "queued" as const })
        .mockResolvedValueOnce({ status: "existing" as const }),
    };
    const service = new InboundWebhookProductionIntakeService(
      prisma as unknown as PrismaService,
      queue as unknown as InboundWebhookProductionQueueService,
      {
        ...productionEnvironment(),
        INBOUND_CONVERSION_RULES_ENABLED: "true",
        INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
      },
    );

    const result = await service.recoverPendingItems(
      new Date("2026-07-21T15:00:00.000Z"),
    );

    expect(result).toMatchObject({
      eligible: 0,
      providerEligible: 2,
      providerQueued: 1,
      providerExisting: 1,
      providerQueueFailures: 0,
    });
    expect(queue.enqueueProviderConversion).toHaveBeenNthCalledWith(1, {
      providerConversionExecutionId: "provider_execution_1",
      workspaceId: "workspace_1",
    });
    expect(queue.enqueueProviderConversion).toHaveBeenNthCalledWith(2, {
      providerConversionExecutionId: "provider_execution_2",
      workspaceId: "workspace_2",
    });
    expect(
      prisma.providerConversionRuleExecution.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "eligible" }),
        take: 100,
      }),
    );
  });
});
