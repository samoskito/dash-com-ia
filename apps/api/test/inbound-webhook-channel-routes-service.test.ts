import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  type InboundWebhookMetaRoutePreview,
  InboundWebhookMetaRouteReaderService,
} from "../src/inbound-webhooks/inbound-webhook-meta-route-reader.service";
import { InboundWebhookChannelRoutesService } from "../src/inbound-webhooks/inbound-webhook-channel-routes.service";

type TestConnection = {
  id: string;
  workspaceId: string;
  status: "observation" | "paused";
  removedAt: Date | null;
};

type TestChannel = {
  id: string;
  workspaceId: string;
  connectionId: string;
  organizationId: string;
  providerChannelId: string;
  connectedPhone: string;
  channelName: string | null;
  status: "discovered" | "active" | "paused";
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type TestBusinessConnection = {
  id: string;
  workspaceId: string;
  status: "active" | "paused";
  defaultConversionDestinationId: string | null;
  credential: {
    workspaceId: string;
    status: "active" | "paused";
    encryptedAccessToken: string;
  };
};

type TestReportingAccount = {
  id: string;
  workspaceId: string;
  businessConnectionId: string | null;
  adAccountId: string;
  active: boolean;
};

type TestDestination = {
  id: string;
  workspaceId: string;
  status: "configured" | "needs_configuration";
  ownerBusinessManagerId: string | null;
};

type TestRoute = {
  id: string;
  workspaceId: string;
  channelId: string;
  routeKey: string;
  metaBusinessConnectionWorkspaceId: string | null;
  metaBusinessConnectionId: string | null;
  metaReportingAccountWorkspaceId: string | null;
  metaReportingAccountId: string | null;
  metaConversionDestinationWorkspaceId: string | null;
  metaConversionDestinationId: string | null;
  active: boolean;
  validationStatus: string;
  validationErrorCode: string | null;
  lastValidatedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TestEvent = {
  id: string;
  workspaceId: string;
  connectionId: string;
  channelId: string;
  adId: string | null;
  classification: "eligible_route_resolved" | "eligible_route_unresolved";
  classificationReason: string | null;
  resolvedBusinessConnectionWorkspaceId: string | null;
  resolvedBusinessConnectionId: string | null;
  resolvedReportingAccountWorkspaceId: string | null;
  resolvedReportingAccountId: string | null;
  resolvedConversionDestinationWorkspaceId: string | null;
  resolvedConversionDestinationId: string | null;
  normalizedSummary: Record<string, unknown>;
  replayItem?: { id: string } | null;
};

const workspaceId = "workspace_1";
const otherWorkspaceId = "workspace_2";
const now = new Date("2026-07-17T19:00:00.000Z");

function createHarness() {
  const connections = new Map<string, TestConnection>([
    [
      "connection_1",
      {
        id: "connection_1",
        workspaceId,
        status: "observation",
        removedAt: null,
      },
    ],
    [
      "connection_foreign",
      {
        id: "connection_foreign",
        workspaceId: otherWorkspaceId,
        status: "observation",
        removedAt: null,
      },
    ],
  ]);
  const channels = new Map<string, TestChannel>([
    [
      "channel_1",
      {
        id: "channel_1",
        workspaceId,
        connectionId: "connection_1",
        organizationId: "organization_1",
        providerChannelId: "provider_channel_1",
        connectedPhone: "5511999990001",
        channelName: "Comercial",
        status: "active",
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      "channel_2",
      {
        id: "channel_2",
        workspaceId,
        connectionId: "connection_1",
        organizationId: "organization_1",
        providerChannelId: "provider_channel_2",
        connectedPhone: "5511999990002",
        channelName: "Suporte",
        status: "active",
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      "channel_foreign",
      {
        id: "channel_foreign",
        workspaceId: otherWorkspaceId,
        connectionId: "connection_foreign",
        organizationId: "organization_2",
        providerChannelId: "provider_channel_foreign",
        connectedPhone: "5511888880001",
        channelName: "Outro workspace",
        status: "active",
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
  ]);
  const businesses = new Map<string, TestBusinessConnection>([
    [
      "business_1",
      {
        id: "business_1",
        workspaceId,
        status: "active",
        defaultConversionDestinationId: "destination_1",
        credential: {
          workspaceId,
          status: "active",
          encryptedAccessToken: "token-must-never-leave-meta",
        },
      },
    ],
    [
      "business_2",
      {
        id: "business_2",
        workspaceId,
        status: "active",
        defaultConversionDestinationId: "destination_2",
        credential: {
          workspaceId,
          status: "active",
          encryptedAccessToken: "second-secret-token",
        },
      },
    ],
    [
      "business_paused",
      {
        id: "business_paused",
        workspaceId,
        status: "paused",
        defaultConversionDestinationId: "destination_1",
        credential: {
          workspaceId,
          status: "active",
          encryptedAccessToken: "paused-business-token",
        },
      },
    ],
    [
      "business_credential_paused",
      {
        id: "business_credential_paused",
        workspaceId,
        status: "active",
        defaultConversionDestinationId: "destination_1",
        credential: {
          workspaceId,
          status: "paused",
          encryptedAccessToken: "paused-credential-token",
        },
      },
    ],
    [
      "business_foreign",
      {
        id: "business_foreign",
        workspaceId: otherWorkspaceId,
        status: "active",
        defaultConversionDestinationId: "destination_foreign",
        credential: {
          workspaceId: otherWorkspaceId,
          status: "active",
          encryptedAccessToken: "foreign-token",
        },
      },
    ],
  ]);
  const reportingAccounts = new Map<string, TestReportingAccount>([
    [
      "reporting_1",
      {
        id: "reporting_1",
        workspaceId,
        businessConnectionId: "business_1",
        adAccountId: "act_1",
        active: true,
      },
    ],
    [
      "reporting_2",
      {
        id: "reporting_2",
        workspaceId,
        businessConnectionId: "business_2",
        adAccountId: "act_2",
        active: true,
      },
    ],
    [
      "reporting_inactive",
      {
        id: "reporting_inactive",
        workspaceId,
        businessConnectionId: "business_1",
        adAccountId: "act_inactive",
        active: false,
      },
    ],
    [
      "reporting_foreign",
      {
        id: "reporting_foreign",
        workspaceId: otherWorkspaceId,
        businessConnectionId: "business_foreign",
        adAccountId: "act_foreign",
        active: true,
      },
    ],
  ]);
  const destinations = new Map<string, TestDestination>([
    [
      "destination_1",
      {
        id: "destination_1",
        workspaceId,
        status: "configured",
        ownerBusinessManagerId: "matrix_business_manager",
      },
    ],
    [
      "destination_2",
      {
        id: "destination_2",
        workspaceId,
        status: "configured",
        ownerBusinessManagerId: null,
      },
    ],
    [
      "destination_unconfigured",
      {
        id: "destination_unconfigured",
        workspaceId,
        status: "needs_configuration",
        ownerBusinessManagerId: null,
      },
    ],
    [
      "destination_foreign",
      {
        id: "destination_foreign",
        workspaceId: otherWorkspaceId,
        status: "configured",
        ownerBusinessManagerId: null,
      },
    ],
  ]);
  const routes = new Map<string, TestRoute>();
  const events = new Map<string, TestEvent>();
  const audits: Array<Record<string, unknown>> = [];
  let routeSequence = 0;

  const withChannelRelations = (channel: TestChannel) => ({
    ...channel,
    connection: connections.get(channel.connectionId) ?? null,
    routes: [...routes.values()]
      .filter(
        (route) =>
          route.workspaceId === channel.workspaceId &&
          route.channelId === channel.id &&
          route.active,
      )
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      ),
  });

  const inboundWebhookConnection = {
    findFirst: vi.fn(async ({ where }) => {
      const connection = connections.get(where.id);
      return connection &&
        connection.workspaceId === where.workspaceId &&
        connection.removedAt === null
        ? connection
        : null;
    }),
  };
  const inboundWebhookChannel = {
    findMany: vi.fn(async ({ where }) =>
      [...channels.values()]
        .filter((channel) => {
          if (
            channel.workspaceId !== where.workspaceId ||
            (where.connectionId !== undefined &&
              channel.connectionId !== where.connectionId)
          ) {
            return false;
          }

          if (!where.events?.some) {
            return true;
          }

          const classifications = where.events.some.classification?.in ?? [];
          return [...events.values()].some(
            (event) =>
              event.workspaceId === where.workspaceId &&
              event.channelId === channel.id &&
              classifications.includes(event.classification) &&
              event.replayItem == null,
          );
        })
        .map(withChannelRelations),
    ),
    findFirst: vi.fn(async ({ where }) => {
      const channel = channels.get(where.id);
      if (
        !channel ||
        channel.workspaceId !== where.workspaceId ||
        (where.connectionId && channel.connectionId !== where.connectionId)
      ) {
        return null;
      }

      const connection = connections.get(channel.connectionId);
      return connection?.removedAt === null
        ? withChannelRelations(channel)
        : null;
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const channel = channels.get(where.id);
      if (
        !channel ||
        channel.workspaceId !== where.workspaceId ||
        (where.updatedAt &&
          channel.updatedAt.getTime() !== where.updatedAt.getTime())
      ) {
        return { count: 0 };
      }

      channels.set(channel.id, {
        ...channel,
        ...data,
        updatedAt: data.updatedAt ?? new Date(channel.updatedAt.getTime() + 1),
      });
      return { count: 1 };
    }),
  };
  const inboundWebhookChannelRoute = {
    findMany: vi.fn(async ({ where }) =>
      [...routes.values()]
        .filter(
          (route) =>
            route.workspaceId === where.workspaceId &&
            route.channelId === where.channelId &&
            (where.active === undefined || route.active === where.active),
        )
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
        ),
    ),
    findFirst: vi.fn(async ({ where }) => {
      const route = routes.get(where.id);
      return route &&
        route.workspaceId === where.workspaceId &&
        route.channelId === where.channelId &&
        (where.active === undefined || route.active === where.active)
        ? route
        : null;
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      let count = 0;

      for (const [id, route] of routes) {
        const routeKeyAllowed =
          !where.routeKey?.notIn ||
          !where.routeKey.notIn.includes(route.routeKey);
        if (
          route.workspaceId === where.workspaceId &&
          route.channelId === where.channelId &&
          (where.id === undefined || route.id === where.id) &&
          (where.active === undefined || route.active === where.active) &&
          routeKeyAllowed
        ) {
          routes.set(id, {
            ...route,
            ...data,
            updatedAt:
              data.updatedAt ?? new Date(route.updatedAt.getTime() + 1),
          });
          count += 1;
        }
      }

      return { count };
    }),
    upsert: vi.fn(async ({ where, create, update }) => {
      const existing = [...routes.values()].find(
        (route) =>
          route.channelId === where.channelId_routeKey.channelId &&
          route.routeKey === where.channelId_routeKey.routeKey,
      );

      if (existing) {
        const updated = {
          ...existing,
          ...update,
          updatedAt:
            update.updatedAt ?? new Date(existing.updatedAt.getTime() + 1),
        };
        routes.set(updated.id, updated);
        return updated;
      }

      routeSequence += 1;
      const createdAt = new Date(now.getTime() + routeSequence * 1_000);
      const route: TestRoute = {
        id: `route_${routeSequence}`,
        metaBusinessConnectionWorkspaceId: null,
        metaBusinessConnectionId: null,
        metaReportingAccountWorkspaceId: null,
        metaReportingAccountId: null,
        metaConversionDestinationWorkspaceId: null,
        metaConversionDestinationId: null,
        active: true,
        validationStatus: "pending",
        validationErrorCode: null,
        lastValidatedAt: null,
        createdByUserId: null,
        ...create,
        createdAt,
        updatedAt: createdAt,
      };
      routes.set(route.id, route);
      return route;
    }),
  };
  const metaBusinessConnection = {
    findFirst: vi.fn(async ({ where }) => {
      const business = businesses.get(where.id);
      return business && business.workspaceId === where.workspaceId
        ? business
        : null;
    }),
  };
  const metaReportingAccount = {
    findFirst: vi.fn(async ({ where }) => {
      const account = reportingAccounts.get(where.id);
      return account && account.workspaceId === where.workspaceId
        ? account
        : null;
    }),
  };
  const metaConversionDestination = {
    findFirst: vi.fn(async ({ where }) => {
      const destination = destinations.get(where.id);
      return destination && destination.workspaceId === where.workspaceId
        ? destination
        : null;
    }),
  };
  const inboundWebhookEvent = {
    findMany: vi.fn(async ({ where }) => {
      const classifications = where.classification?.in ?? [
        where.classification,
      ];

      return [...events.values()].filter(
        (event) =>
          event.workspaceId === where.workspaceId &&
          event.channelId === where.channelId &&
          classifications.includes(event.classification) &&
          (where.replayItem === undefined || event.replayItem == null),
      );
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const event = events.get(where.id);
      const classifications = where.classification?.in ?? [
        where.classification,
      ];
      if (
        !event ||
        event.workspaceId !== where.workspaceId ||
        event.channelId !== where.channelId ||
        !classifications.includes(event.classification) ||
        (where.replayItem !== undefined && event.replayItem != null)
      ) {
        return { count: 0 };
      }

      events.set(event.id, { ...event, ...data });
      return { count: 1 };
    }),
  };
  const prisma = {
    inboundWebhookConnection,
    inboundWebhookChannel,
    inboundWebhookChannelRoute,
    inboundWebhookEvent,
    metaBusinessConnection,
    metaReportingAccount,
    metaConversionDestination,
    auditLog: {
      create: vi.fn(async ({ data }) => {
        audits.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (operation) => {
      const channelSnapshot = structuredClone([...channels.entries()]);
      const routeSnapshot = structuredClone([...routes.entries()]);
      const eventSnapshot = structuredClone([...events.entries()]);
      const auditLength = audits.length;

      try {
        return await operation(prisma);
      } catch (error) {
        channels.clear();
        routes.clear();
        events.clear();
        for (const [id, channel] of channelSnapshot) {
          channels.set(id, channel);
        }
        for (const [id, route] of routeSnapshot) {
          routes.set(id, route);
        }
        for (const [id, event] of eventSnapshot) {
          events.set(id, event);
        }
        audits.splice(auditLength);
        throw error;
      }
    }),
  };
  const previewRoute = vi.fn(
    async ({
      workspaceId: previewWorkspaceId,
      adId,
      reportingAccountId,
      businessConnectionId,
      conversionDestinationId,
    }: {
      workspaceId: string;
      adId: string;
      reportingAccountId?: string | null;
      businessConnectionId?: string | null;
      conversionDestinationId?: string | null;
    }): Promise<InboundWebhookMetaRoutePreview> => {
      if (previewWorkspaceId !== workspaceId || adId !== "ad_1") {
        return {
          status: "unresolved" as const,
          reason: "ad_not_found" as const,
          reportingAccountId: null,
          adAccountId: null,
          businessConnectionId: null,
          conversionDestinationId: null,
          pixelId: null,
          pageId: null,
        };
      }

      if (businessConnectionId === "business_1") {
        return {
          status: "resolved" as const,
          reason: "route_resolved" as const,
          reportingAccountId: reportingAccountId ?? "reporting_1",
          adAccountId: "act_1",
          businessConnectionId,
          conversionDestinationId: conversionDestinationId ?? "destination_1",
          pixelId: "pixel_1",
          pageId: "page_1",
        };
      }

      return {
        status: "unresolved" as const,
        reason: "business_connection_not_found" as const,
        reportingAccountId: "reporting_1",
        adAccountId: "act_1",
        businessConnectionId: null,
        conversionDestinationId: null,
        pixelId: null,
        pageId: null,
      };
    },
  );
  const metaRouteReader = {
    previewRoute,
  };
  const service = new InboundWebhookChannelRoutesService(
    prisma as unknown as PrismaService,
    metaRouteReader as unknown as InboundWebhookMetaRouteReaderService,
  );

  function addUnresolvedEvent(
    id: string,
    overrides: Partial<TestEvent> = {},
  ): TestEvent {
    const event: TestEvent = {
      id,
      workspaceId,
      connectionId: "connection_1",
      channelId: "channel_1",
      adId: "ad_1",
      classification: "eligible_route_unresolved",
      classificationReason: "route_resolution_pending",
      resolvedBusinessConnectionWorkspaceId: null,
      resolvedBusinessConnectionId: null,
      resolvedReportingAccountWorkspaceId: null,
      resolvedReportingAccountId: null,
      resolvedConversionDestinationWorkspaceId: null,
      resolvedConversionDestinationId: null,
      normalizedSummary: {
        classification: "eligible_route_unresolved",
        rawPayload: "must-remain-untouched",
      },
      ...overrides,
    };
    events.set(event.id, event);
    return event;
  }

  return {
    audits,
    businesses,
    channels,
    destinations,
    events,
    metaRouteReader,
    previewRoute,
    prisma,
    reportingAccounts,
    routes,
    service,
    addUnresolvedEvent,
  };
}

async function captureNotFound(operation: () => Promise<unknown>) {
  try {
    await operation();
    throw new Error("expected operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundException);
    return {
      status: (error as NotFoundException).getStatus(),
      message: (error as NotFoundException).message,
    };
  }
}

describe("inbound webhook channel routes service", () => {
  it("lists redacted channels and active routes only inside the connection workspace", async () => {
    const harness = createHarness();

    await harness.service.replaceRoutes(
      workspaceId,
      "channel_1",
      {
        routes: [
          {
            metaBusinessConnectionId: "business_1",
            metaReportingAccountId: "reporting_1",
            metaConversionDestinationId: "destination_1",
          },
        ],
      },
      "user_1",
    );
    const route = [...harness.routes.values()][0];
    route.active = false;

    const listed = await harness.service.listChannels(
      workspaceId,
      "connection_1",
    );

    expect(listed).toHaveLength(2);
    expect(listed.map((channel) => channel.id)).toEqual([
      "channel_1",
      "channel_2",
    ]);
    expect(listed[0]?.routes).toEqual([]);
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(otherWorkspaceId);
    expect(serialized).not.toContain("routeKey");
    expect(serialized).not.toContain("WorkspaceId");
    expect(serialized).not.toContain("token-must-never-leave-meta");

    const foreign = await captureNotFound(() =>
      harness.service.listChannels(otherWorkspaceId, "connection_1"),
    );
    const missing = await captureNotFound(() =>
      harness.service.listChannels(otherWorkspaceId, "missing_connection"),
    );
    expect(foreign).toEqual(missing);
  });

  it("persists genuine many-to-many routes and accepts a configured matrix-owned destination", async () => {
    const harness = createHarness();

    const firstChannel = await harness.service.replaceRoutes(
      workspaceId,
      "channel_1",
      {
        routes: [
          {
            metaBusinessConnectionId: "business_1",
            metaReportingAccountId: "reporting_1",
            metaConversionDestinationId: "destination_1",
          },
          {
            metaBusinessConnectionId: "business_2",
            metaReportingAccountId: "reporting_2",
          },
        ],
      },
      "user_1",
    );
    const secondChannel = await harness.service.replaceRoutes(
      workspaceId,
      "channel_2",
      {
        routes: [{ metaBusinessConnectionId: "business_1" }],
      },
      "user_2",
    );

    expect(firstChannel).toHaveLength(2);
    expect(secondChannel).toHaveLength(1);
    expect(
      [...harness.routes.values()].filter(
        (route) =>
          route.active && route.metaBusinessConnectionId === "business_1",
      ),
    ).toHaveLength(2);
    expect(firstChannel[0]).toMatchObject({
      channelId: "channel_1",
      metaBusinessConnectionId: "business_1",
      metaReportingAccountId: "reporting_1",
      metaConversionDestinationId: "destination_1",
      active: true,
      validationStatus: "valid",
    });
    expect(JSON.stringify(firstChannel)).not.toContain("routeKey");
    expect(JSON.stringify(harness.audits)).not.toContain(
      "token-must-never-leave-meta",
    );
    expect(harness.audits.map((audit) => audit.action)).toEqual([
      "inbound_webhook.channel_routes_replaced",
      "inbound_webhook.channel_routes_replaced",
    ]);
  });

  it("tombstones omitted routes and reactivates the same deterministic route", async () => {
    const harness = createHarness();
    const input = {
      routes: [
        { metaBusinessConnectionId: "business_1" },
        { metaBusinessConnectionId: "business_2" },
      ],
    };

    await harness.service.replaceRoutes(
      workspaceId,
      "channel_1",
      input,
      "user_1",
    );
    const originalBusinessTwo = [...harness.routes.values()].find(
      (route) => route.metaBusinessConnectionId === "business_2",
    );

    await harness.service.replaceRoutes(
      workspaceId,
      "channel_1",
      { routes: [{ metaBusinessConnectionId: "business_1" }] },
      "user_1",
    );
    expect(harness.routes.get(originalBusinessTwo!.id)?.active).toBe(false);

    await harness.service.replaceRoutes(
      workspaceId,
      "channel_1",
      input,
      "user_2",
    );
    const reactivated = harness.routes.get(originalBusinessTwo!.id);

    expect(reactivated).toMatchObject({
      id: originalBusinessTwo!.id,
      routeKey: originalBusinessTwo!.routeKey,
      active: true,
      validationStatus: "valid",
      validationErrorCode: null,
    });
    expect(
      [...harness.routes.values()].filter(
        (route) =>
          route.channelId === "channel_1" &&
          route.metaBusinessConnectionId === "business_2",
      ),
    ).toHaveLength(1);
  });

  it("rejects every missing, cross-workspace or inactive route reference generically", async () => {
    const harness = createHarness();
    const invalidInputs = [
      { metaBusinessConnectionId: "missing_business" },
      { metaBusinessConnectionId: "business_foreign" },
      { metaBusinessConnectionId: "business_paused" },
      { metaBusinessConnectionId: "business_credential_paused" },
      {
        metaBusinessConnectionId: "business_1",
        metaReportingAccountId: "reporting_foreign",
      },
      {
        metaBusinessConnectionId: "business_1",
        metaReportingAccountId: "reporting_2",
      },
      {
        metaBusinessConnectionId: "business_1",
        metaReportingAccountId: "reporting_inactive",
      },
      {
        metaBusinessConnectionId: "business_1",
        metaConversionDestinationId: "destination_foreign",
      },
      {
        metaBusinessConnectionId: "business_1",
        metaConversionDestinationId: "destination_unconfigured",
      },
    ];
    const errors = [];

    for (const route of invalidInputs) {
      errors.push(
        await captureNotFound(() =>
          harness.service.replaceRoutes(
            workspaceId,
            "channel_1",
            { routes: [route] },
            "user_1",
          ),
        ),
      );
    }

    expect(new Set(errors.map((error) => JSON.stringify(error))).size).toBe(1);
    expect(harness.routes.size).toBe(0);
    expect(harness.audits).toEqual([]);

    const foreignChannel = await captureNotFound(() =>
      harness.service.replaceRoutes(
        workspaceId,
        "channel_foreign",
        { routes: [] },
        "user_1",
      ),
    );
    const missingChannel = await captureNotFound(() =>
      harness.service.replaceRoutes(
        workspaceId,
        "missing_channel",
        { routes: [] },
        "user_1",
      ),
    );
    expect(foreignChannel).toEqual(missingChannel);
  });

  it("tombstones one route transactionally and audits without credentials", async () => {
    const harness = createHarness();
    const [route] = await harness.service.replaceRoutes(
      workspaceId,
      "channel_1",
      { routes: [{ metaBusinessConnectionId: "business_1" }] },
      "user_1",
    );

    await harness.service.removeRoute(
      workspaceId,
      "channel_1",
      route!.id,
      "user_2",
    );

    expect(harness.routes.get(route!.id)?.active).toBe(false);
    expect(harness.audits.at(-1)).toMatchObject({
      action: "inbound_webhook.channel_route_removed",
      targetId: route!.id,
      actorUserId: "user_2",
    });
    expect(JSON.stringify(harness.audits)).not.toContain("secret-token");

    const foreign = await captureNotFound(() =>
      harness.service.removeRoute(
        otherWorkspaceId,
        "channel_1",
        route!.id,
        "user_2",
      ),
    );
    const missing = await captureNotFound(() =>
      harness.service.removeRoute(
        otherWorkspaceId,
        "channel_1",
        "missing_route",
        "user_2",
      ),
    );
    expect(foreign).toEqual(missing);
  });

  it("re-evaluates eligible unresolved events through metadata-only previews after route replacement", async () => {
    const harness = createHarness();
    const event = harness.addUnresolvedEvent("event_1");
    const originalSummary = structuredClone(event.normalizedSummary);

    await harness.service.replaceRoutes(
      workspaceId,
      "channel_1",
      {
        routes: [
          {
            metaBusinessConnectionId: "business_1",
            metaReportingAccountId: "reporting_1",
            metaConversionDestinationId: "destination_1",
          },
          {
            metaBusinessConnectionId: "business_2",
            metaReportingAccountId: "reporting_2",
          },
        ],
      },
      "user_1",
    );

    expect(harness.previewRoute).toHaveBeenCalledTimes(2);
    expect(harness.previewRoute).toHaveBeenNthCalledWith(1, {
      workspaceId,
      adId: "ad_1",
      businessConnectionId: "business_1",
      reportingAccountId: "reporting_1",
      conversionDestinationId: "destination_1",
    });
    expect(harness.events.get("event_1")).toMatchObject({
      classification: "eligible_route_resolved",
      classificationReason: "route_resolved",
      resolvedBusinessConnectionWorkspaceId: workspaceId,
      resolvedBusinessConnectionId: "business_1",
      resolvedReportingAccountWorkspaceId: workspaceId,
      resolvedReportingAccountId: "reporting_1",
      resolvedConversionDestinationWorkspaceId: workspaceId,
      resolvedConversionDestinationId: "destination_1",
      normalizedSummary: originalSummary,
    });
  });

  it("demotes an unmaterialized resolved event when its channel route is removed", async () => {
    const harness = createHarness();
    const [route] = await harness.service.replaceRoutes(
      workspaceId,
      "channel_1",
      { routes: [{ metaBusinessConnectionId: "business_1" }] },
      "user_1",
    );
    harness.addUnresolvedEvent("event_resolved", {
      classification: "eligible_route_resolved",
      classificationReason: "route_resolved",
      resolvedBusinessConnectionWorkspaceId: workspaceId,
      resolvedBusinessConnectionId: "business_1",
      resolvedReportingAccountWorkspaceId: workspaceId,
      resolvedReportingAccountId: "reporting_1",
      resolvedConversionDestinationWorkspaceId: workspaceId,
      resolvedConversionDestinationId: "destination_1",
    });

    await harness.service.removeRoute(
      workspaceId,
      "channel_1",
      route!.id,
      "user_1",
    );

    expect(harness.events.get("event_resolved")).toMatchObject({
      classification: "eligible_route_unresolved",
      classificationReason: "route_not_configured",
      resolvedBusinessConnectionId: null,
      resolvedReportingAccountId: null,
      resolvedConversionDestinationId: null,
    });
  });

  it("fails closed for zero previews, conflicts, missing ad and a paused channel", async () => {
    const zero = createHarness();
    zero.addUnresolvedEvent("event_zero");
    zero.previewRoute.mockResolvedValue({
      status: "unresolved",
      reason: "reporting_account_not_found",
      reportingAccountId: null,
      adAccountId: "act_unsynchronized",
      businessConnectionId: null,
      conversionDestinationId: null,
      pixelId: null,
      pageId: null,
    });
    await zero.service.replaceRoutes(
      workspaceId,
      "channel_1",
      { routes: [{ metaBusinessConnectionId: "business_1" }] },
      "user_1",
    );
    expect(zero.events.get("event_zero")).toMatchObject({
      classification: "eligible_route_unresolved",
      classificationReason: "reporting_account_not_found",
      resolvedBusinessConnectionId: null,
      resolvedReportingAccountId: null,
      resolvedConversionDestinationId: null,
    });

    const conflict = createHarness();
    conflict.addUnresolvedEvent("event_conflict");
    conflict.previewRoute.mockImplementation(async (input) => ({
      status: "resolved",
      reason: "route_resolved",
      reportingAccountId:
        input.businessConnectionId === "business_1"
          ? "reporting_1"
          : "reporting_2",
      adAccountId:
        input.businessConnectionId === "business_1" ? "act_1" : "act_2",
      businessConnectionId: input.businessConnectionId ?? null,
      conversionDestinationId:
        input.businessConnectionId === "business_1"
          ? "destination_1"
          : "destination_2",
      pixelId: "pixel",
      pageId: "page",
    }));
    await conflict.service.replaceRoutes(
      workspaceId,
      "channel_1",
      {
        routes: [
          { metaBusinessConnectionId: "business_1" },
          { metaBusinessConnectionId: "business_2" },
        ],
      },
      "user_1",
    );
    expect(conflict.events.get("event_conflict")).toMatchObject({
      classification: "eligible_route_unresolved",
      classificationReason: "route_conflict",
      resolvedBusinessConnectionId: null,
      resolvedReportingAccountId: null,
      resolvedConversionDestinationId: null,
    });

    const missingAd = createHarness();
    missingAd.addUnresolvedEvent("event_without_ad", { adId: null });
    await missingAd.service.replaceRoutes(
      workspaceId,
      "channel_1",
      { routes: [{ metaBusinessConnectionId: "business_1" }] },
      "user_1",
    );
    expect(missingAd.previewRoute).not.toHaveBeenCalled();
    expect(missingAd.events.get("event_without_ad")).toMatchObject({
      classification: "eligible_route_unresolved",
      classificationReason: "route_ad_missing",
    });

    const paused = createHarness();
    paused.addUnresolvedEvent("event_paused");
    await paused.service.replaceRoutes(
      workspaceId,
      "channel_1",
      { routes: [{ metaBusinessConnectionId: "business_1" }] },
      "user_1",
    );
    const eventPendingPause = paused.events.get("event_paused")!;
    paused.events.set("event_paused", {
      ...eventPendingPause,
      classification: "eligible_route_unresolved",
      classificationReason: "route_resolution_pending",
      resolvedBusinessConnectionWorkspaceId: null,
      resolvedBusinessConnectionId: null,
      resolvedReportingAccountWorkspaceId: null,
      resolvedReportingAccountId: null,
      resolvedConversionDestinationWorkspaceId: null,
      resolvedConversionDestinationId: null,
    });
    paused.previewRoute.mockClear();
    await paused.service.updateChannelStatus(
      workspaceId,
      "channel_1",
      { status: "paused" },
      "user_2",
    );
    expect(paused.previewRoute).not.toHaveBeenCalled();
    expect(paused.events.get("event_paused")).toMatchObject({
      classification: "eligible_route_unresolved",
      classificationReason: "route_channel_paused",
    });
  });

  it("rolls route changes back when the audit cannot be stored", async () => {
    const harness = createHarness();
    harness.prisma.auditLog.create.mockRejectedValueOnce(
      new Error("audit unavailable"),
    );

    await expect(
      harness.service.replaceRoutes(
        workspaceId,
        "channel_1",
        { routes: [{ metaBusinessConnectionId: "business_1" }] },
        "user_1",
      ),
    ).rejects.toThrow("audit unavailable");

    expect(harness.routes.size).toBe(0);
    expect(harness.audits).toEqual([]);
    expect(harness.previewRoute).not.toHaveBeenCalled();
  });
});
