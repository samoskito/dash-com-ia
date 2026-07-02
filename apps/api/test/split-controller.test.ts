import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { SplitController } from "../src/billing/split.controller";
import { SplitService } from "../src/billing/split.service";

async function createApp() {
  const splitService = {
    listReceivers: vi.fn(async () => []),
    createReceiver: vi.fn(async () => ({
      id: "receiver_1",
      name: "Socio Operacional",
      walletId: "wallet_asaas_1",
      email: "socio@wpptrack.com",
      percentageBps: 2500,
      active: true,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z"
    })),
    updateReceiver: vi.fn(async () => ({
      id: "receiver_1",
      name: "Socio Operacional",
      walletId: "wallet_asaas_1",
      email: "socio@wpptrack.com",
      percentageBps: 1500,
      active: false,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z"
    }))
  };
  const platformAdminService = {
    assertPlatformAdmin: vi.fn(async () => ({
      id: "user_1",
      email: "owner@wpptrack.com"
    }))
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [SplitController],
    providers: [
      { provide: SplitService, useValue: splitService },
      { provide: PlatformAdminService, useValue: platformAdminService }
    ]
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, platformAdminService, splitService };
}

describe("split controller", () => {
  it("creates split receivers in platform backoffice", async () => {
    const { app, platformAdminService, splitService } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/split/receivers")
      .set("Authorization", "Bearer refresh-token")
      .send({
        name: "Socio Operacional",
        walletId: "wallet_asaas_1",
        email: "socio@wpptrack.com",
        percentageBps: 2500,
        active: true
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe("receiver_1");
        expect(body.percentageBps).toBe(2500);
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(splitService.createReceiver).toHaveBeenCalledWith({
      name: "Socio Operacional",
      walletId: "wallet_asaas_1",
      email: "socio@wpptrack.com",
      percentageBps: 2500,
      active: true
    });

    await app.close();
  });

  it("updates split receivers in platform backoffice", async () => {
    const { app, platformAdminService, splitService } = await createApp();

    await request(app.getHttpServer())
      .patch("/backoffice/split/receivers/receiver_1")
      .set("Authorization", "Bearer refresh-token")
      .send({
        percentageBps: 1500,
        active: false
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.active).toBe(false);
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(splitService.updateReceiver).toHaveBeenCalledWith("receiver_1", {
      percentageBps: 1500,
      active: false
    });

    await app.close();
  });
});
