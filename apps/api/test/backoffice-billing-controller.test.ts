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
  it("lists payment charges for platform admins", async () => {
    const { app, billingService, platformAdminService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/billing/charges")
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
    expect(billingService.listBackofficePaymentCharges).toHaveBeenCalled();

    await app.close();
  });
});
