import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { GuimoController } from "../src/guimo/guimo.controller";
import { GuimoService } from "../src/guimo/guimo.service";
import { AuthService } from "../src/auth/auth.service";

/**
 * Guimo's webhook integration only lets a user configure a target URL, not a
 * custom header. The public ingress must therefore be fully self-authenticating
 * from the URL alone: no `x-wpptrack-webhook-token` header, no CRM
 * Authorization/X-API-Key, no other out-of-band secret.
 */
async function createApp() {
  const guimo = {
    receive: vi.fn(async (_id: string, token: unknown) => {
      if (token !== "correct-token") throw new NotFoundException("Webhook nao encontrado");
      return { status: "accepted" as const };
    }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [GuimoController],
    providers: [
      { provide: AuthService, useValue: {} },
      { provide: GuimoService, useValue: guimo },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, guimo };
}

describe("Guimo public webhook: URL-only contract", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("accepts a request authenticated only by the token query string, without any header", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/webhooks/guimo/v1/g1?token=correct-token")
      .send({ id_negociacao: 1, id_contato: 2, estagio_novo: { id: 3, nome: "Q" } })
      .expect(202, { status: "accepted" });

    expect(guimo.receive).toHaveBeenCalledWith("g1", "correct-token", { id_negociacao: 1, id_contato: 2, estagio_novo: { id: 3, nome: "Q" } });
  });

  it("does not require and does not read the legacy x-wpptrack-webhook-token header", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/webhooks/guimo/v1/g1?token=correct-token")
      .set("x-wpptrack-webhook-token", "some-other-value")
      .send({})
      .expect(202, { status: "accepted" });

    // The header is never wired to the controller/service call; only the query token is used.
    expect(guimo.receive).toHaveBeenCalledWith("g1", "correct-token", {});
  });

  it("rejects a missing token the same way as an unknown integration (404, fail closed)", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/webhooks/guimo/v1/g1")
      .send({})
      .expect(404);
    expect(guimo.receive).toHaveBeenCalledWith("g1", undefined, {});
  });

  it("rejects an invalid token capability (404, fail closed)", async () => {
    const { app, guimo } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/webhooks/guimo/v1/g1?token=wrong-token")
      .send({})
      .expect(404);
    expect(guimo.receive).toHaveBeenCalledWith("g1", "wrong-token", {});
  });
});
