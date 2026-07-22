import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  InboundWebhookChannelDto,
  ProviderConversionRuleDto,
} from "@wpptrack/shared";
import {
  parseMoneyToCents,
  ProviderConversionRulePanel,
} from "../src/app/(app)/integrations/provider-conversion-rule-panel";

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
      removeAction: action,
      testMessageAction: action,
    }),
  );
}
