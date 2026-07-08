import { describe, expect, it } from "vitest";
import {
  metaOAuthAllowedOrigins,
  metaOAuthCallbackOrigin,
  originFromUrl
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
});
