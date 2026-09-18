import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { AdditiveWhatsappBillingService } from "../src/billing/additive-whatsapp-billing.service";
import { PackageBillingController } from "../src/billing/package-billing.controller";
import { PackageCheckoutService } from "../src/billing/package-checkout.service";
import { PackageContractService } from "../src/billing/package-contract.service";
import { PackagePlanService } from "../src/billing/package-plan.service";
import { PackageSubscriptionLifecycleService } from "../src/billing/package-subscription-lifecycle.service";
import { PackageUazapiProvisioningService } from "../src/billing/package-uazapi-provisioning.service";
import { WhatsappSeatService } from "../src/billing/whatsapp-seat.service";
import { WorkspacePackageAccessService } from "../src/billing/workspace-package-access.service";
import { IdempotencyGuard } from "../src/common/guards/idempotency.guard";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

async function createApp() {
  const authService = {
    getSession: vi.fn(async () => ({ user: { id: "user_1" } })),
  };
  const workspacesService = {
    getCurrentWorkspace: vi.fn(() => ({
      id: "workspace_1",
      permissions: { canManageBilling: true },
    })),
  };
  const additiveBilling = {
    addIndividualNumber: vi.fn(async () => ({
      subscriptionId: "subscription_1",
      itemId: "item_1",
      chargeId: "charge_1",
      addedCapacity: 0,
      capacity: 1,
      monthlyPriceCents: 3000,
      paymentAmountCents: 3000,
      checkoutUrl: "https://asaas.example.test/checkout_1",
      externalPaymentId: "payment_1",
      status: "awaiting_payment",
    })),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [PackageBillingController],
    providers: [
      IdempotencyGuard,
      { provide: AuthService, useValue: authService },
      { provide: WorkspacesService, useValue: workspacesService },
      { provide: AdditiveWhatsappBillingService, useValue: additiveBilling },
      { provide: PackagePlanService, useValue: {} },
      { provide: PackageContractService, useValue: {} },
      { provide: PackageCheckoutService, useValue: {} },
      { provide: PackageSubscriptionLifecycleService, useValue: {} },
      { provide: PackageUazapiProvisioningService, useValue: {} },
      { provide: WhatsappSeatService, useValue: {} },
      { provide: WorkspacePackageAccessService, useValue: {} },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { additiveBilling, app };
}

describe("PackageBillingController additive checkout", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("requires Idempotency-Key before creating an additive R$30 charge", async () => {
    const { additiveBilling, app } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/billing/package/add-number")
      .set("Authorization", "Bearer refresh-token")
      .send({})
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toBe("Header Idempotency-Key é obrigatório");
      });

    expect(additiveBilling.addIndividualNumber).not.toHaveBeenCalled();
  });

  it("passes the required Idempotency-Key header to the additive billing service", async () => {
    const { additiveBilling, app } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/billing/package/add-number")
      .set("Authorization", "Bearer refresh-token")
      .set("Idempotency-Key", "request-0001")
      .send({})
      .expect(201);

    expect(additiveBilling.addIndividualNumber).toHaveBeenCalledWith(
      "workspace_1",
      "user_1",
      "request-0001",
    );
  });
});
