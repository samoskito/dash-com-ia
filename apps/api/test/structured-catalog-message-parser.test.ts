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

  it("blocks a matched product without a monetary value", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "Tamanho: 4,90\nModelo: Nacional",
    );

    expect(result).toMatchObject({
      matched: false,
      reasonCode: "missing_price",
      catalogVariantId: "variant_1",
    });
  });

  it("blocks a monetary value that differs from the catalog", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "Tamanho: 4,90\nModelo: Nacional\n3.497,00",
    );

    expect(result).toMatchObject({
      matched: false,
      reasonCode: "price_mismatch",
      parsedValueCents: 349_700,
      catalogVariantId: "variant_1",
    });
  });

  it("blocks a message containing more than one product", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      [
        "Tamanho: 4,90",
        "Modelo: Nacional",
        "3.597,00",
        "Tamanho: 2,44",
        "Modelo: Europa",
        "1.397,00",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      matched: false,
      reasonCode: "ambiguous_attribute",
    });
  });

  it("blocks a matched product when more than one price is present", () => {
    const result = matchStructuredCatalogMessage(
      catalog(),
      "Tamanho: 4,90\nModelo: Nacional\nDe 3.797,00 por 3.597,00",
    );

    expect(result).toMatchObject({
      matched: false,
      reasonCode: "ambiguous_price",
    });
  });
});
