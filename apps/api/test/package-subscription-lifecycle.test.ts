import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackageSubscriptionLifecycleService } from "../src/billing/package-subscription-lifecycle.service";

const activeContract = {
  id: "contract_1",
  workspaceId: "workspace_1",
  planId: "plan_1",
  contractStatus: "active",
  status: "active",
  isCurrent: true,
  planNameSnapshot: "Pacote",
  asaasSubscriptionId: "sub_asaas_1",
  recurrenceStoppedAt: null,
  currentPeriodEnd: new Date("2026-08-26T12:00:00.000Z"),
  cancellationRequestedAt: null,
  accessEndsAt: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false
};

function createHarness() {
  const transaction = {
    workspaceSubscription: {
      update: vi.fn().mockImplementation(({ where, data }) => ({
        ...activeContract,
        id: where.id,
        ...data
      }))
    },
    billingContractAudit: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" })
    }
  };
  const prisma = {
    workspaceSubscription: {
      findFirst: vi.fn().mockResolvedValue(activeContract),
      findUnique: vi.fn().mockResolvedValue(activeContract),
      findMany: vi.fn()
    },
    $transaction: vi
      .fn()
      .mockImplementation(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction)
      )
  };
  const configuration = {
    isPackageBillingEnabled: () => true,
    isLifecycleEnabled: () => true,
    gracePeriodDays: () => 3,
    reconciliationIntervalMs: () => 60_000
  };
  const asaas = {
    removeSubscription: vi.fn().mockResolvedValue(undefined)
  };
  const seats = {
    expireAllReservations: vi.fn().mockResolvedValue(0),
    suspendSubscriptionSeats: vi.fn().mockResolvedValue(0)
  };
  const service = new PackageSubscriptionLifecycleService(
    prisma as never,
    configuration as never,
    asaas as never,
    seats as never
  );

  return { asaas, prisma, seats, service, transaction };
}

describe("PackageSubscriptionLifecycleService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops recurrence but keeps access until the paid period ends", async () => {
    const { asaas, service, transaction } = createHarness();

    const result = await service.requestCancellation(
      "workspace_1",
      "user_1",
      "Cancelado pelo cliente"
    );

    expect(asaas.removeSubscription).toHaveBeenCalledWith("sub_asaas_1");
    expect(result.status).toBe("cancel_at_period_end");
    expect(result.accessEndsAt).toBe("2026-08-26T12:00:00.000Z");
    expect(transaction.workspaceSubscription.update).toHaveBeenCalledWith({
      where: { id: "contract_1" },
      data: expect.objectContaining({
        cancelAtPeriodEnd: true,
        contractStatus: "cancel_at_period_end",
        recurrenceStoppedAt: new Date("2026-07-26T12:00:00.000Z")
      })
    });
  });

  it("does not cancel or cut access before a paid period is confirmed", async () => {
    const { asaas, prisma, service, transaction } = createHarness();
    prisma.workspaceSubscription.findFirst.mockResolvedValueOnce({
      ...activeContract,
      contractStatus: "awaiting_payment",
      currentPeriodEnd: null
    });

    await expect(
      service.requestCancellation(
        "workspace_1",
        "user_1",
        "Cancelado pelo cliente"
      )
    ).rejects.toThrow(
      "Periodo pago ainda nao confirmado; tente novamente apos a conciliacao"
    );

    expect(asaas.removeSubscription).not.toHaveBeenCalled();
    expect(transaction.workspaceSubscription.update).not.toHaveBeenCalled();
  });

  it("opens exactly three days of grace after an overdue payment", async () => {
    const { service, transaction } = createHarness();

    const result = await service.markPaymentOverdue(
      "contract_1",
      "payment_1"
    );

    expect(result.contractStatus).toBe("grace_period");
    expect(result.graceEndsAt?.toISOString()).toBe(
      "2026-07-29T12:00:00.000Z"
    );
    expect(transaction.billingContractAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "contract.payment_overdue",
        providerReferences: { paymentId: "payment_1" }
      })
    });
  });

  it("keeps the paid period when Asaas deletes future charges after cancellation", async () => {
    const { prisma, service, transaction } = createHarness();
    const cancelingContract = {
      ...activeContract,
      contractStatus: "cancel_at_period_end",
      cancelAtPeriodEnd: true,
      cancellationRequestedAt: new Date("2026-07-26T12:00:00.000Z"),
      recurrenceStoppedAt: new Date("2026-07-26T12:00:00.000Z"),
      accessEndsAt: activeContract.currentPeriodEnd
    };
    prisma.workspaceSubscription.findUnique.mockResolvedValueOnce(
      cancelingContract
    );

    const result = await service.markPaymentDeleted(
      "contract_1",
      "payment_future_1"
    );

    expect(result).toBe(cancelingContract);
    expect(transaction.workspaceSubscription.update).not.toHaveBeenCalled();
    expect(transaction.billingContractAudit.create).not.toHaveBeenCalled();
  });

  it("opens grace when a payment is deleted outside scheduled cancellation", async () => {
    const { service, transaction } = createHarness();

    const result = await service.markPaymentDeleted(
      "contract_1",
      "payment_deleted_1"
    );

    expect(result.contractStatus).toBe("grace_period");
    expect(transaction.workspaceSubscription.update).toHaveBeenCalledWith({
      where: { id: "contract_1" },
      data: expect.objectContaining({
        contractStatus: "grace_period",
        status: "past_due"
      })
    });
  });

  it("reconciles expired reservations, grace and period-end cancellation", async () => {
    const { prisma, seats, service } = createHarness();
    seats.expireAllReservations.mockResolvedValueOnce(2);
    prisma.workspaceSubscription.findMany
      .mockResolvedValueOnce([{ id: "contract_grace" }])
      .mockResolvedValueOnce([{ id: "contract_canceling" }]);

    const result = await service.reconcileDueContracts(
      new Date("2026-07-30T12:00:00.000Z")
    );

    expect(result).toEqual({
      canceled: 1,
      expiredReservations: 2,
      suspended: 1
    });
    expect(seats.suspendSubscriptionSeats).toHaveBeenCalledTimes(2);
    expect(seats.suspendSubscriptionSeats).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      "contract_grace",
      "grace_period_expired",
      new Date("2026-07-30T12:00:00.000Z")
    );
    expect(seats.suspendSubscriptionSeats).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      "contract_canceling",
      "contract_canceled",
      new Date("2026-07-30T12:00:00.000Z")
    );
  });
});
