import { describe, expect, it } from "vitest";
import {
  conversionRuleCreateInputSchema,
  inboundWebhookDeliveryPurposeSchema,
  providerConversionRuleCreateInputSchema,
  structuredCatalogTestMessageInputSchema,
  structuredCatalogTestMessageResultSchema,
} from "../src";

const channelScope = {
  name: "Conversoes Umbler",
  connectionId: "connection_1",
  channelIds: ["channel_1"],
};

const messageScope = {
  ...channelScope,
  triggerPhrases: ["Dados para confirmar o pedido"],
  messageAuthorScope: "both" as const,
};

const trampolineCatalog = {
  name: "Catalogo de camas elasticas",
  productName: "Cama elastica",
  currency: "brl",
  attributes: [
    { key: "tamanho", label: "Tamanho" },
    { key: "modelo", label: "Modelo" },
  ],
  variants: [
    { attributeValues: ["4,90", "Nacional"], valueCents: 359700 },
    { attributeValues: ["4,27", "Nacional"], valueCents: 299700 },
    { attributeValues: ["3,05", "Nacional"], valueCents: 199700 },
    { attributeValues: ["2,44", "Nacional"], valueCents: 159700 },
    { attributeValues: ["3,05", "Europa"], valueCents: 179700 },
    { attributeValues: ["2,44", "Europa"], valueCents: 139700 },
  ],
};

describe("provider conversion rule contracts", () => {
  it("keeps provider triggers out of the legacy conversion rule endpoint", () => {
    expect(
      conversionRuleCreateInputSchema.safeParse({
        name: "Compra Umbler",
        triggerType: "provider_automation",
        triggerValue: "automation",
        eventName: "Purchase",
        active: true,
      }).success,
    ).toBe(false);
  });

  it("accepts a QualifiedLead automation without a monetary value", () => {
    const parsed = providerConversionRuleCreateInputSchema.parse({
      ...channelScope,
      triggerType: "provider_automation",
      eventName: "QualifiedLead",
    });

    expect(parsed).toMatchObject({
      mode: "observation",
      eventName: "QualifiedLead",
    });
    expect("defaultValueCents" in parsed).toBe(false);
  });

  it("requires a positive average value for Purchase automation", () => {
    expect(
      providerConversionRuleCreateInputSchema.safeParse({
        ...channelScope,
        triggerType: "provider_automation",
        eventName: "Purchase",
        defaultValueCents: 0,
      }).success,
    ).toBe(false);

    const parsed = providerConversionRuleCreateInputSchema.parse({
      ...channelScope,
      triggerType: "provider_automation",
      eventName: "Purchase",
      defaultValueCents: 250000,
    });

    expect(parsed).toMatchObject({
      defaultValueCents: 250000,
      defaultCurrency: "BRL",
    });
  });

  it("accepts the approved two-attribute trampoline catalog", () => {
    const parsed = providerConversionRuleCreateInputSchema.parse({
      ...messageScope,
      triggerType: "structured_catalog",
      eventName: "Purchase",
      catalog: trampolineCatalog,
    });

    expect(parsed.catalog.currency).toBe("BRL");
    expect(parsed.catalog.variants).toHaveLength(6);
    expect(parsed.catalog.variants[0]).toMatchObject({
      attributeValues: ["4,90", "Nacional"],
      valueCents: 359700,
    });
  });

  it("rejects incomplete, duplicate, and non-Purchase catalogs", () => {
    expect(
      providerConversionRuleCreateInputSchema.safeParse({
        ...messageScope,
        triggerType: "structured_catalog",
        eventName: "Purchase",
        catalog: {
          ...trampolineCatalog,
          variants: [{ attributeValues: ["4,90"], valueCents: 359700 }],
        },
      }).success,
    ).toBe(false);

    expect(
      providerConversionRuleCreateInputSchema.safeParse({
        ...messageScope,
        triggerType: "structured_catalog",
        eventName: "Purchase",
        catalog: {
          ...trampolineCatalog,
          attributes: [
            { key: "modelo", label: "Modelo" },
            { key: "modelo", label: "Modelo alternativo" },
          ],
        },
      }).success,
    ).toBe(false);

    expect(
      providerConversionRuleCreateInputSchema.safeParse({
        ...messageScope,
        triggerType: "structured_catalog",
        eventName: "QualifiedLead",
        catalog: trampolineCatalog,
      }).success,
    ).toBe(false);
  });

  it("distinguishes regular observation intake from conversion automation", () => {
    expect(
      inboundWebhookDeliveryPurposeSchema.parse("message_observation"),
    ).toBe("message_observation");
    expect(
      inboundWebhookDeliveryPurposeSchema.parse("conversion_automation"),
    ).toBe("conversion_automation");
    expect(() =>
      inboundWebhookDeliveryPurposeSchema.parse("conversion"),
    ).toThrow();
  });

  it("validates side-effect-free structured catalog test messages", () => {
    expect(
      structuredCatalogTestMessageInputSchema.parse({
        messageText: "Tamanho: 4,90\nModelo: Nacional\n3.597,00",
      }),
    ).toMatchObject({ messageText: expect.stringContaining("Nacional") });

    expect(
      structuredCatalogTestMessageResultSchema.parse({
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
            quantity: 1,
            parsedAttributes: [
              { key: "tamanho", label: "Tamanho", value: "4,90" },
              { key: "modelo", label: "Modelo", value: "Nacional" },
            ],
            catalogVariantId: "variant_1",
            unitValueCents: 359700,
            subtotalValueCents: 359700,
            contentName: "Cama elastica | Tamanho: 4,90 | Modelo: Nacional",
            reasonCode: "matched",
          },
        ],
        parsedValueCents: 359700,
        calculatedValueCents: 359700,
        observedPaymentValueCents: 359700,
        catalogVariantId: "variant_1",
        contentName: "Cama elastica | Tamanho: 4,90 | Modelo: Nacional",
        currency: "BRL",
      }),
    ).toMatchObject({ matched: true, parsedValueCents: 359700 });
  });
});
