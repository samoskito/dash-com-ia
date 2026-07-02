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
    const exchangeSpy = vi.spyOn(metaAdapter, "exchangeCode").mockResolvedValue({
      provider: "meta",
      status: "connected",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read"],
      missingEnv: [],
      message: "Meta OAuth conectado"
    });
    const service = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {}
    );

    await expect(
      service.handleMetaCallback({ code: "meta-code", state: "state-token" })
    ).resolves.toMatchObject({
      provider: "meta",
      status: "connected"
    });
    expect(exchangeSpy).toHaveBeenCalledWith({ code: "meta-code" });
  });
});
