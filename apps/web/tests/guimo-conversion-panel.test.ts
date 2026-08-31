// @vitest-environment jsdom
import type { GuimoIntegrationDto } from "@wpptrack/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuimoConversionPanel } from "../src/app/(app)/settings/guimo-conversion-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
  }),
}));

afterEach(() => {
  cleanup();
});

const activeIntegration = {
  id: "guimo_integration_1",
  status: "active",
  webhookVersion: "guimo/v1",
  qualifiedStageId: null,
  qualifiedStageName: "Lead Qualificado",
  purchaseStageId: null,
  purchaseStageName: "Venda Fechada",
  purchaseCurrency: "BRL",
  purchaseValueUnit: "cents",
  hasCrmHeaders: true,
  rules: [
    {
      id: "rule_1",
      stageName: "Lead Qualificado",
      eventName: "QualifiedLead",
      valueMode: "dynamic",
      fixedValueCents: null,
      active: true,
      createdAt: "2026-07-17T18:00:00.000Z",
      updatedAt: "2026-07-17T18:00:00.000Z",
    },
    {
      id: "rule_2",
      stageName: "Venda Fechada",
      eventName: "Purchase",
      valueMode: "fixed",
      fixedValueCents: 19990,
      active: true,
      createdAt: "2026-07-17T18:00:00.000Z",
      updatedAt: "2026-07-17T18:00:00.000Z",
    },
  ],
  createdAt: "2026-07-17T18:00:00.000Z",
  updatedAt: "2026-07-17T19:00:00.000Z",
} satisfies GuimoIntegrationDto;

const connectedNoRules = {
  ...activeIntegration,
  id: "guimo_integration_2",
  rules: [],
} satisfies GuimoIntegrationDto;

describe("guimo conversion panel", () => {
  it("shows an opt-in activation CTA and no rules when there is no connection yet", () => {
    const html = renderPanel({ integrations: [] });

    expect(html).toContain("Nao conectado");
    expect(html).toContain("Gerar URL do webhook");
    expect(html).toContain("Nenhuma conexao Guimo ativa.");
    expect(html).not.toContain("Nome do estagio na Guimo");
    expect(html).not.toContain("Pausar conexao");
    expect(html).not.toContain("Nova regra");
  });

  it("shows the empty state and a Nova regra CTA once connected without rules", () => {
    const html = renderPanel({ integrations: [connectedNoRules] });

    expect(html).toContain("Ativa");
    expect(html).toContain("Nova regra");
    expect(html).toContain("Nenhuma regra cadastrada ainda");
  });

  it("offers free-form rule fields (stage name, conversion select, value mode) in each rule's editor", () => {
    const html = renderPanel({ integrations: [activeIntegration] });

    expect(html).toContain("Nome do estagio na Guimo");
    expect(html).toContain("Conversao disparada");
    expect(html).toContain('<option value="QualifiedLead">Lead qualificado</option>');
    expect(html).toContain('<option value="Purchase">Compras</option>');
    expect(html).toContain('<option value="LeadSubmitted">');
    expect(html).toContain("Valor dinamico do negocio (Guimo)");
    expect(html).toContain("Valor fixo");
    expect(html).toContain("O casamento e feito pelo nome do estagio, nao pelo ID.");
    expect(html).not.toContain('name="stageId"');
    expect(html).not.toContain("Nome do estagio na Guimo (ID)");
  });

  it("lists free-form rules by stage name, chosen conversion and value mode", () => {
    const html = renderPanel({ integrations: [activeIntegration] });

    expect(html).toContain("Estagio na Guimo: Lead Qualificado");
    expect(html).toContain("Estagio na Guimo: Venda Fechada");
    expect(html).toContain("Lead qualificado");
    expect(html).toContain("Compras");
    expect(html).toContain("Valor dinamico do negocio (Guimo)");
    expect(html).toContain("Valor fixo:");
    expect(html).toContain("199,90");
    expect(html).not.toContain('name="stageId"');
  });

  it("gates connect, rule and connection-management actions on canManage", () => {
    const managerHtml = renderPanel({
      canManage: true,
      integrations: [activeIntegration],
    });
    const analystHtml = renderPanel({
      canManage: false,
      integrations: [activeIntegration],
    });
    const managerEmptyHtml = renderPanel({ canManage: true, integrations: [] });
    const analystEmptyHtml = renderPanel({ canManage: false, integrations: [] });

    expect(managerHtml).toContain("Pausar conexao");
    expect(managerHtml).toContain("Gerar nova URL");
    expect(managerHtml).toContain("Nova regra");
    expect(managerHtml).toContain("Editar regra");
    expect(analystHtml).not.toContain("Pausar conexao");
    expect(analystHtml).not.toContain("Gerar nova URL");
    expect(analystHtml).not.toContain("Nova regra");
    expect(analystHtml).not.toContain("Editar regra");
    expect(managerEmptyHtml).toContain("Gerar URL do webhook");
    expect(analystEmptyHtml).not.toContain("Gerar URL do webhook");
  });

  it("never renders CRM credentials, headers or a separate token field/button in the connected rule list", () => {
    const html = renderPanel({ integrations: [activeIntegration] });

    expect(html).not.toContain("Bearer");
    expect(html).not.toContain("crmHeadersEncrypted");
    expect(html).not.toContain("Authorization");
    expect(html).not.toContain("X-API-Key");
    expect(html).not.toContain("Copiar token");
  });
});

describe("guimo activation flow (URL-only, no credentials)", () => {
  it("asks for nothing but generates the webhook URL — no Authorization/Bearer/X-API-Key/separate token field anywhere", () => {
    renderInteractive({ integrations: [] });
    fireEvent.click(screen.getByRole("button", { name: "Gerar URL do webhook" }));

    const form = screen
      .getAllByRole("button", { name: "Gerar URL do webhook" })
      .map((button) => button.closest("form"))
      .find((candidate): candidate is HTMLFormElement => candidate !== null);
    expect(form).toBeTruthy();

    // No credential inputs of any kind — the form only carries the hidden
    // workspaceId and the submit button.
    expect(form?.querySelectorAll("input, select").length).toBe(1);
    expect(form?.querySelector('input[name="workspaceId"]')).toBeTruthy();
    expect(form?.querySelector('input[name="crmAuthorization"]')).toBeNull();
    expect(form?.querySelector('input[name="crmApiKey"]')).toBeNull();
    expect(form?.querySelector('input[name="purchaseCurrency"]')).toBeNull();
    expect(form?.querySelector('select[name="purchaseValueUnit"]')).toBeNull();
    expect(screen.queryByPlaceholderText("Bearer ...")).toBeNull();
    expect(screen.queryByPlaceholderText("Chave de API")).toBeNull();
    expect(screen.queryByText("Avancado (opcional)")).toBeNull();
    expect(document.body.textContent).toContain(
      "Nao ha Authorization, X-API-Key ou token separado para informar",
    );

    // Legacy stage fields never appear anywhere in the activation form, not even collapsed.
    expect(form?.querySelector('[name="qualifiedStageId"]')).toBeNull();
    expect(form?.querySelector('[name="qualifiedStageName"]')).toBeNull();
    expect(form?.querySelector('[name="purchaseStageId"]')).toBeNull();
    expect(form?.querySelector('[name="purchaseStageName"]')).toBeNull();
  });

  it("submits an empty payload and shows only the resulting URL with a copy button, never the raw token", async () => {
    const provisionAction = vi.fn(async (_formData: FormData) => ({
      ok: true as const,
      message: "URL do webhook Guimo gerada.",
      oneTimeWebhook: {
        webhookUrl: "https://api.wpptrack.test/webhooks/guimo/v1/integration_1?token=raw-secret-token-value",
        webhookPath: "/webhooks/guimo/v1/integration_1?token=raw-secret-token-value",
      },
    }));

    renderInteractive({ integrations: [], provisionAction });
    fireEvent.click(screen.getByRole("button", { name: "Gerar URL do webhook" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar URL do webhook" }));

    await screen.findByLabelText("URL do webhook Guimo");

    expect(provisionAction).toHaveBeenCalledTimes(1);
    const sentFormData = provisionAction.mock.calls[0][0] as FormData;
    expect(sentFormData.get("workspaceId")).toBe("workspace_1");
    expect(sentFormData.get("crmAuthorization")).toBeNull();
    expect(sentFormData.get("crmApiKey")).toBeNull();

    const urlField = screen.getByLabelText(
      "URL do webhook Guimo",
    ) as HTMLInputElement;
    expect(urlField.value).toBe(
      "https://api.wpptrack.test/webhooks/guimo/v1/integration_1?token=raw-secret-token-value",
    );
    expect(screen.getByRole("button", { name: /Copiar URL/ })).toBeTruthy();
    expect(screen.queryByLabelText("Token privado do webhook Guimo")).toBeNull();
    expect(screen.queryByRole("button", { name: /Copiar token/ })).toBeNull();
    expect(document.body.textContent).toContain(
      "Cole essa URL completa na configuracao de webhook da Guimo",
    );
  });
});

describe("guimo connected connection actions", () => {
  it("labels rotation as generating a new URL and warns it invalidates the previous one", () => {
    renderInteractive({ integrations: [activeIntegration] });

    expect(screen.getByRole("button", { name: /Gerar nova URL/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Girar novo token/ })).toBeNull();
  });
});

function renderInteractive({
  canManage = true,
  integrations = [],
  provisionAction,
}: {
  canManage?: boolean;
  integrations?: GuimoIntegrationDto[];
  provisionAction?: (formData: FormData) => Promise<{
    ok: true;
    message: string;
    oneTimeWebhook?: {
      webhookUrl: string | null;
      webhookPath: string;
    };
  }>;
} = {}) {
  const connectAction =
    provisionAction ??
    vi.fn(async (_formData: FormData) => ({
      ok: true as const,
      message: "ok",
    }));
  const ruleAction = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));
  const conversionRuleAction = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));

  return render(
    createElement(GuimoConversionPanel, {
      workspaceId: "workspace_1",
      integrations,
      canManage,
      provisionAction: connectAction,
      rotateAction: connectAction,
      setActiveAction: ruleAction,
      createRuleAction: conversionRuleAction,
      updateRuleAction: conversionRuleAction,
      deleteRuleAction: conversionRuleAction,
    }),
  );
}

function renderPanel({
  canManage = true,
  integrations = [],
}: {
  canManage?: boolean;
  integrations?: GuimoIntegrationDto[];
} = {}) {
  const connectAction = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));
  const ruleAction = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));
  const conversionRuleAction = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));

  return renderToStaticMarkup(
    createElement(GuimoConversionPanel, {
      workspaceId: "workspace_1",
      integrations,
      canManage,
      provisionAction: connectAction,
      rotateAction: connectAction,
      setActiveAction: ruleAction,
      createRuleAction: conversionRuleAction,
      updateRuleAction: conversionRuleAction,
      deleteRuleAction: conversionRuleAction,
    }),
  );
}
