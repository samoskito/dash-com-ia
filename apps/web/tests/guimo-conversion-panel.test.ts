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
    expect(html).toContain("Ativar conexao Guimo");
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
    expect(managerHtml).toContain("Girar novo token");
    expect(managerHtml).toContain("Nova regra");
    expect(managerHtml).toContain("Editar regra");
    expect(analystHtml).not.toContain("Pausar conexao");
    expect(analystHtml).not.toContain("Girar novo token");
    expect(analystHtml).not.toContain("Nova regra");
    expect(analystHtml).not.toContain("Editar regra");
    expect(managerEmptyHtml).toContain("Ativar conexao Guimo");
    expect(analystEmptyHtml).not.toContain("Ativar conexao Guimo");
  });

  it("never renders CRM credentials in the connected rule list", () => {
    const html = renderPanel({ integrations: [activeIntegration] });

    expect(html).not.toContain("Bearer");
    expect(html).not.toContain("crmHeadersEncrypted");
  });
});

describe("guimo activation form", () => {
  it("asks only for CRM credentials, with stage/moeda/unidade fully removed from the main form", () => {
    renderInteractive({ integrations: [] });
    fireEvent.click(screen.getByRole("button", { name: "Ativar conexao Guimo" }));

    const form = screen
      .getByRole("button", { name: "Ativar conexao" })
      .closest("form") as HTMLFormElement;
    const scope = within(form);

    expect(scope.getByPlaceholderText("Bearer ...")).toBeTruthy();
    expect(scope.getByPlaceholderText("Chave de API")).toBeTruthy();
    expect(form.querySelector('input[name="crmAuthorization"]')).toBeTruthy();
    expect(form.querySelector('input[name="crmApiKey"]')).toBeTruthy();

    // Legacy stage fields never appear anywhere in the activation form, not even collapsed.
    expect(form.querySelector('[name="qualifiedStageId"]')).toBeNull();
    expect(form.querySelector('[name="qualifiedStageName"]')).toBeNull();
    expect(form.querySelector('[name="purchaseStageId"]')).toBeNull();
    expect(form.querySelector('[name="purchaseStageName"]')).toBeNull();
    expect(scope.queryByPlaceholderText("Ex.: Lead Qualificado")).toBeNull();
    expect(scope.queryByPlaceholderText("Ex.: Venda Fechada")).toBeNull();
  });

  it("keeps moeda/unidade behind a collapsed, default-closed Avancado (opcional) block", () => {
    renderInteractive({ integrations: [] });
    fireEvent.click(screen.getByRole("button", { name: "Ativar conexao Guimo" }));

    const form = screen
      .getByRole("button", { name: "Ativar conexao" })
      .closest("form") as HTMLFormElement;
    const details = form.querySelector("details") as HTMLDetailsElement;

    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    expect(within(details).getByText("Avancado (opcional)")).toBeTruthy();

    const currencyField = details.querySelector('input[name="purchaseCurrency"]');
    const unitField = details.querySelector('select[name="purchaseValueUnit"]');
    expect(currencyField).toBeTruthy();
    expect(unitField).toBeTruthy();

    fireEvent.click(within(details).getByText("Avancado (opcional)"));
    expect(details.open).toBe(true);
  });

  it("requires both CRM credential fields before the browser allows submission", () => {
    renderInteractive({ integrations: [] });
    fireEvent.click(screen.getByRole("button", { name: "Ativar conexao Guimo" }));

    const form = screen
      .getByRole("button", { name: "Ativar conexao" })
      .closest("form") as HTMLFormElement;

    const authorization = form.querySelector(
      'input[name="crmAuthorization"]',
    ) as HTMLInputElement;
    const apiKey = form.querySelector('input[name="crmApiKey"]') as HTMLInputElement;

    expect(authorization.required).toBe(true);
    expect(apiKey.required).toBe(true);
  });
});

function renderInteractive({
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
