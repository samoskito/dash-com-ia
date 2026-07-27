import { describe, expect, it } from "vitest";
import {
  billingInvoiceStatusSchema,
  legacyBillingBackfillApplyInputSchema,
  legacyBillingBackfillReportSchema,
  whatsappPackagePlanSchema,
  whatsappSeatSchema,
  workspaceBillingProfileInputSchema,
  workspacePackageCheckoutSchema,
  workspaceSubscriptionCancellationInputSchema,
} from "../src";

describe("WhatsApp package billing contracts", () => {
  it("accepts negotiated and exempt packages with explicit capacity", () => {
    expect(
      whatsappPackagePlanSchema.parse({
        id: "plan_custom",
        name: "Parceiro 3 numeros",
        slug: "parceiro-3-numeros",
        kind: "custom",
        visibility: "private",
        monthlyPriceCents: 5000,
        includedWhatsappNumbers: 3,
        version: 1,
        active: true,
      }),
    ).toMatchObject({
      kind: "custom",
      monthlyPriceCents: 5000,
      includedWhatsappNumbers: 3,
    });

    expect(
      whatsappPackagePlanSchema.parse({
        id: "plan_exempt",
        name: "Isento inicial",
        slug: "isento-inicial",
        kind: "exempt",
        visibility: "private",
        monthlyPriceCents: 0,
        includedWhatsappNumbers: 5,
        version: 1,
        active: true,
      }),
    ).toMatchObject({
      kind: "exempt",
      monthlyPriceCents: 0,
    });
  });

  it("requires complete payer data before checkout", () => {
    const valid = workspaceBillingProfileInputSchema.safeParse({
      payerType: "company",
      payerName: "Empresa Exemplo Ltda",
      taxId: "12.345.678/0001-99",
      billingEmail: "financeiro@example.com",
      phone: "+5511999999999",
      postalCode: "01001-000",
      addressLine: "Praca da Se",
      addressNumber: "100",
      addressComplement: null,
      district: "Se",
      city: "Sao Paulo",
      state: "SP",
    });
    const missingTaxId = workspaceBillingProfileInputSchema.safeParse({
      payerType: "company",
      payerName: "Empresa Exemplo Ltda",
      billingEmail: "financeiro@example.com",
      phone: "+5511999999999",
      postalCode: "01001-000",
      addressLine: "Praca da Se",
      addressNumber: "100",
      district: "Se",
      city: "Sao Paulo",
      state: "SP",
    });

    expect(valid.success).toBe(true);
    expect(missingTaxId.success).toBe(false);
  });

  it("keeps hosted checkout pending until a trusted webhook confirms payment", () => {
    expect(
      workspacePackageCheckoutSchema.parse({
        workspaceId: "workspace_1",
        subscriptionId: "subscription_1",
        checkoutId: "checkout_1",
        checkoutUrl: "https://asaas.com/checkout/checkout_1",
        status: "awaiting_payment",
      }).status,
    ).toBe("awaiting_payment");
  });

  it("requires explicit confirmation for self-service cancellation", () => {
    expect(
      workspaceSubscriptionCancellationInputSchema.safeParse({
        confirmation: false,
      }).success,
    ).toBe(false);
    expect(
      workspaceSubscriptionCancellationInputSchema.safeParse({
        confirmation: true,
        reason: "Encerramento solicitado pelo cliente",
      }).success,
    ).toBe(true);
  });

  it("requires one and only one provider target for a WhatsApp seat", () => {
    const baseSeat = {
      id: "seat_1",
      workspaceId: "workspace_1",
      subscriptionId: "subscription_1",
      provider: "uazapi",
      status: "reserved",
      normalizedPhone: null,
      reservationExpiresAt: null,
      activatedAt: null,
      suspendedAt: null,
      releasedAt: null,
    } as const;

    expect(
      whatsappSeatSchema.safeParse({
        ...baseSeat,
        whatsappInstanceId: "instance_1",
        inboundWebhookChannelId: null,
      }).success,
    ).toBe(true);
    expect(
      whatsappSeatSchema.safeParse({
        ...baseSeat,
        whatsappInstanceId: null,
        inboundWebhookChannelId: null,
      }).success,
    ).toBe(false);
    expect(
      whatsappSeatSchema.safeParse({
        ...baseSeat,
        whatsappInstanceId: "instance_1",
        inboundWebhookChannelId: "channel_1",
      }).success,
    ).toBe(false);
  });

  it("exposes fiscal failure states without changing payment state", () => {
    expect(billingInvoiceStatusSchema.parse("authorized")).toBe("authorized");
    expect(billingInvoiceStatusSchema.parse("rejected")).toBe("rejected");
  });

  it("requires the exact audited confirmation before legacy backfill", () => {
    expect(
      legacyBillingBackfillApplyInputSchema.safeParse({
        confirmation: "APLICAR",
        reason: "Protecao inicial dos clientes existentes",
      }).success,
    ).toBe(false);
    expect(
      legacyBillingBackfillApplyInputSchema.safeParse({
        confirmation: "APLICAR LEGADO PROTEGIDO",
        reason: "Protecao inicial dos clientes existentes",
        workspaceIds: ["workspace_1"],
      }).success,
    ).toBe(true);
  });

  it("keeps dry-run totals and blocking issues explicit", () => {
    const parsed = legacyBillingBackfillReportSchema.parse({
      generatedAt: "2026-07-26T12:00:00.000Z",
      applyEnabled: false,
      confirmationPhrase: "APLICAR LEGADO PROTEGIDO",
      summary: {
        workspaces: 1,
        eligibleWorkspaces: 0,
        protectedWorkspaces: 0,
        totalResources: 1,
        activeInstances: 0,
        externalChannels: 1,
        existingSeats: 0,
        missingSeats: 1,
        orphanedSeats: 0,
        blockingIssues: 1,
      },
      workspaces: [
        {
          workspace: {
            id: "workspace_1",
            name: "Cliente",
            slug: "cliente",
          },
          currentContractId: null,
          currentContractStatus: null,
          activeInstances: 0,
          externalChannels: 1,
          targetCapacity: 1,
          existingSeats: 0,
          missingSeats: 1,
          orphanedSeats: 0,
          protected: false,
          eligible: false,
          issues: [
            {
              severity: "blocking",
              code: "duplicate_connected_phone",
              message: "Numero duplicado",
              resourceIds: ["channel_1", "channel_2"],
            },
          ],
        },
      ],
    });

    expect(parsed.applyEnabled).toBe(false);
    expect(parsed.summary.blockingIssues).toBe(1);
    expect(parsed.workspaces[0]?.eligible).toBe(false);
  });
});
