import { describe, expect, it, vi } from "vitest";
import { PackageBillingReconciliationService } from "../src/billing/package-billing-reconciliation.service";

type ReconciliationContractFixture = {
  id: string;
  workspaceId: string;
  planId: string;
  planNameSnapshot: string;
  contractStatus: string;
  isCurrent: boolean;
  asaasSubscriptionId: string | null;
};

const contract: ReconciliationContractFixture = {
  id: "contract_1",
  workspaceId: "workspace_1",
  planId: "plan_1",
  planNameSnapshot: "Pacote 3",
  contractStatus: "active",
  isCurrent: true,
  asaasSubscriptionId: "subscription_asaas_1"
};

function createHarness(
  currentContract: ReconciliationContractFixture = contract
) {
  const prisma = {
    workspaceSubscription: {
      findMany: vi.fn().mockResolvedValue([currentContract]),
      update: vi.fn()
    },
    billingContractAudit: {
      create: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    },
    $transaction: vi
      .fn()
      .mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations)
      )
  };
  const asaas = {
    isConfigured: () => true,
    contractExternalReference: vi.fn(
      (workspaceId: string, subscriptionId: string) =>
        `wpptrack:contract:${workspaceId}:${subscriptionId}`
    ),
    findSubscriptionByExternalReference: vi.fn(),
    listSubscriptionPayments: vi.fn().mockResolvedValue([
      {
        id: "payment_1",
        status: "RECEIVED",
        value: 50,
        billingType: "PIX",
        dueDate: "2026-07-26",
        paymentDate: "2026-07-26",
        subscriptionId: "subscription_asaas_1",
        externalReference: null
      }
    ]),
    listSubscriptionInvoices: vi.fn().mockResolvedValue([])
  };
  const webhooks = {
    tryProcess: vi.fn().mockResolvedValue({
      handled: true,
      status: "processed",
      workspaceId: "workspace_1"
    })
  };
  const configuration = {
    isPackageBillingEnabled: () => true,
    isAsaasRecurringEnabled: () => true,
    isLifecycleEnabled: () => true,
    isAsaasReconciliationEnabled: () => false,
    isFiscalEnabled: () => false,
    asaasReconciliationIntervalMs: () => 21_600_000,
    asaasReconciliationBatchSize: () => 100
  };
  const service = new PackageBillingReconciliationService(
    prisma as never,
    configuration as never,
    asaas as never,
    webhooks as never
  );

  return { asaas, prisma, service, webhooks };
}

describe("PackageBillingReconciliationService", () => {
  it("recovers a missed payment with a deterministic provider event", async () => {
    const { service, webhooks } = createHarness();

    const result = await service.reconcileWorkspace("workspace_1");

    expect(result).toMatchObject({
      contracts: 1,
      paymentsChecked: 1,
      eventsProcessed: 1,
      failures: 0
    });
    expect(webhooks.tryProcess).toHaveBeenCalledWith({
      id: "reconciliation:payment:payment_1:PAYMENT_RECEIVED",
      event: "PAYMENT_RECEIVED",
      payment: expect.objectContaining({
        id: "payment_1",
        subscription: "subscription_asaas_1"
      })
    });
  });

  it("binds a subscription recovered by external reference", async () => {
    const unboundContract = {
      ...contract,
      asaasSubscriptionId: null,
      contractStatus: "awaiting_payment"
    };
    const { asaas, prisma, service } = createHarness(unboundContract);
    asaas.findSubscriptionByExternalReference.mockResolvedValueOnce({
      id: "subscription_asaas_1",
      status: "ACTIVE",
      billingType: "PIX",
      nextDueDate: "2026-08-26",
      externalReference: "wpptrack:contract:workspace_1:contract_1",
      deleted: false
    });

    const result = await service.reconcileWorkspace("workspace_1");

    expect(result.subscriptionsBound).toBe(1);
    expect(prisma.workspaceSubscription.update).toHaveBeenCalledWith({
      where: { id: "contract_1" },
      data: { asaasSubscriptionId: "subscription_asaas_1" }
    });
  });
});
