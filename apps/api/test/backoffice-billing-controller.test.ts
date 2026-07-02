import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { BackofficeBillingController } from "../src/billing/backoffice-billing.controller";
import { BillingService } from "../src/billing/billing.service";

async function createApp() {
  const platformAdminService = {
    assertPlatformAdmin: vi.fn(async () => ({
      id: "user_1",
      email: "owner@wpptrack.com"
    }))
  };
  const billingService = {
    listBackofficeSubscriptionPlans: vi.fn(async () => [
      {
        id: "plan_1",
        name: "Plano Growth",
        slug: "growth",
        pricePerWhatsappInstanceCents: 12900,
        active: true,
        createdAt: "2026-07-02T03:00:00.000Z",
        updatedAt: "2026-07-02T03:00:00.000Z"
      }
    ]),
    createBackofficeSubscriptionPlan: vi.fn(async () => ({
      id: "plan_2",
      name: "Plano Pro",
      slug: "pro",
      pricePerWhatsappInstanceCents: 19900,
      active: true,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:00:00.000Z"
    })),
    updateBackofficeSubscriptionPlan: vi.fn(async () => ({
      id: "plan_1",
      name: "Plano Growth",
      slug: "growth",
      pricePerWhatsappInstanceCents: 14900,
      active: false,
      createdAt: "2026-07-02T03:00:00.000Z",
      updatedAt: "2026-07-02T03:30:00.000Z"
    })),
    listBackofficePaymentCharges: vi.fn(async () => [
      {
        id: "charge_1",
        workspaceId: "workspace_1",
        workspaceName: "Comunidade NOD",
        provider: "asaas",
        externalChargeId: "pay_asaas_1",
        status: "paid",
        amountCents: 12900,
        description: "Ativacao da instancia WhatsApp Comercial",
        checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_1",
        dueAt: null,
        paidAt: "2026-07-02T12:00:00.000Z",
        createdAt: "2026-07-02T11:00:00.000Z",
        whatsappInstanceId: "wpp_1",
        whatsappInstanceName: "Comercial"
      }
    ])
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BackofficeBillingController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdminService },
      { provide: BillingService, useValue: billingService }
    ]
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, billingService, platformAdminService };
}

describe("backoffice billing controller", () => {
  it("lists subscription plans for platform admins", async () => {
    const { app, billingService, platformAdminService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/billing/plans")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].slug).toBe("growth");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(billingService.listBackofficeSubscriptionPlans).toHaveBeenCalled();

    await app.close();
  });

  it("creates subscription plans for platform admins", async () => {
    const { app, billingService, platformAdminService } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/billing/plans")
      .set("Authorization", "Bearer refresh-token")
      .send({
        name: "Plano Pro",
        slug: "pro",
        pricePerWhatsappInstanceCents: 19900,
        active: true
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe("plan_2");
        expect(body.pricePerWhatsappInstanceCents).toBe(19900);
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(billingService.createBackofficeSubscriptionPlan).toHaveBeenCalledWith(
      {
        name: "Plano Pro",
        slug: "pro",
        pricePerWhatsappInstanceCents: 19900,
        active: true
      },
      "user_1"
    );

    await app.close();
  });

  it("updates subscription plans for platform admins", async () => {
    const { app, billingService, platformAdminService } = await createApp();

    await request(app.getHttpServer())
      .patch("/backoffice/billing/plans/plan_1")
      .set("Authorization", "Bearer refresh-token")
      .send({
        pricePerWhatsappInstanceCents: 14900,
        active: false
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe("plan_1");
        expect(body.active).toBe(false);
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(billingService.updateBackofficeSubscriptionPlan).toHaveBeenCalledWith(
      "plan_1",
      {
        pricePerWhatsappInstanceCents: 14900,
        active: false
      },
      "user_1"
    );

    await app.close();
  });

  it("lists payment charges for platform admins", async () => {
    const { app, billingService, platformAdminService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/billing/charges?status=paid&workspaceId=workspace_1")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe("charge_1");
        expect(body[0].workspaceName).toBe("Comunidade NOD");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(billingService.listBackofficePaymentCharges).toHaveBeenCalledWith({
      status: "paid",
      workspaceId: "workspace_1"
    });

    await app.close();
  });
});
