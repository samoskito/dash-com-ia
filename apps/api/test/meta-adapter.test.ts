import { describe, expect, it, vi } from "vitest";
import { MetaAdapter } from "../src/integrations/meta/meta.adapter";

describe("meta adapter oauth", () => {
  it("builds the Meta OAuth dialog URL without contacting Meta", () => {
    const adapter = new MetaAdapter({
      META_APP_ID: "app_123",
      META_APP_SECRET: "secret",
      META_OAUTH_REDIRECT_URL:
        "https://api.wpptrack.com/integrations/meta/callback",
      META_GRAPH_API_VERSION: "v25.0",
      META_OAUTH_SCOPES:
        "ads_read,ads_management,business_management,pages_show_list,pages_read_engagement",
    });

    const url = new URL(adapter.getOAuthAuthorizationUrl("state-token"));

    expect(url.origin + url.pathname).toBe(
      "https://www.facebook.com/v25.0/dialog/oauth",
    );
    expect(url.searchParams.get("client_id")).toBe("app_123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.wpptrack.com/integrations/meta/callback",
    );
    expect(url.searchParams.get("scope")).toBe(
      "ads_read,ads_management,business_management,pages_show_list,pages_read_engagement",
    );
    expect(url.searchParams.get("scope")).not.toContain("read_insights");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
  });

  it("exchanges a callback code server-side, extends the Meta token and never exposes it", async () => {
    const fetchCalls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      fetchCalls.push(String(input));

      if (String(input).includes("grant_type=fb_exchange_token")) {
        return new Response(
          JSON.stringify({
            access_token: "EAAB-long-lived-token",
            token_type: "bearer",
            expires_in: 5183944,
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          access_token: "EAAB-secret-token",
          token_type: "bearer",
          expires_in: 3600,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL:
          "https://api.wpptrack.com/integrations/meta/callback",
        META_GRAPH_API_VERSION: "v25.0",
        META_OAUTH_SCOPES: "ads_read,business_management",
      },
      fetchMock,
    );

    const result = await adapter.exchangeCode({ code: "oauth-code" });
    const requestUrl = new URL(fetchCalls[0] ?? "");

    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://graph.facebook.com/v25.0/oauth/access_token",
    );
    expect(requestUrl.searchParams.get("client_id")).toBe("app_123");
    expect(requestUrl.searchParams.get("redirect_uri")).toBe(
      "https://api.wpptrack.com/integrations/meta/callback",
    );
    expect(requestUrl.searchParams.get("client_secret")).toBe("secret");
    expect(requestUrl.searchParams.get("code")).toBe("oauth-code");
    const longLivedRequestUrl = new URL(fetchCalls[1] ?? "");
    expect(longLivedRequestUrl.searchParams.get("grant_type")).toBe(
      "fb_exchange_token",
    );
    expect(longLivedRequestUrl.searchParams.get("fb_exchange_token")).toBe(
      "EAAB-secret-token",
    );
    expect(result).toEqual({
      provider: "meta",
      status: "connected",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read", "business_management"],
      missingEnv: [],
      message: "Meta OAuth conectado",
    });
    expect(JSON.stringify(result)).not.toContain("EAAB-secret-token");
    expect(JSON.stringify(result)).not.toContain("EAAB-long-lived-token");
  });

  it("can return the access token to backend services for encrypted persistence", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("grant_type=fb_exchange_token")
        ? new Response(
            JSON.stringify({
              access_token: "EAAB-long-lived-token",
              token_type: "bearer",
              expires_in: 5183944,
            }),
            { status: 200 },
          )
        : new Response(
            JSON.stringify({
              access_token: "EAAB-secret-token",
              token_type: "bearer",
              expires_in: 3600,
            }),
            { status: 200 },
          ),
    ) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL:
          "https://api.wpptrack.com/integrations/meta/callback",
      },
      fetchMock,
    );

    const result = await adapter.exchangeCodeForToken({ code: "oauth-code" });

    expect(result.accessToken).toBe("EAAB-long-lived-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.publicResult.status).toBe("connected");
    expect(JSON.stringify(result.publicResult)).not.toContain(
      "EAAB-secret-token",
    );
    expect(JSON.stringify(result.publicResult)).not.toContain(
      "EAAB-long-lived-token",
    );
  });

  it("returns configure_env when callback exchange is missing required env", async () => {
    const adapter = new MetaAdapter({
      META_APP_ID: "app_123",
      META_APP_SECRET: "secret",
    });

    await expect(
      adapter.exchangeCode({ code: "oauth-code" }),
    ).resolves.toMatchObject({
      provider: "meta",
      status: "configure_env",
      missingEnv: ["META_OAUTH_REDIRECT_URL"],
    });
  });

  it("lists Meta businesses, ad accounts and business pixels from Graph API with backend token", async () => {
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
                verification_status: "verified",
              },
            ],
          }),
          { status: 200 },
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
                timezone_name: "America/Sao_Paulo",
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/business_1/adspixels")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "pixel_1",
                name: "Pixel Loja",
                code: "1234567890",
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          data: [],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_GRAPH_API_VERSION: "v25.0",
      },
      fetchMock,
    );

    await expect(
      adapter.listBusinesses({ accessToken: "EAAB-secret-token" }),
    ).resolves.toEqual([
      {
        id: "business_1",
        name: "BM Principal",
        verificationStatus: "verified",
      },
    ]);
    await expect(
      adapter.listOwnedAdAccounts({
        accessToken: "EAAB-secret-token",
        businessId: "business_1",
      }),
    ).resolves.toEqual([
      {
        id: "act_123",
        businessId: "business_1",
        name: "Conta WhatsApp",
        accountStatus: "1",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
      },
    ]);
    await expect(
      adapter.listBusinessPixels({
        accessToken: "EAAB-secret-token",
        businessId: "business_1",
      }),
    ).resolves.toEqual([
      {
        id: "pixel_1",
        businessId: "business_1",
        name: "Pixel Loja",
        code: null,
      },
    ]);
    expect(fetchCalls[0]).toContain("access_token=EAAB-secret-token");
    expect(fetchCalls[1]).toContain(
      "fields=id%2Cname%2Caccount_status%2Ccurrency%2Ctimezone_name",
    );
    expect(fetchCalls[2]).toContain("fields=id%2Cname");
    expect(fetchCalls[2]).not.toContain("code");
  });

  it("follows Meta Graph pagination for asset lists", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("page=2")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "act_2",
                name: "Conta Pagina 2",
                account_status: 1,
                currency: "BRL",
                timezone_name: "America/Sao_Paulo",
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "act_1",
              name: "Conta Pagina 1",
              account_status: 1,
              currency: "BRL",
              timezone_name: "America/Sao_Paulo",
            },
          ],
          paging: {
            next: "https://graph.facebook.com/v25.0/business_1/owned_ad_accounts?page=2",
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_GRAPH_API_VERSION: "v25.0",
      },
      fetchMock,
    );

    await expect(
      adapter.listOwnedAdAccounts({
        accessToken: "EAAB-secret-token",
        businessId: "business_1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "act_1",
        businessId: "business_1",
        name: "Conta Pagina 1",
      }),
      expect.objectContaining({
        id: "act_2",
        businessId: "business_1",
        name: "Conta Pagina 2",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lists Meta pages for conversion destination from the selected business", async () => {
    const fetchCalls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      fetchCalls.push(String(input));

      if (String(input).includes("/business_1/client_pages")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "page_2", name: "Pagina Cliente" }],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          data: [{ id: "page_1", name: "Pagina Principal" }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter({}, fetcher);

    await expect(
      adapter.listBusinessPages({
        accessToken: "meta-token",
        businessId: "business_1",
      }),
    ).resolves.toEqual([
      { id: "page_1", businessId: "business_1", name: "Pagina Principal" },
      { id: "page_2", businessId: "business_1", name: "Pagina Cliente" },
    ]);
    expect(fetchCalls[0]).toContain("/business_1/owned_pages");
    expect(fetchCalls[1]).toContain("/business_1/client_pages");
  });

  it("lists adsets with destination type", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "adset_1",
                name: "Conjunto WhatsApp",
                campaign_id: "cmp_1",
                status: "ACTIVE",
                effective_status: "ACTIVE",
                destination_type: "WHATSAPP",
                daily_budget: "45000",
              },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const adapter = new MetaAdapter({}, fetcher);

    await expect(
      adapter.listAdSets({ accessToken: "meta-token", adAccountId: "act_123" }),
    ).resolves.toMatchObject([
      { destinationType: "WHATSAPP", dailyBudgetCents: 45000 },
    ]);
  });

  it("lists ads with creative WhatsApp CTA", async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = init.body as URLSearchParams;
          expect(body.get("batch")).toContain("thumbnail_width=1200");

          return new Response(
            JSON.stringify([
              {
                code: 200,
                body: JSON.stringify({
                  id: "creative_1",
                  image_url: "https://example.com/creative-high.jpg",
                  thumbnail_url: "https://example.com/creative-rendered.jpg",
                }),
              },
            ]),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            data: [
              {
                id: "ad_1",
                name: "Anuncio WhatsApp",
                campaign_id: "cmp_1",
                adset_id: "adset_1",
                status: "ACTIVE",
                effective_status: "ACTIVE",
                creative: {
                  id: "creative_1",
                  call_to_action_type: "WHATSAPP_MESSAGE",
                  thumbnail_url: "https://example.com/creative.jpg",
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    ) as unknown as typeof fetch;
    const adapter = new MetaAdapter({}, fetcher);

    await expect(
      adapter.listAds({ accessToken: "meta-token", adAccountId: "act_123" }),
    ).resolves.toMatchObject([
      {
        creativeId: "creative_1",
        callToActionType: "WHATSAPP_MESSAGE",
        thumbnailUrl: "https://example.com/creative.jpg",
        previewUrl: "https://example.com/creative-high.jpg",
      },
    ]);
  });

  it("uses the largest video thumbnail for the creative preview", async () => {
    let batchCall = 0;
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") {
          batchCall += 1;

          if (batchCall === 1) {
            return new Response(
              JSON.stringify([
                {
                  code: 200,
                  body: JSON.stringify({
                    id: "creative_1",
                    thumbnail_url: "https://example.com/video-rendered.jpg",
                    video_id: "video_1",
                  }),
                },
              ]),
              { status: 200 },
            );
          }

          return new Response(
            JSON.stringify([
              {
                code: 200,
                body: JSON.stringify({
                  data: [
                    {
                      uri: "https://example.com/video-small.jpg",
                      width: 320,
                      height: 180,
                      is_preferred: true,
                    },
                    {
                      uri: "https://example.com/video-large.jpg",
                      width: 1920,
                      height: 1080,
                      is_preferred: false,
                    },
                  ],
                }),
              },
            ]),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            data: [
              {
                id: "ad_1",
                name: "Anuncio em video",
                campaign_id: "cmp_1",
                adset_id: "adset_1",
                creative: {
                  id: "creative_1",
                  thumbnail_url: "https://example.com/video-small.jpg",
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    ) as unknown as typeof fetch;
    const adapter = new MetaAdapter({}, fetcher);

    await expect(
      adapter.listAds({ accessToken: "meta-token", adAccountId: "act_123" }),
    ).resolves.toMatchObject([
      {
        thumbnailUrl: "https://example.com/video-small.jpg",
        previewUrl: "https://example.com/video-large.jpg",
      },
    ]);
    expect(batchCall).toBe(2);
  });

  it("extracts Pixel and Page destination hints from each ad", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "ad_1",
                name: "Anuncio com multiplos destinos",
                campaign_id: "cmp_1",
                adset_id: "adset_1",
                status: "ACTIVE",
                effective_status: "ACTIVE",
                tracking_specs: [
                  {
                    "action.type": ["offsite_conversion"],
                    fb_pixel: ["pixel_1"],
                    page: ["page_tracking"],
                  },
                  { dataset: ["pixel_2"] },
                ],
                creative: {
                  object_story_spec: { page_id: "page_creative" },
                },
              },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const adapter = new MetaAdapter({}, fetcher);

    await expect(
      adapter.listAds({ accessToken: "meta-token", adAccountId: "act_123" }),
    ).resolves.toMatchObject([
      {
        id: "ad_1",
        detectedPixelIds: ["pixel_1", "pixel_2"],
        detectedPageIds: ["page_creative", "page_tracking"],
      },
    ]);
  });

  it("lists campaigns, ad sets, ads and campaign insights from the selected ad account", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === "https://graph.facebook.com/v25.0") {
        return new Response(
          JSON.stringify([
            {
              code: 200,
              body: JSON.stringify({
                id: "creative_1",
                image_url: "https://example.com/ad-1-high.jpg",
              }),
            },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("/campaigns")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "cmp_1",
                name: "Black Friday WhatsApp",
                status: "ACTIVE",
                effective_status: "ACTIVE",
                objective: "OUTCOME_SALES",
                daily_budget: "49500",
              },
            ],
          }),
          { status: 200 },
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
                effective_status: "ACTIVE",
                lifetime_budget: "120000",
              },
            ],
          }),
          { status: 200 },
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
                effective_status: "ACTIVE",
                creative: {
                  id: "creative_1",
                  thumbnail_url: "https://example.com/ad-1.jpg",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("level=adset")) {
        const daily = new URL(url).searchParams.get("time_increment") === "1";
        return new Response(
          JSON.stringify({
            data: [
              {
                adset_id: "adset_1",
                campaign_id: "cmp_1",
                ...(daily
                  ? {
                      date_start: "2026-07-01",
                      date_stop: "2026-07-01",
                    }
                  : {}),
                spend: "600.10",
                impressions: "5000",
                clicks: "210",
                actions: [
                  {
                    action_type:
                      "onsite_conversion.messaging_conversation_started_7d",
                    value: "80",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("level=ad")) {
        const daily = new URL(url).searchParams.get("time_increment") === "1";
        return new Response(
          JSON.stringify({
            data: [
              {
                ad_id: "ad_1",
                adset_id: "adset_1",
                campaign_id: "cmp_1",
                ...(daily
                  ? {
                      date_start: "2026-07-01",
                      date_stop: "2026-07-01",
                    }
                  : {}),
                spend: "300.05",
                impressions: "2500",
                clicks: "105",
                actions: [
                  {
                    action_type:
                      "onsite_conversion.messaging_conversation_started_7d",
                    value: "40",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (new URL(url).searchParams.get("time_increment") === "1") {
        return new Response(
          JSON.stringify({
            data: [
              {
                campaign_id: "cmp_1",
                date_start: "2026-07-01",
                date_stop: "2026-07-01",
                spend: "700.25",
                impressions: "6000",
                clicks: "250",
                actions: [
                  {
                    action_type:
                      "onsite_conversion.messaging_conversation_started_7d",
                    value: "100",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
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
                  action_type:
                    "onsite_conversion.messaging_conversation_started_7d",
                  value: "176",
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      {
        META_GRAPH_API_VERSION: "v25.0",
      },
      fetchMock,
    );

    await expect(
      adapter.listCampaigns({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
      }),
    ).resolves.toEqual([
      {
        id: "cmp_1",
        name: "Black Friday WhatsApp",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        objective: "OUTCOME_SALES",
        dailyBudgetCents: 49500,
        lifetimeBudgetCents: null,
      },
    ]);
    await expect(
      adapter.listAdSets({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
      }),
    ).resolves.toEqual([
      {
        id: "adset_1",
        name: "Publico quente",
        campaignId: "cmp_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        destinationType: null,
        dailyBudgetCents: null,
        lifetimeBudgetCents: 120000,
      },
    ]);
    await expect(
      adapter.listAds({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
      }),
    ).resolves.toEqual([
      {
        id: "ad_1",
        name: "Criativo WhatsApp",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        creativeId: "creative_1",
        thumbnailUrl: "https://example.com/ad-1.jpg",
        previewUrl: "https://example.com/ad-1-high.jpg",
        callToActionType: null,
        detectedPixelIds: [],
        detectedPageIds: [],
      },
    ]);
    await expect(
      adapter.listCampaignInsights({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).resolves.toEqual([
      {
        campaignId: "cmp_1",
        spendCents: 120055,
        impressions: 10000,
        clicks: 420,
        metaConversationsStarted: 176,
      },
    ]);
    await expect(
      adapter.listCampaignDailyInsights({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).resolves.toEqual([
      {
        campaignId: "cmp_1",
        date: "2026-07-01",
        spendCents: 70025,
        impressions: 6000,
        clicks: 250,
        metaConversationsStarted: 100,
      },
    ]);
    await expect(
      adapter.listAdSetInsights({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).resolves.toEqual([
      {
        adSetId: "adset_1",
        campaignId: "cmp_1",
        spendCents: 60010,
        impressions: 5000,
        clicks: 210,
        metaConversationsStarted: 80,
      },
    ]);
    await expect(
      adapter.listAdSetDailyInsights({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).resolves.toEqual([
      {
        adSetId: "adset_1",
        campaignId: "cmp_1",
        date: "2026-07-01",
        spendCents: 60010,
        impressions: 5000,
        clicks: 210,
        metaConversationsStarted: 80,
      },
    ]);
    await expect(
      adapter.listAdInsights({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).resolves.toEqual([
      {
        adId: "ad_1",
        adSetId: "adset_1",
        campaignId: "cmp_1",
        spendCents: 30005,
        impressions: 2500,
        clicks: 105,
        metaConversationsStarted: 40,
      },
    ]);
    await expect(
      adapter.listAdDailyInsights({
        accessToken: "EAAB-secret-token",
        adAccountId: "act_123",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).resolves.toEqual([
      {
        adId: "ad_1",
        adSetId: "adset_1",
        campaignId: "cmp_1",
        date: "2026-07-01",
        spendCents: 30005,
        impressions: 2500,
        clicks: 105,
        metaConversationsStarted: 40,
      },
    ]);
  });

  it("updates Meta entity status and budget with form encoded Graph writes", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const adapter = new MetaAdapter(
      { META_GRAPH_API_VERSION: "v25.0" },
      fetchMock as unknown as typeof fetch,
    );

    await adapter.updateEntityStatus({
      accessToken: "meta-token",
      id: "cmp_1",
      status: "PAUSED",
    });
    await adapter.updateEntityBudget({
      accessToken: "meta-token",
      id: "adset_1",
      budgetType: "daily",
      budgetCents: 72500,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://graph.facebook.com/v25.0/cmp_1",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://graph.facebook.com/v25.0/adset_1",
      expect.objectContaining({ method: "POST" }),
    );
    const statusBody = String(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body,
    );
    const budgetBody = String(
      (fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body,
    );

    expect(statusBody).toContain("status=PAUSED");
    expect(statusBody).toContain("access_token=meta-token");
    expect(budgetBody).toContain("daily_budget=72500");
  });

  it("uses broader conversation action variants only for manual-token Insights", async () => {
    const requestedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(new URL(String(input)));
      return new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: "cmp_sales_whatsapp",
              spend: "593.97",
              impressions: "4000",
              clicks: "120",
              actions: [
                {
                  action_type:
                    "onsite_conversion.messaging_conversation_started_7d",
                  value: "8",
                },
                {
                  action_type: "messaging_conversation_started",
                  value: "11",
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      { META_GRAPH_API_VERSION: "v25.0" },
      fetchMock,
    );
    const input = {
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123",
      since: "2026-07-08",
      until: "2026-07-14",
    };

    const legacy = await adapter.listCampaignInsights(input);
    const manual = await adapter.listCampaignInsights({
      ...input,
      readMode: "manual",
    });

    expect(legacy[0]).toMatchObject({
      spendCents: 59397,
      metaConversationsStarted: 8,
    });
    expect(manual[0]).toMatchObject({
      spendCents: 59397,
      metaConversationsStarted: 11,
    });
    expect(requestedUrls[0]?.searchParams.has("action_breakdowns")).toBe(false);
    expect(requestedUrls[0]?.searchParams.has("action_report_time")).toBe(
      false,
    );
    expect(requestedUrls[1]?.searchParams.get("action_breakdowns")).toBe(
      "action_type",
    );
    expect(requestedUrls[1]?.searchParams.get("action_report_time")).toBe(
      "conversion",
    );
    expect(
      requestedUrls[1]?.searchParams.get("use_unified_attribution_setting"),
    ).toBe("true");
  });

  it("paginates campaign, ad set and ad insights through paging.next", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const level = url.searchParams.get("level") ?? "campaign";
      const page = url.searchParams.get("after") === "page_2" ? 2 : 1;
      requestedUrls.push(url.toString());
      const node = {
        campaign_id: `cmp_${page}`,
        ...(level === "adset" || level === "ad"
          ? { adset_id: `adset_${page}` }
          : {}),
        ...(level === "ad" ? { ad_id: `ad_${page}` } : {}),
        spend: String(page * 10),
        impressions: String(page * 100),
        clicks: String(page * 5),
        actions: [],
      };

      return new Response(
        JSON.stringify({
          data: [node],
          ...(page === 1
            ? {
                paging: {
                  next: `https://graph.facebook.com/v25.0/act_123/insights?level=${level}&after=page_2`,
                },
              }
            : {}),
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = new MetaAdapter(
      { META_GRAPH_API_VERSION: "v25.0" },
      fetchMock,
    );
    const input = {
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123",
      since: "2026-07-06",
      until: "2026-07-12",
    };

    const [campaigns, adSets, ads] = await Promise.all([
      adapter.listCampaignInsights(input),
      adapter.listAdSetInsights(input),
      adapter.listAdInsights(input),
    ]);

    expect(campaigns.map((item) => item.campaignId)).toEqual([
      "cmp_1",
      "cmp_2",
    ]);
    expect(adSets.map((item) => item.adSetId)).toEqual(["adset_1", "adset_2"]);
    expect(ads.map((item) => item.adId)).toEqual(["ad_1", "ad_2"]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(
      requestedUrls
        .filter((url) => !url.includes("after=page_2"))
        .every((url) => url.includes("limit=100")),
    ).toBe(true);
  });
});
