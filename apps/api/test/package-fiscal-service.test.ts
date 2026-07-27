import { describe, expect, it, vi } from "vitest";
import { PackageFiscalService } from "../src/billing/package-fiscal.service";

const contract = {
  id: "contract_1",
  workspaceId: "workspace_1",
  planId: "plan_1",
  asaasSubscriptionId: "subscription_asaas_1"
};

const localInvoice = {
  id: "invoice_1",
  workspaceId: "workspace_1",
  subscriptionId: "contract_1",
  paymentChargeId: "charge_1",
  providerInvoiceId: null,
  providerPaymentId: "payment_1",
  status: "pending_configuration",
  amountCents: 5000
};

const fiscalSettings = {
  id: "platform",
  enabled: true,
  validatedAt: new Date(),
  serviceDescription: "Assinatura WppTrack",
  observations: null,
  municipalServiceId: "service_1",
  municipalServiceCode: null,
  taxes: {}
};

function createHarness(settings: typeof fiscalSettings | null = fiscalSettings) {
  const prisma = {
    billingInvoice: {
      upsert: vi.fn().mockResolvedValue(localInvoice),
      update: vi.fn().mockResolvedValue(localInvoice),
      findUnique: vi.fn(),
      findFirst: vi.fn()
    },
    platformFiscalSettings: {
      findUnique: vi.fn().mockResolvedValue(settings)
    },
    paymentCharge: {
      findUnique: vi.fn().mockResolvedValue({
        id: "charge_1",
        paidAt: new Date("2026-07-26T12:00:00.000Z"),
        dueAt: null
      })
    },
    workspaceSubscription: {
      update: vi.fn().mockResolvedValue(contract)
    },
    billingContractAudit: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" })
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
    findSubscriptionInvoice: vi.fn().mockResolvedValue(null),
    schedulePaymentInvoice: vi.fn().mockResolvedValue({
      id: "invoice_asaas_1",
      status: "SCHEDULED",
      paymentId: "payment_1",
      externalReference: "wpptrack:invoice:invoice_1"
    }),
    upsertAutomaticInvoiceSettings: vi.fn().mockResolvedValue({
      id: "settings_1"
    })
  };
  const service = new PackageFiscalService(
    prisma as never,
    {
      isPackageBillingEnabled: () => true,
      isFiscalEnabled: () => true
    } as never,
    asaas as never
  );

  return { asaas, prisma, service };
}

describe("PackageFiscalService", () => {
  it("schedules the invoice for the current payment before marking it ready", async () => {
    const { asaas, prisma, service } = createHarness();

    await service.configureAfterPayment({
      contract: contract as never,
      paymentChargeId: "charge_1",
      providerPaymentId: "payment_1",
      amountCents: 5000
    });

    expect(asaas.schedulePaymentInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "payment_1",
        amountCents: 5000,
        effectiveDate: "2026-07-26",
        externalReference: "wpptrack:invoice:invoice_1"
      })
    );
    expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: "invoice_1" },
      data: expect.objectContaining({
        providerInvoiceId: "invoice_asaas_1",
        status: "scheduled",
        lastErrorCode: null
      })
    });
  });

  it("does not schedule the same payment twice", async () => {
    const { asaas, prisma, service } = createHarness();
    prisma.billingInvoice.upsert.mockResolvedValueOnce({
      ...localInvoice,
      providerInvoiceId: "invoice_asaas_1",
      status: "scheduled"
    });

    await service.configureAfterPayment({
      contract: contract as never,
      paymentChargeId: "charge_1",
      providerPaymentId: "payment_1",
      amountCents: 5000
    });

    expect(asaas.findSubscriptionInvoice).not.toHaveBeenCalled();
    expect(asaas.schedulePaymentInvoice).not.toHaveBeenCalled();
  });

  it("persists a recoverable fiscal failure when settings are missing", async () => {
    const { asaas, prisma, service } = createHarness(null);

    await service.configureAfterPayment({
      contract: contract as never,
      paymentChargeId: "charge_1",
      providerPaymentId: "payment_1",
      amountCents: 5000
    });

    expect(prisma.billingInvoice.upsert).toHaveBeenCalledOnce();
    expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: "invoice_1" },
      data: expect.objectContaining({
        status: "failed",
        lastErrorCode: "fiscal_settings_not_validated"
      })
    });
    expect(asaas.schedulePaymentInvoice).not.toHaveBeenCalled();
  });
});
