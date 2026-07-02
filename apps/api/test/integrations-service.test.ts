import { describe, expect, it, vi } from "vitest";
import { AsaasAdapter } from "../src/integrations/asaas/asaas.adapter";
import { IntegrationsService } from "../src/integrations/integrations.service";
import { MetaAdapter } from "../src/integrations/meta/meta.adapter";
import { UazapiAdapter } from "../src/integrations/uazapi/uazapi.adapter";

describe("integrations service", () => {
  it("returns a Meta OAuth redirect action with the real authorization URL", () => {
    const service = new IntegrationsService(
      new MetaAdapter({
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL: "https://api.wpptrack.com/integrations/meta/callback",
        META_GRAPH_API_VERSION: "v25.0"
      }),
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL: "https://api.wpptrack.com/integrations/meta/callback",
        META_GRAPH_API_VERSION: "v25.0"
      }
    );

    const action = service.getMetaStartAction();

    expect(action.action).toBe("oauth_redirect");
    expect(action.href).toContain("https://www.facebook.com/v25.0/dialog/oauth");
    expect(action.href).toContain("client_id=app_123");
    expect(action.missingEnv).toEqual([]);
  });

  it("requires redirect URL before starting Meta OAuth", () => {
    const service = new IntegrationsService(
      new MetaAdapter({
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret"
      }),
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret"
      }
    );

    expect(service.getMetaStartAction()).toMatchObject({
      provider: "meta",
      action: "configure_env",
      missingEnv: ["META_OAUTH_REDIRECT_URL"]
    });
  });

  it("delegates Meta callback exchange to the adapter", async () => {
    const metaAdapter = new MetaAdapter({});
    const exchangeSpy = vi.spyOn(metaAdapter, "exchangeCodeForToken").mockResolvedValue({
      accessToken: "EAAB-secret-token",
      publicResult: {
        provider: "meta",
        status: "connected",
        tokenType: "bearer",
        expiresInSeconds: 5183944,
        scopes: ["ads_read"],
        missingEnv: [],
        message: "Meta OAuth conectado"
      }
    });
    const metaConnectionsService = {
      saveOAuthConnection: vi.fn(async () => ({
        workspaceId: "workspace_1",
        status: "connected",
        tokenType: "bearer",
        scopes: ["ads_read"],
        expiresAt: "2026-09-01T03:00:00.000Z",
        connectedAt: "2026-07-02T03:00:00.000Z",
        selectedBusinessId: null,
        selectedAdAccountId: null,
        selectedPixelId: null
      }))
    };
    const env = {
      META_TOKEN_ENCRYPTION_KEY: "state-secret"
    };
    const stateService = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL: "https://api.wpptrack.com/integrations/meta/callback",
        META_TOKEN_ENCRYPTION_KEY: "state-secret"
      },
      metaConnectionsService as never
    );
    const start = stateService.getMetaStartAction("workspace_1");
    const state = new URL(start.href ?? "").searchParams.get("state");
    const service = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      env,
      metaConnectionsService as never
    );

    await expect(
      service.handleMetaCallback({ code: "meta-code", state: state ?? "" })
    ).resolves.toMatchObject({
      provider: "meta",
      status: "connected",
      connection: {
        workspaceId: "workspace_1",
        status: "connected"
      }
    });
    expect(exchangeSpy).toHaveBeenCalledWith({ code: "meta-code" });
    expect(metaConnectionsService.saveOAuthConnection).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read"]
    });
  });

  it("returns sanitized Meta connection status for a workspace", async () => {
    const metaConnectionsService = {
      getConnection: vi.fn(async () => ({
        workspaceId: "workspace_1",
        status: "connected",
        tokenType: "bearer",
        scopes: ["ads_read"],
        expiresAt: null,
        connectedAt: "2026-07-02T03:00:00.000Z",
        selectedBusinessId: null,
        selectedAdAccountId: null,
        selectedPixelId: null
      }))
    };
    const service = new IntegrationsService(
      new MetaAdapter({}),
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {},
      metaConnectionsService as never
    );

    await expect(service.getMetaConnection("workspace_1")).resolves.toMatchObject({
      workspaceId: "workspace_1",
      status: "connected"
    });
    expect(metaConnectionsService.getConnection).toHaveBeenCalledWith("workspace_1");
  });

  it("returns selectable Meta assets for a workspace", async () => {
    const metaAdapter = new MetaAdapter({});
    const metaConnectionsService = {
      listAssets: vi.fn(async () => ({
        workspaceId: "workspace_1",
        status: "connected",
        businesses: [{ id: "business_1", name: "BM Principal", verificationStatus: null }],
        adAccounts: [
          {
            id: "act_123",
            name: "Conta WhatsApp",
            accountStatus: "1",
            currency: "BRL",
            timezoneName: "America/Sao_Paulo"
          }
        ],
        pixels: [{ id: "pixel_1", name: "Pixel Loja", code: "1234567890" }],
        selection: {
          businessId: "business_1",
          adAccountId: "act_123",
          pixelId: "pixel_1"
        },
        lastSyncedAt: "2026-07-02T12:00:00.000Z",
        syncError: null
      }))
    };
    const service = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {},
      metaConnectionsService as never
    );

    await expect(service.getMetaAssets("workspace_1")).resolves.toMatchObject({
      workspaceId: "workspace_1",
      businesses: [{ name: "BM Principal" }],
      pixels: [{ name: "Pixel Loja" }]
    });
    expect(metaConnectionsService.listAssets).toHaveBeenCalledWith(
      "workspace_1",
      metaAdapter
    );
  });

  it("saves selected Meta assets for a workspace", async () => {
    const metaConnectionsService = {
      saveAssetSelection: vi.fn(async () => ({
        workspaceId: "workspace_1",
        status: "connected",
        tokenType: "bearer",
        scopes: ["ads_read"],
        expiresAt: null,
        connectedAt: "2026-07-02T03:00:00.000Z",
        selectedBusinessId: "business_1",
        selectedAdAccountId: "act_123",
        selectedPixelId: "pixel_1"
      }))
    };
    const service = new IntegrationsService(
      new MetaAdapter({}),
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {},
      metaConnectionsService as never
    );

    await expect(
      service.saveMetaAssetSelection("workspace_1", {
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1"
      })
    ).resolves.toMatchObject({
      selectedBusinessId: "business_1",
      selectedAdAccountId: "act_123",
      selectedPixelId: "pixel_1"
    });
  });
});
