import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { InboundWebhookChannelRoutesService } from "../src/inbound-webhooks/inbound-webhook-channel-routes.service";
import { InboundWebhookConnectionsController } from "../src/inbound-webhooks/inbound-webhook-connections.controller";
import { InboundWebhookConnectionsService } from "../src/inbound-webhooks/inbound-webhook-connections.service";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

type WorkspaceRole = "owner" | "admin" | "member";

function workspacePermissions(role: WorkspaceRole) {
  const isOwner = role === "owner";
  const isAdmin = role === "admin";

  return {
    canInviteMembers: isOwner,
    canManageMembers: isOwner,
    canGrantMemberManager: isOwner,
    canManageBilling: isOwner,
    canManageIntegrations: isOwner || isAdmin,
    canManageWorkspaceSettings: isOwner || isAdmin,
    canTransferOwnership: isOwner,
    canViewReports: true,
    canExportReports: true,
  };
}

function connectionDto() {
  return {
    id: "inbound_connection_1",
    workspaceId: "workspace_1",
    provider: "umbler" as const,
    displayName: "Umbler Comercial",
    parserVersion: "v1",
    parserReleaseStatus: "observation_only" as const,
    status: "observation" as const,
    lastDeliveryAt: null,
    lastSuccessfulParseAt: null,
    createdAt: "2026-07-17T18:30:00.000Z",
    updatedAt: "2026-07-17T18:30:00.000Z",
  };
}

function channelDto() {
  return {
    id: "inbound_channel_1",
    connectionId: "inbound_connection_1",
    organizationId: "umbler_org_1",
    providerChannelId: "umbler_channel_1",
    connectedPhone: "5511999999999",
    channelName: "Comercial",
    status: "active" as const,
    firstSeenAt: "2026-07-17T18:30:00.000Z",
    lastSeenAt: "2026-07-17T18:35:00.000Z",
    routes: [],
    readiness: {
      state: "waiting" as const,
      blockers: ["route_not_configured", "ctwa_not_observed"] as const,
      routeCount: 0,
      validRouteCount: 0,
      totalCtwa: 0,
      routedCtwa: 0,
      unresolvedCtwa: 0,
      retainedCtwa: 0,
      retainedRoutedCtwa: 0,
      payloadUnavailableCtwa: 0,
      alreadyMaterializedCtwa: 0,
      nextPayloadExpiresAt: null,
    },
    createdAt: "2026-07-17T18:30:00.000Z",
    updatedAt: "2026-07-17T18:35:00.000Z",
  };
}

async function createApp(role: WorkspaceRole = "owner") {
  const authService = {
    getSession: vi.fn(async () => ({
      user: {
        id: "user_1",
        email: "cliente@wpptrack.com",
        name: "Cliente",
        authProvider: "email",
        emailVerifiedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Cliente",
          slug: "cliente",
          role,
          permissions: workspacePermissions(role),
        },
      ],
    })),
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn((authenticated) => authenticated.workspaces[0]),
  };
  const connectionsService = {
    getCapabilities: vi.fn(async () => ({
      enabled: true,
      providers: [
        {
          provider: "umbler",
          parserVersion: "v1",
          parserReleaseStatus: "observation_only",
          creationEnabled: true,
        },
      ],
    })),
    listConnections: vi.fn(async () => [connectionDto()]),
    getConnection: vi.fn(async () => connectionDto()),
    getOverview: vi.fn(async () => ({
      connection: connectionDto(),
      counters: {
        eligibleRouted: 2,
        eligibleUnresolved: 1,
        ignoredNoCtwa: 4,
        duplicate: 1,
        invalid: 0,
      },
    })),
    createConnection: vi.fn(async () => ({
      connection: connectionDto(),
      secret: "a".repeat(43),
      webhookUrl:
        "https://api.example.com/webhooks/inbound/inbound_connection_1?token=one-time-secret",
    })),
    rotateSecret: vi.fn(async () => ({
      connectionId: "inbound_connection_1",
      secret: "b".repeat(43),
      webhookUrl:
        "https://api.example.com/webhooks/inbound/inbound_connection_1?token=rotated-secret",
      rotatedAt: "2026-07-17T18:35:00.000Z",
    })),
    updateStatus: vi.fn(async (_workspaceId, _connectionId, input) => ({
      ...connectionDto(),
      status: input.status,
    })),
    removeConnection: vi.fn(async () => undefined),
  };
  const channelRoutesService = {
    listChannels: vi.fn(async () => [channelDto()]),
    replaceRoutes: vi.fn(async (_workspaceId, channelId, input) =>
      input.routes.map(
        (
          route: {
            metaBusinessConnectionId: string;
            metaReportingAccountId?: string | null;
            metaConversionDestinationId?: string | null;
          },
          index: number,
        ) => ({
          id: `route_${index + 1}`,
          channelId,
          metaBusinessConnectionId: route.metaBusinessConnectionId,
          metaReportingAccountId: route.metaReportingAccountId ?? null,
          metaConversionDestinationId:
            route.metaConversionDestinationId ?? null,
          active: true,
          validationStatus: "valid",
          validationErrorCode: null,
          lastValidatedAt: "2026-07-17T18:40:00.000Z",
          createdAt: "2026-07-17T18:40:00.000Z",
          updatedAt: "2026-07-17T18:40:00.000Z",
        }),
      ),
    ),
    removeRoute: vi.fn(async () => undefined),
    updateChannelStatus: vi.fn(async (_workspaceId, _channelId, input) => ({
      ...channelDto(),
      status: input.status,
    })),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [InboundWebhookConnectionsController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
      {
        provide: InboundWebhookConnectionsService,
        useValue: connectionsService,
      },
      {
        provide: InboundWebhookChannelRoutesService,
        useValue: channelRoutesService,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    authService,
    channelRoutesService,
    connectionsService,
  };
}

describe("inbound webhook connections controller", () => {
  it("lists and reads connections only from the current workspace context", async () => {
    const { app, authService, channelRoutesService, connectionsService } =
      await createApp("member");

    await request(app.getHttpServer())
      .get("/integrations/inbound-webhooks")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe("inbound_connection_1");
        expect(JSON.stringify(body)).not.toContain("secret");
      });

    await request(app.getHttpServer())
      .get("/integrations/inbound-webhooks/capabilities")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.enabled).toBe(true);
        expect(body.providers[0].provider).toBe("umbler");
      });

    await request(app.getHttpServer())
      .get("/integrations/inbound-webhooks/inbound_connection_1")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
      });

    await request(app.getHttpServer())
      .get("/integrations/inbound-webhooks/inbound_connection_1/channels")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe("inbound_channel_1");
      });

    await request(app.getHttpServer())
      .get("/integrations/inbound-webhooks/inbound_connection_1/overview")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.counters.eligibleRouted).toBe(2);
      });

    expect(authService.getSession).toHaveBeenCalledWith("refresh-token");
    expect(connectionsService.listConnections).toHaveBeenCalledWith(
      "workspace_1",
    );
    expect(connectionsService.getConnection).toHaveBeenCalledWith(
      "workspace_1",
      "inbound_connection_1",
    );
    expect(connectionsService.getCapabilities).toHaveBeenCalledOnce();
    expect(connectionsService.getOverview).toHaveBeenCalledWith(
      "workspace_1",
      "inbound_connection_1",
    );
    expect(channelRoutesService.listChannels).toHaveBeenCalledWith(
      "workspace_1",
      "inbound_connection_1",
    );

    await app.close();
  });

  it.each(["owner", "admin"] as const)(
    "allows a %s to create an observation connection",
    async (role) => {
      const { app, connectionsService } = await createApp(role);

      await request(app.getHttpServer())
        .post("/integrations/inbound-webhooks")
        .set("Authorization", "Bearer refresh-token")
        .send({
          provider: "umbler",
          displayName: "Umbler Comercial",
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body.connection.provider).toBe("umbler");
          expect(body.secret).toHaveLength(43);
          expect(body.webhookUrl).toContain("/webhooks/inbound/");
        });

      expect(connectionsService.createConnection).toHaveBeenCalledWith(
        "workspace_1",
        {
          provider: "umbler",
          displayName: "Umbler Comercial",
        },
        "user_1",
      );

      await app.close();
    },
  );

  it("keeps a workspace member read-only", async () => {
    const { app, channelRoutesService, connectionsService } =
      await createApp("member");

    await request(app.getHttpServer())
      .post("/integrations/inbound-webhooks")
      .set("Authorization", "Bearer refresh-token")
      .send({
        provider: "umbler",
        displayName: "Umbler Comercial",
      })
      .expect(403);

    await request(app.getHttpServer())
      .post("/integrations/inbound-webhooks/inbound_connection_1/rotate-secret")
      .set("Authorization", "Bearer refresh-token")
      .expect(403);

    await request(app.getHttpServer())
      .delete("/integrations/inbound-webhooks/inbound_connection_1")
      .set("Authorization", "Bearer refresh-token")
      .expect(403);

    await request(app.getHttpServer())
      .put("/integrations/inbound-webhooks/channels/inbound_channel_1/routes")
      .set("Authorization", "Bearer refresh-token")
      .send({
        routes: [{ metaBusinessConnectionId: "meta_business_1" }],
      })
      .expect(403);

    await request(app.getHttpServer())
      .put("/integrations/inbound-webhooks/channels/inbound_channel_1/status")
      .set("Authorization", "Bearer refresh-token")
      .send({ status: "paused" })
      .expect(403);

    await request(app.getHttpServer())
      .delete(
        "/integrations/inbound-webhooks/channels/inbound_channel_1/routes/route_1",
      )
      .set("Authorization", "Bearer refresh-token")
      .expect(403);

    expect(connectionsService.createConnection).not.toHaveBeenCalled();
    expect(connectionsService.rotateSecret).not.toHaveBeenCalled();
    expect(connectionsService.removeConnection).not.toHaveBeenCalled();
    expect(channelRoutesService.replaceRoutes).not.toHaveBeenCalled();
    expect(channelRoutesService.updateChannelStatus).not.toHaveBeenCalled();
    expect(channelRoutesService.removeRoute).not.toHaveBeenCalled();

    await app.close();
  });

  it("validates input and returns a certification conflict for production", async () => {
    const { app, connectionsService } = await createApp("owner");

    await request(app.getHttpServer())
      .post("/integrations/inbound-webhooks")
      .set("Authorization", "Bearer refresh-token")
      .send({
        provider: "umbler",
        displayName: "<script>",
      })
      .expect(400);

    await request(app.getHttpServer())
      .put("/integrations/inbound-webhooks/inbound_connection_1/status")
      .set("Authorization", "Bearer refresh-token")
      .send({
        status: "production",
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toContain("certificacao");
      });

    expect(connectionsService.createConnection).not.toHaveBeenCalled();
    expect(connectionsService.updateStatus).not.toHaveBeenCalled();

    await app.close();
  });

  it("rotates, pauses and removes using the authenticated actor", async () => {
    const { app, connectionsService } = await createApp("admin");

    await request(app.getHttpServer())
      .post("/integrations/inbound-webhooks/inbound_connection_1/rotate-secret")
      .set("Authorization", "Bearer refresh-token")
      .expect(200);

    await request(app.getHttpServer())
      .put("/integrations/inbound-webhooks/inbound_connection_1/status")
      .set("Authorization", "Bearer refresh-token")
      .send({
        status: "paused",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("paused");
      });

    await request(app.getHttpServer())
      .delete("/integrations/inbound-webhooks/inbound_connection_1")
      .set("Authorization", "Bearer refresh-token")
      .expect(204);

    expect(connectionsService.rotateSecret).toHaveBeenCalledWith(
      "workspace_1",
      "inbound_connection_1",
      "user_1",
    );
    expect(connectionsService.updateStatus).toHaveBeenCalledWith(
      "workspace_1",
      "inbound_connection_1",
      { status: "paused" },
      "user_1",
    );
    expect(connectionsService.removeConnection).toHaveBeenCalledWith(
      "workspace_1",
      "inbound_connection_1",
      "user_1",
    );

    await app.close();
  });

  it.each(["owner", "admin"] as const)(
    "allows a %s to manage channel routes and status",
    async (role) => {
      const { app, channelRoutesService } = await createApp(role);

      await request(app.getHttpServer())
        .put("/integrations/inbound-webhooks/channels/inbound_channel_1/routes")
        .set("Authorization", "Bearer refresh-token")
        .send({
          routes: [
            {
              metaBusinessConnectionId: "meta_business_1",
              metaReportingAccountId: "meta_account_1",
              metaConversionDestinationId: "meta_destination_1",
            },
            {
              metaBusinessConnectionId: "meta_business_2",
            },
          ],
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveLength(2);
        });

      await request(app.getHttpServer())
        .put("/integrations/inbound-webhooks/channels/inbound_channel_1/status")
        .set("Authorization", "Bearer refresh-token")
        .send({ status: "paused" })
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe("paused");
        });

      await request(app.getHttpServer())
        .delete(
          "/integrations/inbound-webhooks/channels/inbound_channel_1/routes/route_1",
        )
        .set("Authorization", "Bearer refresh-token")
        .expect(204);

      expect(channelRoutesService.replaceRoutes).toHaveBeenCalledWith(
        "workspace_1",
        "inbound_channel_1",
        {
          routes: [
            {
              metaBusinessConnectionId: "meta_business_1",
              metaReportingAccountId: "meta_account_1",
              metaConversionDestinationId: "meta_destination_1",
            },
            {
              metaBusinessConnectionId: "meta_business_2",
            },
          ],
        },
        "user_1",
      );
      expect(channelRoutesService.updateChannelStatus).toHaveBeenCalledWith(
        "workspace_1",
        "inbound_channel_1",
        { status: "paused" },
        "user_1",
      );
      expect(channelRoutesService.removeRoute).toHaveBeenCalledWith(
        "workspace_1",
        "inbound_channel_1",
        "route_1",
        "user_1",
      );

      await app.close();
    },
  );

  it("rejects invalid route and channel status inputs before mutation", async () => {
    const { app, channelRoutesService } = await createApp("owner");

    await request(app.getHttpServer())
      .put("/integrations/inbound-webhooks/channels/inbound_channel_1/routes")
      .set("Authorization", "Bearer refresh-token")
      .send({
        routes: [{ metaBusinessConnectionId: "" }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .put("/integrations/inbound-webhooks/channels/inbound_channel_1/status")
      .set("Authorization", "Bearer refresh-token")
      .send({ status: "discovered" })
      .expect(400);

    expect(channelRoutesService.replaceRoutes).not.toHaveBeenCalled();
    expect(channelRoutesService.updateChannelStatus).not.toHaveBeenCalled();

    await app.close();
  });
});
