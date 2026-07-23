import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { BackofficeInboundWebhooksController } from "../src/inbound-webhooks/backoffice-inbound-webhooks.controller";
import { BackofficeInboundWebhooksService } from "../src/inbound-webhooks/backoffice-inbound-webhooks.service";

const delivery = {
  id: "delivery_1",
  workspaceId: "workspace_1",
  workspaceName: "Cliente Teste",
  connectionId: "connection_1",
  connectionName: "Umbler Comercial",
  provider: "umbler",
  providerEventType: "Message",
  parserVersion: "v1",
  parserReleaseStatus: "observation_only",
  purpose: "message_observation",
  status: "processed",
  classification: "eligible_route_resolved",
  firstReceivedAt: "2026-07-17T20:00:00.000Z",
  lastReceivedAt: "2026-07-17T20:00:01.000Z",
  attemptCount: 1,
  payloadAvailable: true,
  payloadExpiresAt: "2099-07-24T20:00:00.000Z",
  providerConversionsObservedAt: null,
  parseErrorCode: null,
  routingErrorCode: null,
  normalizedSummary: {
    provider: "umbler",
    eventCount: 1,
  },
  eventCount: 1,
  channels: [
    {
      id: "channel_1",
      displayName: "Comercial",
      connectedPhone: "+5511999999999",
    },
  ],
};

const payloadResult = {
  delivery,
  payload: {
    Type: "Message",
    EventId: "umbler_event_1",
  },
  events: [
    {
      id: "event_1",
      connectionId: "connection_1",
      deliveryId: "delivery_1",
      channelId: "channel_1",
      provider: "umbler",
      providerEventType: "Message",
      externalMessageId: "message_1",
      occurredAt: "2026-07-17T20:00:00.000Z",
      connectedPhoneSuffix: "9999",
      contactIdentityHash: `sha256:${"a".repeat(64)}`,
      adId: "ad_1",
      hasCtwa: true,
      classification: "eligible_route_resolved",
      classificationReason: "paid_ctwa_candidate",
      resolvedBusinessConnectionId: "meta_business_1",
      resolvedReportingAccountId: "meta_account_1",
      resolvedConversionDestinationId: "meta_destination_1",
      createdAt: "2026-07-17T20:00:02.000Z",
    },
  ],
};

async function createApp() {
  const platformAdminService = {
    assertPlatformOwner: vi.fn(async (token: string) => {
      if (token === "owner-token") {
        return {
          id: "platform_owner_1",
          email: "owner@wpptrack.com",
          role: "platform_owner",
        };
      }

      throw new ForbiddenException(
        "Acao restrita ao proprietario da plataforma",
      );
    }),
  };
  const authService = {
    getSession: vi.fn(async (token: string) => {
      if (token === "operator-token") {
        return {
          user: {
            id: "platform_operator_1",
            email: "operator@wpptrack.com",
            platformRole: "platform_operator",
          },
          workspaces: [],
        };
      }

      if (token === "workspace-admin-token") {
        return {
          user: {
            id: "workspace_admin_1",
            email: "admin@customer.example",
            platformRole: null,
          },
          workspaces: [
            {
              id: "workspace_1",
              role: "admin",
            },
          ],
        };
      }

      throw new ForbiddenException("Sessao invalida");
    }),
  };
  const service = {
    getOperationsScope: vi.fn(async () => ({
      workspaces: [
        {
          id: "workspace_1",
          name: "Cliente Teste",
          connections: [
            {
              id: "connection_1",
              displayName: "Umbler Comercial",
              provider: "umbler",
              status: "production",
              lastDeliveryAt: "2026-07-17T20:00:01.000Z",
              channels: [
                {
                  id: "channel_1",
                  displayName: "Comercial",
                  connectedPhone: "+5511999999999",
                  status: "active",
                  lastSeenAt: "2026-07-17T20:00:01.000Z",
                },
              ],
            },
          ],
        },
      ],
    })),
    listDeliveries: vi.fn(async () => [delivery]),
    summarizeDeliveries: vi.fn(async () => ({
      all: 423,
      ctwaPending: 50,
      ctwaRouted: 0,
      failed: 0,
      noCtwa: 373,
      automationCallbacks: 12,
      awaitingParser: 4,
    })),
    getPayload: vi.fn(async () => payloadResult),
    reprocessProviderConversions: vi.fn(async () => ({
      deliveryId: "delivery_1",
      status: "queued",
    })),
    recordDeniedPayloadAccess: vi.fn(async () => undefined),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BackofficeInboundWebhooksController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdminService },
      { provide: AuthService, useValue: authService },
      { provide: BackofficeInboundWebhooksService, useValue: service },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    authService,
    platformAdminService,
    service,
  };
}

describe("backoffice inbound webhooks controller", () => {
  it("returns a human-readable workspace, connection and channel scope to the platform owner", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/inbound-webhooks/scope")
      .set("Authorization", "Bearer owner-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaces[0].name).toBe("Cliente Teste");
        expect(body.workspaces[0].connections[0].displayName).toBe(
          "Umbler Comercial",
        );
        expect(body.workspaces[0].connections[0].channels[0]).toMatchObject({
          displayName: "Comercial",
          connectedPhone: "+5511999999999",
        });
      });

    expect(service.getOperationsScope).toHaveBeenCalledOnce();
    await app.close();
  });

  it("lets only a platform owner list cross-workspace deliveries with parser status", async () => {
    const { app, platformAdminService, service } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/backoffice/inbound-webhooks/deliveries?workspaceId=workspace_1&connectionId=connection_1&channelId=channel_1&provider=umbler&purpose=message_observation&status=processed&classification=eligible_route_resolved&limit=25&offset=50",
      )
      .set("Authorization", "Bearer owner-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          id: "delivery_1",
          workspaceId: "workspace_1",
          parserVersion: "v1",
          parserReleaseStatus: "observation_only",
          payloadAvailable: true,
        });
        expect(JSON.stringify(body)).not.toContain("secretHash");
        expect(JSON.stringify(body)).not.toContain("webhookUrl");
      });

    expect(platformAdminService.assertPlatformOwner).toHaveBeenCalledWith(
      "owner-token",
    );
    expect(service.listDeliveries).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      provider: "umbler",
      purpose: "message_observation",
      status: "processed",
      classification: "eligible_route_resolved",
      limit: 25,
      offset: 50,
    });

    await app.close();
  });

  it.each(["operator-token", "workspace-admin-token"])(
    "denies delivery listing to a valid non-owner session (%s)",
    async (token) => {
      const { app, service } = await createApp();

      await request(app.getHttpServer())
        .get("/backoffice/inbound-webhooks/deliveries")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      expect(service.listDeliveries).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it("returns global counters scoped to the selected workspace and connection", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/backoffice/inbound-webhooks/summary?workspaceId=workspace_1&connectionId=connection_1&channelId=channel_1&provider=umbler",
      )
      .set("Authorization", "Bearer owner-token")
      .expect(200)
      .expect({
        all: 423,
        ctwaPending: 50,
        ctwaRouted: 0,
        failed: 0,
        noCtwa: 373,
        automationCallbacks: 12,
        awaitingParser: 4,
      });

    expect(service.summarizeDeliveries).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      provider: "umbler",
    });
    await app.close();
  });

  it("returns a platform-owner payload with metadata and normalized events", async () => {
    const { app, platformAdminService, service } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/inbound-webhooks/deliveries/delivery_1/payload")
      .set("Authorization", "Bearer owner-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.delivery.parserReleaseStatus).toBe("observation_only");
        expect(body.payload.EventId).toBe("umbler_event_1");
        expect(body.events).toHaveLength(1);
        expect(body.events[0].classification).toBe("eligible_route_resolved");
      });

    expect(platformAdminService.assertPlatformOwner).toHaveBeenCalledWith(
      "owner-token",
    );
    expect(service.getPayload).toHaveBeenCalledWith(
      "delivery_1",
      expect.objectContaining({
        id: "platform_owner_1",
        actorType: "platform_owner",
        sourceIp: expect.any(String),
      }),
    );

    await app.close();
  });

  it("lets only the platform owner recover conversion observation for one retained delivery", async () => {
    const { app, platformAdminService, service } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/inbound-webhooks/deliveries/delivery_1/reprocess-provider-conversions",
      )
      .set("Authorization", "Bearer owner-token")
      .expect(201)
      .expect({
        deliveryId: "delivery_1",
        status: "queued",
      });

    expect(platformAdminService.assertPlatformOwner).toHaveBeenCalledWith(
      "owner-token",
    );
    expect(service.reprocessProviderConversions).toHaveBeenCalledWith(
      "delivery_1",
      expect.objectContaining({
        id: "platform_owner_1",
        actorType: "platform_owner",
        sourceIp: expect.any(String),
      }),
    );

    await app.close();
  });

  it("denies conversion recovery to workspace users", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/inbound-webhooks/deliveries/delivery_1/reprocess-provider-conversions",
      )
      .set("Authorization", "Bearer workspace-admin-token")
      .expect(403);

    expect(service.reprocessProviderConversions).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    {
      token: "operator-token",
      actorUserId: "platform_operator_1",
      actorType: "platform_operator",
    },
    {
      token: "workspace-admin-token",
      actorUserId: "workspace_admin_1",
      actorType: "workspace_user",
    },
  ])(
    "audits and denies raw access for $actorType",
    async ({ token, actorUserId, actorType }) => {
      const { app, authService, service } = await createApp();

      await request(app.getHttpServer())
        .get("/backoffice/inbound-webhooks/deliveries/delivery_1/payload")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      expect(authService.getSession).toHaveBeenCalledWith(token);
      expect(service.recordDeniedPayloadAccess).toHaveBeenCalledWith({
        deliveryId: "delivery_1",
        actorUserId,
        actorType,
        sourceIp: expect.any(String),
      });
      expect(service.getPayload).not.toHaveBeenCalled();

      await app.close();
    },
  );

  it("does not create an attacker-controlled audit for an invalid session", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/inbound-webhooks/deliveries/delivery_1/payload")
      .set("Authorization", "Bearer invalid-token")
      .expect(403);

    expect(service.recordDeniedPayloadAccess).not.toHaveBeenCalled();
    expect(service.getPayload).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects invalid list filters before querying deliveries", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/inbound-webhooks/deliveries?limit=0")
      .set("Authorization", "Bearer owner-token")
      .expect(400);

    expect(service.listDeliveries).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a negative delivery offset before querying the database", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/inbound-webhooks/deliveries?offset=-1")
      .set("Authorization", "Bearer owner-token")
      .expect(400);

    expect(service.listDeliveries).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not expose a parser certification action in observation mode", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/inbound-webhooks/parser-releases/inbound_parser_umbler_v1/certify",
      )
      .set("Authorization", "Bearer owner-token")
      .expect(404);

    expect(service.listDeliveries).not.toHaveBeenCalled();
    expect(service.getPayload).not.toHaveBeenCalled();
    await app.close();
  });
});
