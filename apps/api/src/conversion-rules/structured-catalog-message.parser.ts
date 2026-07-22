import type {
  ProviderConversionCatalogDto,
  StructuredCatalogTestMessageResultDto,
} from "@wpptrack/shared";

type CatalogAttribute = ProviderConversionCatalogDto["attributes"][number];
type CatalogVariant = ProviderConversionCatalogDto["variants"][number];

type ParsedMessageAttributes = {
  parsed: StructuredCatalogTestMessageResultDto["parsedAttributes"];
  valuesByKey: Map<string, string[]>;
  attributeLineIndexes: Set<number>;
};

const moneyPattern =
  /(?:^|[^\d])((?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|(?:US\$\s*|\$\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(?=$|[^\d])/giu;

export function normalizeStructuredCatalogText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

function parseAttributes(
  catalog: ProviderConversionCatalogDto,
  lines: string[],
): ParsedMessageAttributes {
  const valuesByKey = new Map<string, string[]>();
  const attributeLineIndexes = new Set<number>();
  const attributesByLabel = new Map<string, CatalogAttribute>();

  for (const attribute of catalog.attributes) {
    attributesByLabel.set(
      normalizeStructuredCatalogText(attribute.label),
      attribute,
    );
    attributesByLabel.set(
      normalizeStructuredCatalogText(attribute.key),
      attribute,
    );
  }

  lines.forEach((line, lineIndex) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1) return;

    const label = normalizeStructuredCatalogText(line.slice(0, separatorIndex));
    const attribute = attributesByLabel.get(label);
    if (!attribute) return;

    attributeLineIndexes.add(lineIndex);
    const value = line.slice(separatorIndex + 1).trim();
    const current = valuesByKey.get(attribute.key) ?? [];
    current.push(value);
    valuesByKey.set(attribute.key, current);
  });

  return {
    valuesByKey,
    attributeLineIndexes,
    parsed: catalog.attributes.flatMap((attribute) => {
      const values = valuesByKey.get(attribute.key) ?? [];
      return values.length === 1 && values[0]
        ? [
            {
              key: attribute.key,
              label: attribute.label,
              value: values[0],
            },
          ]
        : [];
    }),
  };
}

function variantMatches(
  catalog: ProviderConversionCatalogDto,
  variant: CatalogVariant,
  valuesByKey: Map<string, string[]>,
): boolean {
  return catalog.attributes.every((attribute, index) => {
    const actual = valuesByKey.get(attribute.key)?.[0];
    if (!actual) return false;

    const accepted = [
      variant.attributeValues[index],
      ...(variant.aliases[index] ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeStructuredCatalogText);

    return accepted.includes(normalizeStructuredCatalogText(actual));
  });
}

function parseMoneyToken(token: string): number | null {
  const normalized = token
    .replace(/R\$|US\$|\$/giu, "")
    .replace(/\s+/g, "")
    .trim();
  const commaIndex = normalized.lastIndexOf(",");
  const dotIndex = normalized.lastIndexOf(".");
  const decimalSeparator = commaIndex > dotIndex ? "," : ".";
  const [wholePart, decimalPart] = normalized.split(decimalSeparator);

  if (!wholePart || !/^\d{2}$/u.test(decimalPart ?? "")) return null;

  const wholeDigits = wholePart.replace(/[.,]/g, "");
  if (!/^\d+$/u.test(wholeDigits)) return null;

  const cents = Number(wholeDigits) * 100 + Number(decimalPart);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function messageMoneyValues(lines: string[], excluded: Set<number>): number[] {
  const values: number[] = [];

  lines.forEach((line, lineIndex) => {
    if (excluded.has(lineIndex)) return;

    for (const match of line.matchAll(moneyPattern)) {
      const value = parseMoneyToken(match[1]);
      if (value !== null) values.push(value);
    }
  });

  return values;
}

function contentNameFor(
  catalog: ProviderConversionCatalogDto,
  variant: CatalogVariant,
): string {
  if (variant.contentName) return variant.contentName;

  const attributes = catalog.attributes
    .map(
      (attribute, index) =>
        `${attribute.label}: ${variant.attributeValues[index]}`,
    )
    .join(" | ");

  return `${catalog.productName} | ${attributes}`.slice(0, 180);
}

function blockedResult(
  catalog: ProviderConversionCatalogDto,
  input: {
    reasonCode: Exclude<
      StructuredCatalogTestMessageResultDto["reasonCode"],
      "matched"
    >;
    parsedAttributes: StructuredCatalogTestMessageResultDto["parsedAttributes"];
    parsedValueCents?: number | null;
    variant?: CatalogVariant | null;
  },
): StructuredCatalogTestMessageResultDto {
  return {
    matched: false,
    reasonCode: input.reasonCode,
    parsedAttributes: input.parsedAttributes,
    parsedValueCents: input.parsedValueCents ?? null,
    catalogVariantId: input.variant?.id ?? null,
    contentName: input.variant ? contentNameFor(catalog, input.variant) : null,
    currency: catalog.currency,
  };
}

export function matchStructuredCatalogMessage(
  catalog: ProviderConversionCatalogDto,
  messageText: string,
): StructuredCatalogTestMessageResultDto {
  if (!catalog.active) {
    return blockedResult(catalog, {
      reasonCode: "catalog_inactive",
      parsedAttributes: [],
    });
  }

  const lines = messageText.split(/\r?\n/u);
  const attributes = parseAttributes(catalog, lines);

  for (const attribute of catalog.attributes) {
    const values = attributes.valuesByKey.get(attribute.key) ?? [];
    if (values.length === 0 || values.some((value) => !value.trim())) {
      return blockedResult(catalog, {
        reasonCode: "missing_attribute",
        parsedAttributes: attributes.parsed,
      });
    }
    if (values.length !== 1) {
      return blockedResult(catalog, {
        reasonCode: "ambiguous_attribute",
        parsedAttributes: attributes.parsed,
      });
    }
  }

  const matchingVariants = catalog.variants.filter(
    (variant) =>
      variant.active &&
      variantMatches(catalog, variant, attributes.valuesByKey),
  );

  if (matchingVariants.length === 0) {
    return blockedResult(catalog, {
      reasonCode: "unknown_combination",
      parsedAttributes: attributes.parsed,
    });
  }
  if (matchingVariants.length > 1) {
    return blockedResult(catalog, {
      reasonCode: "ambiguous_variant",
      parsedAttributes: attributes.parsed,
    });
  }

  const variant = matchingVariants[0];
  const moneyValues = messageMoneyValues(
    lines,
    attributes.attributeLineIndexes,
  );
  if (moneyValues.length === 0) {
    return blockedResult(catalog, {
      reasonCode: "missing_price",
      parsedAttributes: attributes.parsed,
      variant,
    });
  }
  if (moneyValues.length !== 1) {
    return blockedResult(catalog, {
      reasonCode: "ambiguous_price",
      parsedAttributes: attributes.parsed,
      variant,
    });
  }
  if (moneyValues[0] !== variant.valueCents) {
    return blockedResult(catalog, {
      reasonCode: "price_mismatch",
      parsedAttributes: attributes.parsed,
      parsedValueCents: moneyValues[0],
      variant,
    });
  }

  return {
    matched: true,
    reasonCode: "matched",
    parsedAttributes: attributes.parsed,
    parsedValueCents: moneyValues[0],
    catalogVariantId: variant.id,
    contentName: contentNameFor(catalog, variant),
    currency: catalog.currency,
  };
}
