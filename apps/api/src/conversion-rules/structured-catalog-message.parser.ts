import type {
  ProviderConversionCatalogDto,
  ProviderConversionMessageAuthorScopeDto,
  StructuredCatalogParsedItemDto,
  StructuredCatalogTestMessageResultDto,
} from "@wpptrack/shared";
import type { ParsedInboundWebhookMessageAuthorType } from "../inbound-webhooks/providers/inbound-webhook-parser";

type CatalogAttribute = ProviderConversionCatalogDto["attributes"][number];
type CatalogVariant = ProviderConversionCatalogDto["variants"][number];

type RawItem = {
  values: Map<string, string>;
  presentKeys: Set<string>;
  lineIndexes: Set<number>;
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

function normalizeAttributeLabel(value: string): string {
  return normalizeStructuredCatalogText(value)
    .replace(/^[^a-z0-9]+/u, "")
    .replace(/[^a-z0-9_]+$/u, "");
}

export function matchProviderMessageTrigger(
  messageText: string,
  triggerPhrases: string[],
): string | null {
  if (triggerPhrases.length === 0) return null;

  const normalizedMessage = normalizeStructuredCatalogText(messageText);
  return (
    triggerPhrases.find((phrase) => {
      const normalizedPhrase = normalizeStructuredCatalogText(phrase);
      return (
        normalizedPhrase.length > 0 &&
        normalizedMessage.includes(normalizedPhrase)
      );
    }) ?? null
  );
}

export function providerMessageAuthorAllowed(
  scope: ProviderConversionMessageAuthorScopeDto,
  authorType: ParsedInboundWebhookMessageAuthorType,
): boolean {
  if (scope === "both") {
    return ["contact", "organization_member", "bot"].includes(authorType);
  }
  if (scope === "contact") return authorType === "contact";
  return ["organization_member", "bot"].includes(authorType);
}

function attributeLookup(catalog: ProviderConversionCatalogDto) {
  const lookup = new Map<string, CatalogAttribute>();
  for (const attribute of catalog.attributes) {
    lookup.set(normalizeAttributeLabel(attribute.label), attribute);
    lookup.set(normalizeAttributeLabel(attribute.key), attribute);
  }
  return lookup;
}

function parseRawItems(
  catalog: ProviderConversionCatalogDto,
  lines: string[],
): { items: RawItem[]; attributeLineIndexes: Set<number> } {
  const lookup = attributeLookup(catalog);
  const items: RawItem[] = [];
  const attributeLineIndexes = new Set<number>();
  let current: RawItem | null = null;

  const finishCurrent = () => {
    if (current && current.presentKeys.size > 0) items.push(current);
    current = null;
  };

  lines.forEach((line, lineIndex) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1) return;

    const attribute = lookup.get(
      normalizeAttributeLabel(line.slice(0, separatorIndex)),
    );
    if (!attribute) return;

    attributeLineIndexes.add(lineIndex);
    const position = catalog.attributes.findIndex(
      (candidate) => candidate.key === attribute.key,
    );
    const repeatsCurrent = current?.presentKeys.has(attribute.key) ?? false;
    if (position === 0 || repeatsCurrent) finishCurrent();

    current ??= {
      values: new Map<string, string>(),
      presentKeys: new Set<string>(),
      lineIndexes: new Set<number>(),
    };
    current.presentKeys.add(attribute.key);
    current.lineIndexes.add(lineIndex);
    current.values.set(attribute.key, line.slice(separatorIndex + 1).trim());

    if (catalog.attributes.length === 1) finishCurrent();
  });

  finishCurrent();
  return { items, attributeLineIndexes };
}

function parseQuantity(value: string): {
  quantity: number;
  value: string;
  valid: boolean;
} {
  const match = value.match(/^\s*(\d{1,3})\s*[xX\u00d7]\s*(.+?)\s*$/u);
  if (!match) return { quantity: 1, value: value.trim(), valid: true };

  const quantity = Number(match[1]);
  return {
    quantity,
    value: match[2].trim(),
    valid: Number.isInteger(quantity) && quantity >= 1 && quantity <= 100,
  };
}

function acceptedVariantValues(
  variant: CatalogVariant,
  attributeIndex: number,
): string[] {
  return [
    variant.attributeValues[attributeIndex],
    ...(variant.aliases[attributeIndex] ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeStructuredCatalogText);
}

function observedVariantValues(value: string): string[] {
  const normalized = normalizeStructuredCatalogText(value);
  const candidates = new Set([normalized]);
  const metricValue = normalized.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:m|metro|metros)$/u,
  );

  if (metricValue?.[1]) candidates.add(metricValue[1]);

  return [...candidates];
}

function matchingVariants(
  catalog: ProviderConversionCatalogDto,
  values: Map<string, string>,
): CatalogVariant[] {
  return catalog.variants.filter(
    (variant) =>
      variant.active &&
      catalog.attributes.every((attribute, index) => {
        const actual = values.get(attribute.key);
        const accepted = acceptedVariantValues(variant, index);
        return (
          Boolean(actual) &&
          observedVariantValues(actual!).some((candidate) =>
            accepted.includes(candidate),
          )
        );
      }),
  );
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

function observedPaymentValue(
  lines: string[],
  excluded: Set<number>,
): number | null {
  const values = new Set<number>();
  lines.forEach((line, lineIndex) => {
    if (excluded.has(lineIndex)) return;
    for (const match of line.matchAll(moneyPattern)) {
      const value = parseMoneyToken(match[1]);
      if (value !== null) values.add(value);
    }
  });

  return values.size === 1 ? [...values][0] : null;
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

function emptyResult(
  catalog: ProviderConversionCatalogDto,
  input: {
    reasonCode: StructuredCatalogTestMessageResultDto["reasonCode"];
    classification: StructuredCatalogTestMessageResultDto["classification"];
    matchedTriggerPhrase?: string | null;
    parsedAttributes?: StructuredCatalogTestMessageResultDto["parsedAttributes"];
    items?: StructuredCatalogParsedItemDto[];
    observedPaymentValueCents?: number | null;
  },
): StructuredCatalogTestMessageResultDto {
  return {
    matched: false,
    reasonCode: input.reasonCode,
    classification: input.classification,
    matchedTriggerPhrase: input.matchedTriggerPhrase ?? null,
    parsedAttributes: input.parsedAttributes ?? [],
    items: input.items ?? [],
    parsedValueCents: null,
    calculatedValueCents: null,
    observedPaymentValueCents: input.observedPaymentValueCents ?? null,
    catalogVariantId: null,
    contentName: null,
    currency: catalog.currency,
  };
}

function parseItem(
  catalog: ProviderConversionCatalogDto,
  rawItem: RawItem,
  position: number,
): StructuredCatalogParsedItemDto {
  const normalizedValues = new Map(rawItem.values);
  const firstAttribute = catalog.attributes[0];
  const firstRawValue = normalizedValues.get(firstAttribute.key) ?? "";
  const quantity = parseQuantity(firstRawValue);
  normalizedValues.set(firstAttribute.key, quantity.value);

  const parsedAttributes = catalog.attributes.flatMap((attribute) => {
    const value = normalizedValues.get(attribute.key)?.trim() ?? "";
    return value ? [{ key: attribute.key, label: attribute.label, value }] : [];
  });

  if (!quantity.valid) {
    return {
      position,
      quantity: 1,
      parsedAttributes,
      catalogVariantId: null,
      unitValueCents: null,
      subtotalValueCents: null,
      contentName: null,
      reasonCode: "invalid_quantity",
    };
  }

  const hasEveryLabel = catalog.attributes.every((attribute) =>
    rawItem.presentKeys.has(attribute.key),
  );
  const hasBlankValue = catalog.attributes.some(
    (attribute) => !(normalizedValues.get(attribute.key)?.trim() ?? ""),
  );
  if (!hasEveryLabel || hasBlankValue) {
    return {
      position,
      quantity: quantity.quantity,
      parsedAttributes,
      catalogVariantId: null,
      unitValueCents: null,
      subtotalValueCents: null,
      contentName: null,
      reasonCode: hasBlankValue ? "awaiting_data" : "incomplete_item",
    };
  }

  const variants = matchingVariants(catalog, normalizedValues);
  if (variants.length !== 1) {
    return {
      position,
      quantity: quantity.quantity,
      parsedAttributes,
      catalogVariantId: null,
      unitValueCents: null,
      subtotalValueCents: null,
      contentName: null,
      reasonCode:
        variants.length === 0 ? "unknown_combination" : "ambiguous_variant",
    };
  }

  const variant = variants[0];
  return {
    position,
    quantity: quantity.quantity,
    parsedAttributes,
    catalogVariantId: variant.id,
    unitValueCents: variant.valueCents,
    subtotalValueCents: variant.valueCents * quantity.quantity,
    contentName: contentNameFor(catalog, variant),
    reasonCode: "matched",
  };
}

export function matchStructuredCatalogMessage(
  catalog: ProviderConversionCatalogDto,
  messageText: string,
  options: { triggerPhrases?: string[] } = {},
): StructuredCatalogTestMessageResultDto {
  if (!catalog.active) {
    return emptyResult(catalog, {
      reasonCode: "catalog_inactive",
      classification: "review_required",
    });
  }

  const triggerPhrases = options.triggerPhrases ?? [];
  const matchedTriggerPhrase = matchProviderMessageTrigger(
    messageText,
    triggerPhrases,
  );
  if (triggerPhrases.length > 0 && !matchedTriggerPhrase) {
    return emptyResult(catalog, {
      reasonCode: "trigger_missing",
      classification: "ignored",
    });
  }

  const lines = messageText.split(/\r?\n/u);
  const parsed = parseRawItems(catalog, lines);
  const observedPaymentValueCents = observedPaymentValue(
    lines,
    parsed.attributeLineIndexes,
  );
  if (parsed.items.length === 0) {
    return emptyResult(catalog, {
      reasonCode: "awaiting_data",
      classification: "awaiting_data",
      matchedTriggerPhrase,
      observedPaymentValueCents,
    });
  }

  const items = parsed.items.map((item, index) =>
    parseItem(catalog, item, index + 1),
  );
  const invalidItem = items.find((item) => item.reasonCode !== "matched");
  if (invalidItem) {
    const awaiting = items.every((item) =>
      ["matched", "awaiting_data"].includes(item.reasonCode),
    );
    return emptyResult(catalog, {
      reasonCode: invalidItem.reasonCode,
      classification: awaiting ? "awaiting_data" : "review_required",
      matchedTriggerPhrase,
      parsedAttributes: items[0]?.parsedAttributes ?? [],
      items,
      observedPaymentValueCents,
    });
  }

  const calculatedValueCents = items.reduce(
    (total, item) => total + (item.subtotalValueCents ?? 0),
    0,
  );
  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
  const singleItem = items.length === 1 ? items[0] : null;
  const contentName = singleItem
    ? singleItem.contentName
    : `${catalog.productName} | ${totalQuantity} itens`.slice(0, 180);

  return {
    matched: true,
    reasonCode: "matched",
    classification: "recognized",
    matchedTriggerPhrase,
    parsedAttributes: items[0]?.parsedAttributes ?? [],
    items,
    parsedValueCents: calculatedValueCents,
    calculatedValueCents,
    observedPaymentValueCents,
    catalogVariantId: singleItem?.catalogVariantId ?? null,
    contentName,
    currency: catalog.currency,
  };
}
