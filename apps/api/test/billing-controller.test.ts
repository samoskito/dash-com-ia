import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { BillingController } from "../src/billing/billing.controller";
import { BillingService } from "../src/billing/billing.service";
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
  const billingService = {
    getWhatsappInstanceQuote: vi.fn(async () => ({
      workspaceId: "workspace_1",
      activeInstances: 1,
      pricePerInstanceCents: 9900,
      nextInstanceAmountCents: 9900,
      currency: "BRL"
    })),
    getWorkspaceSubscriptionSummary: vi.fn(async () => ({
      workspaceId: "workspace_1",
      status: "active",
      planName: "Por instancia",
      activeInstances: 2,
      pricePerWhatsappInstanceCents: 9900,
      monthlyAmountCents: 19800,
      currentPeriodEnd: "2026-08-02T03:00:00.000Z",
      asaasSubscriptionId: "sub_asaas_1"
    })),
    createWhatsappInstanceCheckout: vi.fn(async () => ({
      workspaceId: "workspace_1",
      whatsappInstanceId: "wpp_1",
      activationId: "activation_1",
      chargeId: "charge_1",
      status: "pending_payment",
      amountCents: 9900,
      checkoutUrl: null
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [BillingController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
      { provide: BillingService, useValue: billingService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, billingService };
}

describe("billing controller", () => {
  it("returns WhatsApp instance quote for the current workspace", async () => {
    const { app, billingService } = await createApp();

    await request(app.getHttpServer())
      .get("/billing/whatsapp-instance/quote")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.currency).toBe("BRL");
        expect(body.nextInstanceAmountCents).toBe(9900);
      });

    expect(billingService.getWhatsappInstanceQuote).toHaveBeenCalledWith(
      "workspace_1"
    );

    await app.close();
  });

  it("returns subscription summary for the current workspace", async () => {
    const { app, billingService } = await createApp();

    await request(app.getHttpServer())
      .get("/billing/subscription")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("active");
        expect(body.monthlyAmountCents).toBe(19800);
      });

    expect(billingService.getWorkspaceSubscriptionSummary).toHaveBeenCalledWith(
      "workspace_1"
    );

    await app.close();
  });

  it("creates pending checkout for current workspace", async () => {
    const { app, billingService } = await createApp();

    await request(app.getHttpServer())
      .post("/billing/whatsapp-instance/checkout")
      .set("Authorization", "Bearer refresh-token")
      .send({
        instanceName: "Comercial",
        provider: "uazapi"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("pending_payment");
        expect(body.checkoutUrl).toBeNull();
      });

    expect(billingService.createWhatsappInstanceCheckout).toHaveBeenCalledWith(
      "workspace_1",
      {
        instanceName: "Comercial",
        provider: "uazapi"
      }
    );

    await app.close();
  });
});
