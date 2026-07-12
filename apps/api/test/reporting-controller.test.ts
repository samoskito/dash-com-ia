import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { MetaReportSyncQueueService } from "../src/reporting/meta-report-sync-queue.service";
import { MetaReportingService } from "../src/reporting/meta-reporting.service";
import { ReportingController } from "../src/reporting/reporting.controller";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const reportMetricsFixture = {
  spendCents: 120000,
  metaConversationsStarted: 176,
  costPerMetaConversationCents: 681,
  realConversations: 2,
  costPerRealConversationCents: 60000,
  organicLeads: 0,
  totalReceived: 2,
  trackingRate: 1,
  qualifiedLead: 1,
  costPerQualifiedLeadCents: 120000,
  purchases: 1,
  firstPurchases: 1,
  repurchases: 0,
  costPerPurchaseCents: 120000,
  trafficRevenueCents: 100000,
  organicRevenueCents: 0,
  totalRevenueCents: 100000,
  firstPurchaseRevenueCents: 100000,
  repurchaseRevenueCents: 0,
  roasAcquisition: 100000 / 120000,
  roasWithRepurchase: 100000 / 120000,
  funnelSteps: [
    {
      key: "real_conversations",
      label: "Conversas reais iniciadas",
      value: 2,
      costCents: 60000,
    },
    {
      key: "qualified_lead",
      label: "Lead qualificado",
      value: 1,
      costCents: 120000,
    },
    {
      key: "purchase",
      label: "Compras",
      value: 1,
      costCents: 120000,
    },
    {
      key: "first_purchase",
      label: "Primeira compra",
      value: 1,
      costCents: 120000,
    },
  ],
};

async function createApp(role: "owner" | "admin" | "member" = "owner") {
  const reportingService = {
    getCampaignReportOverview: vi.fn(async () => ({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Black Friday WhatsApp",
          status: "active",
          ...reportMetricsFixture,
        },
      ],
    })),
    getMetaStructureReport: vi.fn(async () => ({
      workspaceId: "workspace_1",
      campaigns: [
        {
          id: "cmp_1",
          name: "Black Friday WhatsApp",
          status: "ACTIVE",
          effectiveStatus: "ACTIVE",
          objective: "OUTCOME_SALES",
          adSets: [
            {
              id: "adset_1",
              name: "Publico quente",
              status: "ACTIVE",
              effectiveStatus: "ACTIVE",
              ads: [
                {
                  id: "ad_1",
                  name: "Criativo WhatsApp",
                  status: "ACTIVE",
                  effectiveStatus: "ACTIVE",
                },
              ],
            },
          ],
        },
      ],
    })),
    getAdSetReportOverview: vi.fn(async () => ({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      adSets: [
        {
          id: "adset_1",
          campaignId: "cmp_1",
          campaignName: "Black Friday WhatsApp",
          name: "Publico quente",
          status: "active",
          ...reportMetricsFixture,
        },
      ],
    })),
    getAdReportOverview: vi.fn(async () => ({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      ads: [
        {
          id: "ad_1",
          campaignId: "cmp_1",
          campaignName: "Black Friday WhatsApp",
          adSetId: "adset_1",
          adSetName: "Publico quente",
          name: "Criativo WhatsApp",
          status: "active",
          ...reportMetricsFixture,
        },
      ],
    })),
    getConversionEventAudit: vi.fn(async () => ({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      events: [
        {
          id: "conversion_1",
          eventName: "LeadSubmitted",
          eventLabel: "Conversas reais iniciadas",
          leadId: "lead_1",
          phoneHash: "phone_hash_1",
          campaignId: "cmp_1",
          adSetId: "adset_1",
          adId: "ad_1",
          pixelId: "pixel_1",
          pageId: "page_1",
          occurredAt: "2026-07-02T12:00:00.000Z",
          sentAt: "2026-07-02T12:01:00.000Z",
          status: "sent",
          providerResponseSummary: "events_received: 1",
          errorCode: null,
          errorMessage: null,
        },
      ],
    })),
    getCampaignReportCsv: vi.fn(async () => ({
      filename: "wpptrack-campanhas-2026-07-01-2026-07-02.csv",
      content:
        "Campanha,Status,Investimento,Conversas Meta,Conversas reais,Leads organicos,Total recebido,Taxa de rastreio,Lead qualificado,Compras,Primeiras compras,Recompras,Receita total,ROAS aquisicao,ROAS com recompra\n" +
        "Black Friday WhatsApp,active,1200.00,176,2,0,2,1,1,1,1,0,1000.00,0.8333333333333334,0.8333333333333334\n",
    })),
    saveWhatsappClassificationOverride: vi.fn(async () => ({ ok: true })),
    syncWorkspaceMetaStructure: vi.fn(async () => ({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1,
    })),
  };
  const queueService = {
    enqueueSync: vi.fn(async () => ({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      jobId: "meta-report-sync_workspace_1_2026-07-01_2026-07-02",
      status: "queued",
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
    })),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [ReportingController],
    providers: [
      { provide: MetaReportingService, useValue: reportingService },
      { provide: MetaReportSyncQueueService, useValue: queueService },
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, queueService, reportingService };
}

describe("reporting controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns campaign reports for the current workspace", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/campaigns")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.campaigns[0].name).toBe("Black Friday WhatsApp");
      });

    expect(reportingService.getCampaignReportOverview).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-04",
      until: "2026-07-10",
      rangeLabel: "Ultimos 7 dias",
    });

    await app.close();
  });

  it("requests the workspace summary only when explicitly enabled", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/campaigns?includeSummary=true")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200);

    expect(reportingService.getCampaignReportOverview).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-04",
      until: "2026-07-10",
      rangeLabel: "Ultimos 7 dias",
      includeSummary: true,
    });

    await app.close();
  });

  it("returns conversion event audit for the current workspace period", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/conversions/audit?since=2026-07-01&until=2026-07-02")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.events[0].eventLabel).toBe("Conversas reais iniciadas");
      });

    expect(reportingService.getConversionEventAudit).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      rangeLabel: "2026-07-01 a 2026-07-02",
    });

    await app.close();
  });

  it("passes report period filters to campaign reports", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/campaigns?since=2026-07-01&until=2026-07-02")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200);

    expect(reportingService.getCampaignReportOverview).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      rangeLabel: "2026-07-01 a 2026-07-02",
    });

    await app.close();
  });

  it("passes Meta account and WhatsApp classification filters to campaign reports", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/reports/campaigns?businessId=business_1&adAccountId=act_123&whatsappClassification=all",
      )
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200);

    expect(reportingService.getCampaignReportOverview).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-04",
      until: "2026-07-10",
      rangeLabel: "Ultimos 7 dias",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "all",
    });

    await app.close();
  });

  it("passes name scope and status filters to all report levels", async () => {
    const { app, reportingService } = await createApp();
    const query =
      "nameScope=adset&nameContains=BPC&status=active&businessId=business_1&adAccountId=act_123";

    await request(app.getHttpServer())
      .get(`/reports/campaigns?${query}`)
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200);
    await request(app.getHttpServer())
      .get(`/reports/adsets?${query}`)
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200);
    await request(app.getHttpServer())
      .get(`/reports/ads?${query}`)
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200);

    const expected = {
      workspaceId: "workspace_1",
      since: "2026-07-04",
      until: "2026-07-10",
      rangeLabel: "Ultimos 7 dias",
      businessId: "business_1",
      adAccountId: "act_123",
      nameScope: "adset",
      nameContains: "BPC",
      status: "active",
    };

    expect(reportingService.getCampaignReportOverview).toHaveBeenCalledWith(
      expected,
    );
    expect(reportingService.getAdSetReportOverview).toHaveBeenCalledWith(
      expected,
    );
    expect(reportingService.getAdReportOverview).toHaveBeenCalledWith(expected);

    await app.close();
  });

  it("passes validated pagination to the selected report level", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/adsets?page=3&pageSize=25")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200);

    expect(reportingService.getAdSetReportOverview).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-04",
      until: "2026-07-10",
      rangeLabel: "Ultimos 7 dias",
      page: 3,
      pageSize: 25,
    });

    await app.close();
  });

  it("rejects invalid WhatsApp classification filters", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/campaigns?whatsappClassification=invalid")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe("Filtro de classificacao invalido");
      });

    expect(reportingService.getCampaignReportOverview).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects invalid report name and status filters", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/campaigns?nameScope=creative&nameContains=BPC")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe("Filtro de nome invalido");
      });

    await request(app.getHttpServer())
      .get("/reports/campaigns?status=learning")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe("Filtro de status invalido");
      });

    expect(reportingService.getCampaignReportOverview).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects repeated report filters", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/reports/campaigns?whatsappClassification=all&whatsappClassification=whatsapp",
      )
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe("Filtro de relatorio invalido");
      });

    expect(reportingService.getCampaignReportOverview).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects invalid report period filters", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/campaigns?since=ontem&until=2026-07-02")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(400);

    expect(reportingService.getCampaignReportOverview).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects inverted report periods before queueing sync", async () => {
    const { app, queueService } = await createApp();

    await request(app.getHttpServer())
      .post("/reports/meta/sync?since=2026-07-03&until=2026-07-02")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(400);

    expect(queueService.enqueueSync).not.toHaveBeenCalled();

    await app.close();
  });

  it("exports campaign reports as CSV for the current workspace", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/reports/campaigns/export.csv?since=2026-07-01&until=2026-07-02&businessId=business_1&adAccountId=act_123&whatsappClassification=all",
      )
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect("Content-Type", /text\/csv/)
      .expect(
        "Content-Disposition",
        /wpptrack-campanhas-2026-07-01-2026-07-02.csv/,
      )
      .expect((response) => {
        expect(response.text).toContain("Campanha,Status,Investimento");
        expect(response.text).toContain("Black Friday WhatsApp");
      });

    expect(reportingService.getCampaignReportCsv).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      rangeLabel: "2026-07-01 a 2026-07-02",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "all",
    });

    await app.close();
  });

  it("queues Meta reporting snapshot sync for the current workspace", async () => {
    const { app, queueService, reportingService } = await createApp();

    await request(app.getHttpServer())
      .post("/reports/meta/sync?since=2026-07-01&until=2026-07-02")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("queued");
        expect(body.jobId).toBe(
          "meta-report-sync_workspace_1_2026-07-01_2026-07-02",
        );
      });

    expect(queueService.enqueueSync).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });
    expect(reportingService.syncWorkspaceMetaStructure).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects Meta reporting sync for workspace members", async () => {
    const { app, queueService } = await createApp("member");

    await request(app.getHttpServer())
      .post("/reports/meta/sync?since=2026-07-01&until=2026-07-02")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(403);

    expect(queueService.enqueueSync).not.toHaveBeenCalled();

    await app.close();
  });

  it("saves manual WhatsApp classification overrides for the current workspace", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .put("/reports/meta/whatsapp-classification")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        level: "campaign",
        id: "cmp_1",
        override: "manual_include",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });

    expect(
      reportingService.saveWhatsappClassificationOverride,
    ).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      actorUserId: "user_1",
      level: "campaign",
      id: "cmp_1",
      override: "manual_include",
    });

    await app.close();
  });

  it("rejects WhatsApp classification overrides for workspace members", async () => {
    const { app, reportingService } = await createApp("member");

    await request(app.getHttpServer())
      .put("/reports/meta/whatsapp-classification")
      .set("Cookie", "wpptrack_session=refresh-token")
      .send({
        level: "campaign",
        id: "cmp_1",
        override: "manual_include",
      })
      .expect(403);

    expect(
      reportingService.saveWhatsappClassificationOverride,
    ).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns Meta campaign structure for the current workspace", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get("/reports/meta/structure")
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.campaigns[0].adSets[0].ads[0].name).toBe(
          "Criativo WhatsApp",
        );
      });

    expect(reportingService.getMetaStructureReport).toHaveBeenCalledWith(
      "workspace_1",
    );

    await app.close();
  });

  it("returns ad set reports for the current workspace", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/reports/adsets?since=2026-07-01&until=2026-07-02&businessId=business_1&adAccountId=act_123&whatsappClassification=needs_review",
      )
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.adSets[0].name).toBe("Publico quente");
      });

    expect(reportingService.getAdSetReportOverview).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      rangeLabel: "2026-07-01 a 2026-07-02",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "needs_review",
    });

    await app.close();
  });

  it("returns ad reports for the current workspace", async () => {
    const { app, reportingService } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/reports/ads?since=2026-07-01&until=2026-07-02&businessId=business_1&adAccountId=act_123&whatsappClassification=excluded",
      )
      .set("Cookie", "wpptrack_session=refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.ads[0].name).toBe("Criativo WhatsApp");
      });

    expect(reportingService.getAdReportOverview).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      rangeLabel: "2026-07-01 a 2026-07-02",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "excluded",
    });

    await app.close();
  });
});
