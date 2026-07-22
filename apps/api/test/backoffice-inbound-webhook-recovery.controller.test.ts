import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { BackofficeInboundWebhookRecoveryController } from "../src/inbound-webhooks/backoffice-inbound-webhook-recovery.controller";
import { BackofficeInboundWebhookRecoveryService } from "../src/inbound-webhooks/backoffice-inbound-webhook-recovery.service";

async function createApp() {
  const owner = {
    id: "platform_owner_1",
    email: "owner@wpptrack.com",
    role: "platform_owner" as const,
  };
  const platformAdmin = {
    assertPlatformOwner: vi.fn(async (token: string) => {
      if (token === "owner-token") {
        return owner;
      }

      throw new ForbiddenException(
        "Acao restrita ao proprietario da plataforma",
      );
    }),
  };
  const recovery = {
    getPreview: vi.fn(async () => ({
      workspace: { id: "workspace_1", name: "Cliente Teste" },
      connection: {
        id: "connection_1",
        workspaceId: "workspace_1",
        provider: "umbler",
        displayName: "Umbler Comercial",
        parserVersion: "v1",
        parserReleaseStatus: "certified",
        status: "production",
        productionActivatedAt: "2026-07-21T12:00:00.000Z",
        lastDeliveryAt: "2026-07-21T12:10:00.000Z",
        lastSuccessfulParseAt: "2026-07-21T12:10:00.000Z",
        createdAt: "2026-07-20T12:00:00.000Z",
        updatedAt: "2026-07-21T12:10:00.000Z",
      },
      productionEnabled: true,
      counts: {
        totalCtwa: 20,
        historical: 8,
        routeUnresolved: 1,
        unavailable: 1,
        alreadyQueued: 5,
        eligible: 5,
      },
      channels: [],
    })),
    authorizeRecovery: vi.fn(async () => ({
      connectionId: "connection_1",
      channelId: "channel_1",
      selection: "canary_1",
      selected: 1,
      persisted: 1,
      queued: 1,
      existing: 0,
      queueFailures: 0,
    })),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BackofficeInboundWebhookRecoveryController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdmin },
      {
        provide: BackofficeInboundWebhookRecoveryService,
        useValue: recovery,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, owner, platformAdmin, recovery };
}

describe("backoffice inbound webhook production recovery controller", () => {
  it("lets the platform owner inspect a production recovery preview", async () => {
    const { app, recovery } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/backoffice/inbound-webhooks/connections/connection_1/production-recovery-preview",
      )
      .set("Authorization", "Bearer owner-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspace.name).toBe("Cliente Teste");
        expect(body.counts.eligible).toBe(5);
      });

    expect(recovery.getPreview).toHaveBeenCalledWith("connection_1");
    await app.close();
  });

  it("authorizes a canary through the platform owner only", async () => {
    const { app, owner, recovery } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/inbound-webhooks/connections/connection_1/production-recovery",
      )
      .set("Authorization", "Bearer owner-token")
      .send({
        channelId: "channel_1",
        confirmation: "Umbler Comercial",
        selection: "canary_1",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ selected: 1, queued: 1 });
      });

    expect(recovery.authorizeRecovery).toHaveBeenCalledWith({
      connectionId: "connection_1",
      channelId: "channel_1",
      confirmation: "Umbler Comercial",
      selection: "canary_1",
      actor: owner,
      sourceIp: expect.any(String),
    });
    await app.close();
  });

  it("rejects invalid input before reaching the recovery service", async () => {
    const { app, recovery } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/inbound-webhooks/connections/connection_1/production-recovery",
      )
      .set("Authorization", "Bearer owner-token")
      .send({ channelId: "", confirmation: "", selection: "all" })
      .expect(400);

    expect(recovery.authorizeRecovery).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(["preview", "authorize"])(
    "denies %s to a non-owner",
    async (operation) => {
      const { app, recovery } = await createApp();
      const testRequest =
        operation === "preview"
          ? request(app.getHttpServer()).get(
              "/backoffice/inbound-webhooks/connections/connection_1/production-recovery-preview",
            )
          : request(app.getHttpServer())
              .post(
                "/backoffice/inbound-webhooks/connections/connection_1/production-recovery",
              )
              .send({
                channelId: "channel_1",
                confirmation: "Umbler Comercial",
                selection: "canary_1",
              });

      await testRequest
        .set("Authorization", "Bearer operator-token")
        .expect(403);

      expect(recovery.getPreview).not.toHaveBeenCalled();
      expect(recovery.authorizeRecovery).not.toHaveBeenCalled();
      await app.close();
    },
  );
});
