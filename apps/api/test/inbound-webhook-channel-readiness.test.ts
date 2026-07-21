import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { InboundWebhookChannelRoutesService } from "../src/inbound-webhooks/inbound-webhook-channel-routes.service";
import { InboundWebhookMetaRouteReaderService } from "../src/inbound-webhooks/inbound-webhook-meta-route-reader.service";

const now = Date.now();
const future = new Date(now + 72 * 60 * 60 * 1_000);
const soon = new Date(now + 24 * 60 * 60 * 1_000);
const expired = new Date(now - 60 * 60 * 1_000);
const timestamp = new Date("2026-07-18T12:00:00.000Z");

function route(id: string, validationStatus = "valid") {
  return {
    id,
    workspaceId: "workspace_current",
    channelId: "",
    routeKey: `route-key-${id}`,
    metaBusinessConnectionWorkspaceId: "workspace_current",
    metaBusinessConnectionId: `business-${id}`,
    metaReportingAccountWorkspaceId: "workspace_current",
    metaReportingAccountId: `account-${id}`,
    metaConversionDestinationWorkspaceId: "workspace_current",
    metaConversionDestinationId: `destination-${id}`,
    active: true,
    validationStatus,
    validationErrorCode:
      validationStatus === "valid" ? null : "route_validation_failed",
    lastValidatedAt: timestamp,
    createdByUserId: "user_current",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function channel(
  id: string,
  routes: ReturnType<typeof route>[],
  status: "active" | "paused" = "active",
) {
  return {
    id,
    workspaceId: "workspace_current",
    connectionId: "connection_current",
    organizationId: "organization_current",
    providerChannelId: `provider-${id}`,
    connectedPhone: `551190000${id.slice(-1)}`,
    channelName: `Canal ${id}`,
    status,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    connection: {
      id: "connection_current",
      workspaceId: "workspace_current",
      status: "observation",
      removedAt: null,
    },
    routes: routes.map((item) => ({ ...item, channelId: id })),
  };
}

function event(input: {
  id: string;
  channelId: string;
  classification: "eligible_route_resolved" | "eligible_route_unresolved";
  expiresAt?: Date;
  payloadAvailable?: boolean;
  replayStatus?: "materialized" | "duplicate" | "failed" | null;
  workspaceId?: string;
  connectionId?: string;
}) {
  const payloadAvailable = input.payloadAvailable ?? true;

  return {
    id: input.id,
    deliveryId: `delivery_${input.id}`,
    workspaceId: input.workspaceId ?? "workspace_current",
    connectionId: input.connectionId ?? "connection_current",
    channelId: input.channelId,
    hasCtwa: true,
    classification: input.classification,
    occurredAt: timestamp,
    replayItem:
      input.replayStatus === null || input.replayStatus === undefined
        ? null
        : { status: input.replayStatus },
    productionItem: null,
    delivery: {
      payloadExpiresAt: input.expiresAt ?? future,
      encryptedPayload: payloadAvailable ? "encrypted-payload" : null,
      payloadIv: payloadAvailable ? "private-iv" : null,
      payloadTag: payloadAvailable ? "private-tag" : null,
      encryptionKeyVersion: payloadAvailable ? 1 : null,
    },
    rawPayload: {
      CTWaCLId: "must-never-be-returned",
      contactPhone: "+5511999999999",
      adId: "private-ad-id",
    },
  };
}

function createHarness() {
  const channels = [
    channel("channel_waiting", [route("waiting")]),
    channel("channel_blocked", []),
    channel("channel_partial", [route("partial")]),
    channel("channel_ready", [route("ready")]),
    channel("channel_complete", [route("complete")]),
  ];
  const events = [
    event({
      id: "event_blocked",
      channelId: "channel_blocked",
      classification: "eligible_route_unresolved",
    }),
    event({
      id: "event_partial_ready",
      channelId: "channel_partial",
      classification: "eligible_route_resolved",
      expiresAt: soon,
    }),
    event({
      id: "event_partial_unresolved",
      channelId: "channel_partial",
      classification: "eligible_route_unresolved",
      expiresAt: soon,
    }),
    event({
      id: "event_partial_unavailable",
      channelId: "channel_partial",
      classification: "eligible_route_resolved",
      payloadAvailable: false,
    }),
    event({
      id: "event_ready",
      channelId: "channel_ready",
      classification: "eligible_route_resolved",
    }),
    event({
      id: "event_complete",
      channelId: "channel_complete",
      classification: "eligible_route_resolved",
      expiresAt: expired,
      payloadAvailable: false,
      replayStatus: "materialized",
    }),
    event({
      id: "event_foreign",
      channelId: "channel_foreign",
      classification: "eligible_route_resolved",
      workspaceId: "workspace_foreign",
      connectionId: "connection_foreign",
    }),
  ];
  const prisma = {
    inboundWebhookConnection: {
      findFirst: vi.fn(async ({ where }) =>
        where.id === "connection_current" &&
        where.workspaceId === "workspace_current"
          ? { id: "connection_current" }
          : null,
      ),
    },
    inboundWebhookChannel: {
      findMany: vi.fn(async ({ where }) =>
        where.workspaceId === "workspace_current" &&
        where.connectionId === "connection_current"
          ? channels
          : [],
      ),
    },
    inboundWebhookEvent: {
      findMany: vi.fn(async ({ where }) =>
        events.filter(
          (item) =>
            item.workspaceId === where.workspaceId &&
            item.connectionId === where.connectionId &&
            where.channelId.in.includes(item.channelId) &&
            item.hasCtwa === where.hasCtwa,
        ),
      ),
    },
    inboundWebhookDelivery: {
      findMany: vi.fn(async ({ where }) =>
        events
          .filter(
            (item) =>
              item.workspaceId === where.workspaceId &&
              item.connectionId === where.connectionId &&
              where.id.in.includes(item.deliveryId) &&
              item.delivery.payloadExpiresAt > where.payloadExpiresAt.gt &&
              item.delivery.encryptedPayload !== null &&
              item.delivery.payloadIv !== null &&
              item.delivery.payloadTag !== null &&
              item.delivery.encryptionKeyVersion !== null,
          )
          .map((item) => ({ id: item.deliveryId })),
      ),
    },
  };
  const service = new InboundWebhookChannelRoutesService(
    prisma as unknown as PrismaService,
    {
      previewRoute: vi.fn(),
    } as unknown as InboundWebhookMetaRouteReaderService,
  );

  return { prisma, service };
}

describe("inbound webhook channel readiness", () => {
  it("summarizes route and retained CTWA readiness without sensitive data", async () => {
    const { prisma, service } = createHarness();

    const channels = await service.listChannels(
      "workspace_current",
      "connection_current",
    );
    const byId = new Map(channels.map((item) => [item.id, item]));

    expect(byId.get("channel_waiting")?.readiness).toMatchObject({
      state: "waiting",
      blockers: ["ctwa_not_observed"],
      validRouteCount: 1,
      totalCtwa: 0,
    });
    expect(byId.get("channel_blocked")?.readiness).toMatchObject({
      state: "blocked",
      blockers: ["route_not_configured", "ctwa_unresolved"],
      retainedCtwa: 1,
      retainedRoutedCtwa: 0,
    });
    expect(byId.get("channel_partial")?.readiness).toMatchObject({
      state: "partial",
      blockers: [
        "ctwa_unresolved",
        "payload_unavailable",
        "payload_expiring_soon",
      ],
      routedCtwa: 2,
      unresolvedCtwa: 1,
      retainedCtwa: 2,
      retainedRoutedCtwa: 1,
      payloadUnavailableCtwa: 1,
    });
    expect(byId.get("channel_ready")?.readiness).toMatchObject({
      state: "ready",
      blockers: [],
      retainedRoutedCtwa: 1,
    });
    expect(byId.get("channel_complete")?.readiness).toMatchObject({
      state: "complete",
      alreadyMaterializedCtwa: 1,
      payloadUnavailableCtwa: 0,
    });
    expect(byId.get("channel_partial")?.readiness.nextPayloadExpiresAt).toBe(
      soon.toISOString(),
    );

    expect(prisma.inboundWebhookEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace_current",
          connectionId: "connection_current",
          channelId: {
            in: [
              "channel_waiting",
              "channel_blocked",
              "channel_partial",
              "channel_ready",
              "channel_complete",
            ],
          },
          hasCtwa: true,
        },
      }),
    );
    expect(prisma.inboundWebhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_current",
          connectionId: "connection_current",
          encryptedPayload: { not: null },
          payloadIv: { not: null },
          payloadTag: { not: null },
          encryptionKeyVersion: { not: null },
        }),
        select: {
          id: true,
        },
      }),
    );
    expect(
      prisma.inboundWebhookEvent.findMany.mock.calls[0][0].select.delivery,
    ).toEqual({
      select: {
        payloadExpiresAt: true,
      },
    });

    const serialized = JSON.stringify(channels);
    for (const forbidden of [
      "workspace_foreign",
      "must-never-be-returned",
      "+5511999999999",
      "private-ad-id",
      "encrypted-payload",
      "private-iv",
      "private-tag",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not query channel events for a foreign or missing connection", async () => {
    const { prisma, service } = createHarness();

    await expect(
      service.listChannels("workspace_foreign", "connection_current"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.listChannels("workspace_current", "connection_missing"),
    ).rejects.toMatchObject({
      message: "Recurso de webhook nao encontrado",
    });
    expect(prisma.inboundWebhookEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.inboundWebhookDelivery.findMany).not.toHaveBeenCalled();
  });
});
