// @vitest-environment jsdom
import type { InboundWebhookChannelDto } from "@wpptrack/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderConversionRulePanel } from "../src/app/(app)/integrations/provider-conversion-rule-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function buildChannel(id: string, channelName: string) {
  return {
    id,
    connectionId: "connection_1",
    organizationId: "organization_1",
    providerChannelId: `provider_${id}`,
    connectedPhone: "+5511999990000",
    channelName,
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
}

const webhookUrl =
  "https://api.example.com/webhooks/inbound/conversions/endpoint_1?token=secret_token_1";

function renderPanel(channels: InboundWebhookChannelDto[]) {
  const action = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));
  const createAction = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message:
      "Regra criada. Copie a URL da automacao agora; ela nao sera exibida novamente.",
    oneTimeSecret: { ruleId: "provider_rule_payt", webhookUrl },
  }));

  render(
    React.createElement(ProviderConversionRulePanel, {
      connectionId: "connection_1",
      connectionProvider: "umbler",
      channels,
      rules: [],
      enabled: true,
      canManage: true,
      createAction,
      updateAction: action,
      rotateEndpointAction: action,
      loadAutomationAuditAction: action,
      loadAutomationPayloadAction: action,
      loadPurchaseAuditAction: action,
      loadExecutionAuditAction: action,
      reprocessAutomationCallbacksAction: action,
      removeAction: action,
      testMessageAction: action,
      guimoEnabled: false,
      workspaceId: "workspace_1",
      guimoIntegrations: [],
      guimoProvisionAction: action,
      guimoRotateAction: action,
      guimoSetActiveAction: action,
      guimoCreateRuleAction: action,
      guimoUpdateRuleAction: action,
      guimoDeleteRuleAction: action,
    }),
  );

  return { createAction };
}

function openPaytOrigin() {
  fireEvent.click(screen.getByRole("button", { name: /Nova regra/i }));
  fireEvent.change(screen.getByLabelText("Origem do gatilho"), {
    target: { value: "payt" },
  });
}

// PresentationMask soma o placeholder oculto ao nome acessivel do canal.
function channelCheckbox(
  scope: ReturnType<typeof within>,
  channelName: string,
): HTMLInputElement {
  return scope.getByRole("checkbox", {
    name: new RegExp(channelName),
  }) as HTMLInputElement;
}

function createForm() {
  return within(
    screen
      .getByRole("button", { name: "Criar webhook Payt" })
      .closest("form") as HTMLFormElement,
  );
}

describe("provider conversion rule panel — Payt purchase webhook", () => {
  it("offers Payt as an origin locked on Purchase without value or mode fields", () => {
    renderPanel([buildChannel("channel_1", "Comercial")]);
    openPaytOrigin();

    const eventSelect = screen.getByLabelText(
      "Evento enviado a Meta",
    ) as HTMLSelectElement;
    expect(eventSelect.value).toBe("Purchase");
    expect(eventSelect.disabled).toBe(true);
    const form = createForm();
    expect(form.queryByLabelText(/Valor medio/)).toBeNull();
    expect(form.queryByText("Modo inicial")).toBeNull();
    expect(form.queryByText("Etiquetas do WhatsApp")).toBeNull();
  });

  it("preselects the only channel", () => {
    renderPanel([buildChannel("channel_1", "Comercial")]);
    openPaytOrigin();

    const form = createForm();
    expect((channelCheckbox(form, "Comercial") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      (form.getByRole("button", {
        name: "Criar webhook Payt",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("requires an explicit choice when there are several channels", async () => {
    const { createAction } = renderPanel([
      buildChannel("channel_1", "Comercial"),
      buildChannel("channel_2", "Suporte"),
    ]);
    openPaytOrigin();

    const form = createForm();
    const submit = form.getByRole("button", {
      name: "Criar webhook Payt",
    }) as HTMLButtonElement;
    expect((channelCheckbox(form, "Comercial") as HTMLInputElement).checked).toBe(
      false,
    );
    expect((channelCheckbox(form, "Suporte") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(submit.disabled).toBe(true);
    expect(form.getByText("Marque ao menos um numero.")).toBeTruthy();

    fireEvent.click(channelCheckbox(form, "Suporte"));
    expect(submit.disabled).toBe(false);
    expect(form.queryByText("Marque ao menos um numero.")).toBeNull();

    fireEvent.change(form.getByPlaceholderText("Ex.: Compra confirmada"), {
      target: { value: "Compras Payt" },
    });
    await act(async () => {
      fireEvent.submit(submit.closest("form") as HTMLFormElement);
    });

    expect(createAction).toHaveBeenCalledTimes(1);
    const formData = createAction.mock.calls[0]?.[0] as FormData;
    expect(JSON.parse(String(formData.get("payload")))).toEqual({
      name: "Compras Payt",
      connectionId: "connection_1",
      channelIds: ["channel_2"],
      mode: "observation",
      triggerType: "provider_automation",
      eventName: "Purchase",
      automationSource: "payt",
    });
  });

  it("shows URL and token after creating, with copy feedback on each button", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderPanel([buildChannel("channel_1", "Comercial")]);
    openPaytOrigin();

    fireEvent.change(screen.getByPlaceholderText("Ex.: Compra confirmada"), {
      target: { value: "Compras Payt" },
    });
    await act(async () => {
      fireEvent.submit(
        screen
          .getByRole("button", { name: "Criar webhook Payt" })
          .closest("form") as HTMLFormElement,
      );
    });

    expect(
      (screen.getByLabelText("URL do webhook Payt") as HTMLInputElement).value,
    ).toBe(webhookUrl);
    expect(
      (screen.getByLabelText("Token do webhook Payt") as HTMLInputElement).value,
    ).toBe("secret_token_1");
    // O painel da Umbler nao vaza para a origem Payt.
    expect(screen.queryByText("Configuracao HTTP na Umbler")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar token" }));
    });
    expect(writeText).toHaveBeenCalledWith("secret_token_1");
    expect(screen.getByRole("button", { name: "Token copiado" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar URL" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar URL" }));
    });
    expect(writeText).toHaveBeenCalledWith(webhookUrl);
    expect(screen.getByRole("button", { name: "URL copiada" })).toBeTruthy();
  });
});
