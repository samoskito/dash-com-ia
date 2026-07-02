import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { IntegrationsController } from "../src/integrations/integrations.controller";
import { IntegrationsService } from "../src/integrations/integrations.service";

const health = {
  checkedAt: "2026-07-02T03:00:00.000Z",
  providers: [
    {
      provider: "meta",
      status: "disconnected",
      checkedAt: "2026-07-02T03:00:00.000Z",
      message: "Missing META_APP_ID or META_APP_SECRET"
    },
    {
      provider: "uazapi",
      status: "disconnected",
      checkedAt: "2026-07-02T03:00:00.000Z",
      message: "Missing UAZAPI_BASE_URL or UAZAPI_TOKEN"
    },
    {
      provider: "asaas",
      status: "disconnected",
      checkedAt: "2026-07-02T03:00:00.000Z",
      message: "Missing ASAAS_BASE_URL or ASAAS_API_KEY"
    }
  ]
};

async function createApp() {
  const service = {
    getHealthSummary: vi.fn(async () => health),
    getMetaStartAction: vi.fn(() => ({
      provider: "meta",
      action: "configure_env",
      label: "Configurar app Meta",
      missingEnv: ["META_APP_ID", "META_APP_SECRET"]
    })),
    getUazapiStartAction: vi.fn(() => ({
      provider: "uazapi",
      action: "configure_env",
      label: "Configurar Uazapi",
      missingEnv: ["UAZAPI_BASE_URL", "UAZAPI_TOKEN"]
    })),
    getAsaasStatusAction: vi.fn(() => ({
      provider: "asaas",
      action: "configure_env",
      label: "Configurar Asaas",
      missingEnv: ["ASAAS_API_KEY"]
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [IntegrationsController],
    providers: [{ provide: IntegrationsService, useValue: service }]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, service };
}

describe("integrations controller", () => {
  it("returns provider health summary", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body.providers.map((item: { provider: string }) => item.provider)).toEqual([
          "meta",
          "uazapi",
          "asaas"
        ]);
      });

    expect(service.getHealthSummary).toHaveBeenCalledOnce();

    await app.close();
  });

  it("returns Meta start action without calling Meta", async () => {
    const { app } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/start")
      .expect(200)
      .expect(({ body }) => {
        expect(body.action).toBe("configure_env");
        expect(body.missingEnv).toContain("META_APP_ID");
      });

    await app.close();
  });

  it("returns Uazapi and Asaas setup actions", async () => {
    const { app } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/uazapi/start")
      .expect(200)
      .expect(({ body }) => {
        expect(body.provider).toBe("uazapi");
      });

    await request(app.getHttpServer())
      .get("/integrations/asaas/status")
      .expect(200)
      .expect(({ body }) => {
        expect(body.provider).toBe("asaas");
      });

    await app.close();
  });
});
