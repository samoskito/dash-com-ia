// @vitest-environment jsdom
import type { GuimoIntegrationDto } from "@wpptrack/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboundWebhookChannelDto } from "@wpptrack/shared";
import { ProviderConversionRulePanel } from "../src/app/(app)/integrations/provider-conversion-rule-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

afterEach(() => {
  cleanup();
});

const channel = {
  id: "channel_1",
  connectionId: "connection_1",
  organizationId: "organization_1",
  providerChannelId: "provider_channel_1",
  connectedPhone: "+5511999990000",
  channelName: "Comercial",
  whatsappInstanceId: null,
  status: "active",
  productionActivatedAt: null,
  firstSeenAt: "2026-07-21T10:00:00.000Z",
  lastSeenAt: "2026-07-21T11:00:00.000Z",
  routes: [],
  readiness: {
    state: "ready",
    blockers: [],
    routeCount: 1,
    validRouteCount: 1,
    totalCtwa: 1,
    routedCtwa: 1,
    unresolvedCtwa: 0,
    retainedCtwa: 1,
    retainedRoutedCtwa: 1,
    payloadUnavailableCtwa: 0,
    alreadyMaterializedCtwa: 0,
    nextPayloadExpiresAt: null,
  },
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-21T11:00:00.000Z",
} satisfies InboundWebhookChannelDto;

const connectedIntegration = {
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

function renderPanel({
  guimoIntegrations = [],
  guimoEnabled = true,
}: {
  guimoIntegrations?: GuimoIntegrationDto[];
  guimoEnabled?: boolean;
} = {}) {
  const action = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));
  const guimoAction = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));

  return render(
    React.createElement(ProviderConversionRulePanel, {
      connectionId: "connection_1",
      connectionProvider: "umbler",
      channels: [channel],
      rules: [],
      enabled: true,
      canManage: true,
      createAction: action,
      updateAction: action,
      rotateEndpointAction: action,
      loadAutomationAuditAction: action,
      loadAutomationPayloadAction: action,
      loadPurchaseAuditAction: action,
      loadExecutionAuditAction: action,
      reprocessAutomationCallbacksAction: action,
      removeAction: action,
      testMessageAction: action,
      guimoEnabled,
      workspaceId: "workspace_1",
      guimoIntegrations,
      guimoProvisionAction: guimoAction,
      guimoRotateAction: guimoAction,
      guimoSetActiveAction: guimoAction,
      guimoCreateRuleAction: guimoAction,
      guimoUpdateRuleAction: guimoAction,
      guimoDeleteRuleAction: guimoAction,
    }),
  );
}

function openCreateDialog() {
  fireEvent.click(screen.getByRole("button", { name: /Nova regra/i }));
}

function selectOrigin(label: string) {
  fireEvent.change(screen.getByLabelText("Origem do gatilho"), {
    target: { value: label },
  });
}

describe("provider conversion rule panel — Guimo trigger source", () => {
  it("shows no Guimo UI while the message/tag/catalog origins are selected", () => {
    renderPanel();
    openCreateDialog();

    expect(screen.getByLabelText("Origem do gatilho")).toBeTruthy();
    expect(screen.queryByText("Gerar URL do webhook")).toBeNull();
    expect(screen.queryByText("Nome do estagio na Guimo")).toBeNull();

    selectOrigin("tag");
    expect(screen.queryByText("Gerar URL do webhook")).toBeNull();

    selectOrigin("catalog");
    expect(screen.queryByText("Gerar URL do webhook")).toBeNull();
  });

  it("reveals the Guimo activation form inline only after selecting the Guimo origin, with no connection yet", () => {
    const { container } = renderPanel({ guimoIntegrations: [] });
    openCreateDialog();
    selectOrigin("guimo");

    expect(screen.getByText("Gerar URL do webhook")).toBeTruthy();
    expect(container.textContent).toContain("Nenhuma conexao Guimo ativa.");
    // Provider-specific fields must not leak into the Guimo origin.
    expect(screen.queryByPlaceholderText("Ex.: Compra confirmada")).toBeNull();
  });

  it("reveals the free-form rule fields (stage name, chosen conversion, value mode) once Guimo is connected", () => {
    const { container } = renderPanel({
      guimoIntegrations: [connectedIntegration],
    });
    openCreateDialog();
    selectOrigin("guimo");

    expect(container.textContent).toContain(
      "Estagio na Guimo: Lead Qualificado",
    );
    expect(container.textContent).toContain("Estagio na Guimo: Venda Fechada");
    expect(container.textContent).toContain(
      "Valor dinamico do negocio (Guimo)",
    );
    expect(container.textContent).toContain("Valor fixo:");
  });

  it("requires a positive fixed amount only when the fixed value mode is chosen for a new rule", () => {
    renderPanel({ guimoIntegrations: [connectedIntegration] });
    openCreateDialog();
    selectOrigin("guimo");
    fireEvent.click(screen.getByRole("button", { name: "Nova regra" }));

    const createForm = screen
      .getByRole("button", { name: "Criar regra" })
      .closest("form") as HTMLFormElement;
    const scope = within(createForm);

    const stageNameInput = scope.getByPlaceholderText("Ex.: Lead Qualificado");
    expect(stageNameInput).toBeTruthy();
    expect(scope.queryByPlaceholderText("Ex.: 199,90")).toBeNull();

    fireEvent.click(scope.getByLabelText("Valor fixo"));
    const fixedInput = scope.getByPlaceholderText(
      "Ex.: 199,90",
    ) as HTMLInputElement;
    expect(fixedInput.required).toBe(true);

    fireEvent.click(scope.getByLabelText("Valor dinamico do negocio (Guimo)"));
    expect(scope.queryByPlaceholderText("Ex.: 199,90")).toBeNull();
  });

  it("gives management actions (pause and remove) for each Guimo rule", () => {
    renderPanel({ guimoIntegrations: [connectedIntegration] });
    openCreateDialog();
    selectOrigin("guimo");

    expect(
      screen.getByLabelText("Pausar regra de Lead Qualificado"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Remover regra de Lead Qualificado"),
    ).toBeTruthy();
  });

  it("hides the Guimo origin entirely for workspaces where the owner has not enabled it", () => {
    renderPanel({ guimoEnabled: false });
    openCreateDialog();

    expect(screen.queryByText("Movimentacao no CRM (Guimo)")).toBeNull();
  });
});
