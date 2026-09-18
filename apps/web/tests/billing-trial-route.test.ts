import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BackofficeBillingPage from "../src/app/(backoffice)/backoffice/billing/page";

afterEach(() => {
  vi.restoreAllMocks();
});

type ContractOverrides = Record<string, unknown>;

function contract(overrides: ContractOverrides = {}) {
  return {
    id: "contract_trial",
    workspaceId: "workspace_2",
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

type BillingMockOptions = {
  platformRole?: "platform_owner" | "platform_operator";
  reminderTemplates?: unknown;
  reminderTemplatesStatus?: number;
};

function mockBilling(
  contracts: ContractOverrides[],
  options: BillingMockOptions = {},
): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;

    if (path === "/auth/me") {
      return json({
        user: {
          id: "user_1",
          email: "owner@wpptrack.com",
          name: "Owner",
          platformRole: options.platformRole ?? "platform_owner",
        },
      });
    }

    if (path === "/backoffice/billing/trial-reminder-templates") {
      return json(
        options.reminderTemplates ?? defaultReminderTemplates(),
        options.reminderTemplatesStatus ?? 200,
      );
    }

    if (path === "/backoffice/billing/package-contracts") {
      return json(
        contracts.map((entry) => ({
          workspace: {
            id: String(entry.workspaceId ?? "workspace_2"),
            name:
              String(entry.workspaceId ?? "workspace_2") === "workspace_2"
                ? "Cliente Trial"
                : "Cliente Pago",
            slug: "cliente",
          },
          contract: contract(entry),
        })),
      );
    }

    if (path === "/backoffice/workspaces") {
      return json([
        { id: "workspace_1", name: "Cliente Livre", slug: "cliente-livre" },
        { id: "workspace_2", name: "Cliente Trial", slug: "cliente-trial" },
      ]);
    }

    if (path === "/backoffice/billing/legacy-backfill") {
      return json({
        generatedAt: "2026-09-18T12:00:00.000Z",
        applyEnabled: false,
        confirmationPhrase: "APLICAR LEGADO PROTEGIDO",
        summary: {
          workspaces: 0,
          eligibleWorkspaces: 0,
          protectedWorkspaces: 0,
          totalResources: 0,
          activeInstances: 0,
          externalChannels: 0,
          existingSeats: 0,
          missingSeats: 0,
          orphanedSeats: 0,
          blockingIssues: 0,
        },
        workspaces: [],
      });
    }

    if (path === "/backoffice/billing/fiscal-settings") {
      return json(null);
    }

    return json([]);
  });
}

function defaultReminderTemplates() {
  return [
    {
      moment: "day_of",
      emailSubject: "Hoje termina o teste",
      body: "Ola, {{cliente}}! Hoje e o ultimo dia.",
    },
    {
      moment: "d3",
      emailSubject: "Faltam 3 dias",
      body: "Ola, {{cliente}}! Assine em {{link_assinatura}}.",
    },
    {
      moment: "post",
      emailSubject: "Periodo de graca",
      body: "Ola, {{cliente}}! Regularize sua assinatura.",
    },
  ];
}

async function renderBillingPage(): Promise<string> {
  const element = await BackofficeBillingPage();
  return renderToStaticMarkup(createElement("div", null, element));
}

describe("backoffice billing trial controls", () => {
  it("offers the 30-day trial only for workspaces without a live contract", async () => {
    mockBilling([{}]);

    const html = await renderBillingPage();

    expect(html).toContain("Iniciar trial 30d");
    // Any seat count from 1 to 20 is allowed, so the field is a number input.
    const capacityField = /<input[^>]*name="capacity"[^>]*>/.exec(html)?.[0];
    expect(capacityField).toContain('type="number"');
    expect(capacityField).toContain('min="1"');
    expect(capacityField).toContain('max="20"');
    expect(html).not.toContain('<option value="3">3 numeros</option>');
    // The assign form lists every workspace; the trial form only the free one.
    expect(
      occurrences(html, '<option value="workspace_1">Cliente Livre</option>'),
    ).toBe(2);
    expect(
      occurrences(html, '<option value="workspace_2">Cliente Trial</option>'),
    ).toBe(1);
  });

  it("badges the trial row and offers the autoconvert opt-out", async () => {
    mockBilling([{}]);

    const html = await renderBillingPage();

    expect(html).toContain("Trial · 30d");
    expect(html).toContain("Ate 18/10/2026");
    expect(html).toContain("Desligar auto-cobranca");
  });

  it("hides the opt-out once the autoconvert is already off", async () => {
    mockBilling([{ canAutoconvert: false }]);

    const html = await renderBillingPage();

    expect(html).toContain("Trial · 30d");
    expect(html).not.toContain("Desligar auto-cobranca");
  });

  it("keeps the end-contract button of a pending paid draft", async () => {
    mockBilling([
      {
        id: "contract_draft",
        workspaceId: "workspace_3",
        planId: "plan_paid",
        status: "draft",
        planName: "Pago 2 numeros",
        monthlyPriceCents: 6_000,
        includedWhatsappNumbers: 2,
        trialEndsAt: null,
        canAutoconvert: false,
        trialDaysRemaining: null,
        isCurrent: false,
        canCancel: true,
      },
    ]);

    const html = await renderBillingPage();

    expect(html).toContain("Encerrar");
    expect(html).not.toContain("Trial · ");
  });

  it("never relies on a native confirm dialog", async () => {
    mockBilling([{}]);

    const html = await renderBillingPage();

    expect(html).not.toContain("confirm(");
  });
});

describe("backoffice trial reminder messages", () => {
  it("prefills each moment with the text saved on the API", async () => {
    mockBilling([{}]);

    const html = await renderBillingPage();

    expect(html).toContain("Mensagens de trial e cobranca");
    expect(html).toContain("3 dias antes do fim");
    expect(html).toContain("No dia em que termina");
    expect(html).toContain("Depois que terminou");
    // Looked up by moment, not by the order the API happened to return them.
    expect(field(html, "d3_subject")).toContain('value="Faltam 3 dias"');
    expect(html).toContain("Ola, {{cliente}}! Hoje e o ultimo dia.");
  });

  it("lists every placeholder the API knows how to replace", async () => {
    mockBilling([{}]);

    const html = await renderBillingPage();

    for (const token of [
      "{{cliente}}",
      "{{data_fim}}",
      "{{valor}}",
      "{{numeros}}",
      "{{link_assinatura}}",
    ]) {
      expect(html).toContain(`<code>${token}</code>`);
    }
    expect(html).toContain("Salvar mensagens");
  });

  it("warns instead of offering a blank editor when the load fails", async () => {
    mockBilling([{}], { reminderTemplatesStatus: 500 });

    const html = await renderBillingPage();

    expect(html).toContain("Nao foi possivel carregar as mensagens");
    expect(html).not.toContain("Salvar mensagens");
  });

  it("hides the editor from an operator who cannot change it", async () => {
    mockBilling([{}], { platformRole: "platform_operator" });

    const html = await renderBillingPage();

    expect(html).not.toContain("Mensagens de trial e cobranca");
  });
});

describe("backoffice billing form layout", () => {
  it("gives each disclosure the icon its two-column header expects", async () => {
    mockBilling([{}]);

    const html = await renderBillingPage();

    // Without the icon span the heading text lands in the 34px icon column.
    expect(
      occurrences(html, '<span class="client-management-disclosure-icon"'),
    ).toBe(2);
  });

  it("gives the reason fields a full row of their own", async () => {
    mockBilling([{}]);

    const html = await renderBillingPage();

    expect(
      occurrences(html, '<label class="billing-field-wide">'),
    ).toBeGreaterThanOrEqual(4);
  });
});

function field(html: string, name: string): string {
  return new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
