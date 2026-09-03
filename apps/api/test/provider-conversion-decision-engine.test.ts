import type {
  ConversionEventNameDto,
  ProviderConversionCatalogDto,
  ProviderConversionDecisionRuleSnapshotDto,
  ProviderConversionPaidLeadResolutionDto,
} from "@wpptrack/shared";
import {
  providerConversionDecisionSchema,
  providerConversionTechnicalDeliveryStateSchema,
} from "@wpptrack/shared";
import { describe, expect, it } from "vitest";
import {
  ProviderConversionDecisionEngine,
  PROVIDER_CONVERSION_DECISION_ENGINE_VERSION,
} from "../src/conversion-rules/provider-conversion-decision.engine";
import {
  providerConversionDecisionOutcome,
  type ProviderConversionDecisionInput,
} from "../src/conversion-rules/provider-conversion-decision.types";

const engine = new ProviderConversionDecisionEngine();

function catalog(): ProviderConversionCatalogDto {
  return {
    id: "catalog_1",
    name: "Catalogo de camas elasticas",
    productName: "Cama elastica",
    currency: "BRL",
    active: true,
    attributes: [
      { id: "attribute_1", position: 1, key: "tamanho", label: "Tamanho" },
      { id: "attribute_2", position: 2, key: "modelo", label: "Modelo" },
    ],
    variants: [
      {
        id: "variant_1",
        normalizedKey: "4,90|nacional",
        attributeValues: ["4,90", "Nacional"],
        aliases: [["4.9"], ["Tradicional"]],
        valueCents: 359_700,
        contentName: "Cama elastica 4,90 Nacional",
        active: true,
      },
      {
        id: "variant_2",
        normalizedKey: "3,05|europa",
        attributeValues: ["3,05", "Europa"],
        aliases: [["3.05"], []],
        valueCents: 179_700,
        contentName: "Cama elastica 3,05 Europa",
        active: true,
      },
      {
        id: "variant_3",
        normalizedKey: "2,44|nacional",
        attributeValues: ["2,44", "Nacional"],
        aliases: [["2.44"], ["Tradicional"]],
        valueCents: 159_700,
        contentName: "Cama elastica 2,44 Nacional",
        active: true,
      },
    ],
  };
}

function rule(
  input: Partial<ProviderConversionDecisionRuleSnapshotDto> = {},
): ProviderConversionDecisionRuleSnapshotDto {
  return {
    providerRuleId: "provider_rule_1",
    conversionRuleId: "conversion_rule_1",
    version: "2026-07-23T12:00:00.000Z",
    triggerType: "structured_catalog",
    eventName: "Purchase",
    mode: "production",
    active: true,
    authorScope: "both",
    triggerPhrases: ["Dados para confirmar o pedido"],
    defaultValueCents: null,
    defaultCurrency: null,
    defaultContentName: null,
    valueMode: "fixed",
    exampleMessage: null,
    ...input,
  };
}

function paidLead(): ProviderConversionPaidLeadResolutionDto {
  return {
    status: "resolved",
    reasonCode: "paid_lead_resolved",
    lead: {
      id: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "campaign_1",
      adSetId: "adset_1",
      adId: "ad_1",
      ctwaClid: "ctwa_1",
    },
  };
}

function untrackedLead(): ProviderConversionPaidLeadResolutionDto {
  return {
    status: "not_found",
    reasonCode: "paid_lead_not_found",
    candidateLeadId: null,
  };
}

function messageInput(input: {
  messageText: string;
  authorType?: "contact" | "organization_member" | "bot" | "unknown";
  leadResolution?: ProviderConversionPaidLeadResolutionDto;
  rule?: ProviderConversionDecisionRuleSnapshotDto;
  catalog?: ProviderConversionCatalogDto | null;
}): ProviderConversionDecisionInput {
  const selectedRule = input.rule ?? rule();

  return {
    parserVersion: "umbler-v1",
    rule: selectedRule,
    catalog:
      input.catalog === null
        ? null
        : {
            version: "2026-07-23T12:00:00.000Z",
            catalog: input.catalog ?? catalog(),
          },
    leadResolution: input.leadResolution ?? paidLead(),
    contactIdentityHash: "phone_hash_1",
    occurrence: {
      source: "message",
      provider: "umbler",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      externalDeliveryId: "delivery_1",
      externalEventId: "event_1",
      externalMessageId: "message_1",
      occurrenceKey: "occurrence_1",
      eventName: selectedRule.eventName,
      occurredAt: "2026-07-23T13:00:00.000Z",
      authorType: input.authorType ?? "organization_member",
      messageText: input.messageText,
    },
  };
}

function automationInput(input: {
  eventName: ConversionEventNameDto;
  valueCents?: number | null;
  leadResolution?: ProviderConversionPaidLeadResolutionDto;
}): ProviderConversionDecisionInput {
  const selectedRule = rule({
    triggerType: "provider_automation",
    eventName: input.eventName,
    triggerPhrases: [],
    defaultValueCents: input.valueCents ?? null,
    defaultCurrency: input.valueCents ? "BRL" : null,
    defaultContentName: input.eventName === "Purchase" ? "Pedido medio" : null,
  });

  return {
    parserVersion: "automation-v1",
    rule: selectedRule,
    catalog: null,
    leadResolution: input.leadResolution ?? paidLead(),
    contactIdentityHash: "phone_hash_1",
    occurrence: {
      source: "automation",
      provider: "umbler",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      externalDeliveryId: "delivery_automation_1",
      externalEventId: null,
      externalMessageId: null,
      occurrenceKey: "automation_occurrence_1",
      eventName: input.eventName,
      occurredAt: "2026-07-23T13:00:00.000Z",
      authorType: null,
      automation:
        input.eventName === "Purchase" ? "compra_aprovada" : "lead_qualificado",
    },
  };
}

describe("provider conversion decision engine", () => {
  it.each(["organization_member", "bot", "contact"] as const)(
    "ignores an empty template authored by %s",
    (authorType) => {
      const decision = engine.evaluate(
        messageInput({
          authorType,
          leadResolution: untrackedLead(),
          messageText: "Dados para confirmar o pedido:\nTamanho:\nModelo:",
        }),
      );

      expect(decision).toMatchObject({
        engineVersion: PROVIDER_CONVERSION_DECISION_ENGINE_VERSION,
        decisionCode: "ignored_empty_template",
        reasonCode: "empty_template",
      });
      expect(decision && providerConversionDecisionOutcome(decision)).toBe(
        "ignored",
      );
    },
  );

  it("creates an actionable review for a partial catalog message from a paid lead", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "Dados para confirmar o pedido:\nTamanho: 4,90\nModelo:",
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "review_required",
      reasonCode: "awaiting_data",
      leadResolution: { status: "resolved" },
    });
    expect(decision?.conversion.items[0]).toMatchObject({
      quantity: 1,
      reasonCode: "awaiting_data",
    });
  });

  it.each([
    "Dados para confirmar o pedido:\nTamanho: 4,90\nModelo:",
    "Dados para confirmar o pedido:\nTamanho: 4,90\nModelo: Nacional",
  ])(
    "ignores partial and complete purchases from an untracked lead",
    (text) => {
      const decision = engine.evaluate(
        messageInput({
          messageText: text,
          leadResolution: untrackedLead(),
        }),
      );

      expect(decision).toMatchObject({
        decisionCode: "ignored_untracked_lead",
        reasonCode: "paid_lead_not_found",
      });
    },
  );

  it("recognizes a valid single catalog item for a paid lead", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText:
          "Dados para confirmar o pedido:\nTamanho: 4,90\nModelo: Nacional",
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "catalog_matched",
      conversion: {
        valueCents: 359_700,
        currency: "BRL",
      },
      occurrence: {
        businessDedupePolicy: {
          mode: "rolling_window",
          scopeKey: "Purchase:workspace_1:connection_1:channel_1:lead_1",
          windowSeconds: 86_400,
        },
      },
    });
    expect(providerConversionDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("recognizes aliases, quantities and multiple catalog items", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: [
          "Dados para confirmar o pedido:",
          "Tamanho: 4.9",
          "Modelo: Tradicional",
          "Tamanho: 2x 2.44",
          "Modelo: tradicional",
        ].join("\n"),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      conversion: {
        valueCents: 679_100,
        items: [
          {
            catalogVariantId: "variant_1",
            quantity: 1,
          },
          {
            catalogVariantId: "variant_3",
            quantity: 2,
          },
        ],
      },
    });
  });

  it("keeps an unknown size typo in review instead of changing the purchase", () => {
    const decision = engine.evaluate(
      messageInput({
        authorType: "contact",
        messageText: [
          "COMPROVANTE DE ENCOMENDA",
          "Dados para confirmar o pedido:",
          "Tamanho: 3,5",
          "Modelo: Nacional",
        ].join("\n"),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "review_required",
      reasonCode: "unknown_combination",
      conversion: {
        valueCents: null,
        items: [
          {
            quantity: 1,
            catalogVariantId: null,
            reasonCode: "unknown_combination",
          },
        ],
      },
    });
  });

  it("uses the catalog price for an exact combination", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: [
          "Dados para confirmar o pedido:",
          "Tamanho: 3,05",
          "Modelo: Europa",
          "Forma de pagamento: R$ 1,00",
        ].join("\n"),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      conversion: {
        valueCents: 179_700,
        items: [
          {
            catalogVariantId: "variant_2",
            unitValueCents: 179_700,
          },
        ],
      },
    });
  });

  it("recognizes a qualified-lead automation without inventing a value", () => {
    const decision = engine.evaluate(
      automationInput({ eventName: "QualifiedLead" }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "automation_matched",
      conversion: {
        valueCents: null,
        currency: null,
      },
      occurrence: {
        businessDedupePolicy: {
          mode: "lifetime",
          scopeKey: "QualifiedLead:workspace_1:connection_1:channel_1:lead_1",
        },
      },
    });
  });

  it("matches UAZAPI automation labels case-insensitively", () => {
    const input = automationInput({ eventName: "QualifiedLead" });
    input.rule.triggerPhrases = ["Venda fechada"];
    input.occurrence = {
      ...input.occurrence,
      provider: "uazapi",
      labels: ["VENDA FECHADA", "VIP"],
      matchedLabel: "VENDA FECHADA",
    };

    expect(engine.evaluate(input)).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "automation_matched",
    });
  });

  it("does not match UAZAPI automation labels outside the configured rule", () => {
    const input = automationInput({ eventName: "QualifiedLead" });
    input.rule.triggerPhrases = ["Venda fechada"];
    input.occurrence = {
      ...input.occurrence,
      provider: "uazapi",
      labels: ["VIP"],
      matchedLabel: "VIP",
    };

    expect(engine.evaluate(input)).toBeNull();
  });

  it("recognizes an average-value purchase automation", () => {
    const decision = engine.evaluate(
      automationInput({ eventName: "Purchase", valueCents: 250_000 }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "automation_matched",
      conversion: {
        valueCents: 250_000,
        currency: "BRL",
        contentName: "Pedido medio",
      },
    });
  });

  it.each([
    automationInput({
      eventName: "QualifiedLead",
      leadResolution: untrackedLead(),
    }),
    automationInput({
      eventName: "Purchase",
      valueCents: 250_000,
      leadResolution: untrackedLead(),
    }),
  ])("ignores automation callbacks outside the paid-lead base", (input) => {
    const decision = engine.evaluate(input);

    expect(decision).toMatchObject({
      decisionCode: "ignored_untracked_lead",
      reasonCode: "paid_lead_not_found",
    });
  });

  it("recognizes an average-value purchase message", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "AVISO DE COMPRA\nPedido confirmado",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          triggerPhrases: ["Aviso de compra"],
          defaultValueCents: 99_900,
          defaultCurrency: "BRL",
          defaultContentName: "Pedido medio",
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      conversion: {
        valueCents: 99_900,
      },
    });
  });

  it("recognizes InitiateCheckout message_phrase with fixed value (U1)", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "CLIENTE INICIOU CHECKOUT\nlink enviado",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "InitiateCheckout",
          triggerPhrases: ["iniciou checkout", "cliente iniciou checkout"],
          defaultValueCents: 25_000,
          defaultCurrency: "BRL",
          defaultContentName: "Checkout medio",
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      occurrence: { eventName: "InitiateCheckout" },
      conversion: {
        valueCents: 25_000,
        currency: "BRL",
        contentName: "Checkout medio",
      },
      // valued events use rolling 24h business dedupe (not lifetime like QL)
    });
    expect(decision?.occurrence.businessDedupePolicy).toMatchObject({
      mode: "rolling_window",
      windowSeconds: 24 * 60 * 60,
    });
  });

  it("extracts the checkout value from the message when valueMode is message_extracted", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText:
          "Segue o link de pagamento\nValor do procedimento: R$ 250,00",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "InitiateCheckout",
          triggerPhrases: ["link de pagamento"],
          valueMode: "message_extracted",
          defaultValueCents: null,
          defaultCurrency: "BRL",
          defaultContentName: "Checkout",
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      occurrence: { eventName: "InitiateCheckout" },
      conversion: {
        valueCents: 25_000,
        observedPaymentValueCents: 25_000,
        currency: "BRL",
      },
    });
  });

  it("extracts the purchase value from the message instead of the fallback", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "AVISO DE COMPRA\nTotal pago: 1.397,00",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "Purchase",
          triggerPhrases: ["Aviso de compra"],
          valueMode: "message_extracted",
          defaultValueCents: 99_900,
          defaultCurrency: "BRL",
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      conversion: { valueCents: 139_700, observedPaymentValueCents: 139_700 },
    });
  });

  it("falls back to the configured average when the message has no single value", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "AVISO DE COMPRA\nPedido confirmado",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "Purchase",
          triggerPhrases: ["Aviso de compra"],
          valueMode: "message_extracted",
          defaultValueCents: 99_900,
          defaultCurrency: "BRL",
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      conversion: { valueCents: 99_900, observedPaymentValueCents: null },
    });
  });

  it("sends an extracted-value message without a value to review", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "Segue o link de pagamento",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "InitiateCheckout",
          triggerPhrases: ["link de pagamento"],
          valueMode: "message_extracted",
          defaultValueCents: null,
          defaultCurrency: "BRL",
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "review_required",
      reasonCode: "average_value_missing",
      conversion: { valueCents: null },
    });
  });

  it("ignores money in the message while valueMode stays fixed", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "CLIENTE INICIOU CHECKOUT\nfalamos em R$ 900,00",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "InitiateCheckout",
          triggerPhrases: ["iniciou checkout"],
          defaultValueCents: 25_000,
          defaultCurrency: "BRL",
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      conversion: { valueCents: 25_000, observedPaymentValueCents: null },
    });
  });

  it("does not match InitiateCheckout when trigger phrase is absent", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "ola, quero saber o preco",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "InitiateCheckout",
          triggerPhrases: ["iniciou checkout"],
          defaultValueCents: 25_000,
          defaultCurrency: "BRL",
        }),
      }),
    );
    expect(decision).toBeNull();
  });

  it("returns a duplicate decision after a valid business match", () => {
    const input = messageInput({
      messageText:
        "Dados para confirmar o pedido:\nTamanho: 4,90\nModelo: Nacional",
    });
    input.duplicateMatch = {
      duplicate: true,
      decisionId: "decision_original",
      conversionEventLogId: "event_log_original",
    };

    const decision = engine.evaluate(input);

    expect(decision).toMatchObject({
      decisionCode: "duplicate",
      reasonCode: "business_duplicate",
      duplicateOfDecisionId: "decision_original",
      duplicateOfConversionEventLogId: "event_log_original",
    });
  });

  it("does not create a decision when author scope rejects the message", () => {
    const decision = engine.evaluate(
      messageInput({
        authorType: "contact",
        messageText:
          "Dados para confirmar o pedido:\nTamanho: 4,90\nModelo: Nacional",
        rule: rule({ authorScope: "team" }),
      }),
    );

    expect(decision).toBeNull();
  });

  it("recognizes a qualified-lead message rule without asking for a value", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "Perfeito! Vou te passar os valores do procedimento",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "QualifiedLead",
          triggerPhrases: ["vou te passar os valores"],
          defaultValueCents: null,
          defaultCurrency: null,
          defaultContentName: null,
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      occurrence: { eventName: "QualifiedLead" },
      conversion: {
        matchedTriggerPhrase: "vou te passar os valores",
        valueCents: null,
        currency: null,
        contentName: null,
      },
    });
    expect(decision?.occurrence.businessDedupePolicy).toEqual({
      mode: "lifetime",
      scopeKey: "QualifiedLead:workspace_1:connection_1:channel_1:lead_1",
    });
  });

  it("keeps dedupe isolated by channel while preserving it for matching entries", () => {
    const sameChannelAutomation = engine.evaluate(
      automationInput({ eventName: "QualifiedLead" }),
    );
    const sameChannelMessage = engine.evaluate(
      messageInput({
        messageText: "lead confirmado",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "QualifiedLead",
          triggerPhrases: ["lead confirmado"],
        }),
      }),
    );
    const otherChannelInput = messageInput({
      messageText: "lead confirmado",
      catalog: null,
      rule: rule({
        triggerType: "message_phrase",
        eventName: "QualifiedLead",
        triggerPhrases: ["lead confirmado"],
      }),
    });
    const otherChannel = engine.evaluate({
      ...otherChannelInput,
      occurrence: { ...otherChannelInput.occurrence, channelId: "channel_2" },
    });

    expect(sameChannelAutomation?.occurrence.businessDedupePolicy).toEqual(
      sameChannelMessage?.occurrence.businessDedupePolicy,
    );
    expect(otherChannel?.occurrence.businessDedupePolicy).not.toEqual(
      sameChannelMessage?.occurrence.businessDedupePolicy,
    );
  });

  it("recognizes an AddToCart message rule with a fixed value", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "Vou separar o produto pra voce",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "AddToCart",
          triggerPhrases: ["vou separar o produto"],
          defaultValueCents: 12_900,
          defaultCurrency: "BRL",
          defaultContentName: "Kit basico",
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      occurrence: { eventName: "AddToCart" },
      conversion: {
        valueCents: 12_900,
        currency: "BRL",
        contentName: "Kit basico",
      },
    });
    expect(decision?.occurrence.businessDedupePolicy).toMatchObject({
      mode: "rolling_window",
      windowSeconds: 24 * 60 * 60,
    });
  });

  it("recognizes an AddToCart message rule without a value instead of asking for review", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "Vou separar o produto pra voce",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "AddToCart",
          triggerPhrases: ["vou separar o produto"],
          defaultValueCents: null,
          defaultCurrency: null,
          defaultContentName: null,
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      conversion: { valueCents: null, currency: null },
    });
  });

  it("still asks for review when a purchase message has no value", () => {
    const decision = engine.evaluate(
      messageInput({
        messageText: "AVISO DE COMPRA",
        catalog: null,
        rule: rule({
          triggerType: "message_phrase",
          eventName: "Purchase",
          triggerPhrases: ["aviso de compra"],
          defaultValueCents: null,
          defaultCurrency: null,
        }),
      }),
    );

    expect(decision).toMatchObject({
      decisionCode: "review_required",
      reasonCode: "average_value_missing",
    });
  });

  it("recognizes a ViewContent automation without a value", () => {
    const decision = engine.evaluate(
      automationInput({ eventName: "ViewContent" }),
    );

    expect(decision).toMatchObject({
      decisionCode: "eligible",
      reasonCode: "automation_matched",
      conversion: { valueCents: null, currency: null },
    });
    expect(decision?.occurrence.businessDedupePolicy).toMatchObject({
      mode: "rolling_window",
      windowSeconds: 24 * 60 * 60,
    });
  });

  it("keeps the lifetime dedupe for lead-submitted automations", () => {
    const decision = engine.evaluate(
      automationInput({ eventName: "LeadSubmitted" }),
    );

    expect(decision?.occurrence.businessDedupePolicy).toEqual({
      mode: "lifetime",
      scopeKey: "LeadSubmitted:workspace_1:connection_1:channel_1:lead_1",
    });
  });

  it("keeps technical delivery states outside the business decision union", () => {
    expect(providerConversionTechnicalDeliveryStateSchema.parse("queued")).toBe(
      "queued",
    );
    expect(
      providerConversionTechnicalDeliveryStateSchema.parse("failed_retryable"),
    ).toBe("failed_retryable");

    const decision = engine.evaluate(
      automationInput({ eventName: "QualifiedLead" }),
    );
    expect(decision).not.toHaveProperty("technicalState");
  });
});
