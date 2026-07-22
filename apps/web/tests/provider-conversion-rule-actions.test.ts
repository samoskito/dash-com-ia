import { afterEach, describe, expect, it, vi } from "vitest";

const { isApiRequestError, revalidatePath, serverApiFetch } = vi.hoisted(
  () => ({
    isApiRequestError: vi.fn(
      (error: unknown) =>
        error instanceof Error && error.name === "ApiRequestError",
    ),
    revalidatePath: vi.fn(),
    serverApiFetch: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../src/lib/server-api", () => ({
  isApiRequestError,
  serverApiFetch,
}));

import {
  adaptProviderConversionRuleAction,
  createProviderConversionRuleAction,
  removeProviderConversionRuleAction,
  reprocessLatestProviderConversionAutomationAction,
  rotateProviderConversionRuleEndpointAction,
  testProviderCatalogMessageAction,
  updateProviderConversionRuleAction,
} from "../src/app/(app)/integrations/provider-conversion-rule-actions";

const endpoint = {
  id: "endpoint_1",
  workspaceId: "workspace_1",
  providerRuleId: "provider_rule_1",
  secretVersion: 1,
  lastDeliveryAt: null,
  lastSuccessfulParseAt: null,
  rotatedAt: null,
  removedAt: null,
  createdAt: "2026-07-21T12:00:00.000Z",
  updatedAt: "2026-07-21T12:00:00.000Z",
};

const providerRule = {
  id: "provider_rule_1",
  workspaceId: "workspace_1",
  conversionRule: {
    id: "conversion_rule_1",
    workspaceId: "workspace_1",
    name: "Lead qualificado por tag",
    triggerType: "provider_automation",
    triggerValue: "provider_automation",
    matchMode: "exact",
    eventName: "QualifiedLead",
    pixelId: null,
    defaultValueCents: null,
    defaultCurrency: null,
    defaultContentName: null,
    defaultItems: null,
    active: true,
    createdAt: "2026-07-21T12:00:00.000Z",
    updatedAt: "2026-07-21T12:00:00.000Z",
  },
  connectionId: "connection_1",
  mode: "observation",
  parserReleaseId: "parser_automation_v1",
  productionActivatedAt: null,
  channelIds: ["channel_1"],
  triggerPhrases: [],
  messageAuthorScope: null,
  endpoint,
  catalog: null,
  lastExecution: null,
  createdAt: "2026-07-21T12:00:00.000Z",
  updatedAt: "2026-07-21T12:00:00.000Z",
} as const;

afterEach(() => {
  revalidatePath.mockReset();
  serverApiFetch.mockReset();
});

describe("provider conversion rule server actions", () => {
  it("creates an automation rule and returns its URL only in the ephemeral result", async () => {
    const webhookUrl =
      "https://api.wpptrack.test/webhooks/inbound/conversions/endpoint_1?token=secret";
    serverApiFetch.mockResolvedValueOnce({ rule: providerRule, webhookUrl });
    const payload = {
      name: "Lead qualificado por tag",
      connectionId: "connection_1",
      channelIds: ["channel_1"],
      mode: "observation",
      triggerType: "provider_automation",
      eventName: "QualifiedLead",
    };

    const result = await createProviderConversionRuleAction(
      form({ payload: JSON.stringify(payload) }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith("/conversion-rules/providers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    expect(result).toEqual({
      ok: true,
      message:
        "Regra criada. Copie a URL da automacao agora; ela nao sera exibida novamente.",
      oneTimeSecret: {
        ruleId: "provider_rule_1",
        webhookUrl,
      },
    });
    expect(result.message).not.toContain("secret");
    expect(revalidatePath).toHaveBeenCalledWith("/integrations");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("adapts the same legacy rule to selected Umbler channels in observation", async () => {
    const adaptedRule = {
      ...providerRule,
      conversionRule: {
        ...providerRule.conversionRule,
        id: "legacy_rule_1",
        name: "Compra por aviso",
        triggerType: "message_phrase",
        triggerValue: "aviso de compra",
        matchMode: "contains",
        eventName: "Purchase",
        defaultValueCents: 9990,
        defaultCurrency: "BRL",
      },
      triggerPhrases: ["aviso de compra"],
      messageAuthorScope: "team",
    };
    serverApiFetch.mockResolvedValueOnce(adaptedRule);
    const payload = {
      connectionId: "connection_1",
      channelIds: ["channel_1"],
      triggerPhrases: ["aviso de compra"],
      messageAuthorScope: "team",
    };

    const result = await adaptProviderConversionRuleAction(
      form({
        legacyRuleId: "legacy_rule_1",
        payload: JSON.stringify(payload),
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/conversion-rules/providers/adapt/legacy_rule_1",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    expect(result).toEqual({
      ok: true,
      message: "Regra vinculada aos canais Umbler e mantida em observacao.",
    });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/integrations",
      "/settings",
    ]);
  });

  it("updates, rotates and removes only through provider-rule endpoints", async () => {
    serverApiFetch
      .mockResolvedValueOnce({
        ...providerRule,
        conversionRule: { ...providerRule.conversionRule, active: false },
      })
      .mockResolvedValueOnce({
        endpoint: { ...endpoint, secretVersion: 2 },
        webhookUrl:
          "https://api.wpptrack.test/webhooks/inbound/conversions/endpoint_1?token=rotated",
      })
      .mockResolvedValueOnce(undefined);

    const updateResult = await updateProviderConversionRuleAction(
      form({
        ruleId: "provider_rule_1",
        payload: JSON.stringify({ active: false }),
      }),
    );
    const rotateResult = await rotateProviderConversionRuleEndpointAction(
      form({ ruleId: "provider_rule_1" }),
    );
    const removeResult = await removeProviderConversionRuleAction(
      form({ ruleId: "provider_rule_1" }),
    );

    expect(serverApiFetch.mock.calls.map(([path]) => path)).toEqual([
      "/conversion-rules/providers/provider_rule_1",
      "/conversion-rules/providers/provider_rule_1/rotate-endpoint",
      "/conversion-rules/providers/provider_rule_1",
    ]);
    expect(updateResult.message).toBe("Regra de conversao pausada.");
    expect(rotateResult.oneTimeSecret?.webhookUrl).toContain("token=rotated");
    expect(removeResult).toEqual({
      ok: true,
      message: "Regra removida. O historico observado foi preservado.",
    });
  });

  it("reprocesses the latest observed automation callback with explicit confirmation", async () => {
    serverApiFetch.mockResolvedValueOnce({
      executionId: "execution_1",
      sourceDeliveryId: "delivery_1",
      queueStatus: "queued",
    });

    const result = await reprocessLatestProviderConversionAutomationAction(
      form({ ruleId: "provider_rule_1" }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/integrations/inbound-webhooks/provider-rules/provider_rule_1/reprocess-latest",
      {
        method: "POST",
        body: JSON.stringify({
          confirmation: "REPROCESSAR_CALLBACK_OBSERVADO",
        }),
      },
    );
    expect(result).toEqual({
      ok: true,
      message: "Callback observado encaminhado para processamento.",
    });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/integrations",
      "/settings",
    ]);
  });

  it("shows the API reason when an observed callback cannot be reprocessed", async () => {
    const error = new Error("Nenhum callback observado foi encontrado");
    error.name = "ApiRequestError";
    serverApiFetch.mockRejectedValueOnce(error);

    const result = await reprocessLatestProviderConversionAutomationAction(
      form({ ruleId: "provider_rule_1" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Nenhum callback observado foi encontrado",
    });
  });

  it("returns a side-effect-free catalog test result without revalidation", async () => {
    serverApiFetch.mockResolvedValueOnce({
      matched: true,
      reasonCode: "matched",
      classification: "recognized",
      matchedTriggerPhrase: null,
      parsedAttributes: [
        { key: "tamanho", label: "Tamanho", value: "4,90" },
        { key: "modelo", label: "Modelo", value: "Nacional" },
      ],
      items: [
        {
          position: 1,
          catalogVariantId: "variant_1",
          parsedAttributes: [
            { key: "tamanho", label: "Tamanho", value: "4,90" },
            { key: "modelo", label: "Modelo", value: "Nacional" },
          ],
          quantity: 1,
          unitValueCents: 359700,
          subtotalValueCents: 359700,
          contentName: "Cama elastica Nacional 4,90",
          reasonCode: "matched",
        },
      ],
      parsedValueCents: 359700,
      calculatedValueCents: 359700,
      observedPaymentValueCents: 359700,
      catalogVariantId: "variant_1",
      contentName: "Cama elastica Nacional 4,90",
      currency: "BRL",
    });

    const result = await testProviderCatalogMessageAction(
      form({
        ruleId: "provider_rule_1",
        messageText: "Tamanho: 4,90\nModelo: Nacional\n3.597,00",
      }),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/conversion-rules/providers/provider_rule_1/test-message",
      {
        method: "POST",
        body: JSON.stringify({
          messageText: "Tamanho: 4,90\nModelo: Nacional\n3.597,00",
        }),
      },
    );
    expect(result.testResult?.matched).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before calling the API", async () => {
    const result = await createProviderConversionRuleAction(
      form({ payload: "{" }),
    );

    expect(result.ok).toBe(false);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}
