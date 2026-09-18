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
  rules: [],
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
      webhookUrl: `https://api.example.com/webhooks/guimo/v1/guimo_1?token=${"a".repeat(43)}`,
      webhookPath: `/webhooks/guimo/v1/guimo_1?token=${"a".repeat(43)}`,
    })),
    rotateWebhookToken: vi.fn(async () => ({
      id: integration.id,
      status: "active",
      webhookVersion: "v1",
      webhookUrl: `https://api.example.com/webhooks/guimo/v1/guimo_1?token=${"b".repeat(43)}`,
      webhookPath: `/webhooks/guimo/v1/guimo_1?token=${"b".repeat(43)}`,
    })),
    update: vi.fn(async () => ({
      ...integration,
      purchaseStageName: "Venda Fechada",
    })),
    setActive: vi.fn(async (_workspaceId: string, _integrationId: string, _actorUserId: string, active: boolean) => ({
      ...integration,
      status: active ? "active" : "paused",
    })),
    createRule: vi.fn(async (_workspaceId: string, _integrationId: string, _actorUserId: string, rule: any) => ({ id: "rule_1", ...rule, fixedValueCents: rule.valueMode === "fixed" ? rule.fixedValueCents : null, active: rule.active ?? true, createdAt: integration.createdAt, updatedAt: integration.updatedAt })),
    updateRule: vi.fn(async (_workspaceId: string, _integrationId: string, ruleId: string, _actorUserId: string, rule: any) => ({ id: ruleId, stageName: "Venda", eventName: "Purchase", valueMode: "dynamic", fixedValueCents: null, active: true, ...rule, createdAt: integration.createdAt, updatedAt: integration.updatedAt })),
    deleteRule: vi.fn(async () => ({ status: "deleted" as const })),
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

  it("returns only a complete webhook URL/path from provision and rotate, never a separate token field", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    const create = await request(app.getHttpServer())
      .post("/workspaces/workspace_1/guimo/integrations")
      .set("Authorization", "Bearer refresh-token")
      .send({ qualifiedStageId: "qualified" })
      .expect(201);
    expect(create.body).not.toHaveProperty("webhookToken");
    expect(create.body.webhookPath).toContain(`token=${"a".repeat(43)}`);

    const rotated = await request(app.getHttpServer())
      .post(
        "/workspaces/workspace_1/guimo/integrations/guimo_1/rotate-webhook-token",
      )
      .set("Authorization", "Bearer refresh-token")
      .expect(200);
    expect(rotated.body).not.toHaveProperty("webhookToken");
    expect(rotated.body.webhookPath).toContain(`token=${"b".repeat(43)}`);
    expect(rotated.body.webhookPath).not.toBe(create.body.webhookPath);
    expect(guimo.rotateWebhookToken).toHaveBeenCalledWith(
      "workspace_1",
      "guimo_1",
      "user_1",
    );
  });

  it("edits a rule's stage name by name (not id) and rejects an empty payload", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    const updated = await request(app.getHttpServer())
      .patch("/workspaces/workspace_1/guimo/integrations/guimo_1")
      .set("Authorization", "Bearer refresh-token")
      .send({ purchaseStageName: "Venda Fechada" })
      .expect(200);
    expect(updated.body.purchaseStageName).toBe("Venda Fechada");
    expect(guimo.update).toHaveBeenCalledWith(
      "workspace_1",
      "guimo_1",
      "user_1",
      expect.objectContaining({ purchaseStageName: "Venda Fechada" }),
    );

    await request(app.getHttpServer())
      .patch("/workspaces/workspace_1/guimo/integrations/guimo_1")
      .set("Authorization", "Bearer refresh-token")
      .send({})
      .expect(400);
    expect(guimo.update).toHaveBeenCalledTimes(1);
  });

  it("isolates rule updates to the caller's own workspace", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .patch("/workspaces/workspace_2/guimo/integrations/guimo_1")
      .set("Authorization", "Bearer refresh-token")
      .send({ purchaseStageName: "Venda Fechada" })
      .expect(403);
    expect(guimo.update).not.toHaveBeenCalled();
  });

  it("pauses and resumes a rule through the active endpoint", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    const paused = await request(app.getHttpServer())
      .post("/workspaces/workspace_1/guimo/integrations/guimo_1/active")
      .set("Authorization", "Bearer refresh-token")
      .send({ active: false })
      .expect(200);
    expect(paused.body.status).toBe("paused");
    expect(guimo.setActive).toHaveBeenCalledWith(
      "workspace_1",
      "guimo_1",
      "user_1",
      false,
    );

    const resumed = await request(app.getHttpServer())
      .post("/workspaces/workspace_1/guimo/integrations/guimo_1/active")
      .set("Authorization", "Bearer refresh-token")
      .send({ active: true })
      .expect(200);
    expect(resumed.body.status).toBe("active");

    await request(app.getHttpServer())
      .post("/workspaces/workspace_2/guimo/integrations/guimo_1/active")
      .set("Authorization", "Bearer refresh-token")
      .send({ active: true })
      .expect(403);
    expect(guimo.setActive).toHaveBeenCalledTimes(2);
  });

  it("creates, updates, and deletes rules without exposing integration secrets", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);
    const created = await request(app.getHttpServer()).post("/workspaces/workspace_1/guimo/integrations/guimo_1/rules").set("Authorization", "Bearer refresh-token").send({ stageName: "  Venda fechada  ", eventName: "Purchase", valueMode: "fixed", fixedValueCents: 1250 }).expect(201);
    expect(created.body).toMatchObject({ id: "rule_1", stageName: "Venda fechada", eventName: "Purchase", fixedValueCents: 1250 });
    expect(JSON.stringify(created.body)).not.toMatch(/secret|encrypted|authorization/i);
    expect(guimo.createRule).toHaveBeenCalledWith("workspace_1", "guimo_1", "user_1", expect.objectContaining({ stageName: "Venda fechada" }));
    await request(app.getHttpServer()).patch("/workspaces/workspace_1/guimo/integrations/guimo_1/rules/rule_1").set("Authorization", "Bearer refresh-token").send({ active: false }).expect(200);
    await request(app.getHttpServer()).delete("/workspaces/workspace_1/guimo/integrations/guimo_1/rules/rule_1").set("Authorization", "Bearer refresh-token").expect(200, { status: "deleted" });
  });

  it("rejects invalid rule values and isolates rule routes by workspace", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);
    await request(app.getHttpServer()).post("/workspaces/workspace_1/guimo/integrations/guimo_1/rules").set("Authorization", "Bearer refresh-token").send({ stageName: "Venda", eventName: "Purchase", valueMode: "fixed" }).expect(400);
    await request(app.getHttpServer()).post("/workspaces/workspace_1/guimo/integrations/guimo_1/rules").set("Authorization", "Bearer refresh-token").send({ stageName: "Venda", eventName: "NotAnEvent", valueMode: "dynamic" }).expect(400);
    await request(app.getHttpServer()).post("/workspaces/workspace_2/guimo/integrations/guimo_1/rules").set("Authorization", "Bearer refresh-token").send({ stageName: "Venda", eventName: "Purchase", valueMode: "dynamic" }).expect(403);
    expect(guimo.createRule).not.toHaveBeenCalled();
  });
});
