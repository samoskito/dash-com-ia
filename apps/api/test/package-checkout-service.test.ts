import { describe, expect, it, vi } from "vitest";
import { PackageCheckoutService } from "../src/billing/package-checkout.service";

const profile = {
  id: "profile_1",
  workspaceId: "workspace_1",
  payerName: "Cliente",
  taxId: "12345678901",
  billingEmail: "billing@example.test",
  phone: "5511999999999",
  postalCode: "01001000",
  addressLine: "Rua A",
  addressNumber: "10",
  addressComplement: null,
  district: "Centro",
  city: "Sao Paulo",
  state: "SP",
  payerType: "individual",
  asaasCustomerId: "customer_1"
};

function createHarness() {
  const prisma = {
    workspaceSubscription: {
      findFirst: vi.fn().mockResolvedValue(null)
    },
    workspaceBillingProfile: {
      findUnique: vi.fn().mockResolvedValue(profile),
      update: vi.fn().mockResolvedValue(profile)
    }
  };
  const configuration = {
    isPackageBillingEnabled: () => true,
    isAsaasRecurringEnabled: () => true
  };
  const plans = {
    getPackagePlan: vi.fn().mockResolvedValue({
      id: "plan_1",
      name: "Pacote 3",
      kind: "standard",
      visibility: "public",
      monthlyPriceCents: 5000,
      includedWhatsappNumbers: 3,
      active: true
    })
  };
  const asaas = {
    updateCustomer: vi.fn().mockResolvedValue({ id: "customer_1" }),
    createCustomer: vi.fn(),
    createRecurringCheckout: vi.fn().mockResolvedValue({
      id: "checkout_1",
      link: "https://asaas.example.test/checkout_1",
      expiresAt: new Date("2026-07-27T12:00:00.000Z")
    })
  };
  const contracts = {
    assignPlan: vi.fn().mockResolvedValue({
      subscriptionId: "contract_1"
    }),
    markAwaitingPayment: vi.fn().mockResolvedValue({
      id: "contract_1",
      contractStatus: "awaiting_payment"
    }),
    activatePaidContract: vi.fn()
  };
  const service = new PackageCheckoutService(
    prisma as never,
    configuration as never,
    asaas as never,
    plans as never,
    contracts as never
  );

  return { asaas, contracts, plans, service };
}

describe("PackageCheckoutService", () => {
  it("returns a checkout without activating access before payment", async () => {
    const { contracts, service } = createHarness();

    const result = await service.createCheckout(
      "workspace_1",
      "plan_1",
      "user_1"
    );

    expect(result).toEqual({
      workspaceId: "workspace_1",
      subscriptionId: "contract_1",
      checkoutId: "checkout_1",
      checkoutUrl: "https://asaas.example.test/checkout_1",
      status: "awaiting_payment"
    });
    expect(contracts.markAwaitingPayment).toHaveBeenCalledOnce();
    expect(contracts.activatePaidContract).not.toHaveBeenCalled();
  });

  it("never exposes a private custom plan in self-service checkout", async () => {
    const { plans, service } = createHarness();
    plans.getPackagePlan.mockResolvedValueOnce({
      id: "plan_custom",
      name: "Negociacao especial",
      kind: "custom",
      visibility: "private",
      monthlyPriceCents: 3000,
      includedWhatsappNumbers: 5,
      active: true
    });

    await expect(
      service.createCheckout("workspace_1", "plan_custom", "user_1")
    ).rejects.toMatchObject({
      message: "Plano indisponivel para contratacao"
    });
  });
});
