import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { ConversionRulesController } from "../src/conversion-rules/conversion-rules.controller";
import { ConversionRulesService } from "../src/conversion-rules/conversion-rules.service";
import { FunnelConfigurationService } from "../src/conversion-rules/funnel-configuration.service";
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

async function createApp(role: "owner" | "admin" | "member" = "owner") {
  const authService = {
    getSession: vi.fn(async () => ({
      ...session,
      workspaces: [
        {
          ...session.workspaces[0],
          role
        }
      ]
    }))
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn(() => ({
      ...session.workspaces[0],
      role,
      permissions: {
        canInviteMembers: role === "owner",
        canManageMembers: role === "owner",
        canGrantMemberManager: role === "owner",
        canManageBilling: role === "owner",
        canManageIntegrations: role === "owner" || role === "admin",
        canManageWorkspaceSettings: role === "owner" || role === "admin",
        canTransferOwnership: role === "owner",
        canViewReports: true,
        canExportReports: true
      }
    }))
  };
  const conversionRulesService = {
    listRules: vi.fn(async () => []),
    createRule: vi.fn(async () => ({
      id: "rule_1",
      workspaceId: "workspace_1",
      name: "Lead qualificado",
      triggerType: "keyword",
      triggerValue: "quero comprar",
      matchMode: "contains",
      eventName: "QualifiedLead",
      pixelId: null,
      active: true,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z"
    })),
    updateRule: vi.fn(async () => ({
      id: "rule_1",
      workspaceId: "workspace_1",
      name: "Lead qualificado",
      triggerType: "keyword",
      triggerValue: "quero comprar",
      matchMode: "contains",
      eventName: "QualifiedLead",
      pixelId: null,
      active: false,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z"
    })),
    evaluateTriggers: vi.fn(async () => [])
  };
  const funnelConfigurationService = {
    getConfiguration: vi.fn(async () => ({
      stages: [
        {
          eventName: "LeadSubmitted",
          label: "Conversas reais iniciadas",
          position: 1,
          visible: true
        }
      ]
    })),
    updateConfiguration: vi.fn(async (_workspaceId: string, input: unknown) => input)
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [ConversionRulesController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
      { provide: ConversionRulesService, useValue: conversionRulesService },
      { provide: FunnelConfigurationService, useValue: funnelConfigurationService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, conversionRulesService, funnelConfigurationService };
}

describe("conversion rules controller", () => {
  it("creates keyword rules for the current workspace", async () => {
    const { app, conversionRulesService } = await createApp();

    await request(app.getHttpServer())
      .post("/conversion-rules")
      .set("Authorization", "Bearer refresh-token")
      .send({
        name: "Lead qualificado",
        triggerType: "keyword",
        triggerValue: "quero comprar",
        matchMode: "contains",
        eventName: "QualifiedLead",
        active: true
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.workspaceId).toBe("workspace_1");
        expect(body.triggerType).toBe("keyword");
      });

    expect(conversionRulesService.createRule).toHaveBeenCalledWith(
      "workspace_1",
      {
        name: "Lead qualificado",
        triggerType: "keyword",
        triggerValue: "quero comprar",
        matchMode: "contains",
        eventName: "QualifiedLead",
        active: true
      },
      "user_1"
    );

    await app.close();
  });

  it("rejects rule creation for workspace members", async () => {
    const { app, conversionRulesService } = await createApp("member");

    await request(app.getHttpServer())
      .post("/conversion-rules")
      .set("Authorization", "Bearer refresh-token")
      .send({
        name: "Lead qualificado",
        triggerType: "keyword",
        triggerValue: "quero comprar",
        matchMode: "contains",
        eventName: "QualifiedLead",
        active: true
      })
      .expect(403);

    expect(conversionRulesService.createRule).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects rule updates for workspace members", async () => {
    const { app, conversionRulesService } = await createApp("member");

    await request(app.getHttpServer())
      .patch("/conversion-rules/rule_1")
      .set("Authorization", "Bearer refresh-token")
      .send({
        active: false
      })
      .expect(403);

    expect(conversionRulesService.updateRule).not.toHaveBeenCalled();

    await app.close();
  });

  it("evaluates a webhook payload against active rules without sending Meta events", async () => {
    const { app, conversionRulesService } = await createApp();

    await request(app.getHttpServer())
      .post("/conversion-rules/evaluate")
      .set("Authorization", "Bearer refresh-token")
      .send({
        messageText: "Quero comprar",
        labels: ["Venda fechada"]
      })
      .expect(201);

    expect(conversionRulesService.evaluateTriggers).toHaveBeenCalledWith("workspace_1", {
      messageText: "Quero comprar",
      labels: ["Venda fechada"]
    });

    await app.close();
  });

  it("returns and updates the ordered funnel configuration", async () => {
    const { app, funnelConfigurationService } = await createApp();

    await request(app.getHttpServer())
      .get("/conversion-rules/funnel")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.stages[0].eventName).toBe("LeadSubmitted");
      });

    const stages = [
      {
        eventName: "QualifiedLead",
        label: "Oportunidade",
        position: 1,
        visible: true
      },
      {
        eventName: "Purchase",
        label: "Vendas",
        position: 2,
        visible: false
      }
    ];

    await request(app.getHttpServer())
      .put("/conversion-rules/funnel")
      .set("Authorization", "Bearer refresh-token")
      .send({ stages })
      .expect(200);

    expect(funnelConfigurationService.updateConfiguration).toHaveBeenCalledWith(
      "workspace_1",
      { stages },
      "user_1"
    );

    await app.close();
  });

  it("rejects funnel updates for workspace members", async () => {
    const { app, funnelConfigurationService } = await createApp("member");

    await request(app.getHttpServer())
      .put("/conversion-rules/funnel")
      .set("Authorization", "Bearer refresh-token")
      .send({
        stages: [
          {
            eventName: "QualifiedLead",
            label: "Oportunidade",
            position: 1,
            visible: true
          }
        ]
      })
      .expect(403);

    expect(funnelConfigurationService.updateConfiguration).not.toHaveBeenCalled();

    await app.close();
  });
});
