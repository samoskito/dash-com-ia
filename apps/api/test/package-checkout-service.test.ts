import { describe, expect, it, vi } from "vitest";
import { PackageAsaasError } from "../src/billing/package-asaas.adapter";
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
    updateCustomer: vi.fn().mockResolvedValue({
      id: "customer_1",
      cityId: 3550308
    }),
    findCustomerByExternalReference: vi.fn().mockResolvedValue(null),
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

  return { asaas, contracts, plans, prisma, service };
}

describe("PackageCheckoutService", () => {
  it("returns a checkout without activating access before payment", async () => {
    const { asaas, contracts, service } = createHarness();

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
    expect(asaas.createRecurringCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        profile,
        customerCityId: 3550308
      })
    );
    expect(asaas.createRecurringCheckout).not.toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: expect.anything()
      })
    );
  });

  it("resumes a draft contract after checkout creation previously failed", async () => {
    const { asaas, contracts, prisma, service } = createHarness();
    prisma.workspaceSubscription.findFirst.mockResolvedValueOnce({
      id: "contract_draft_1",
      contractStatus: "draft"
    });

    const result = await service.createCheckout(
      "workspace_1",
      "plan_1",
      "user_1"
    );

    expect(result.subscriptionId).toBe("contract_draft_1");
    expect(contracts.assignPlan).not.toHaveBeenCalled();
    expect(asaas.createRecurringCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "contract_draft_1"
      })
    );
    expect(contracts.markAwaitingPayment).toHaveBeenCalledWith(
      "contract_draft_1",
      expect.objectContaining({
        checkoutId: "checkout_1"
      })
    );
  });

  it("returns an unexpired checkout without creating another Asaas session", async () => {
    const { asaas, contracts, prisma, service } = createHarness();
    prisma.workspaceSubscription.findFirst.mockResolvedValueOnce({
      id: "contract_pending_1",
      contractStatus: "awaiting_payment",
      asaasCheckoutId: "checkout_existing_1",
      asaasCheckoutUrl: "https://asaas.example.test/checkout_existing_1",
      asaasCheckoutExpiresAt: new Date(Date.now() + 60_000)
    });

    const result = await service.createCheckout(
      "workspace_1",
      "plan_1",
      "user_1"
    );

    expect(result).toEqual({
      workspaceId: "workspace_1",
      subscriptionId: "contract_pending_1",
      checkoutId: "checkout_existing_1",
      checkoutUrl: "https://asaas.example.test/checkout_existing_1",
      status: "awaiting_payment"
    });
    expect(contracts.assignPlan).not.toHaveBeenCalled();
    expect(asaas.createRecurringCheckout).not.toHaveBeenCalled();
    expect(contracts.markAwaitingPayment).not.toHaveBeenCalled();
  });

  it("reuses a customer created remotely before a local timeout", async () => {
    const { asaas, prisma, service } = createHarness();
    prisma.workspaceBillingProfile.findUnique.mockResolvedValueOnce({
      ...profile,
      asaasCustomerId: null,
      status: "incomplete"
    });
    asaas.findCustomerByExternalReference.mockResolvedValueOnce({
      id: "customer_recovered",
      cityId: 3550308
    });

    await service.createCheckout("workspace_1", "plan_1", "user_1");

    expect(asaas.createCustomer).not.toHaveBeenCalled();
    expect(prisma.workspaceBillingProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: expect.objectContaining({
        asaasCustomerId: "customer_recovered",
        status: "valid"
      })
    });
    expect(asaas.createRecurringCheckout).toHaveBeenCalledOnce();
  });

  it("recovers a customer after a retryable create timeout", async () => {
    const { asaas, prisma, service } = createHarness();
    prisma.workspaceBillingProfile.findUnique.mockResolvedValueOnce({
      ...profile,
      asaasCustomerId: null,
      status: "incomplete"
    });
    asaas.createCustomer.mockRejectedValueOnce(
      new PackageAsaasError("asaas_timeout", null, true)
    );
    asaas.findCustomerByExternalReference
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "customer_recovered",
        cityId: 3550308
      });

    await service.createCheckout("workspace_1", "plan_1", "user_1");

    expect(asaas.createCustomer).toHaveBeenCalledOnce();
    expect(
      asaas.findCustomerByExternalReference
    ).toHaveBeenCalledTimes(2);
    expect(prisma.workspaceBillingProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: expect.objectContaining({
        asaasCustomerId: "customer_recovered",
        status: "valid"
      })
    });
    expect(asaas.createRecurringCheckout).toHaveBeenCalledOnce();
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

  it("allows a private paid plan only when assigned to the workspace", async () => {
    const { asaas, contracts, plans, prisma, service } = createHarness();
    plans.getPackagePlan.mockResolvedValueOnce({
      id: "plan_canary",
      name: "Canario producao - 1 numero",
      kind: "custom",
      visibility: "private",
      monthlyPriceCents: 500,
      includedWhatsappNumbers: 1,
      active: true
    });
    prisma.workspaceSubscription.findFirst.mockResolvedValueOnce({
      id: "contract_canary",
      workspaceId: "workspace_1",
      planId: "plan_canary",
      contractStatus: "draft",
      asaasSubscriptionId: null
    });

    const result = await service.createCheckout(
      "workspace_1",
      "plan_canary",
      "user_1"
    );

    expect(result.subscriptionId).toBe("contract_canary");
    expect(contracts.assignPlan).not.toHaveBeenCalled();
    expect(asaas.createRecurringCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "contract_canary",
        planName: "Canario producao - 1 numero",
        monthlyPriceCents: 500
      })
    );
    expect(prisma.workspaceSubscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          planId: "plan_canary"
        })
      })
    );
  });

  it("returns the sanitized Asaas rejection instead of a generic code", async () => {
    const { asaas, contracts, service } = createHarness();
    asaas.createRecurringCheckout.mockRejectedValueOnce(
      new PackageAsaasError(
        "asaas_invalid_object",
        400,
        false,
        "The 'subscription.nextDueDate' field is invalid for billing@example.test"
      )
    );

    await expect(
      service.createCheckout("workspace_1", "plan_1", "user_1")
    ).rejects.toMatchObject({
      message:
        "O Asaas recusou a operacao (asaas_invalid_object): The 'subscription.nextDueDate' field is invalid for [email]"
    });
    expect(contracts.markAwaitingPayment).not.toHaveBeenCalled();
  });
});
