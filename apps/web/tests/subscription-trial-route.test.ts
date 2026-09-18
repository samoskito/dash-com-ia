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

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract_trial",
    workspaceId: "workspace_1",
    planId: null,
    status: "exempt",
    planName: "Trial 30 dias (1 numero)",
    planVersion: 1,
    monthlyPriceCents: 0,
    includedWhatsappNumbers: 1,
    occupiedWhatsappNumbers: 1,
    billingMethod: "pix",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    trialEndsAt: "2026-10-18T12:00:00.000Z",
    canAutoconvert: true,
    trialDaysRemaining: 30,
    cancelAtPeriodEnd: false,
    accessEndsAt: "2026-10-18T12:00:00.000Z",
    fiscalStatus: "not_configured",
    isCurrent: true,
    canCancel: false,
    items: [],
    ...overrides,
  };
}

function mockState(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;

    if (path === "/billing/package/state") {
      return json({
        profile: null,
        contract: contract(overrides),
        availablePlans: [],
        seats: {
          capacity: 1,
          occupied: 1,
          available: 0,
          reserved: 0,
          active: 1,
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
      });
    }

    if (path === "/workspaces/current") {
      return json({
        id: "workspace_1",
        name: "Cliente Trial",
        slug: "cliente-trial",
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

    return json([]);
  });
}

async function renderSubscriptionPage(): Promise<string> {
  const element = await SubscriptionPage();
  return renderToStaticMarkup(createElement("div", null, element));
}

describe("subscription trial status", () => {
  it("shows the trial deadline instead of a bare 'Isento' chip", async () => {
    mockState();

    const html = await renderSubscriptionPage();

    expect(html).toContain("Trial ativo");
    expect(html).toContain("Trial ate 18/10/2026");
    expect(html).toContain("Faltam 30 dia(s)");
    expect(html).toContain("cobranca dos numeros conectados");
  });

  it("says nothing will be charged when the autoconvert was disabled", async () => {
    mockState({ canAutoconvert: false });

    const html = await renderSubscriptionPage();

    expect(html).toContain("Nada sera cobrado no fim do periodo");
  });

  it("keeps the grace deadline visible after the trial ends", async () => {
    mockState({
      status: "grace_period",
      trialEndsAt: "2026-09-16T12:00:00.000Z",
      trialDaysRemaining: 0,
      graceEndsAt: "2026-09-19T12:00:00.000Z",
      accessEndsAt: "2026-09-19T12:00:00.000Z",
    });

    const html = await renderSubscriptionPage();

    expect(html).toContain("Trial encerrado");
    expect(html).toContain("Seu acesso continua ate 19/09/2026");
  });

  it("points the pending paid draft at the existing checkout flow", async () => {
    mockState({
      id: "contract_draft",
      planId: "plan_paid",
      status: "draft",
      planName: "Pago 2 numeros",
      monthlyPriceCents: 6_000,
      includedWhatsappNumbers: 2,
      trialEndsAt: null,
      canAutoconvert: false,
      trialDaysRemaining: null,
      accessEndsAt: null,
      isCurrent: false,
    });

    const html = await renderSubscriptionPage();

    expect(html).toContain("Pagamento pendente");
    expect(html).toContain("Seu acesso atual continua ativo");
    expect(html).toContain("Iniciar pagamento");
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
