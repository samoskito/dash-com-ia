import { describe, expect, it, vi } from "vitest";
import {
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

  it("confirms the OAuth connection and refreshes Meta assets", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ status: "connected" })
      .mockResolvedValueOnce({
        status: "connected",
        businesses: [{ id: "business_1", name: "BM Principal" }]
      });

    await expect(refreshMetaAssetsAfterOAuth(fetcher)).resolves.toMatchObject({
      businesses: [{ id: "business_1" }]
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/integrations/meta/connection"
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/integrations/meta/assets/refresh",
      {
        method: "POST",
        body: JSON.stringify({ businessId: null })
      }
    );
  });

  it("does not report success before the OAuth connection is persisted", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ status: "not_connected" });

    await expect(refreshMetaAssetsAfterOAuth(fetcher)).rejects.toThrow(
      "MetaOAuthConnectionNotPersisted"
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
