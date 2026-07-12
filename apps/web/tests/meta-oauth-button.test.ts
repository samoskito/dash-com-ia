import { describe, expect, it, vi } from "vitest";
import {
  loadMetaOAuthStartAction,
  metaOAuthAllowedOrigins,
  metaOAuthCallbackOrigin,
  originFromUrl,
  refreshMetaAssetsAfterOAuth
} from "../src/app/(app)/integrations/meta-oauth-button";

describe("MetaOAuthButton helpers", () => {
  it("extracts the callback origin from the Facebook OAuth redirect_uri", () => {
    const oauthUrl = new URL("https://www.facebook.com/v25.0/dialog/oauth");
    oauthUrl.searchParams.set(
      "redirect_uri",
      "https://wpptrack-api.rastrack.app/integrations/meta/callback"
    );

    expect(metaOAuthCallbackOrigin(oauthUrl.toString())).toBe(
      "https://wpptrack-api.rastrack.app"
    );
  });

  it("allows the app origin, configured API origin and callback origin", () => {
    const origins = metaOAuthAllowedOrigins({
      apiUrl: "http://localhost:3333",
      currentOrigin: "http://localhost:3000",
      callbackOrigin: "https://wpptrack-api.rastrack.app"
    });

    expect(origins.has("http://localhost:3000")).toBe(true);
    expect(origins.has("http://localhost:3333")).toBe(true);
    expect(origins.has("https://wpptrack-api.rastrack.app")).toBe(true);
  });

  it("ignores invalid URLs while building allowed origins", () => {
    expect(originFromUrl("not a url")).toBeNull();

    const origins = metaOAuthAllowedOrigins({
      apiUrl: "not a url",
      currentOrigin: "http://localhost:3000",
      callbackOrigin: null
    });

    expect([...origins]).toEqual(["http://localhost:3000"]);
  });

  it("loads the OAuth URL through the server action provided by the page", async () => {
    const startOAuthAction = vi.fn(async () => ({
      provider: "meta" as const,
      action: "oauth_redirect" as const,
      label: "Conectar Meta via OAuth",
      href: "https://www.facebook.com/v25.0/dialog/oauth?state=barbieri",
      missingEnv: []
    }));

    await expect(loadMetaOAuthStartAction(startOAuthAction)).resolves.toMatchObject({
      href: expect.stringContaining("state=barbieri")
    });
    expect(startOAuthAction).toHaveBeenCalledOnce();
  });

  it("confirms the OAuth connection and refreshes Meta assets", async () => {
    const completeOAuthAction = vi.fn(async () => ({
      workspaceId: "workspace_barbieri",
      status: "connected" as const,
      businesses: [{ id: "business_1", name: "BM Principal" }]
    })) as never;

    await expect(
      refreshMetaAssetsAfterOAuth(completeOAuthAction)
    ).resolves.toMatchObject({
      businesses: [{ id: "business_1" }]
    });
    expect(completeOAuthAction).toHaveBeenCalledOnce();
  });

  it("does not report success before the OAuth connection is persisted", async () => {
    const completeOAuthAction = vi.fn(async () => {
      throw new Error("MetaOAuthWorkspaceConnectionMismatch");
    });

    await expect(
      refreshMetaAssetsAfterOAuth(completeOAuthAction)
    ).rejects.toThrow("MetaOAuthWorkspaceConnectionMismatch");
    expect(completeOAuthAction).toHaveBeenCalledOnce();
  });

  it("does not report success when the asset refresh remains disconnected", async () => {
    const completeOAuthAction = vi.fn(async () => ({
      workspaceId: "workspace_barbieri",
      status: "not_connected" as const,
      syncError: null
    })) as never;

    await expect(
      refreshMetaAssetsAfterOAuth(completeOAuthAction)
    ).rejects.toThrow("MetaAssetsRefreshFailed");
    expect(completeOAuthAction).toHaveBeenCalledOnce();
  });
});
