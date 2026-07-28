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
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
