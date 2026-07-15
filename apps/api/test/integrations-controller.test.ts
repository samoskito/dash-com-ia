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
      message: "Missing META_APP_ID or META_APP_SECRET",
    },
    {
      provider: "uazapi",
      status: "disconnected",
      checkedAt: "2026-07-02T03:00:00.000Z",
      message: "Missing UAZAPI_BASE_URL or UAZAPI_TOKEN",
    },
    {
      provider: "asaas",
      status: "disconnected",
      checkedAt: "2026-07-02T03:00:00.000Z",
      message: "Missing ASAAS_BASE_URL or ASAAS_API_KEY",
    },
  ],
};

const manualCredential = {
  id: "credential_1",
  workspaceId: "workspace_1",
  source: "manual",
  label: "Token BM Cliente",
  fingerprint: "1234567890abcdef",
  tokenLast4: "cret",
  tokenType: "system_user",
  scopes: ["ads_read", "ads_management", "business_management"],
  expiresAt: null,
  status: "active",
  lastValidatedAt: "2026-07-14T12:00:00.000Z",
  validationError: null,
  rotatedAt: null,
  createdAt: "2026-07-14T12:00:00.000Z",
  updatedAt: "2026-07-14T12:00:00.000Z",
};

const manualConfiguration = {
  workspaceId: "workspace_1",
  credentials: [manualCredential],
  businessConnections: [],
  destinations: [],
  reportingAccounts: [],
};

const manualDiscovery = {
  credential: manualCredential,
  businesses: [
    {
      id: "business_1",
      name: "BM Cliente",
      verificationStatus: "verified",
    },
  ],
  selectedBusinessId: "business_1",
  adAccounts: [
    {
      id: "act_123",
      businessId: "business_1",
      name: "Conta Cliente",
      accountStatus: "1",
      currency: "BRL",
      timezoneName: "America/Sao_Paulo",
    },
  ],
  pixels: [
    {
      id: "pixel_1",
      businessId: "business_1",
      name: "Pixel Cliente",
      code: null,
    },
  ],
  pages: [
    {
      id: "page_1",
      businessId: "business_1",
      name: "Pagina Cliente",
    },
  ],
};

function workspacePermissions(role: "owner" | "admin" | "member") {
  const isOwner = role === "owner";
  const isAdmin = role === "admin";

  return {
    canInviteMembers: isOwner,
    canManageMembers: isOwner,
    canGrantMemberManager: isOwner,
    canManageBilling: isOwner,
    canManageIntegrations: isOwner || isAdmin,
    canManageWorkspaceSettings: isOwner || isAdmin,
    canTransferOwnership: isOwner,
    canViewReports: true,
    canExportReports: true,
  };
}

async function createApp(role: "owner" | "admin" | "member" = "owner") {
  const service = {
    getHealthSummary: vi.fn(async () => health),
    getMetaStartAction: vi.fn(() => ({
      provider: "meta",
      action: "configure_env",
      label: "Configurar app Meta",
      missingEnv: ["META_APP_ID", "META_APP_SECRET"],
    })),
    handleMetaCallback: vi.fn(async () => ({
      provider: "meta",
      status: "connected",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read"],
      message: "Meta OAuth conectado",
      connection: {
        workspaceId: "workspace_1",
        status: "connected",
        tokenType: "bearer",
        scopes: ["ads_read"],
        expiresAt: null,
        connectedAt: "2026-07-02T03:00:00.000Z",
        selectedBusinessId: null,
        selectedAdAccountId: null,
        selectedPixelId: null,
        capiTokenConfigured: false,
      },
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
      selectedPixelId: null,
    })),
    getMetaAssets: vi.fn(async () => ({
      workspaceId: "workspace_1",
      status: "connected",
      businesses: [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified",
        },
      ],
      adAccounts: [
        {
          id: "act_123",
          businessId: "business_1",
          name: "Conta WhatsApp",
          accountStatus: "1",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo",
        },
      ],
      pixels: [
        {
          id: "pixel_1",
          businessId: "business_1",
          name: "Pixel Loja",
          code: "1234567890",
        },
      ],
      pages: [
        {
          id: "page_1",
          businessId: "business_1",
          name: "Pagina Principal",
        },
      ],
      conversionDestination: {
        workspaceId: "workspace_1",
        pixelId: "pixel_1",
        pixelName: "Pixel Loja",
        pageId: "page_1",
        pageName: "Pagina Principal",
        status: "configured",
        lastValidatedAt: "2026-07-09T12:00:00.000Z",
        validationError: null,
      },
      reportingAccounts: [
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
          syncError: null,
        },
      ],
      selection: {
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1",
      },
      lastSyncedAt: "2026-07-02T12:00:00.000Z",
      syncError: null,
    })),
    refreshMetaAssets: vi.fn(async () => ({
      workspaceId: "workspace_1",
      status: "connected",
      businesses: [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified",
        },
      ],
      adAccounts: [
        {
          id: "act_123",
          businessId: "business_1",
          name: "Conta WhatsApp",
          accountStatus: "1",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo",
        },
      ],
      pixels: [
        {
          id: "pixel_1",
          businessId: "business_1",
          name: "Pixel Loja",
          code: null,
        },
      ],
      pages: [
        {
          id: "page_1",
          businessId: "business_1",
          name: "Pagina Principal",
        },
      ],
      selection: {
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1",
      },
      lastSyncedAt: "2026-07-09T12:00:00.000Z",
      syncError: null,
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
      selectedPixelId: "pixel_1",
    })),
    saveMetaCapiToken: vi.fn(async () => ({
      workspaceId: "workspace_1",
      configured: true,
      updatedAt: "2026-07-02T04:00:00.000Z",
    })),
    getMetaConversionDestination: vi.fn(async () => ({
      workspaceId: "workspace_1",
      pixelId: null,
      pixelName: null,
      pageId: null,
      pageName: null,
      status: "needs_configuration",
      lastValidatedAt: null,
      validationError: null,
    })),
    saveMetaConversionDestination: vi.fn(async () => ({
      workspaceId: "workspace_1",
      pixelId: "pixel_1",
      pixelName: "Pixel Principal",
      pageId: "page_1",
      pageName: "Pagina Principal",
      status: "configured",
      lastValidatedAt: "2026-07-09T12:00:00.000Z",
      validationError: null,
    })),
    getMetaReportingAccounts: vi.fn(async () => [
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
        syncError: null,
      },
    ]),
    saveMetaReportingAccount: vi.fn(async () => ({
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
      syncError: null,
    })),
    setMetaReportingAccountActive: vi.fn(async () => [
      {
        id: "reporting_1",
        workspaceId: "workspace_1",
        businessId: "business_1",
        businessName: "BM Principal",
        adAccountId: "act_123",
        adAccountName: "Conta WhatsApp",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
        active: false,
        syncStatus: "pending",
        lastSyncedAt: null,
        syncError: null,
      },
    ]),
    getMetaConnectionCapabilities: vi.fn(() => ({
      enabledModes: ["oauth", "manual"],
      oauthEnabled: true,
      manualEnabled: true,
    })),
    disconnectMetaOAuth: vi.fn(async () => ({
      workspaceId: "workspace_1",
      status: "not_connected",
      disconnectedAt: "2026-07-15T04:30:00.000Z",
      preserved: {
        assetSnapshots: 2,
        reportingAccounts: 1,
        conversionDestinations: 1,
      },
    })),
    getMetaManualConfiguration: vi.fn(async () => manualConfiguration),
    createMetaManualCredential: vi.fn(async () => manualDiscovery),
    discoverMetaManualAssets: vi.fn(async () => manualDiscovery),
    createMetaManualBusinessConnection: vi.fn(async () => manualConfiguration),
    rotateMetaManualCredential: vi.fn(async () => manualConfiguration),
    setMetaManualBusinessConnectionStatus: vi.fn(
      async () => manualConfiguration,
    ),
    testMetaManualBusinessConnection: vi.fn(async () => ({
      connectionId: "connection_1",
      credentialId: "credential_1",
      destinationId: "destination_1",
      reportingAccountCount: 1,
      status: "active",
      validatedAt: "2026-07-14T12:00:00.000Z",
      message: "Conexao validada",
    })),
    setMetaManualReportingDestination: vi.fn(async () => manualConfiguration),
    getUazapiStartAction: vi.fn(() => ({
      provider: "uazapi",
      action: "configure_env",
      label: "Configurar Uazapi",
      missingEnv: ["UAZAPI_BASE_URL", "UAZAPI_TOKEN"],
    })),
    getAsaasStatusAction: vi.fn(() => ({
      provider: "asaas",
      action: "configure_env",
      label: "Configurar Asaas",
      missingEnv: ["ASAAS_API_KEY"],
    })),
    getPipelineOverview: vi.fn(async () => ({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      stages: [
        {
          key: "webhook",
          label: "Webhook",
          value: 4,
          detail: "Webhooks Uazapi recebidos",
        },
      ],
    })),
    getWhatsappDataSource: vi.fn(async () => ({
      mode: "external",
      connectorName: "MySQL Barbieri",
      provider: "kinbox_mysql",
      lastSyncCompletedAt: "2026-07-12T03:41:52.000Z",
      lastSyncStatus: "completed",
    })),
  };
  const authService = {
    getSession: vi.fn(async () => ({
      user: {
        id: "user_1",
        email: "owner@wpptrack.com",
        name: "Owner",
        authProvider: "email",
        emailVerifiedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Workspace",
          slug: "workspace",
          role,
        },
      ],
    })),
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn(() => ({
      id: "workspace_1",
      name: "Workspace",
      slug: "workspace",
      role,
      permissions: workspacePermissions(role),
    })),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [IntegrationsController],
    providers: [
      { provide: IntegrationsService, useValue: service },
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
    ],
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
        expect(
          body.providers.map((item: { provider: string }) => item.provider),
        ).toEqual(["meta", "uazapi", "asaas"]);
      });

    expect(service.getHealthSummary).toHaveBeenCalledOnce();

    await app.close();
  });

  it("returns Meta start action without calling Meta", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/start")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.action).toBe("configure_env");
        expect(body.missingEnv).toContain("META_APP_ID");
      });

    expect(service.getMetaStartAction).toHaveBeenCalledWith(
      "workspace_1",
      "user_1",
    );

    await app.close();
  });

  it("rejects Meta OAuth start when the displayed workspace changed", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/start?workspaceId=workspace_barbieri")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toContain("workspace da sessao mudou");
      });

    expect(service.getMetaStartAction).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects Meta OAuth start for workspace members", async () => {
    const { app, service } = await createApp("member");

    await request(app.getHttpServer())
      .get("/integrations/meta/start")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(403);

    expect(service.getMetaStartAction).not.toHaveBeenCalled();

    await app.close();
  });

  it("handles Meta OAuth callback through the backend service", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/callback?code=meta-code&state=state-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.provider).toBe("meta");
        expect(body.status).toBe("connected");
        expect(JSON.stringify(body)).not.toContain("access_token");
      });

    expect(service.handleMetaCallback).toHaveBeenCalledWith({
      code: "meta-code",
      state: "state-token",
    });

    await app.close();
  });

  it("renders Meta OAuth popup result for browser callbacks without requiring app cookies", async () => {
    const { app, service } = await createApp();
    const previousWebOrigin = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = "http://localhost:3000";

    await request(app.getHttpServer())
      .get("/integrations/meta/callback?code=meta-code&state=state-token")
      .set("Accept", "text/html")
      .expect(200)
      .expect("Content-Type", /html/)
      .expect(({ text }) => {
        expect(text).toContain("postMessage");
        expect(text).toContain("meta_oauth");
        expect(text).toContain("http://localhost:3000");
        expect(text).toContain("Conexao Meta concluida.");
        expect(text).not.toContain("access_token");
      });

    expect(service.handleMetaCallback).toHaveBeenCalledWith({
      code: "meta-code",
      state: "state-token",
    });

    process.env.WEB_ORIGIN = previousWebOrigin;
    await app.close();
  });

  it("does not render OAuth success before the workspace connection is persisted", async () => {
    const { app, service } = await createApp();
    service.handleMetaCallback.mockResolvedValueOnce({
      provider: "meta",
      status: "connected",
      tokenType: "bearer",
      expiresInSeconds: 5183944,
      scopes: ["ads_read"],
      missingEnv: [],
      message: "Meta OAuth conectado",
    } as never);

    await request(app.getHttpServer())
      .get("/integrations/meta/callback?code=meta-code&state=state-token")
      .set("Accept", "text/html")
      .expect(400)
      .expect(({ text }) => {
        expect(text).toContain("Falha ao conectar com Meta.");
        expect(text).toContain(
          "Conexao Meta nao foi salva para este workspace.",
        );
        expect(text).not.toContain("Conexao Meta concluida.");
      });

    await app.close();
  });

  it("renders provider errors inside the Meta OAuth popup", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/integrations/meta/callback?error=invalid_scope&error_description=Invalid%20Scopes",
      )
      .set("Accept", "text/html")
      .expect(400)
      .expect("Content-Type", /html/)
      .expect(({ text }) => {
        expect(text).toContain("Falha ao conectar com Meta.");
        expect(text).toContain("Invalid Scopes");
        expect(text).toContain("meta_oauth");
      });

    expect(service.handleMetaCallback).not.toHaveBeenCalled();

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
        expect(body.pages[0].name).toBe("Pagina Principal");
        expect(body.conversionDestination.pageId).toBe("page_1");
        expect(body.reportingAccounts[0].adAccountId).toBe("act_123");
        expect(JSON.stringify(body)).not.toContain("EAAB");
      });

    expect(service.getMetaAssets).toHaveBeenCalledWith("workspace_1");

    await app.close();
  });

  it("returns Meta assets for a requested business without saving selection", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/assets?businessId=business_2")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.businesses[0].name).toBe("BM Principal");
      });

    expect(service.getMetaAssets).toHaveBeenCalledWith(
      "workspace_1",
      "business_2",
    );

    await app.close();
  });

  it("refreshes Meta assets for integration managers", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .post("/integrations/meta/assets/refresh")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({ businessId: "business_1" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.businesses[0].name).toBe("BM Principal");
        expect(body.adAccounts[0].name).toBe("Conta WhatsApp");
      });

    expect(service.refreshMetaAssets).toHaveBeenCalledWith(
      "workspace_1",
      "business_1",
      "user_1",
    );

    await app.close();
  });

  it("rejects a Meta asset refresh when the current workspace is not connected", async () => {
    const { app, service } = await createApp();
    service.refreshMetaAssets.mockResolvedValueOnce({
      workspaceId: "workspace_1",
      status: "not_connected",
      businesses: [],
      adAccounts: [],
      pixels: [],
      pages: [],
      selection: {
        businessId: null,
        adAccountId: null,
        pixelId: null,
      },
      lastSyncedAt: null,
      syncError: null,
    } as never);

    await request(app.getHttpServer())
      .post("/integrations/meta/assets/refresh")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({ businessId: null })
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toContain(
          "Conecte uma conta Meta neste workspace",
        );
      });

    await app.close();
  });

  it("rejects Meta asset refresh for workspace members", async () => {
    const { app, service } = await createApp("member");

    await request(app.getHttpServer())
      .post("/integrations/meta/assets/refresh")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({ businessId: "business_1" })
      .expect(403);

    expect(service.refreshMetaAssets).not.toHaveBeenCalled();

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
        pixelId: "pixel_1",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.selectedBusinessId).toBe("business_1");
        expect(body.selectedAdAccountId).toBe("act_123");
        expect(body.selectedPixelId).toBe("pixel_1");
      });

    expect(service.saveMetaAssetSelection).toHaveBeenCalledWith(
      "workspace_1",
      {
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1",
      },
      "user_1",
    );

    await app.close();
  });

  it("rejects selected Meta asset changes for workspace members", async () => {
    const { app, service } = await createApp("member");

    await request(app.getHttpServer())
      .put("/integrations/meta/assets/selection")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1",
      })
      .expect(403);

    expect(service.saveMetaAssetSelection).not.toHaveBeenCalled();

    await app.close();
  });

  it("saves Meta CAPI token configuration for integration managers without echoing the token", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .put("/integrations/meta/capi-token")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        accessToken: "EAAB-capi-token-secret",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          workspaceId: "workspace_1",
          configured: true,
          updatedAt: "2026-07-02T04:00:00.000Z",
        });
        expect(JSON.stringify(body)).not.toContain("EAAB-capi-token-secret");
      });

    expect(service.saveMetaCapiToken).toHaveBeenCalledWith(
      "workspace_1",
      {
        accessToken: "EAAB-capi-token-secret",
        clear: false,
      },
      "user_1",
    );

    await app.close();
  });

  it("rejects Meta CAPI token changes for workspace members", async () => {
    const { app, service } = await createApp("member");

    await request(app.getHttpServer())
      .put("/integrations/meta/capi-token")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        accessToken: "EAAB-capi-token-secret",
      })
      .expect(403);

    expect(service.saveMetaCapiToken).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns Meta conversion destination for the current workspace", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/conversion-destination")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.status).toBe("needs_configuration");
      });

    expect(service.getMetaConversionDestination).toHaveBeenCalledWith(
      "workspace_1",
    );

    await app.close();
  });

  it("saves Meta conversion destination for integration managers", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .put("/integrations/meta/conversion-destination")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        pixelId: "pixel_1",
        pixelName: "Pixel Principal",
        pageId: "page_1",
        pageName: "Pagina Principal",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.pixelId).toBe("pixel_1");
        expect(body.pageId).toBe("page_1");
        expect(body.status).toBe("configured");
      });

    expect(service.saveMetaConversionDestination).toHaveBeenCalledWith(
      "workspace_1",
      {
        pixelId: "pixel_1",
        pixelName: "Pixel Principal",
        pageId: "page_1",
        pageName: "Pagina Principal",
      },
      "user_1",
    );

    await app.close();
  });

  it("rejects Meta conversion destination changes for workspace members", async () => {
    const { app, service } = await createApp("member");

    await request(app.getHttpServer())
      .put("/integrations/meta/conversion-destination")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        pixelId: "pixel_1",
        pixelName: "Pixel Principal",
        pageId: "page_1",
        pageName: "Pagina Principal",
      })
      .expect(403);

    expect(service.saveMetaConversionDestination).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns Meta reporting accounts for the current workspace", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/meta/reporting-accounts")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].id).toBe("reporting_1");
        expect(body[0].adAccountId).toBe("act_123");
      });

    expect(service.getMetaReportingAccounts).toHaveBeenCalledWith(
      "workspace_1",
    );

    await app.close();
  });

  it("saves Meta reporting accounts for integration managers", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .post("/integrations/meta/reporting-accounts")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        businessId: "business_1",
        businessName: "BM Principal",
        adAccountId: "act_123",
        adAccountName: "Conta WhatsApp",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe("reporting_1");
        expect(body.active).toBe(true);
      });

    expect(service.saveMetaReportingAccount).toHaveBeenCalledWith(
      "workspace_1",
      {
        businessId: "business_1",
        businessName: "BM Principal",
        adAccountId: "act_123",
        adAccountName: "Conta WhatsApp",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
      },
      "user_1",
    );

    await app.close();
  });

  it("updates Meta reporting account active status for integration managers", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .put("/integrations/meta/reporting-accounts/reporting_1/status")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({ active: false })
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].id).toBe("reporting_1");
        expect(body[0].active).toBe(false);
      });

    expect(service.setMetaReportingAccountActive).toHaveBeenCalledWith(
      "workspace_1",
      "reporting_1",
      false,
      "user_1",
    );

    await app.close();
  });

  it("rejects Meta reporting account writes for workspace members", async () => {
    const { app, service } = await createApp("member");

    await request(app.getHttpServer())
      .post("/integrations/meta/reporting-accounts")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        businessId: "business_1",
        businessName: "BM Principal",
        adAccountId: "act_123",
        adAccountName: "Conta WhatsApp",
      })
      .expect(403);

    await request(app.getHttpServer())
      .put("/integrations/meta/reporting-accounts/reporting_1/status")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({ active: false })
      .expect(403);

    expect(service.saveMetaReportingAccount).not.toHaveBeenCalled();
    expect(service.setMetaReportingAccountActive).not.toHaveBeenCalled();

    await app.close();
  });

  it("creates a manual Meta credential without echoing its access token", async () => {
    const { app, service } = await createApp("owner");
    const accessToken = "EAAB-manual-token-super-secret";

    await request(app.getHttpServer())
      .post("/integrations/meta/manual/credentials")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({ label: "Token BM Cliente", accessToken })
      .expect(201)
      .expect(({ body }) => {
        expect(body.credential.id).toBe("credential_1");
        expect(body.businesses[0].id).toBe("business_1");
        expect(JSON.stringify(body)).not.toContain(accessToken);
      });

    expect(service.createMetaManualCredential).toHaveBeenCalledWith(
      "workspace_1",
      { label: "Token BM Cliente", accessToken },
      "user_1",
    );

    await app.close();
  });

  it("disconnects OAuth from the current workspace after explicit confirmation", async () => {
    const { app, service } = await createApp("owner");

    await request(app.getHttpServer())
      .post("/integrations/meta/oauth/disconnect")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        expectedWorkspaceId: "workspace_1",
        confirmation: "DESCONECTAR META",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.status).toBe("not_connected");
        expect(body.preserved.reportingAccounts).toBe(1);
      });

    expect(service.disconnectMetaOAuth).toHaveBeenCalledWith(
      "workspace_1",
      {
        expectedWorkspaceId: "workspace_1",
        confirmation: "DESCONECTAR META",
      },
      "user_1",
    );

    await app.close();
  });

  it("rejects OAuth disconnects for members and stale workspace context", async () => {
    const memberApp = await createApp("member");

    await request(memberApp.app.getHttpServer())
      .post("/integrations/meta/oauth/disconnect")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        expectedWorkspaceId: "workspace_1",
        confirmation: "DESCONECTAR META",
      })
      .expect(403);
    expect(memberApp.service.disconnectMetaOAuth).not.toHaveBeenCalled();
    await memberApp.app.close();

    const ownerApp = await createApp("owner");

    await request(ownerApp.app.getHttpServer())
      .post("/integrations/meta/oauth/disconnect")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        expectedWorkspaceId: "workspace_other",
        confirmation: "DESCONECTAR META",
      })
      .expect(409);
    expect(ownerApp.service.disconnectMetaOAuth).not.toHaveBeenCalled();
    await ownerApp.app.close();
  });

  it("lets an admin test an exact manual Meta connection", async () => {
    const { app, service } = await createApp("admin");

    await request(app.getHttpServer())
      .post("/integrations/meta/manual/connections/connection_1/test")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(201)
      .expect(({ body }) => {
        expect(body.connectionId).toBe("connection_1");
        expect(body.status).toBe("active");
      });

    expect(service.testMetaManualBusinessConnection).toHaveBeenCalledWith(
      "workspace_1",
      "connection_1",
      "user_1",
    );

    await app.close();
  });

  it("rejects every manual Meta write for workspace members", async () => {
    const { app, service } = await createApp("member");

    await request(app.getHttpServer())
      .post("/integrations/meta/manual/credentials")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        label: "Token BM Cliente",
        accessToken: "EAAB-manual-token-super-secret",
      })
      .expect(403);

    await request(app.getHttpServer())
      .post("/integrations/meta/manual/connections/connection_1/test")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(403);

    expect(service.createMetaManualCredential).not.toHaveBeenCalled();
    expect(service.testMetaManualBusinessConnection).not.toHaveBeenCalled();

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

  it("returns integration pipeline overview for the current workspace", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/pipeline")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.stages[0].key).toBe("webhook");
        expect(body.stages[0].value).toBe(4);
      });

    expect(service.getPipelineOverview).toHaveBeenCalledWith("workspace_1");

    await app.close();
  });

  it("returns the WhatsApp data source for the current workspace", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/integrations/whatsapp/source")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          mode: "external",
          connectorName: "MySQL Barbieri",
          lastSyncStatus: "completed",
        });
      });

    expect(service.getWhatsappDataSource).toHaveBeenCalledWith("workspace_1");

    await app.close();
  });
});
