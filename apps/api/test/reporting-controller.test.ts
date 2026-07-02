import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { MetaReportSyncQueueService } from "../src/reporting/meta-report-sync-queue.service";
import { MetaReportingService } from "../src/reporting/meta-reporting.service";
import { ReportingController } from "../src/reporting/reporting.controller";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

async function createApp() {
  const reportingService = {
    getCampaignReportOverview: vi.fn(async () => ({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Black Friday WhatsApp",
          status: "active",
          spendCents: 120000,
          metaConversationsStarted: 176,
          costPerMetaConversationCents: 681,
          realConversations: 0,
          costPerRealConversationCents: null,
          leadSubmitted: 1,
          costPerLeadSubmittedCents: 120000,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: 120000,
          purchase: 1,
          costPerPurchaseCents: 120000,
          roas: null
        }
      ]
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
                  effectiveStatus: "ACTIVE"
                }
              ]
            }
          ]
        }
      ]
    })),
    syncWorkspaceMetaStructure: vi.fn(async () => ({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1
    }))
  };
  const queueService = {
    enqueueSync: vi.fn(async () => ({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      jobId: "meta-report-sync:workspace_1:2026-07-01:2026-07-02",
      status: "queued"
    }))
  };
  const authService = {
    getSession: vi.fn(async () => ({
      user: {
        id: "user_1",
        email: "owner@wpptrack.com",
        name: "Owner",
        authProvider: "email",
        emailVerifiedAt: null
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Workspace",
          slug: "workspace",
          role: "owner"
        }
      ]
    }))
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn(() => ({
      id: "workspace_1",
      name: "Workspace",
      slug: "workspace",
      role: "owner"
    }))
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [ReportingController],
    providers: [
      { provide: MetaReportingService, useValue: reportingService },
      { provide: MetaReportSyncQueueService, useValue: queueService },
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService }
    ]
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, queueService, reportingService };
}

describe("reporting controller", () => {
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
      rangeLabel: "Ultimos 7 dias"
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
        expect(body.jobId).toBe("meta-report-sync:workspace_1:2026-07-01:2026-07-02");
      });

    expect(queueService.enqueueSync).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });
    expect(reportingService.syncWorkspaceMetaStructure).not.toHaveBeenCalled();

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
          "Criativo WhatsApp"
        );
      });

    expect(reportingService.getMetaStructureReport).toHaveBeenCalledWith(
      "workspace_1"
    );

    await app.close();
  });
});
