import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { LeadsController } from "../src/leads/leads.controller";
import { LeadsService } from "../src/leads/leads.service";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const session = {
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
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "owner"
    }
  ]
};

async function createApp() {
  const authService = {
    getSession: vi.fn(async () => session)
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn(() => ({
      ...session.workspaces[0],
      permissions: {
        canInviteMembers: true,
        canManageBilling: true,
        canManageIntegrations: true,
        canViewReports: true
      }
    }))
  };
  const leadsService = {
    listLeads: vi.fn(async () => [
      {
        id: "lead_1",
        workspaceId: "workspace_1",
        name: "Mariana Alves",
        phoneDisplay: "+55 11 *****-1020",
        phoneHash: "phone_hash_1",
        status: "qualified",
        source: "uazapi",
        campaignId: "cmp_1",
        campaignName: "Black Friday WhatsApp",
        adSetId: "adset_1",
        adId: "ad_1",
        lastEventName: "QualifiedLead",
        score: 86,
        firstMessageAt: "2026-07-02T03:00:00.000Z",
        lastMessageAt: "2026-07-02T03:10:00.000Z",
        createdAt: "2026-07-02T03:00:00.000Z",
        updatedAt: "2026-07-02T03:10:00.000Z"
      }
    ]),
    getLeadDetail: vi.fn(async () => ({
      lead: {
        id: "lead_1",
        workspaceId: "workspace_1",
        name: "Mariana Alves",
        phoneDisplay: "+55 11 *****-1020",
        phoneHash: "phone_hash_1",
        status: "qualified",
        source: "uazapi",
        campaignId: "cmp_1",
        campaignName: "Black Friday WhatsApp",
        adSetId: "adset_1",
        adId: "ad_1",
        lastEventName: "QualifiedLead",
        score: 86,
        firstMessageAt: "2026-07-02T03:00:00.000Z",
        lastMessageAt: "2026-07-02T03:10:00.000Z",
        createdAt: "2026-07-02T03:00:00.000Z",
        updatedAt: "2026-07-02T03:10:00.000Z"
      },
      attribution: {
        campaignName: "Black Friday WhatsApp",
        adSetName: "Publico quente",
        adName: "Criativo WhatsApp"
      },
      conversionEvents: [
        {
          id: "conversion_1",
          eventName: "QualifiedLead",
          status: "sent",
          sourceTrigger: "keyword",
          pixelId: "pixel_1",
          campaignId: "cmp_1",
          adSetId: "adset_1",
          adId: "ad_1",
          errorCode: null,
          errorMessage: null,
          sentAt: "2026-07-02T03:13:00.000Z",
          createdAt: "2026-07-02T03:12:00.000Z"
        }
      ],
      webhookEvents: [
        {
          id: "webhook_1",
          source: "uazapi",
          eventType: "message",
          status: "processed",
          errorCode: null,
          errorMessage: null,
          receivedAt: "2026-07-02T03:01:00.000Z",
          processedAt: "2026-07-02T03:01:01.000Z"
        }
      ]
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [LeadsController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
      { provide: LeadsService, useValue: leadsService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, leadsService };
}

describe("leads controller", () => {
  it("lists leads for the current workspace", async () => {
    const { app, leadsService } = await createApp();

    await request(app.getHttpServer())
      .get("/leads?search=mariana&status=qualified&limit=25")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].name).toBe("Mariana Alves");
        expect(body[0].lastEventName).toBe("QualifiedLead");
      });

    expect(leadsService.listLeads).toHaveBeenCalledWith("workspace_1", {
      search: "mariana",
      status: "qualified",
      limit: 25
    });

    await app.close();
  });

  it("forwards report drill-down filters to the leads service", async () => {
    const { app, leadsService } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/leads?campaignId=cmp_1&adSetId=adset_1&adId=ad_1&since=2026-07-01&until=2026-07-02"
      )
      .set("Authorization", "Bearer refresh-token")
      .expect(200);

    expect(leadsService.listLeads).toHaveBeenCalledWith("workspace_1", {
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      since: "2026-07-01",
      until: "2026-07-02",
      limit: 50
    });

    await app.close();
  });

  it("returns lead detail for the current workspace", async () => {
    const { app, leadsService } = await createApp();

    await request(app.getHttpServer())
      .get("/leads/lead_1")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.lead.name).toBe("Mariana Alves");
        expect(body.attribution.adName).toBe("Criativo WhatsApp");
        expect(body.conversionEvents[0].eventName).toBe("QualifiedLead");
        expect(body.webhookEvents[0].eventType).toBe("message");
      });

    expect(leadsService.getLeadDetail).toHaveBeenCalledWith(
      "workspace_1",
      "lead_1"
    );

    await app.close();
  });
});
