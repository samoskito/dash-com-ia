import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { InboundWebhookReplayController } from "../src/inbound-webhook-replay/inbound-webhook-replay.controller";
import { InboundWebhookReplayService } from "../src/inbound-webhook-replay/inbound-webhook-replay.service";

async function createApp() {
  const platformAdmin = {
    assertPlatformOwner: vi.fn(async (token: string) => {
      if (token !== "owner-token") {
        throw new ForbiddenException(
          "Acao restrita ao proprietario da plataforma",
        );
      }

      return {
        id: "owner_1",
        email: "owner@example.com",
        role: "platform_owner",
      };
    }),
  };
  const replay = {
    certifyParserRelease: vi.fn(async () => ({
      id: "parser_1",
      provider: "umbler",
      version: "v1",
      status: "certified",
      certifiedAt: "2026-07-18T15:00:00.000Z",
      createdAt: "2026-07-17T15:00:00.000Z",
      updatedAt: "2026-07-18T15:00:00.000Z",
    })),
    getPreview: vi.fn(async () => ({ replayEnabled: false })),
    authorizeReplay: vi.fn(async () => ({
      id: "batch_1",
      status: "queued",
    })),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [InboundWebhookReplayController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdmin },
      { provide: InboundWebhookReplayService, useValue: replay },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, platformAdmin, replay };
}

describe("inbound webhook replay controller", () => {
  it("lets only the platform owner certify and preview", async () => {
    const { app, replay } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/inbound-webhooks/parser-releases/parser_1/certify",
      )
      .set("Authorization", "Bearer owner-token")
      .expect(201);
    await request(app.getHttpServer())
      .get(
        "/backoffice/inbound-webhooks/connections/connection_1/replay-preview",
      )
      .set("Authorization", "Bearer owner-token")
      .expect(200)
      .expect({ replayEnabled: false });

    expect(replay.certifyParserRelease).toHaveBeenCalledWith(
      "parser_1",
      expect.objectContaining({ id: "owner_1" }),
      expect.any(String),
    );
    expect(replay.getPreview).toHaveBeenCalledWith("connection_1");
    await app.close();
  });

  it("requires a valid typed confirmation before calling the service", async () => {
    const { app, replay } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/inbound-webhooks/connections/connection_1/replay",
      )
      .set("Authorization", "Bearer owner-token")
      .send({ confirmation: "" })
      .expect(400);
    expect(replay.authorizeReplay).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post(
        "/backoffice/inbound-webhooks/connections/connection_1/replay",
      )
      .set("Authorization", "Bearer owner-token")
      .send({ confirmation: "observacao inicial" })
      .expect(201);
    expect(replay.authorizeReplay).toHaveBeenCalledWith(
      "connection_1",
      "observacao inicial",
      expect.objectContaining({ id: "owner_1" }),
      expect.any(String),
    );
    await app.close();
  });

  it.each(["operator-token", "workspace-owner-token"])(
    "denies replay controls to %s",
    async (token) => {
      const { app, replay } = await createApp();

      await request(app.getHttpServer())
        .post(
          "/backoffice/inbound-webhooks/connections/connection_1/replay",
        )
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: "observacao inicial" })
        .expect(403);
      expect(replay.authorizeReplay).not.toHaveBeenCalled();
      await app.close();
    },
  );
});
