import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { BackofficePackageBillingController } from "../src/billing/backoffice-package-billing.controller";
import { LegacyBillingBackfillService } from "../src/billing/legacy-billing-backfill.service";
import { PackageBillingReconciliationService } from "../src/billing/package-billing-reconciliation.service";
import { PackageContractService } from "../src/billing/package-contract.service";
import { PackageFiscalService } from "../src/billing/package-fiscal.service";
import { PackagePlanService } from "../src/billing/package-plan.service";

async function createApp() {
  const platformAdminService = {
    assertPlatformAdmin: vi.fn(),
    assertPlatformOwner: vi.fn(async () => ({ id: "owner_1" })),
  };
  const contracts = {
    cancelStaleContract: vi.fn(async () => ({
      id: "contract_1",
      contractStatus: "canceled",
    })),
    startTrial: vi.fn(async () => ({ id: "trial_1", contractStatus: "exempt" })),
    disableTrialAutoconvert: vi.fn(async () => ({
      id: "trial_1",
      trialAutoconvertDisabled: true,
    })),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BackofficePackageBillingController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdminService },
      { provide: PackagePlanService, useValue: {} },
      { provide: PackageContractService, useValue: contracts },
      { provide: PackageFiscalService, useValue: {} },
      { provide: PackageBillingReconciliationService, useValue: {} },
      { provide: LegacyBillingBackfillService, useValue: {} },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, contracts, platformAdminService };
}

describe("backoffice package billing controller", () => {
  it("starts a one- or three-seat trial for a platform owner", async () => {
    const { app, contracts } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/billing/package-contracts/workspace_1/start-trial")
      .set("Authorization", "Bearer refresh-token")
      .send({ capacity: 3, reason: "Trial aprovado pelo comercial" })
      .expect(201)
      .expect(({ body }) => expect(body.contractStatus).toBe("exempt"));

    expect(contracts.startTrial).toHaveBeenCalledWith(
      "workspace_1",
      { capacity: 3, reason: "Trial aprovado pelo comercial" },
      "owner_1",
    );
    await app.close();
  });

  it("records a contract-level automatic-conversion opt-out", async () => {
    const { app, contracts } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/billing/package-contracts/workspace_1/trial-autoconvert/disable",
      )
      .set("Authorization", "Bearer refresh-token")
      .send({ reason: "Cliente com excecao comercial" })
      .expect(201);

    expect(contracts.disableTrialAutoconvert).toHaveBeenCalledWith(
      "workspace_1",
      "Cliente com excecao comercial",
      "owner_1",
    );
    await app.close();
  });

  it("lets a platform owner end a stale package contract", async () => {
    const { app, contracts, platformAdminService } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/billing/package-contracts/workspace_1/subscriptions/contract_1/cancel",
      )
      .set("Authorization", "Bearer refresh-token")
      .send({ reason: "Encerrar rascunho antigo" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.contractStatus).toBe("canceled");
      });

    expect(platformAdminService.assertPlatformOwner).toHaveBeenCalledWith(
      "refresh-token",
    );
    expect(contracts.cancelStaleContract).toHaveBeenCalledWith(
      "workspace_1",
      "contract_1",
      "owner_1",
      "Encerrar rascunho antigo",
    );
    await app.close();
  });

  it("rejects a cancellation reason shorter than three characters", async () => {
    const { app, contracts } = await createApp();

    await request(app.getHttpServer())
      .post(
        "/backoffice/billing/package-contracts/workspace_1/subscriptions/contract_1/cancel",
      )
      .set("Authorization", "Bearer refresh-token")
      .send({ reason: "no" })
      .expect(400);

    expect(contracts.cancelStaleContract).not.toHaveBeenCalled();
    await app.close();
  });
});
