import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { IntegrationsController } from "../src/integrations/integrations.controller";
import { IntegrationsService } from "../src/integrations/integrations.service";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

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
    handleMetaCallback: vi.fn(async () => ({
      provider: "meta",
      status: "connected",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read"],
      message: "Meta OAuth conectado"
    })),
    getMetaConnection: vi.fn(async () => ({
      workspaceId: "workspace_1",
      status: "connected",
      tokenType: "bearer",
      scopes: ["ads_read"],
      expiresAt: null,
      connectedAt: "2026-07-02T03:00:00.000Z",
      selectedBusinessId: null,
      selectedAdAccountId: null,
      selectedPixelId: null
    })),
    getMetaAssets: vi.fn(async () => ({
      workspaceId: "workspace_1",
      status: "connected",
      businesses: [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified"
        }
      ],
      adAccounts: [
        {
          id: "act_123",
          name: "Conta WhatsApp",
          accountStatus: "1",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo"
        }
      ],
      pixels: [
        {
          id: "pixel_1",
          name: "Pixel Loja",
          code: "1234567890"
        }
      ],
      selection: {
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1"
      },
      lastSyncedAt: "2026-07-02T12:00:00.000Z",
      syncError: null
    })),
    saveMetaAssetSelection: vi.fn(async () => ({
      workspaceId: "workspace_1",
      status: "connected",
      tokenType: "bearer",
      scopes: ["ads_read"],
      expiresAt: null,
      connectedAt: "2026-07-02T03:00:00.000Z",
      selectedBusinessId: "business_1",
      selectedAdAccountId: "act_123",
      selectedPixelId: "pixel_1"
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
  const authService = {
    getSession: vi.fn(async () => ({
      user: {
        id: "user_1",
        email: "owner@wpptrack.com",
        name: "Owner",
        authProvider: "email",
        emailVerifiedAt: null
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Workspace",
          slug: "workspace",
          role: "owner"
        }
      ]
    }))
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn(() => ({
      id: "workspace_1",
      name: "Workspace",
      slug: "workspace",
      role: "owner"
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [IntegrationsController],
    providers: [
      { provide: IntegrationsService, useValue: service },
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, service, authService, workspacesService };
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
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.action).toBe("configure_env");
        expect(body.missingEnv).toContain("META_APP_ID");
      });

    await app.close();
  });

  it("handles Meta OAuth callback through the backend service", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/callback?code=meta-code&state=state-token")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.provider).toBe("meta");
        expect(body.status).toBe("connected");
        expect(JSON.stringify(body)).not.toContain("access_token");
      });

    expect(service.handleMetaCallback).toHaveBeenCalledWith({
      code: "meta-code",
      state: "state-token"
    });

    await app.close();
  });

  it("returns sanitized Meta connection status for the current workspace", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/connection")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.status).toBe("connected");
        expect(JSON.stringify(body)).not.toContain("EAAB");
      });

    expect(service.getMetaConnection).toHaveBeenCalledWith("workspace_1");

    await app.close();
  });

  it("returns selectable Meta assets for the current workspace", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/assets")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.businesses[0].name).toBe("BM Principal");
        expect(body.adAccounts[0].name).toBe("Conta WhatsApp");
        expect(body.pixels[0].name).toBe("Pixel Loja");
        expect(JSON.stringify(body)).not.toContain("EAAB");
      });

    expect(service.getMetaAssets).toHaveBeenCalledWith("workspace_1");

    await app.close();
  });

  it("saves selected Meta assets for the current workspace", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .put("/integrations/meta/assets/selection")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1"
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.selectedBusinessId).toBe("business_1");
        expect(body.selectedAdAccountId).toBe("act_123");
        expect(body.selectedPixelId).toBe("pixel_1");
      });

    expect(service.saveMetaAssetSelection).toHaveBeenCalledWith("workspace_1", {
      businessId: "business_1",
      adAccountId: "act_123",
      pixelId: "pixel_1"
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
