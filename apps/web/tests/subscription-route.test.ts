import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SubscriptionPage from "../src/app/(app)/subscription/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscription route", () => {
  it("renders package capacity, fiscal history and self-service actions", async () => {
    const requestedPaths: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      requestedPaths.push(path);

      if (path === "/billing/package/state") {
        return json({
          profile: null,
          contract: {
            id: "contract_1",
            workspaceId: "workspace_1",
            planId: "plan_1",
            status: "active",
            planName: "Inicial 3 numeros",
            planVersion: 1,
            monthlyPriceCents: 5_000,
            includedWhatsappNumbers: 3,
            occupiedWhatsappNumbers: 2,
            billingMethod: "pix",
            currentPeriodStart: "2026-07-01T00:00:00.000Z",
            currentPeriodEnd: "2026-08-01T00:00:00.000Z",
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
            accessEndsAt: null,
            fiscalStatus: "authorized",
          },
          availablePlans: [
            {
              id: "plan_1",
              name: "Inicial 3 numeros",
              slug: "inicial-3-numeros",
              kind: "standard",
              visibility: "public",
              monthlyPriceCents: 5_000,
              includedWhatsappNumbers: 3,
              version: 1,
              active: true,
            },
          ],
          seats: {
            capacity: 3,
            occupied: 2,
            available: 1,
            reserved: 0,
            active: 2,
            suspended: 0,
          },
          invoices: [
            {
              id: "invoice_1",
              workspaceId: "workspace_1",
              subscriptionId: "contract_1",
              paymentChargeId: "charge_1",
              providerInvoiceId: "invoice_asaas_1",
              providerPaymentId: "payment_1",
              status: "authorized",
              amountCents: 5_000,
              issuedAt: "2026-07-01T12:00:00.000Z",
              authorizedAt: "2026-07-01T12:01:00.000Z",
              canceledAt: null,
              lastErrorCode: null,
              lastAttemptAt: "2026-07-01T12:01:00.000Z",
              createdAt: "2026-07-01T12:00:00.000Z",
            },
          ],
          enforcementEnabled: false,
          capabilities: {
            packageBilling: true,
            recurringCheckout: true,
            lifecycle: true,
            automaticInvoices: true,
            uazapiProvisioning: true,
            externalChannelEnforcement: false,
          },
        });
      }

      if (path === "/workspaces/current") {
        return json({
          id: "workspace_1",
          name: "Cliente Inicial",
          slug: "cliente-inicial",
          role: "owner",
          operationalStatus: "active",
          permissions: {
            canInviteMembers: true,
            canManageMembers: true,
            canGrantMemberManager: true,
            canManageBilling: true,
            canManageIntegrations: true,
            canManageWorkspaceSettings: true,
            canTransferOwnership: true,
            canViewReports: true,
            canExportReports: true,
          },
        });
      }

      if (path === "/billing/package/seats") {
        return json([
          {
            id: "seat_1",
            workspaceId: "workspace_1",
            subscriptionId: "contract_1",
            provider: "uazapi",
            status: "active",
            normalizedPhone: "5549998347468",
            whatsappInstanceId: "instance_1",
            inboundWebhookChannelId: null,
            reservationExpiresAt: null,
            activatedAt: "2026-07-27T20:45:02.193Z",
            suspendedAt: null,
            releasedAt: null,
          },
        ]);
      }

      if (path === "/integrations/whatsapp/instances") {
        return json([
          {
            id: "instance_1",
            name: "Comunidade NOD - Teste",
            provider: "uazapi",
            billingStatus: "active",
            providerInstanceId: "provider_instance_1",
            checkoutUrl: null,
            createdAt: "2026-07-27T20:30:00.000Z",
          },
        ]);
      }

      return json({ message: `Unhandled test URL: ${path}` }, 404);
    });

    const element = await SubscriptionPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(requestedPaths).toContain("/billing/package/state");
    expect(requestedPaths).toContain("/workspaces/current");
    expect(requestedPaths).toContain("/billing/package/seats");
    expect(requestedPaths).toContain("/integrations/whatsapp/instances");
    expect(html).toContain("Assinatura WhatsApp");
    expect(html).toContain("Inicial 3 numeros");
    expect(html).toContain("2/3 ocupados");
    expect(html).toContain("Instancias do pacote");
    expect(html).toContain("NOD API por QR code");
    expect(html).toContain("Conectar numero por QR code");
    expect(html).toContain("Comunidade NOD - Teste");
    expect(html).toContain("+55 49 99834-7468");
    expect(html).toContain("Conectado");
    expect(html).toContain("Remover numero");
    expect(html).toContain("A assinatura nao sera cancelada.");
    expect(html).toContain("Gerar QR code");
    expect(html).toContain("Pagamentos e notas fiscais");
    expect(html).toContain("Autorizada");
    expect(html).toContain("Cancelar renovacao");
  });

  it("uses the assigned private package checkout instead of the public plan", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;

      if (path === "/billing/package/state") {
        return json({
          profile: {
            id: "profile_1",
            workspaceId: "workspace_1",
          },
          contract: {
            id: "contract_canary",
            workspaceId: "workspace_1",
            planId: "plan_canary",
            status: "draft",
            planName: "Canario producao - 1 numero",
            planVersion: 1,
            monthlyPriceCents: 500,
            includedWhatsappNumbers: 1,
            occupiedWhatsappNumbers: 0,
            billingMethod: "unknown",
            currentPeriodStart: null,
            currentPeriodEnd: null,
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
            accessEndsAt: null,
            fiscalStatus: "not_configured",
          },
          availablePlans: [
            {
              id: "plan_public",
              name: "Rastrackdash Wpp - 1 numero",
              slug: "rastrackdash-wpp-1-numero",
              kind: "standard",
              visibility: "public",
              monthlyPriceCents: 3_000,
              includedWhatsappNumbers: 1,
              version: 1,
              active: true,
            },
          ],
          seats: {
            capacity: 0,
            occupied: 0,
            available: 0,
            reserved: 0,
            active: 0,
            suspended: 0,
          },
          invoices: [],
          enforcementEnabled: true,
          capabilities: {
            packageBilling: true,
            recurringCheckout: true,
            lifecycle: true,
            automaticInvoices: false,
            uazapiProvisioning: true,
            externalChannelEnforcement: true,
          },
        });
      }

      if (path === "/workspaces/current") {
        return json({
          id: "workspace_1",
          name: "Comunidade NOD",
          slug: "comunidade-nod",
          role: "owner",
          operationalStatus: "active",
          permissions: {
            canInviteMembers: true,
            canManageMembers: true,
            canGrantMemberManager: true,
            canManageBilling: true,
            canManageIntegrations: true,
            canManageWorkspaceSettings: true,
            canTransferOwnership: true,
            canViewReports: true,
            canExportReports: true,
          },
        });
      }

      if (
        path === "/billing/package/seats" ||
        path === "/integrations/whatsapp/instances"
      ) {
        return json([]);
      }

      return json({ message: `Unhandled test URL: ${path}` }, 404);
    });

    const element = await SubscriptionPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Canario producao - 1 numero");
    expect(html).toContain("5,00");
    expect(html).toContain("Iniciar pagamento");
    expect(html).toContain('name="planId" value="plan_canary"');
    expect(html).not.toContain("Rastrackdash Wpp - 1 numero");
    expect(html).not.toContain('value="plan_public"');
  });

  it("orders sections as contract summary, capacity, instances/additive CTA, billing profile, invoices", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;

      if (path === "/billing/package/state") {
        return json(baseBillingState());
      }

      if (path === "/workspaces/current") {
        return json(baseWorkspace());
      }

      if (
        path === "/billing/package/seats" ||
        path === "/integrations/whatsapp/instances"
      ) {
        return json([]);
      }

      return json({ message: `Unhandled test URL: ${path}` }, 404);
    });

    const element = await SubscriptionPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    const contractIndex = html.indexOf("Contrato atual");
    const capacityIndex = html.indexOf("Capacidade WhatsApp");
    const instancesIndex = html.indexOf("Instancias do pacote");
    const additiveCtaIndex = html.indexOf("Numero avulso adicional");
    const qrConnectIndex = html.indexOf("Conectar numero por QR code");
    const profileIndex = html.indexOf("Dados de cobranca");
    const invoicesIndex = html.indexOf("Pagamentos e notas fiscais");

    for (const index of [
      contractIndex,
      capacityIndex,
      instancesIndex,
      qrConnectIndex,
      additiveCtaIndex,
      profileIndex,
      invoicesIndex,
    ]) {
      expect(index).toBeGreaterThan(-1);
    }

    expect(contractIndex).toBeLessThan(capacityIndex);
    expect(capacityIndex).toBeLessThan(instancesIndex);
    expect(instancesIndex).toBeLessThan(qrConnectIndex);
    expect(qrConnectIndex).toBeLessThan(additiveCtaIndex);
    expect(additiveCtaIndex).toBeLessThan(profileIndex);
    expect(profileIndex).toBeLessThan(invoicesIndex);
  });

  it("shows honest additive item states from contract.items using providerSyncStatus", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;

      if (path === "/billing/package/state") {
        return json(
          baseBillingState({
            items: [
              {
                id: "item_awaiting",
                key: "individual-whatsapp-number",
                name: "Numero avulso",
                quantity: 1,
                capacity: 1,
                monthlyPriceCents: 3_000,
                status: "pending_payment",
                providerSyncStatus: "not_required",
              },
              {
                id: "item_activating",
                key: "individual-whatsapp-number",
                name: "Numero avulso",
                quantity: 1,
                capacity: 1,
                monthlyPriceCents: 3_000,
                status: "pending_payment",
                providerSyncStatus: "pending",
              },
              {
                id: "item_active",
                key: "individual-whatsapp-number",
                name: "Numero avulso",
                quantity: 1,
                capacity: 1,
                monthlyPriceCents: 3_000,
                status: "active",
                providerSyncStatus: "synced",
              },
            ],
          }),
        );
      }

      if (path === "/workspaces/current") {
        return json(baseWorkspace());
      }

      if (
        path === "/billing/package/seats" ||
        path === "/integrations/whatsapp/instances"
      ) {
        return json([]);
      }

      return json({ message: `Unhandled test URL: ${path}` }, 404);
    });

    const element = await SubscriptionPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("Estado dos numeros adicionais");
    expect(html).toContain("Aguardando pagamento");
    expect(html).toContain("Aguardando confirmacao do pagamento");
    expect(html).toContain("Pago, ativando capacidade");
    expect(html).toContain("Pagamento confirmado. Ativando a capacidade");
    expect(html).toContain(">Ativo<");
    expect(html).toContain("Capacidade ativa no pacote.");
  });

  it("explains a zero-availability capacity honestly instead of fabricating open slots", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;

      if (path === "/billing/package/state") {
        return json(
          baseBillingState({
            seats: {
              capacity: 3,
              occupied: 3,
              available: 0,
              reserved: 0,
              active: 3,
              suspended: 0,
            },
            items: [
              {
                id: "item_activating",
                key: "individual-whatsapp-number",
                name: "Numero avulso",
                quantity: 1,
                capacity: 1,
                monthlyPriceCents: 3_000,
                status: "pending_payment",
                providerSyncStatus: "failed",
              },
            ],
          }),
        );
      }

      if (path === "/workspaces/current") {
        return json(baseWorkspace());
      }

      if (
        path === "/billing/package/seats" ||
        path === "/integrations/whatsapp/instances"
      ) {
        return json([]);
      }

      return json({ message: `Unhandled test URL: ${path}` }, 404);
    });

    const element = await SubscriptionPage();
    const html = renderToStaticMarkup(createElement("div", null, element));

    expect(html).toContain("3/3 ocupados");
    expect(html).toContain(
      "ha pagamento(s) confirmado(s) aguardando a ativacao da capacidade",
    );
    expect(html).not.toContain("O pacote atingiu a capacidade contratada.");
  });
});

function baseWorkspace() {
  return {
    id: "workspace_1",
    name: "Cliente Inicial",
    slug: "cliente-inicial",
    role: "owner",
    operationalStatus: "active",
    permissions: {
      canInviteMembers: true,
      canManageMembers: true,
      canGrantMemberManager: true,
      canManageBilling: true,
      canManageIntegrations: true,
      canManageWorkspaceSettings: true,
      canTransferOwnership: true,
      canViewReports: true,
      canExportReports: true,
    },
  };
}

function baseBillingState(
  overrides: {
    items?: unknown[];
    seats?: {
      capacity: number;
      occupied: number;
      available: number;
      reserved: number;
      active: number;
      suspended: number;
    };
  } = {},
) {
  return {
    profile: null,
    contract: {
      id: "contract_1",
      workspaceId: "workspace_1",
      planId: "plan_1",
      status: "active",
      planName: "Inicial 3 numeros",
      planVersion: 1,
      monthlyPriceCents: 5_000,
      includedWhatsappNumbers: 3,
      occupiedWhatsappNumbers: 2,
      billingMethod: "pix",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      accessEndsAt: null,
      fiscalStatus: "authorized",
      items: overrides.items ?? [],
    },
    availablePlans: [
      {
        id: "plan_1",
        name: "Inicial 3 numeros",
        slug: "inicial-3-numeros",
        kind: "standard",
        visibility: "public",
        monthlyPriceCents: 5_000,
        includedWhatsappNumbers: 3,
        version: 1,
        active: true,
      },
    ],
    seats: overrides.seats ?? {
      capacity: 3,
      occupied: 2,
      available: 1,
      reserved: 0,
      active: 2,
      suspended: 0,
    },
    invoices: [],
    enforcementEnabled: false,
    capabilities: {
      packageBilling: true,
      recurringCheckout: true,
      lifecycle: true,
      automaticInvoices: true,
      uazapiProvisioning: true,
      externalChannelEnforcement: false,
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
