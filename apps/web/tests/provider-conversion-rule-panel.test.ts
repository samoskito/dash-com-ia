import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  InboundWebhookChannelDto,
  ProviderConversionRuleDto,
} from "@wpptrack/shared";
import {
  buildCreatePayload,
  MessagePhraseFields,
  parseMoneyToCents,
  previewMessagePhrase,
  ProviderConversionRulePanel,
  RuleKindSelector,
} from "../src/app/(app)/integrations/provider-conversion-rule-panel";
import { ProviderCatalogTestResult } from "../src/app/(app)/settings/provider-catalog-test-result";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const channel = {
  id: "channel_1",
  connectionId: "connection_1",
  organizationId: "organization_1",
  providerChannelId: "provider_channel_1",
  connectedPhone: "+5511999990000",
  channelName: "Comercial",
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

const catalogRule = {
  id: "provider_rule_catalog",
  workspaceId: "workspace_1",
  conversionRule: {
    id: "conversion_rule_catalog",
    workspaceId: "workspace_1",
    name: "Compra por catalogo",
    triggerType: "structured_catalog",
    triggerValue: "structured_catalog",
    matchMode: "exact",
    eventName: "Purchase",
    pixelId: null,
    defaultValueCents: null,
    defaultCurrency: "BRL",
    defaultContentName: "Cama elastica",
    defaultItems: null,
    active: true,
    createdAt: "2026-07-21T12:00:00.000Z",
    updatedAt: "2026-07-21T12:00:00.000Z",
  },
  connectionId: "connection_1",
  mode: "observation",
  parserReleaseId: "parser_1",
  productionActivatedAt: null,
  channelIds: ["channel_1"],
  triggerPhrases: ["Dados para confirmar o pedido"],
  messageAuthorScope: "both",
  valueMode: "fixed",
  exampleMessage: null,
  endpoint: null,
  catalog: {
    id: "catalog_1",
    name: "Camas elasticas",
    productName: "Cama elastica",
    currency: "BRL",
    active: true,
    attributes: [
      { id: "attribute_size", position: 1, key: "tamanho", label: "Tamanho" },
      { id: "attribute_model", position: 2, key: "modelo", label: "Modelo" },
    ],
    variants: [
      {
        id: "variant_1",
        normalizedKey: "4,90\u001fnacional",
        attributeValues: ["4,90", "Nacional"],
        aliases: [[], []],
        valueCents: 359700,
        contentName: null,
        active: true,
      },
    ],
  },
  lastExecution: null,
  createdAt: "2026-07-21T12:00:00.000Z",
  updatedAt: "2026-07-21T12:00:00.000Z",
} satisfies ProviderConversionRuleDto;

describe("provider conversion rule panel", () => {
  it("renders a compact catalog summary and the side-effect-free tester", () => {
    const html = renderPanel({ rules: [catalogRule] });

    expect(html).toContain("Eventos de conversao");
    expect(html).toContain("Compra por catalogo");
    expect(html).toContain("Mensagem com catalogo");
    expect(html).toContain("Camas elasticas");
    expect(html).toContain("Tamanho");
    expect(html).toContain("Modelo");
    expect(html).toContain("R$\u00a03.597,00");
    expect(html).toContain("Testar sem enviar");
    expect(html).toContain("Editar aliases");
    expect(html).toContain("Auditar compras reconhecidas");
    expect(html).toContain('aria-label="Ativar envio automatico"');
  });

  it("keeps management controls out of analyst access", () => {
    const html = renderPanel({ rules: [catalogRule], canManage: false });

    expect(html).toContain("Compra por catalogo");
    expect(html).not.toContain("Nova regra");
    expect(html).not.toContain('aria-label="Remover regra"');
    expect(html).not.toContain('aria-label="Ativar envio automatico"');
    expect(html).not.toContain("Salvar canais");
    expect(html).not.toContain("Editar aliases");
    expect(html).not.toContain("Auditar compras reconhecidas");
  });

  it("offers explicit production activation for a certified automation rule", () => {
    const html = renderPanel({
      rules: [
        {
          ...catalogRule,
          id: "provider_rule_automation",
          conversionRule: {
            ...catalogRule.conversionRule,
            id: "conversion_rule_automation",
            name: "Lead qualificado",
            triggerType: "provider_automation",
            triggerValue: "provider_automation",
            eventName: "QualifiedLead",
            defaultCurrency: null,
            defaultContentName: null,
          },
          triggerPhrases: [],
          messageAuthorScope: null,
          catalog: null,
        },
      ],
    });

    expect(html).toContain("Lead qualificado");
    expect(html).toContain("Observando");
    expect(html).toContain('aria-label="Ativar envio automatico"');
    expect(html).toContain('aria-label="Gerar nova URL"');
  });

  it("exposes event-level audit when a newer callback is blocked", () => {
    const html = renderPanel({
      rules: [
        {
          ...catalogRule,
          id: "provider_rule_automation",
          mode: "production",
          productionActivatedAt: "2026-07-22T18:00:00.000Z",
          conversionRule: {
            ...catalogRule.conversionRule,
            id: "conversion_rule_automation",
            name: "Lead qualificado",
            triggerType: "provider_automation",
            triggerValue: "provider_automation",
            eventName: "QualifiedLead",
            defaultCurrency: null,
            defaultContentName: null,
          },
          triggerPhrases: [],
          messageAuthorScope: null,
          endpoint: {
            id: "endpoint_1",
            workspaceId: "workspace_1",
            providerRuleId: "provider_rule_automation",
            secretVersion: 1,
            lastDeliveryAt: "2026-07-22T15:34:00.000Z",
            lastSuccessfulParseAt: "2026-07-22T15:34:00.000Z",
            rotatedAt: null,
            removedAt: null,
            createdAt: "2026-07-22T12:00:00.000Z",
            updatedAt: "2026-07-22T15:34:00.000Z",
          },
          catalog: null,
          lastExecution: {
            id: "execution_blocked",
            workspaceId: "workspace_1",
            providerRuleId: "provider_rule_automation",
            sourceDeliveryId: "delivery_blocked",
            channelId: "channel_1",
            externalExecutionKey: "blocked_1",
            occurredAt: "2026-07-22T16:37:00.000Z",
            status: "blocked",
            reasonCode: "automation_paid_lead_missing",
            matchedCatalogVariantId: null,
            valueCents: null,
            currency: null,
            leadId: null,
            conversionEventLogId: null,
            attemptCount: 0,
            createdAt: "2026-07-22T16:37:00.000Z",
            updatedAt: "2026-07-22T16:37:00.000Z",
          },
        },
      ],
    });

    expect(html).toContain("Auditar eventos recebidos");
    expect(html).toContain(
      "Payload, diagnostico e reprocessamento por callback",
    );
    expect(html).not.toContain("Reprocessar ultimo callback observado");
  });

  it("keeps a scoped alias editor wired to the existing catalog update", () => {
    const source = readFileSync(
      new URL(
        "../src/app/(app)/integrations/provider-conversion-rule-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain("Reconhecimento de escrita");
    expect(source).toContain("Salvar aliases");
    expect(source).toContain("splitAliases(aliasDrafts");
    expect(source).toContain("valueCents: variant.valueCents");
    expect(source).toContain('timeZone: "America/Sao_Paulo"');
  });

  it("shows the latest execution outcome without exposing raw message content", () => {
    const html = renderPanel({
      rules: [
        {
          ...catalogRule,
          lastExecution: {
            id: "execution_1",
            workspaceId: "workspace_1",
            providerRuleId: catalogRule.id,
            sourceDeliveryId: "delivery_1",
            channelId: "channel_1",
            externalExecutionKey: "provider-event:1",
            occurredAt: "2026-07-21T13:00:00.000Z",
            status: "blocked",
            reasonCode: "price_mismatch",
            matchedCatalogVariantId: null,
            valueCents: null,
            currency: null,
            leadId: null,
            conversionEventLogId: null,
            attemptCount: 0,
            createdAt: "2026-07-21T13:00:00.000Z",
            updatedAt: "2026-07-21T13:00:00.000Z",
          },
        },
      ],
    });

    expect(html).toContain("Ultimo resultado: Bloqueado");
    expect(html).toContain("Valor diferente do catalogo");
    expect(html).not.toContain("provider-event:1");
  });

  it("keeps two-attribute catalog fields readable and explains optional values", () => {
    const source = readFileSync(
      new URL(
        "../src/app/(app)/integrations/provider-conversion-rule-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const css = readFileSync(
      new URL("../src/styles/globals.css", import.meta.url),
      "utf8",
    );

    expect(source).toContain("Outras formas aceitas (opcional)");
    expect(source).toContain("Nome da variante na Meta (opcional)");
    expect(source).toContain("Automatico: produto + atributos");
    expect(css).toContain(".provider-catalog-variant-attributes");
    expect(css).toContain("minmax(min(100%, 360px), 1fr)");
    expect(css).toContain(".provider-catalog-variant-commerce");
  });

  it("explains the simulated catalog decision with extracted items and values", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderCatalogTestResult, {
        result: {
          matched: true,
          reasonCode: "matched",
          classification: "recognized",
          matchedTriggerPhrase: "Dados para confirmar o pedido",
          parsedAttributes: [
            { key: "tamanho", label: "Tamanho", value: "4,90" },
            { key: "modelo", label: "Modelo", value: "Nacional" },
          ],
          items: [
            {
              position: 1,
              quantity: 2,
              parsedAttributes: [
                { key: "tamanho", label: "Tamanho", value: "4,90" },
                { key: "modelo", label: "Modelo", value: "Nacional" },
              ],
              catalogVariantId: "variant_1",
              unitValueCents: 359700,
              subtotalValueCents: 719400,
              contentName: "Cama elastica",
              reasonCode: "matched",
            },
          ],
          parsedValueCents: 719400,
          calculatedValueCents: 719400,
          observedPaymentValueCents: 700000,
          catalogVariantId: null,
          contentName: "Cama elastica",
          currency: "BRL",
        },
      }),
    );

    expect(html).toContain("Decisao do simulador");
    expect(html).toContain("Variante reconhecida");
    expect(html).toContain("Dados para confirmar o pedido");
    expect(html).toContain("Tamanho");
    expect(html).toContain("4,90");
    expect(html).toContain("Modelo");
    expect(html).toContain("Nacional");
    expect(html).toContain("2 un.");
    expect(html).toContain("R$\u00a07.194,00");
    expect(html).toContain("Valor pelo catalogo");
    expect(html).toContain("Valor informado na mensagem");
    expect(html).toContain("R$\u00a07.000,00");
  });

  it("keeps catalog and tag rules alongside the new checkout message kind", () => {
    const html = renderToStaticMarkup(
      createElement(RuleKindSelector, {
        kind: "qualified_automation",
        onSelect: () => undefined,
      }),
    );

    expect(html).toContain("Lead qualificado por tag");
    expect(html).toContain("Compra por tag");
    expect(html).toContain("Compra por catalogo");
    expect(html).toContain("Compra por mensagem");
    expect(html).toContain("Checkout por mensagem");
  });

  it("builds an InitiateCheckout message rule with a fixed average value", () => {
    const payload = createPayload({
      kind: "checkout_message",
      name: "Checkout Dr Hernia",
      averageValue: "250,00",
      triggerPhrases: "Segue o link do pagamento",
      exampleMessage: "Segue o link do pagamento de R$ 250,00",
      valueMode: "fixed",
    });

    expect(payload).toMatchObject({
      connectionId: "connection_1",
      triggerType: "message_phrase",
      eventName: "InitiateCheckout",
      valueMode: "fixed",
      defaultValueCents: 25_000,
      defaultCurrency: "BRL",
      exampleMessage: "Segue o link do pagamento de R$ 250,00",
      triggerPhrases: ["Segue o link do pagamento"],
      messageAuthorScope: "team",
    });
  });

  it("builds a Purchase message rule that extracts the value from the message", () => {
    const payload = createPayload({
      kind: "purchase_message",
      name: "Compra confirmada",
      averageValue: "",
      triggerPhrases: "Pagamento confirmado",
      exampleMessage: "Pagamento confirmado no valor de R$ 1.397,00",
      valueMode: "message_extracted",
    });

    expect(payload).toMatchObject({
      triggerType: "message_phrase",
      eventName: "Purchase",
      valueMode: "message_extracted",
      defaultValueCents: null,
      exampleMessage: "Pagamento confirmado no valor de R$ 1.397,00",
    });
  });

  it("keeps the average value required for fixed message rules", () => {
    const result = buildCreatePayload({
      ...payloadInput,
      kind: "checkout_message",
      averageValue: "",
      valueMode: "fixed",
      triggerPhrases: "Segue o link do pagamento",
    });

    expect(result).toEqual({
      ok: false,
      message: "Informe um valor medio valido.",
    });
  });

  it("keeps the catalog payload free of message value fields", () => {
    const payload = createPayload({
      kind: "purchase_catalog",
      triggerPhrases: "Dados para confirmar o pedido",
      catalogName: "Camas elasticas",
      productName: "Cama elastica",
      attributes: [{ id: 1, label: "Tamanho" }],
      variants: [
        {
          id: 1,
          values: ["4,90"],
          aliases: [""],
          value: "3.597,00",
          contentName: "",
        },
      ],
    });

    expect(payload).toMatchObject({
      triggerType: "structured_catalog",
      eventName: "Purchase",
    });
    expect(payload).not.toHaveProperty("valueMode");
    expect(payload).not.toHaveProperty("exampleMessage");
  });

  it("previews the extracted value of the example message", () => {
    expect(
      previewMessagePhrase({
        triggerPhrases: "Segue o link do pagamento",
        exampleMessage: "Ola! Segue o link do pagamento de R$ 250,00",
        valueMode: "message_extracted",
        averageValue: "",
      }),
    ).toEqual({
      matchedPhrase: "Segue o link do pagamento",
      valueCents: 25_000,
      valueSource: "message",
      ambiguousValue: false,
    });
  });

  it("refuses to guess when the example carries more than one value", () => {
    expect(
      previewMessagePhrase({
        triggerPhrases: "Pagamento confirmado",
        exampleMessage: "Pagamento confirmado: R$ 250,00 de R$ 500,00",
        valueMode: "message_extracted",
        averageValue: "",
      }),
    ).toMatchObject({ valueCents: null, ambiguousValue: true });
  });

  it("falls back to the average value when the example has no value", () => {
    expect(
      previewMessagePhrase({
        triggerPhrases: "Pagamento confirmado",
        exampleMessage: "Pagamento confirmado, obrigado!",
        valueMode: "message_extracted",
        averageValue: "250,00",
      }),
    ).toMatchObject({ valueCents: 25_000, valueSource: "fallback" });
  });

  it("previews the fixed value and reports an example without the trigger phrase", () => {
    expect(
      previewMessagePhrase({
        triggerPhrases: "Pagamento confirmado",
        exampleMessage: "Bom dia, tudo certo por aqui",
        valueMode: "fixed",
        averageValue: "250,00",
      }),
    ).toEqual({
      matchedPhrase: null,
      valueCents: 25_000,
      valueSource: "fixed",
      ambiguousValue: false,
    });
  });

  it("shows the message value fields with a live preview", () => {
    const html = renderToStaticMarkup(
      createElement(MessagePhraseFields, {
        kind: "checkout_message",
        averageValue: "",
        contentName: "",
        triggerPhrases: "Segue o link do pagamento",
        exampleMessage: "Segue o link do pagamento de R$ 250,00",
        valueMode: "message_extracted",
        messageAuthorScope: "team",
        onChange: () => undefined,
      }),
    );

    expect(html).toContain("Exemplo da mensagem");
    expect(html).toContain("Modo de valor");
    expect(html).toContain("Valor fixo");
    expect(html).toContain("Extrair da mensagem");
    expect(html).toContain("Frases gatilho");
    expect(html).toContain("Quem pode enviar");
    expect(html).toContain("Frase gatilho reconhecida");
    expect(html).toContain("Valor extraido do exemplo: R$\u00a0250,00");
    expect(html).toContain("Valor medio (fallback, opcional)");
  });

  it("lists a checkout rule with its event, value mode and example", () => {
    const html = renderPanel({
      rules: [
        {
          ...catalogRule,
          id: "provider_rule_checkout",
          conversionRule: {
            ...catalogRule.conversionRule,
            id: "conversion_rule_checkout",
            name: "Checkout Dr Hernia",
            triggerType: "message_phrase",
            triggerValue: "message_phrase",
            eventName: "InitiateCheckout",
            defaultValueCents: null,
            defaultContentName: null,
          },
          triggerPhrases: ["Segue o link do pagamento"],
          messageAuthorScope: "team",
          valueMode: "message_extracted",
          exampleMessage: "Segue o link do pagamento de R$ 250,00",
          catalog: null,
        },
      ],
    });

    expect(html).toContain("Checkout iniciado");
    expect(html).toContain("Valor na mensagem");
    expect(html).toContain("Exemplo da mensagem");
    expect(html).toContain("Segue o link do pagamento de R$ 250,00");
  });

  it.each([
    ["3.597,00", 359700],
    ["R$ 1.397,00", 139700],
    ["2997.00", 299700],
    ["", null],
    ["invalido", null],
  ])("normalizes %s to integer cents", (value, expected) => {
    expect(parseMoneyToCents(value)).toBe(expected);
  });
});

const payloadInput = {
  connectionId: "connection_1",
  kind: "purchase_message",
  name: "Regra de teste",
  selectedChannelIds: ["channel_1"],
  averageValue: "",
  contentName: "",
  triggerPhrases: "",
  messageAuthorScope: "team",
  exampleMessage: "",
  valueMode: "fixed",
  catalogName: "",
  productName: "",
  attributes: [],
  variants: [],
} satisfies Parameters<typeof buildCreatePayload>[0];

function createPayload(
  overrides: Partial<Parameters<typeof buildCreatePayload>[0]>,
): unknown {
  const result = buildCreatePayload({ ...payloadInput, ...overrides });
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

function renderPanel({
  rules,
  canManage = true,
}: {
  rules: ProviderConversionRuleDto[];
  canManage?: boolean;
}) {
  const action = vi.fn(async (_formData: FormData) => ({
    ok: true as const,
    message: "ok",
  }));

  return renderToStaticMarkup(
    createElement(ProviderConversionRulePanel, {
      connectionId: "connection_1",
      channels: [channel],
      rules,
      enabled: true,
      canManage,
      createAction: action,
      updateAction: action,
      rotateEndpointAction: action,
      loadAutomationAuditAction: action,
      loadAutomationPayloadAction: action,
      loadPurchaseAuditAction: action,
      reprocessAutomationCallbacksAction: action,
      removeAction: action,
      testMessageAction: action,
    }),
  );
}
