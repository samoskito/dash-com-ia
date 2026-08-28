import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdditiveWhatsappBillingService } from "../src/billing/additive-whatsapp-billing.service";

type Item = Record<string, any>;
type Charge = Record<string, any>;

function createHarness(options?: {
  contract?: Record<string, any> | null;
  secondWorkspace?: boolean;
}) {
  const contracts: Record<string, Record<string, any>> = {
    workspace_1: {
      id: "contract_1",
      workspaceId: "workspace_1",
      contractStatus: "active",
      isCurrent: true,
      planNameSnapshot: "Individual",
      asaasSubscriptionId: "sub_1",
      monthlyPriceCentsSnapshot: 3000,
      includedWhatsappNumbersSnapshot: 1,
      ...options?.contract,
    },
  };
  if (options?.contract === null) delete contracts.workspace_1;
  if (options?.secondWorkspace) {
    contracts.workspace_2 = {
      ...contracts.workspace_1,
      id: "contract_2",
      workspaceId: "workspace_2",
      asaasSubscriptionId: "sub_2",
    };
  }
  const items: Item[] = [];
  const charges: Charge[] = [];
  const audits: Record<string, any>[] = [];
  let transactionTail = Promise.resolve();
  const matchingItems = (where: Record<string, any>) =>
    items.filter((item) => {
      if (where.id) {
        const ids = typeof where.id === "string" ? [where.id] : where.id.in;
        if (!ids.includes(item.id)) return false;
      }
      if (where.workspaceId && item.workspaceId !== where.workspaceId)
        return false;
      if (where.subscriptionId && item.subscriptionId !== where.subscriptionId)
        return false;
      if (
        where.idempotencyKey !== undefined &&
        item.idempotencyKey !== where.idempotencyKey
      )
        return false;
      if (where.status && item.status !== where.status) return false;
      if (
        where.providerSyncStatus &&
        !where.providerSyncStatus.in.includes(item.providerSyncStatus)
      )
        return false;
      if (
        where.paymentChargeId &&
        item.paymentChargeId !== where.paymentChargeId
      )
        return false;
      const charge = charges.find((entry) => entry.id === item.paymentChargeId);
      if (where.paymentCharge) {
        if (!charge || charge.status !== where.paymentCharge.status)
          return false;
        if (
          where.paymentCharge.amountCents &&
          charge.amountCents !== where.paymentCharge.amountCents
        )
          return false;
      }
      return true;
    });
  const updateRecord = (
    record: Record<string, any>,
    data: Record<string, any>,
  ) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        record[key] = (record[key] ?? 0) + Number(value.increment);
      } else {
        record[key] = value;
      }
    }
    return record;
  };

  const tx: any = {
    $executeRaw: vi.fn(),
    workspaceSubscription: {
      findFirst: vi.fn(async ({ where }: any) => {
        const contract = Object.values(contracts).find((candidate) => {
          if (where.workspaceId && candidate.workspaceId !== where.workspaceId)
            return false;
          if (where.id && candidate.id !== where.id) return false;
          if (
            where.isCurrent !== undefined &&
            candidate.isCurrent !== where.isCurrent
          )
            return false;
          if (
            where.contractStatus &&
            candidate.contractStatus !== where.contractStatus
          )
            return false;
          return true;
        });
        return contract ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) =>
        updateRecord(
          Object.values(contracts).find(
            (contract) => contract.id === where.id,
          )!,
          data,
        ),
      ),
    },
    workspaceBillingProfile: {
      findUnique: vi.fn(async ({ where }: any) =>
        contracts[where.workspaceId]
          ? { asaasCustomerId: `customer_${where.workspaceId}` }
          : null,
      ),
    },
    workspaceSubscriptionItem: {
      findFirst: vi.fn(
        async ({ where }: any) => matchingItems(where)[0] ?? null,
      ),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const item = items.find((entry) => entry.id === where.id);
        if (!item) return null;
        if (!include?.paymentCharge) return item;
        return {
          ...item,
          paymentCharge: charges.find(
            (charge) => charge.id === item.paymentChargeId,
          ),
        };
      }),
      findMany: vi.fn(async ({ where }: any = {}) =>
        matchingItems(where ?? {}),
      ),
      create: vi.fn(async ({ data }: any) => {
        const item = { id: `item_${items.length + 1}`, ...data };
        items.push(item);
        return item;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = matchingItems(where);
        matches.forEach((item) => updateRecord(item, data));
        return { count: matches.length };
      }),
    },
    paymentCharge: {
      create: vi.fn(async ({ data }: any) => {
        const charge = { id: `charge_${charges.length + 1}`, ...data };
        charges.push(charge);
        return charge;
      }),
      findUnique: vi.fn(
        async ({ where }: any) =>
          charges.find((charge) => charge.id === where.id) ?? null,
      ),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const charge = charges.find(
          (candidate) =>
            candidate.externalChargeId === where.externalChargeId &&
            (!where.workspaceId ||
              candidate.workspaceId === where.workspaceId) &&
            (!where.subscriptionId ||
              candidate.subscriptionId === where.subscriptionId),
        );
        if (!charge) return null;
        return include?.additiveItem
          ? {
              ...charge,
              additiveItem: items.find(
                (item) => item.paymentChargeId === charge.id,
              ),
            }
          : charge;
      }),
      update: vi.fn(async ({ where, data }: any) =>
        updateRecord(
          charges.find((charge) => charge.id === where.id)!,
          data,
        ),
      ),
    },
    billingContractAudit: {
      create: vi.fn(async ({ data }: any) => audits.push(data)),
    },
  };
  const prisma: any = {
    $transaction: vi.fn(async (callback: any) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(tx);
      } finally {
        release();
      }
    }),
    workspaceSubscriptionItem: {
      findMany: tx.workspaceSubscriptionItem.findMany,
      updateMany: tx.workspaceSubscriptionItem.updateMany,
    },
  };
  const asaas = {
    additiveItemExternalReference: vi.fn(
      (workspaceId: string, subscriptionId: string, itemId: string) =>
        `additive:${workspaceId}:${subscriptionId}:${itemId}`,
    ),
    findPaymentByExternalReference: vi.fn().mockResolvedValue(null),
    createAdditivePayment: vi.fn(async ({ itemId }: any) => ({
      id: `payment_${itemId}`,
      invoiceUrl: `https://asaas.example.test/${itemId}`,
    })),
    updateSubscriptionValue: vi.fn().mockResolvedValue(undefined),
  };

  return {
    asaas,
    audits,
    charges,
    contracts,
    items,
    service: new AdditiveWhatsappBillingService(prisma, asaas as never),
    tx,
  };
}

describe("AdditiveWhatsappBillingService", () => {
  it("creates the first R$30 additive checkout but redirect alone grants no capacity", async () => {
    const { asaas, contracts, items, service, tx } = createHarness();

    const result = await service.addIndividualNumber(
      "workspace_1",
      "user_1",
      "request-0001",
    );

    expect(result).toMatchObject({
      paymentAmountCents: 3000,
      status: "awaiting_payment",
      capacity: 1,
      monthlyPriceCents: 3000,
    });
    expect(items).toHaveLength(1);
    expect(contracts.workspace_1).toMatchObject({
      includedWhatsappNumbersSnapshot: 1,
      monthlyPriceCentsSnapshot: 3000,
    });
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
    expect(tx.workspaceSubscription.update).not.toHaveBeenCalled();
  });

  it("activates first, second, and later paid additions on the same recurrence", async () => {
    const { asaas, audits, contracts, items, service } = createHarness();
    const purchases = await Promise.all(
      ["request-0001", "request-0002", "request-0003"].map((key) =>
        service.addIndividualNumber("workspace_1", "user_1", key),
      ),
    );

    for (const purchase of purchases) {
      await service.recordPaidCheckout(purchase.externalPaymentId, 3000);
    }

    expect(items.every((item) => item.status === "active")).toBe(true);
    expect(contracts.workspace_1).toMatchObject({
      includedWhatsappNumbersSnapshot: 4,
      monthlyPriceCentsSnapshot: 12000,
    });
    expect(asaas.updateSubscriptionValue).toHaveBeenLastCalledWith(
      "sub_1",
      12000,
    );
    expect(audits).toHaveLength(6);
  });

  it("serializes concurrent retries with one idempotency key into one charge", async () => {
    const { asaas, items, service } = createHarness();

    const purchases = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.addIndividualNumber("workspace_1", "user_1", "request-0001"),
      ),
    );

    expect(new Set(purchases.map((purchase) => purchase.itemId))).toEqual(
      new Set(["item_1"]),
    );
    expect(items).toHaveLength(1);
    expect(asaas.createAdditivePayment).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent paid webhooks without losing either capacity", async () => {
    const { asaas, contracts, items, service } = createHarness();
    const [first, second] = await Promise.all([
      service.addIndividualNumber("workspace_1", "user_1", "request-0001"),
      service.addIndividualNumber("workspace_1", "user_1", "request-0002"),
    ]);

    await Promise.all([
      service.recordPaidCheckout(first.externalPaymentId, 3000),
      service.recordPaidCheckout(second.externalPaymentId, 3000),
    ]);

    expect(items.filter((item) => item.status === "active")).toHaveLength(2);
    expect(contracts.workspace_1).toMatchObject({
      includedWhatsappNumbersSnapshot: 3,
      monthlyPriceCentsSnapshot: 9000,
    });
    expect(asaas.updateSubscriptionValue).toHaveBeenLastCalledWith(
      "sub_1",
      9000,
    );
  });

  it("rejects duplicate or invalid payment data without changing capacity", async () => {
    const { contracts, items, service } = createHarness();
    const purchase = await service.addIndividualNumber(
      "workspace_1",
      "user_1",
      "request-0001",
    );

    await expect(service.recordPaidCheckout("unknown", 3000)).resolves.toBe(
      false,
    );
    await expect(
      service.recordPaidCheckout(purchase.externalPaymentId, 2999),
    ).resolves.toBe(false);
    await expect(
      service.recordPaidCheckout(purchase.externalPaymentId, 3000),
    ).resolves.toBe(true);
    await expect(
      service.recordPaidCheckout(purchase.externalPaymentId, 3000),
    ).resolves.toBe(false);

    expect(items.filter((item) => item.status === "active")).toHaveLength(1);
    expect(contracts.workspace_1.includedWhatsappNumbersSnapshot).toBe(2);
  });

  it("keeps payment activation inside its workspace", async () => {
    const { contracts, service } = createHarness({ secondWorkspace: true });
    const [first, second] = await Promise.all([
      service.addIndividualNumber("workspace_1", "user_1", "request-0001"),
      service.addIndividualNumber("workspace_2", "user_2", "request-0002"),
    ]);

    await service.recordPaidCheckout(first.externalPaymentId, 3000);

    expect(contracts.workspace_1.includedWhatsappNumbersSnapshot).toBe(2);
    expect(contracts.workspace_2.includedWhatsappNumbersSnapshot).toBe(1);
    expect(second.subscriptionId).toBe("contract_2");
  });

  it("fails closed when no active individual contract or capacity exists", async () => {
    const noContract = createHarness({ contract: null });
    await expect(
      noContract.service.addIndividualNumber("workspace_1", "user_1"),
    ).rejects.toBeInstanceOf(ConflictException);

    const noCapacity = createHarness({
      contract: {
        includedWhatsappNumbersSnapshot: 0,
        monthlyPriceCentsSnapshot: 0,
      },
    });
    await expect(
      noCapacity.service.addIndividualNumber("workspace_1", "user_1"),
    ).rejects.toBeInstanceOf(ConflictException);

    const packagePrice = createHarness({
      contract: {
        includedWhatsappNumbersSnapshot: 3,
        monthlyPriceCentsSnapshot: 5000,
      },
    });
    await expect(
      packagePrice.service.addIndividualNumber("workspace_1", "user_1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
