import { describe, expect, it, vi } from "vitest";
import { PackageContractService } from "../src/billing/package-contract.service";

type ContractFixture = {
  id: string;
  workspaceId: string;
  planId: string;
  contractStatus: string;
  status?: string;
  isCurrent: boolean;
  planNameSnapshot: string;
  planVersionSnapshot: number;
  monthlyPriceCentsSnapshot: number;
  includedWhatsappNumbersSnapshot: number;
  asaasSubscriptionId?: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  accessEndsAt: Date | null;
  activatedAt: Date | null;
};

const pendingContract: ContractFixture = {
  id: "contract_new",
  workspaceId: "workspace_1",
  planId: "plan_1",
  contractStatus: "awaiting_payment",
  isCurrent: false,
  planNameSnapshot: "Pacote 3 numeros",
  planVersionSnapshot: 1,
  monthlyPriceCentsSnapshot: 5000,
  includedWhatsappNumbersSnapshot: 3,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  accessEndsAt: null,
  activatedAt: null,
};

function createHarness(
  occupiedSeats = 2,
  contract: ContractFixture = pendingContract,
) {
  const activated = {
    ...contract,
    contractStatus: "active",
    isCurrent: true,
    currentPeriodStart: new Date("2026-07-26T12:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-26T12:00:00.000Z"),
    activatedAt: new Date("2026-07-26T12:00:00.000Z"),
  };
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    workspaceSubscription: {
      findUnique: vi.fn().mockResolvedValue(contract),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue(activated),
    },
    whatsappSeat: {
      count: vi.fn().mockResolvedValue(occupiedSeats),
    },
    billingContractAudit: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" }),
    },
  };
  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
  };
  const seats = {
    bindWorkspaceSeatsToContract: vi.fn().mockResolvedValue(2),
  };
  const service = new PackageContractService(
    prisma as never,
    {} as never,
    {} as never,
    seats as never,
  );

  return { activated, prisma, seats, service, transaction };
}

function createCancellationHarness(contract: ContractFixture | null) {
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    workspaceSubscription: {
      findFirst: vi.fn().mockResolvedValue(contract),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        ...contract,
        ...data,
      })),
    },
    billingContractAudit: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" }),
    },
  };
  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
  };
  const service = new PackageContractService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { prisma, service, transaction };
}

describe("PackageContractService", () => {
  it("reports effective capacity from verified paid additions without double-counting active items", async () => {
    const current = {
      ...pendingContract,
      contractStatus: "active",
      isCurrent: true,
      billingMethod: "pix",
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      fiscalStatus: "not_configured",
      whatsappSeats: [{ status: "active" }],
      items: [
        {
          id: "active_item",
          key: "individual-whatsapp-number",
          nameSnapshot: "Numero WhatsApp adicional",
          quantity: 1,
          capacityPerUnit: 1,
          monthlyPriceCentsPerUnit: 3000,
          status: "active",
          providerSyncStatus: "synced",
          paymentCharge: { status: "paid", amountCents: 3000 },
        },
        {
          id: "retry_item_1",
          key: "individual-whatsapp-number",
          nameSnapshot: "Numero WhatsApp adicional",
          quantity: 1,
          capacityPerUnit: 1,
          monthlyPriceCentsPerUnit: 3000,
          status: "pending_payment",
          providerSyncStatus: "failed",
          paymentCharge: { status: "paid", amountCents: 3000 },
        },
        {
          id: "retry_item_2",
          key: "individual-whatsapp-number",
          nameSnapshot: "Numero WhatsApp adicional",
          quantity: 1,
          capacityPerUnit: 1,
          monthlyPriceCentsPerUnit: 3000,
          status: "pending_payment",
          providerSyncStatus: "pending",
          paymentCharge: { status: "paid", amountCents: 3000 },
        },
        {
          id: "unpaid_item",
          key: "individual-whatsapp-number",
          nameSnapshot: "Numero WhatsApp adicional",
          quantity: 1,
          capacityPerUnit: 1,
          monthlyPriceCentsPerUnit: 3000,
          status: "pending_payment",
          providerSyncStatus: "not_required",
          paymentCharge: { status: "pending", amountCents: 3000 },
        },
      ],
    };
    const prisma = {
      workspaceBillingProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      workspaceSubscription: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce(null),
      },
      billingInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new PackageContractService(
      prisma as never,
      { listPublicPlans: vi.fn().mockResolvedValue([]) } as never,
      {
        isEnforcementEnabled: () => false,
        isPackageBillingEnabled: () => true,
        isAsaasRecurringEnabled: () => true,
        isLifecycleEnabled: () => true,
        isFiscalEnabled: () => false,
        isUazapiProvisioningEnabled: () => false,
        isExternalChannelEnforcementEnabled: () => false,
      } as never,
      {} as never,
    );

    const state = await service.getWorkspaceBillingState("workspace_1");

    // The snapshot already includes active_item; only the two paid-but-unsynced
    // items are temporarily additive.
    expect(state.seats).toMatchObject({
      capacity: 5,
      occupied: 1,
      available: 4,
    });
    expect(state.contract?.includedWhatsappNumbers).toBe(5);
    expect(state.contract?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "retry_item_1",
          providerSyncStatus: "failed",
        }),
        expect.objectContaining({
          id: "unpaid_item",
          providerSyncStatus: "not_required",
        }),
      ]),
    );
  });

  it("activates the paid contract without promoting reserved QR seats", async () => {
    const { seats, service } = createHarness();
    const periodStart = new Date("2026-07-26T12:00:00.000Z");
    const periodEnd = new Date("2026-08-26T12:00:00.000Z");

    const result = await service.activatePaidContract({
      subscriptionId: "contract_new",
      asaasSubscriptionId: "sub_asaas_1",
      billingMethod: "pix",
      periodStart,
      periodEnd,
      providerPaymentId: "pay_1",
    });

    expect(result.contractStatus).toBe("active");
    expect(seats.bindWorkspaceSeatsToContract).toHaveBeenCalledWith(
      expect.any(Object),
      "workspace_1",
      "contract_new",
      "payment_confirmed",
      periodStart,
    );
  });

  it("fails before activation when the package is below current usage", async () => {
    const { seats, service, transaction } = createHarness(4);

    await expect(
      service.activatePaidContract({
        subscriptionId: "contract_new",
        asaasSubscriptionId: "sub_asaas_1",
        billingMethod: "credit_card",
        periodStart: new Date("2026-07-26T12:00:00.000Z"),
        periodEnd: new Date("2026-08-26T12:00:00.000Z"),
        providerPaymentId: "pay_1",
      }),
    ).rejects.toThrow("package_capacity_below_current_usage");

    expect(transaction.workspaceSubscription.update).not.toHaveBeenCalled();
    expect(seats.bindWorkspaceSeatsToContract).not.toHaveBeenCalled();
  });

  it("does not regress the active period when an older payment arrives late", async () => {
    const currentContract = {
      ...pendingContract,
      contractStatus: "active",
      status: "active",
      isCurrent: true,
      asaasSubscriptionId: "sub_asaas_1",
      currentPeriodStart: new Date("2026-08-26T12:00:00.000Z"),
      currentPeriodEnd: new Date("2026-09-26T12:00:00.000Z"),
      activatedAt: new Date("2026-07-26T12:00:00.000Z"),
    };
    const { seats, service, transaction } = createHarness(2, currentContract);

    const result = await service.activatePaidContract({
      subscriptionId: "contract_new",
      asaasSubscriptionId: "sub_asaas_1",
      billingMethod: "pix",
      periodStart: new Date("2026-07-26T12:00:00.000Z"),
      periodEnd: new Date("2026-08-26T12:00:00.000Z"),
      providerPaymentId: "pay_late",
    });

    expect(result.currentPeriodStart).toEqual(
      new Date("2026-08-26T12:00:00.000Z"),
    );
    expect(transaction.workspaceSubscription.updateMany).not.toHaveBeenCalled();
    expect(transaction.workspaceSubscription.update).not.toHaveBeenCalled();
    expect(seats.bindWorkspaceSeatsToContract).not.toHaveBeenCalled();
  });

  it("cancels a stale draft package contract and writes an audit row", async () => {
    const draft = { ...pendingContract, contractStatus: "draft" };
    const { service, transaction } = createCancellationHarness(draft);

    const canceled = await service.cancelStaleContract(
      "workspace_1",
      "contract_new",
      "owner_1",
      "Encerrar rascunho duplicado",
    );

    expect(canceled).toMatchObject({
      contractStatus: "canceled",
      status: "cancelled",
      isCurrent: false,
    });
    expect(transaction.workspaceSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "contract_new" },
        data: expect.objectContaining({
          contractStatus: "canceled",
          status: "cancelled",
          isCurrent: false,
          canceledAt: expect.any(Date),
          endedAt: expect.any(Date),
        }),
      }),
    );
    expect(transaction.billingContractAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "contract.stale_contract_canceled",
          actorUserId: "owner_1",
          reason: "Encerrar rascunho duplicado",
          beforeSnapshot: expect.objectContaining({
            contractStatus: "draft",
          }),
          afterSnapshot: expect.objectContaining({
            contractStatus: "canceled",
          }),
        }),
      }),
    );
  });

  it("cancels a non-current exempt package contract", async () => {
    const { service, transaction } = createCancellationHarness({
      ...pendingContract,
      contractStatus: "exempt",
      status: "active",
    });

    await expect(
      service.cancelStaleContract(
        "workspace_1",
        "contract_new",
        "owner_1",
        "Encerrar isencao antiga",
      ),
    ).resolves.toMatchObject({ contractStatus: "canceled" });

    expect(transaction.workspaceSubscription.update).toHaveBeenCalledOnce();
  });

  it("never cancels the current package contract", async () => {
    const { service, transaction } = createCancellationHarness({
      ...pendingContract,
      isCurrent: true,
      contractStatus: "exempt",
    });

    await expect(
      service.cancelStaleContract(
        "workspace_1",
        "contract_new",
        "owner_1",
        "Encerrar contrato atual",
      ),
    ).rejects.toThrow("Nao e permitido encerrar o contrato atual");

    expect(transaction.workspaceSubscription.update).not.toHaveBeenCalled();
    expect(transaction.billingContractAudit.create).not.toHaveBeenCalled();
  });

  it("does not expose contracts from another workspace to cancellation", async () => {
    const { service, transaction } = createCancellationHarness(null);

    await expect(
      service.cancelStaleContract(
        "workspace_2",
        "contract_new",
        "owner_1",
        "Encerrar contrato antigo",
      ),
    ).rejects.toThrow("Contrato de pacote nao encontrado");

    expect(transaction.workspaceSubscription.findFirst).toHaveBeenCalledWith({
      where: {
        id: "contract_new",
        workspaceId: "workspace_2",
        planNameSnapshot: { not: null },
      },
    });
  });

  it("keeps exempt assignment behavior intact", async () => {
    const plan = {
      id: "plan_exempt",
      name: "Isento 3 numeros",
      kind: "exempt",
      active: true,
      version: 1,
      monthlyPriceCents: 0,
      includedWhatsappNumbers: 3,
    };
    const created = {
      ...pendingContract,
      id: "contract_exempt",
      planId: plan.id,
      planNameSnapshot: plan.name,
      contractStatus: "exempt",
      status: "active",
      isCurrent: true,
      assignedAt: new Date("2026-08-01T12:00:00.000Z"),
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    };
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      workspaceSubscription: {
        findFirst: vi.fn().mockResolvedValue(pendingContract),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue(created),
      },
      whatsappSeat: { count: vi.fn().mockResolvedValue(2) },
      billingContractAudit: {
        create: vi.fn().mockResolvedValue({ id: "audit_1" }),
      },
    };
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(
          (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
    };
    const seats = {
      bindWorkspaceSeatsToContract: vi.fn().mockResolvedValue(2),
    };
    const service = new PackageContractService(
      prisma as never,
      {
        getPackagePlan: vi.fn().mockResolvedValue(plan),
        mapPlan: vi.fn().mockReturnValue(plan),
      } as never,
      {} as never,
      seats as never,
    );

    await expect(
      service.assignPlan(
        "workspace_1",
        "plan_exempt",
        "owner_1",
        "Aplicar isencao vigente",
      ),
    ).resolves.toMatchObject({
      status: "exempt",
      subscriptionId: "contract_exempt",
    });

    expect(seats.bindWorkspaceSeatsToContract).toHaveBeenCalledWith(
      expect.any(Object),
      "workspace_1",
      "contract_exempt",
      "special_plan_assigned",
      expect.any(Date),
    );
  });

  it("excludes canceled package contracts from the default backoffice list", async () => {
    const prisma = {
      workspaceSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new PackageContractService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listBackofficeContracts({});

    expect(prisma.workspaceSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contractStatus: { not: "canceled" },
        }),
      }),
    );
  });
});
