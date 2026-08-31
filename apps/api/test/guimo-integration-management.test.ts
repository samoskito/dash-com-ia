import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { GuimoController } from "../src/guimo/guimo.controller";
import { GuimoService } from "../src/guimo/guimo.service";
import { WorkspaceOwnerGuard } from "../src/workspaces/guards/workspace-owner.guard";

const integration = {
  id: "guimo_1",
  status: "active",
  webhookVersion: "v1",
  qualifiedStageId: "qualified",
  qualifiedStageName: "Qualificado",
  purchaseStageId: "purchase",
  purchaseStageName: "Comprou",
  purchaseCurrency: "BRL",
  purchaseValueUnit: "major",
  hasCrmHeaders: true,
  createdAt: "2026-08-31T10:00:00.000Z",
  updatedAt: "2026-08-31T10:00:00.000Z",
};

async function createApp() {
  const auth = {
    getSession: vi.fn(async () => ({
      user: { id: "user_1", email: "owner@example.com" },
      workspaces: [{ id: "workspace_1", role: "owner" }],
    })),
  };
  const guimo = {
    list: vi.fn(async () => [integration]),
    provision: vi.fn(async () => ({
      id: integration.id,
      status: "active",
      webhookVersion: "v1",
      webhookToken: "a".repeat(43),
      webhookUrl: "https://api.example.com/webhooks/guimo/v1/guimo_1",
      webhookPath: "/webhooks/guimo/v1/guimo_1",
    })),
    rotateWebhookToken: vi.fn(async () => ({
      id: integration.id,
      status: "active",
      webhookVersion: "v1",
      webhookToken: "b".repeat(43),
      webhookUrl: "https://api.example.com/webhooks/guimo/v1/guimo_1",
      webhookPath: "/webhooks/guimo/v1/guimo_1",
    })),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [GuimoController],
    providers: [
      WorkspaceOwnerGuard,
      { provide: AuthService, useValue: auth },
      { provide: GuimoService, useValue: guimo },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, guimo, auth };
}

describe("Guimo integration management endpoints", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("lists only the owner-authorized workspace and never serializes secrets", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .get("/workspaces/workspace_1/guimo/integrations")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([integration]);
        const serialized = JSON.stringify(body);
        // Safe boolean flag is allowed; actual secrets/ciphertext must never appear.
        expect(serialized).toContain('"hasCrmHeaders":true');
        expect(serialized).not.toMatch(
          /secret|webhookToken|encrypted|crmHeadersEncrypted|crmHeadersIv|crmHeadersTag|Bearer /i,
        );
      });
    expect(guimo.list).toHaveBeenCalledWith("workspace_1");

    await request(app.getHttpServer())
      .get("/workspaces/workspace_2/guimo/integrations")
      .set("Authorization", "Bearer refresh-token")
      .expect(403);
    expect(guimo.list).toHaveBeenCalledTimes(1);
  });

  it("returns webhook tokens only from provision and rotate responses", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    const create = await request(app.getHttpServer())
      .post("/workspaces/workspace_1/guimo/integrations")
      .set("Authorization", "Bearer refresh-token")
      .send({ qualifiedStageId: "qualified" })
      .expect(201);
    expect(create.body.webhookToken).toBe("a".repeat(43));

    const rotated = await request(app.getHttpServer())
      .post(
        "/workspaces/workspace_1/guimo/integrations/guimo_1/rotate-webhook-token",
      )
      .set("Authorization", "Bearer refresh-token")
      .expect(200);
    expect(rotated.body.webhookToken).toBe("b".repeat(43));
    expect(rotated.body.webhookToken).not.toBe(create.body.webhookToken);
    expect(guimo.rotateWebhookToken).toHaveBeenCalledWith(
      "workspace_1",
      "guimo_1",
      "user_1",
    );
  });
});
