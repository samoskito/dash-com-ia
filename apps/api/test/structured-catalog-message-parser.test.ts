import type { ProviderConversionCatalogDto } from "@wpptrack/shared";
import { describe, expect, it } from "vitest";
import { matchStructuredCatalogMessage } from "../src/conversion-rules/structured-catalog-message.parser";

const variants = [
  ["4,90", "Nacional", 359_700],
  ["4,27", "Nacional", 299_700],
  ["3,05", "Nacional", 199_700],
  ["2,44", "Nacional", 159_700],
  ["3,05", "Europa", 179_700],
  ["2,44", "Europa", 139_700],
] as const;

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
    variants: variants.map(([size, model, valueCents], index) => ({
      id: `variant_${index + 1}`,
      normalizedKey: `${size}|${model}`,
      attributeValues: [size, model],
      aliases: [],
      valueCents,
      contentName: null,
      active: true,
    })),
  };
}

function brl(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

describe("structured catalog message parser", () => {
  it.each(variants)(
    "matches size %s and model %s at the authoritative price",
    (size, model, valueCents) => {
      const result = matchStructuredCatalogMessage(
        catalog(),
        `Tamanho: ${size}\nModelo: ${model}\n${brl(valueCents)}`,
      );

      expect(result).toMatchObject({
        matched: true,
        reasonCode: "matched",
        classification: "recognized",
        parsedValueCents: valueCents,
        currency: "BRL",
      });
      expect(result.contentName).toContain(size);
      expect(result.contentName).toContain(model);
    },
  );

  it("normalizes label case, accents, whitespace and explicit aliases", () => {
    const input = catalog();
    input.variants[0].aliases = [["4.9"], ["NACIONAL BR"]];

    const result = matchStructuredCatalogMessage(
      input,
      "  TAMANHO : 4.9  \n modelo: nacional br \nValor: R$ 3.597,00",
    );

    expect(result).toMatchObject({
      matched: true,
      catalogVariantId: "variant_1",
      parsedValueCents: 359_700,
    });
  });

  it("blocks an unknown attribute combination", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "Tamanho: 5,00\nModelo: Nacional\n3.597,00",
    );

    expect(result).toMatchObject({
      matched: false,
      reasonCode: "unknown_combination",
    });
  });

  it("blocks aliases that resolve to more than one variant", () => {
    const input = catalog();
    input.variants[0].aliases = [["grande"], ["padrao"]];
    input.variants[1].aliases = [["grande"], ["padrao"]];

    const result = matchStructuredCatalogMessage(
      input,
      "Tamanho: grande\nModelo: padrao\n3.597,00",
    );

    expect(result).toMatchObject({
      matched: false,
      reasonCode: "ambiguous_variant",
    });
  });

  it("uses the catalog price when the message does not contain a payment value", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "Tamanho: 4,90\nModelo: Nacional",
    );

    expect(result).toMatchObject({
      matched: true,
      reasonCode: "matched",
      catalogVariantId: "variant_1",
      calculatedValueCents: 359_700,
      observedPaymentValueCents: null,
    });
  });

  it("keeps a different payment value as a non-authoritative diagnostic", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "Tamanho: 4,90\nModelo: Nacional\n3.497,00",
    );

    expect(result).toMatchObject({
      matched: true,
      reasonCode: "matched",
      parsedValueCents: 359_700,
      calculatedValueCents: 359_700,
      observedPaymentValueCents: 349_700,
      catalogVariantId: "variant_1",
    });
  });

  it("sums repeated products and quantities using catalog values", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      [
        "Dados para confirmar o pedido:",
        "Tamanho: 3,05",
        "Modelo: Nacional",
        "Tamanho: 2x 2,44",
        "Modelo: Nacional",
        "3 bolsas de transporte",
        "Forma de pagamento: 5.594,00 pix",
      ].join("\n"),
      { triggerPhrases: ["Dados para confirmar o pedido"] },
    );

    expect(result).toMatchObject({
      matched: true,
      reasonCode: "matched",
      classification: "recognized",
      matchedTriggerPhrase: "Dados para confirmar o pedido",
      calculatedValueCents: 519_100,
      observedPaymentValueCents: 559_400,
      catalogVariantId: null,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        position: 1,
        quantity: 1,
        catalogVariantId: "variant_3",
        subtotalValueCents: 199_700,
      }),
      expect.objectContaining({
        position: 2,
        quantity: 2,
        catalogVariantId: "variant_4",
        subtotalValueCents: 319_400,
      }),
    ]);
  });

  it("ignores ambiguous payment amounts when the catalog items are exact", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "Tamanho: 4,90\nModelo: Nacional\nDe 3.797,00 por 3.597,00",
    );

    expect(result).toMatchObject({
      matched: true,
      reasonCode: "matched",
      calculatedValueCents: 359_700,
      observedPaymentValueCents: null,
    });
  });

  it("requires the configured trigger phrase without fuzzy matching", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "Pedido confirmado\nTamanho: 4,90\nModelo: Nacional",
      { triggerPhrases: ["Dados para confirmar o pedido"] },
    );

    expect(result).toMatchObject({
      matched: false,
      reasonCode: "trigger_missing",
      classification: "ignored",
    });
  });

  it("recognizes a blank template as awaiting data", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "COMPROVANTE DE ENCOMENDA\nTamanho:\nModelo:",
      { triggerPhrases: ["Comprovante de encomenda"] },
    );

    expect(result).toMatchObject({
      matched: false,
      reasonCode: "awaiting_data",
      classification: "awaiting_data",
      matchedTriggerPhrase: "Comprovante de encomenda",
    });
  });
});
