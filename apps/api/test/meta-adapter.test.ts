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

  it("lists Meta businesses, ad accounts and pixels from Graph API with backend token", async () => {
    const fetchCalls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      fetchCalls.push(url);

      if (url.includes("/me/businesses")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "business_1",
                name: "BM Principal",
                verification_status: "verified"
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.includes("/business_1/owned_ad_accounts")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "act_123",
                name: "Conta WhatsApp",
                account_status: 1,
                currency: "BRL",
                timezone_name: "America/Sao_Paulo"
              }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "pixel_1",
              name: "Pixel Loja",
              code: "1234567890"
            }
          ]
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_GRAPH_API_VERSION: "v25.0"
      },
      fetchMock
    );

    await expect(
      adapter.listBusinesses({ accessToken: "EAAB-secret-token" })
    ).resolves.toEqual([
      {
        id: "business_1",
        name: "BM Principal",
        verificationStatus: "verified"
      }
    ]);
    await expect(
      adapter.listOwnedAdAccounts({
        accessToken: "EAAB-secret-token",
        businessId: "business_1"
      })
    ).resolves.toEqual([
      {
        id: "act_123",
        name: "Conta WhatsApp",
        accountStatus: "1",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo"
      }
    ]);
    await expect(
      adapter.listAdAccountPixels({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123"
      })
    ).resolves.toEqual([
      {
        id: "pixel_1",
        name: "Pixel Loja",
        code: "1234567890"
      }
    ]);
    expect(fetchCalls[0]).toContain("access_token=EAAB-secret-token");
    expect(fetchCalls[1]).toContain("fields=id%2Cname%2Caccount_status%2Ccurrency%2Ctimezone_name");
    expect(fetchCalls[2]).toContain("fields=id%2Cname%2Ccode");
  });

  it("lists campaigns, ad sets, ads and campaign insights from the selected ad account", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("/campaigns")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "cmp_1",
                name: "Black Friday WhatsApp",
                status: "ACTIVE",
                effective_status: "ACTIVE",
                objective: "OUTCOME_SALES"
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.includes("/adsets")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "adset_1",
                name: "Publico quente",
                campaign_id: "cmp_1",
                status: "ACTIVE",
                effective_status: "ACTIVE"
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.includes("/ads")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "ad_1",
                name: "Criativo WhatsApp",
                campaign_id: "cmp_1",
                adset_id: "adset_1",
                status: "ACTIVE",
                effective_status: "ACTIVE"
              }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: "cmp_1",
              spend: "1200.55",
              impressions: "10000",
              clicks: "420",
              actions: [
                {
                  action_type: "onsite_conversion.messaging_conversation_started_7d",
                  value: "176"
                }
              ]
            }
          ]
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_GRAPH_API_VERSION: "v25.0"
      },
      fetchMock
    );

    await expect(
      adapter.listCampaigns({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123"
      })
    ).resolves.toEqual([
      {
        id: "cmp_1",
        name: "Black Friday WhatsApp",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        objective: "OUTCOME_SALES"
      }
    ]);
    await expect(
      adapter.listAdSets({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123"
      })
    ).resolves.toEqual([
      {
        id: "adset_1",
        name: "Publico quente",
        campaignId: "cmp_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE"
      }
    ]);
    await expect(
      adapter.listAds({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123"
      })
    ).resolves.toEqual([
      {
        id: "ad_1",
        name: "Criativo WhatsApp",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE"
      }
    ]);
    await expect(
      adapter.listCampaignInsights({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    ).resolves.toEqual([
      {
        campaignId: "cmp_1",
        spendCents: 120055,
        impressions: 10000,
        clicks: 420,
        metaConversationsStarted: 176
      }
    ]);
  });
});
