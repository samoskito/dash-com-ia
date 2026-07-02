import { describe, expect, it, vi } from "vitest";
import { MetaAdapter } from "../src/integrations/meta/meta.adapter";

describe("meta adapter oauth", () => {
  it("builds the Meta OAuth dialog URL without contacting Meta", () => {
    const adapter = new MetaAdapter({
      META_APP_ID: "app_123",
      META_APP_SECRET: "secret",
      META_OAUTH_REDIRECT_URL: "https://api.wpptrack.com/integrations/meta/callback",
      META_GRAPH_API_VERSION: "v25.0",
      META_OAUTH_SCOPES: "ads_read,business_management,read_insights"
    });

    const url = new URL(adapter.getOAuthAuthorizationUrl("state-token"));

    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v25.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("app_123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.wpptrack.com/integrations/meta/callback"
    );
    expect(url.searchParams.get("scope")).toBe("ads_read,business_management,read_insights");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
  });

  it("exchanges a callback code server-side and never exposes the access token", async () => {
    const fetchCalls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      fetchCalls.push(String(input));

      return new Response(
        JSON.stringify({
          access_token: "EAAB-secret-token",
          token_type: "bearer",
          expires_in: 5183944
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL: "https://api.wpptrack.com/integrations/meta/callback",
        META_GRAPH_API_VERSION: "v25.0",
        META_OAUTH_SCOPES: "ads_read,business_management"
      },
      fetchMock
    );

    const result = await adapter.exchangeCode({ code: "oauth-code" });
    const requestUrl = new URL(fetchCalls[0] ?? "");

    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://graph.facebook.com/v25.0/oauth/access_token"
    );
    expect(requestUrl.searchParams.get("client_id")).toBe("app_123");
    expect(requestUrl.searchParams.get("redirect_uri")).toBe(
      "https://api.wpptrack.com/integrations/meta/callback"
    );
    expect(requestUrl.searchParams.get("client_secret")).toBe("secret");
    expect(requestUrl.searchParams.get("code")).toBe("oauth-code");
    expect(result).toEqual({
      provider: "meta",
      status: "connected",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read", "business_management"],
      missingEnv: [],
      message: "Meta OAuth conectado"
    });
    expect(JSON.stringify(result)).not.toContain("EAAB-secret-token");
  });

  it("can return the access token to backend services for encrypted persistence", async () => {
    const fetchMock = (async () =>
      new Response(
        JSON.stringify({
          access_token: "EAAB-secret-token",
          token_type: "bearer",
          expires_in: 3600
        }),
        { status: 200 }
      )) as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL: "https://api.wpptrack.com/integrations/meta/callback"
      },
      fetchMock
    );

    const result = await adapter.exchangeCodeForToken({ code: "oauth-code" });

    expect(result.accessToken).toBe("EAAB-secret-token");
    expect(result.publicResult.status).toBe("connected");
    expect(JSON.stringify(result.publicResult)).not.toContain("EAAB-secret-token");
  });

  it("returns configure_env when callback exchange is missing required env", async () => {
    const adapter = new MetaAdapter({
      META_APP_ID: "app_123",
      META_APP_SECRET: "secret"
    });

    await expect(adapter.exchangeCode({ code: "oauth-code" })).resolves.toMatchObject({
      provider: "meta",
      status: "configure_env",
      missingEnv: ["META_OAUTH_REDIRECT_URL"]
    });
  });
});
