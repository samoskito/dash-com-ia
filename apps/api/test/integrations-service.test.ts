import { describe, expect, it, vi } from "vitest";
import { AsaasAdapter } from "../src/integrations/asaas/asaas.adapter";
import { IntegrationsService } from "../src/integrations/integrations.service";
import { MetaAdapter } from "../src/integrations/meta/meta.adapter";
import { UazapiAdapter } from "../src/integrations/uazapi/uazapi.adapter";

describe("integrations service", () => {
  it("returns a Meta OAuth redirect action with the real authorization URL", async () => {
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

    const action = await service.getMetaStartAction();

    expect(action.action).toBe("oauth_redirect");
    expect(action.href).toContain("https://www.facebook.com/v25.0/dialog/oauth");
    expect(action.href).toContain("client_id=app_123");
    expect(action.missingEnv).toEqual([]);
  });

  it("requires redirect URL before starting Meta OAuth", async () => {
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

    await expect(service.getMetaStartAction()).resolves.toMatchObject({
      provider: "meta",
      action: "configure_env",
      missingEnv: ["META_OAUTH_REDIRECT_URL"]
    });
  });

  it("does not start Meta OAuth when the deployment enables only manual mode", async () => {
    const metaAdapter = new MetaAdapter({});
    const exchangeSpy = vi.spyOn(metaAdapter, "exchangeCodeForToken");
    const service = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {
        META_CONNECTION_MODES: "manual",
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL:
          "https://api.wpptrack.com/integrations/meta/callback"
      }
    );

    await expect(service.getMetaStartAction()).resolves.toMatchObject({
      action: "configure_env",
      missingEnv: ["META_CONNECTION_MODES=oauth"]
    });
    await expect(
      service.handleMetaCallback({ code: "meta-code", state: "state" })
    ).resolves.toMatchObject({
      status: "exchange_failed",
      message: "OAuth Meta desabilitado neste ambiente"
    });
    expect(exchangeSpy).not.toHaveBeenCalled();
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
    const states: Array<Record<string, any>> = [];
    const prisma = {
      metaOAuthState: {
        create: vi.fn(async ({ data }) => {
          const state = {
            id: "state_1",
            consumedAt: null,
            createdAt: new Date(),
            ...data
    };
          states.push(state);
          return state;
        }),
        findUnique: vi.fn(
          async ({ where }) =>
            states.find((state) => state.stateHash === where.stateHash) ?? null
        ),
        updateMany: vi.fn(async ({ where, data }) => {
          const state = states.find((candidate) => candidate.id === where.id);

          if (
            !state ||
            state.consumedAt ||
            state.expiresAt.getTime() <= where.expiresAt.gt.getTime()
          ) {
            return { count: 0 };
          }

          state.consumedAt = data.consumedAt;
          return { count: 1 };
        })
      },
      workspaceMember: {
        findUnique: vi.fn(async () => ({ id: "member_1", role: "admin" }))
      }
    };
    const service = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL: "https://api.wpptrack.com/integrations/meta/callback",
        META_TOKEN_ENCRYPTION_KEY: "state-secret"
      },
      metaConnectionsService as never,
      prisma as never
    );
    const start = await service.getMetaStartAction("workspace_1", "user_1");
    const state = new URL(start.href ?? "").searchParams.get("state");

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
    expect(states[0]?.stateHash).not.toBe(state);
    expect(states[0]?.userId).toBe("user_1");
    expect(metaConnectionsService.saveOAuthConnection).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read"]
    });

    await expect(
      service.handleMetaCallback({ code: "replayed-code", state: state ?? "" })
    ).resolves.toMatchObject({
      status: "exchange_failed",
      message: "State OAuth Meta invalido ou expirado"
    });
    expect(exchangeSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a Meta OAuth state when the actor lost workspace membership", async () => {
    const metaAdapter = new MetaAdapter({});
    const exchangeSpy = vi.spyOn(metaAdapter, "exchangeCodeForToken");
    let savedState: Record<string, any> | null = null;
    const prisma = {
      metaOAuthState: {
        create: vi.fn(async ({ data }) => {
          savedState = {
            id: "state_1",
            consumedAt: null,
            ...data
          };
          return savedState;
        }),
        findUnique: vi.fn(async () => savedState),
        updateMany: vi.fn()
      },
      workspaceMember: {
        findUnique: vi.fn(async () => null)
      }
    };
    const service = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL:
          "https://api.wpptrack.com/integrations/meta/callback",
        META_TOKEN_ENCRYPTION_KEY: "state-secret"
      },
      {} as never,
      prisma as never
    );
    const start = await service.getMetaStartAction("workspace_1", "user_1");
    const state = new URL(start.href ?? "").searchParams.get("state") ?? "";

    await expect(
      service.handleMetaCallback({ code: "meta-code", state })
    ).resolves.toMatchObject({
      status: "exchange_failed",
      message: "State OAuth Meta invalido ou expirado"
    });
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(prisma.metaOAuthState.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a Meta OAuth state when the actor lost integration permission", async () => {
    const metaAdapter = new MetaAdapter({});
    const exchangeSpy = vi.spyOn(metaAdapter, "exchangeCodeForToken");
    let savedState: Record<string, any> | null = null;
    const prisma = {
      metaOAuthState: {
        create: vi.fn(async ({ data }) => {
          savedState = {
            id: "state_1",
            consumedAt: null,
            ...data
          };
          return savedState;
        }),
        findUnique: vi.fn(async () => savedState),
        updateMany: vi.fn()
      },
      workspaceMember: {
        findUnique: vi.fn(async () => ({ id: "member_1", role: "member" }))
      }
    };
    const service = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {
        META_APP_ID: "app_123",
        META_APP_SECRET: "secret",
        META_OAUTH_REDIRECT_URL:
          "https://api.wpptrack.com/integrations/meta/callback",
        META_TOKEN_ENCRYPTION_KEY: "state-secret"
      },
      {} as never,
      prisma as never
    );
    const start = await service.getMetaStartAction("workspace_1", "user_1");
    const state = new URL(start.href ?? "").searchParams.get("state") ?? "";

    await expect(
      service.handleMetaCallback({ code: "meta-code", state })
    ).resolves.toMatchObject({
      status: "exchange_failed",
      message: "State OAuth Meta invalido ou expirado"
    });
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(prisma.metaOAuthState.updateMany).not.toHaveBeenCalled();
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

  it("treats Uazapi admin credentials as ready for provisioning", () => {
    const service = new IntegrationsService(
      new MetaAdapter({}),
      new UazapiAdapter({
        UAZAPI_BASE_URL: "https://uazapi.test",
        UAZAPI_ADMIN_TOKEN: "admin-token"
      }),
      new AsaasAdapter({}),
      {
        UAZAPI_BASE_URL: "https://uazapi.test",
        UAZAPI_ADMIN_TOKEN: "admin-token"
      }
    );

    expect(service.getUazapiStartAction()).toMatchObject({
      provider: "uazapi",
      action: "wait_webhook",
      missingEnv: []
    });
  });

  it("returns selectable Meta assets with pages and saved account configuration", async () => {
    const metaAdapter = new MetaAdapter({});
    const metaConnectionsService = {
      listAssets: vi.fn(async () => ({
        workspaceId: "workspace_1",
        status: "connected",
        businesses: [{ id: "business_1", name: "BM Principal", verificationStatus: null }],
        adAccounts: [
          {
            id: "act_123",
            businessId: "business_1",
            name: "Conta WhatsApp",
            accountStatus: "1",
            currency: "BRL",
            timezoneName: "America/Sao_Paulo"
          }
        ],
        pixels: [
          {
            id: "pixel_1",
            businessId: "business_1",
            name: "Pixel Loja",
            code: "1234567890"
          }
        ],
        pages: [
          {
            id: "page_1",
            businessId: "business_1",
            name: "Pagina Principal"
          }
        ],
        selection: {
          businessId: "business_1",
          adAccountId: "act_123",
          pixelId: "pixel_1"
        },
        lastSyncedAt: "2026-07-02T12:00:00.000Z",
        syncError: null
      }))
    };
    const metaAssetsService = {
      getConversionDestination: vi.fn(async () => ({
        workspaceId: "workspace_1",
        pixelId: "pixel_1",
        pixelName: "Pixel Loja",
        pageId: "page_1",
        pageName: "Pagina Principal",
        status: "configured",
        lastValidatedAt: "2026-07-09T12:00:00.000Z",
        validationError: null
      })),
      listReportingAccounts: vi.fn(async () => [
        {
          id: "reporting_1",
          workspaceId: "workspace_1",
          businessId: "business_1",
          businessName: "BM Principal",
          adAccountId: "act_123",
          adAccountName: "Conta WhatsApp",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo",
          active: true,
          syncStatus: "pending",
          lastSyncedAt: null,
          syncError: null
        }
      ])
    };
    const service = new IntegrationsService(
      metaAdapter,
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {},
      metaConnectionsService as never,
      undefined,
      metaAssetsService as never
    );

    await expect(service.getMetaAssets("workspace_1")).resolves.toMatchObject({
      workspaceId: "workspace_1",
      businesses: [{ name: "BM Principal" }],
      pixels: [{ name: "Pixel Loja" }],
      pages: [{ name: "Pagina Principal" }],
      conversionDestination: {
        pixelId: "pixel_1",
        pageId: "page_1",
        status: "configured"
      },
      reportingAccounts: [
        {
          id: "reporting_1",
          adAccountId: "act_123",
          active: true
        }
      ]
    });
    expect(metaConnectionsService.listAssets).toHaveBeenCalledWith(
      "workspace_1",
      metaAdapter
    );
    expect(metaAssetsService.getConversionDestination).toHaveBeenCalledWith(
      "workspace_1"
    );
    expect(metaAssetsService.listReportingAccounts).toHaveBeenCalledWith(
      "workspace_1"
    );
  });

  it("loads Meta assets for a requested business without persisting selection", async () => {
    const metaAdapter = new MetaAdapter({});
    const metaConnectionsService = {
      listAssets: vi.fn(async () => ({
        workspaceId: "workspace_1",
        status: "connected",
        businesses: [{ id: "business_2", name: "BM Secundario", verificationStatus: null }],
        adAccounts: [
          {
            id: "act_789",
            businessId: "business_2",
            name: "Conta Outro BM",
            accountStatus: "1",
            currency: "USD",
            timezoneName: "America/New_York"
          }
        ],
        pixels: [
          {
            id: "pixel_3",
            businessId: "business_2",
            name: "Pixel Outro BM",
            code: null
          }
        ],
        selection: {
          businessId: null,
          adAccountId: null,
          pixelId: null
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

    await expect(
      service.getMetaAssets("workspace_1", "business_2")
    ).resolves.toMatchObject({
      adAccounts: [{ businessId: "business_2", name: "Conta Outro BM" }],
      pixels: [{ businessId: "business_2", name: "Pixel Outro BM" }]
    });
    expect(metaConnectionsService.listAssets).toHaveBeenCalledWith(
      "workspace_1",
      metaAdapter,
      "business_2"
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

  it("delegates Meta conversion destination operations to the assets service", async () => {
    const metaAssetsService = {
      getConversionDestination: vi.fn(async () => ({
        workspaceId: "workspace_1",
        pixelId: null,
        pixelName: null,
        pageId: null,
        pageName: null,
        status: "needs_configuration",
        lastValidatedAt: null,
        validationError: null
      })),
      saveConversionDestination: vi.fn(async () => ({
        workspaceId: "workspace_1",
        pixelId: "pixel_1",
        pixelName: "Pixel Principal",
        pageId: "page_1",
        pageName: "Pagina Principal",
        status: "configured",
        lastValidatedAt: "2026-07-09T12:00:00.000Z",
        validationError: null
      }))
    };
    const service = new IntegrationsService(
      new MetaAdapter({}),
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {},
      undefined,
      undefined,
      metaAssetsService as never
    );

    await expect(
      service.getMetaConversionDestination("workspace_1")
    ).resolves.toMatchObject({
      workspaceId: "workspace_1",
      status: "needs_configuration"
    });
    await expect(
      service.saveMetaConversionDestination(
        "workspace_1",
        {
          pixelId: "pixel_1",
          pixelName: "Pixel Principal",
          pageId: "page_1",
          pageName: "Pagina Principal"
        },
        "user_1"
      )
    ).resolves.toMatchObject({
      pixelId: "pixel_1",
      pageId: "page_1",
      status: "configured"
    });
    expect(metaAssetsService.saveConversionDestination).toHaveBeenCalledWith(
      "workspace_1",
      {
        pixelId: "pixel_1",
        pixelName: "Pixel Principal",
        pageId: "page_1",
        pageName: "Pagina Principal"
      },
      "user_1"
    );
  });

  it("delegates Meta reporting account operations to the assets service", async () => {
    const accounts = [
      {
        id: "reporting_1",
        workspaceId: "workspace_1",
        businessId: "business_1",
        businessName: "BM Principal",
        adAccountId: "act_123",
        adAccountName: "Conta WhatsApp",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
        active: true,
        syncStatus: "pending",
        lastSyncedAt: null,
        syncError: null
      }
    ];
    const metaAssetsService = {
      listReportingAccounts: vi.fn(async () => accounts),
      saveReportingAccount: vi.fn(async () => accounts[0]),
      setReportingAccountActive: vi.fn(async () => [
        { ...accounts[0], active: false }
      ])
    };
    const service = new IntegrationsService(
      new MetaAdapter({}),
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {},
      undefined,
      undefined,
      metaAssetsService as never
    );

    await expect(
      service.getMetaReportingAccounts("workspace_1")
    ).resolves.toEqual(accounts);
    await expect(
      service.saveMetaReportingAccount(
        "workspace_1",
        {
          businessId: "business_1",
          businessName: "BM Principal",
          adAccountId: "act_123",
          adAccountName: "Conta WhatsApp",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo"
        },
        "user_1"
      )
    ).resolves.toEqual(accounts[0]);
    await expect(
      service.setMetaReportingAccountActive(
        "workspace_1",
        "reporting_1",
        false,
        "user_1"
      )
    ).resolves.toMatchObject([{ id: "reporting_1", active: false }]);
  });

  it("summarizes the integration signal pipeline from persisted logs", async () => {
    const prisma = {
      webhookLog: {
        count: vi.fn(async () => 4)
      },
      lead: {
        count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          "OR" in where ? 3 : 5
        )
      },
      conversionEventLog: {
        count: vi.fn(async ({ where }: { where: { status?: string } }) =>
          where.status === "sent" ? 2 : 6,
        ),
      },
      externalDataConnector: {
        findFirst: vi.fn(async () => ({
          name: "MySQL Barbieri",
          provider: "kinbox_mysql",
          lastSyncCompletedAt: new Date("2026-07-02T11:59:00.000Z"),
          lastSyncStatus: "completed",
        })),
      },
    };
    const service = new IntegrationsService(
      new MetaAdapter({}),
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {},
      undefined,
      prisma as never
    );

    await expect(
      service.getPipelineOverview(
        "workspace_1",
        new Date("2026-07-02T12:00:00.000Z")
      )
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      whatsappSource: {
        mode: "external",
        connectorName: "MySQL Barbieri",
        provider: "kinbox_mysql",
        lastSyncCompletedAt: "2026-07-02T11:59:00.000Z",
        lastSyncStatus: "completed",
      },
      stages: [
        {
          key: "ctwa",
          label: "CTWA",
          value: 3,
          detail: "Leads com origem de campanha Meta"
        },
        {
          key: "webhook",
          label: "Webhook",
          value: 4,
          detail: "Webhooks Uazapi recebidos"
        },
        {
          key: "lead",
          label: "Lead",
          value: 5,
          detail: "Leads rastreados pelo WhatsApp"
        },
        {
          key: "conversion_ready",
          label: "CAPI pronta",
          value: 6,
          detail: "Eventos aguardando envio para Meta"
        },
        {
          key: "meta_sent",
          label: "Meta ACK",
          value: 2,
          detail: "Eventos enviados para Meta"
        }
      ]
    });
    expect(prisma.webhookLog.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        source: "uazapi",
        receivedAt: { gte: new Date("2026-06-25T12:00:00.000Z") }
      }
    });
  });

  it("returns a native WhatsApp source when there is no external connector", async () => {
    const prisma = {
      externalDataConnector: {
        findFirst: vi.fn(async () => null),
      },
    };
    const service = new IntegrationsService(
      new MetaAdapter({}),
      new UazapiAdapter({}),
      new AsaasAdapter({}),
      {},
      undefined,
      prisma as never,
    );

    await expect(service.getWhatsappDataSource("workspace_1")).resolves.toEqual(
      {
        mode: "native",
        connectorName: null,
        provider: null,
        lastSyncCompletedAt: null,
        lastSyncStatus: null,
      },
    );
  });
});
