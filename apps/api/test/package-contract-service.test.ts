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
  activatedAt: null
};

function createHarness(
  occupiedSeats = 2,
  contract: ContractFixture = pendingContract
) {
  const activated = {
    ...contract,
    contractStatus: "active",
    isCurrent: true,
    currentPeriodStart: new Date("2026-07-26T12:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-26T12:00:00.000Z"),
    activatedAt: new Date("2026-07-26T12:00:00.000Z")
  };
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    workspaceSubscription: {
      findUnique: vi.fn().mockResolvedValue(contract),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue(activated)
    },
    whatsappSeat: {
      count: vi.fn().mockResolvedValue(occupiedSeats)
    },
    billingContractAudit: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" })
    }
  };
  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction)
      )
  };
  const seats = {
    bindWorkspaceSeatsToContract: vi.fn().mockResolvedValue(2)
  };
  const service = new PackageContractService(
    prisma as never,
    {} as never,
    {} as never,
    seats as never
  );

  return { activated, prisma, seats, service, transaction };
}

describe("PackageContractService", () => {
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
      providerPaymentId: "pay_1"
    });

    expect(result.contractStatus).toBe("active");
    expect(seats.bindWorkspaceSeatsToContract).toHaveBeenCalledWith(
      expect.any(Object),
      "workspace_1",
      "contract_new",
      "payment_confirmed",
      periodStart
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
        providerPaymentId: "pay_1"
      })
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
      activatedAt: new Date("2026-07-26T12:00:00.000Z")
    };
    const { seats, service, transaction } = createHarness(2, currentContract);

    const result = await service.activatePaidContract({
      subscriptionId: "contract_new",
      asaasSubscriptionId: "sub_asaas_1",
      billingMethod: "pix",
      periodStart: new Date("2026-07-26T12:00:00.000Z"),
      periodEnd: new Date("2026-08-26T12:00:00.000Z"),
      providerPaymentId: "pay_late"
    });

    expect(result.currentPeriodStart).toEqual(
      new Date("2026-08-26T12:00:00.000Z")
    );
    expect(transaction.workspaceSubscription.updateMany).not.toHaveBeenCalled();
    expect(transaction.workspaceSubscription.update).not.toHaveBeenCalled();
    expect(seats.bindWorkspaceSeatsToContract).not.toHaveBeenCalled();
  });
});
