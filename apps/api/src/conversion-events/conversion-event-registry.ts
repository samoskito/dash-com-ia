import {
  conversionEventCatalog,
  conversionEventRequiresValue,
  type ConversionEventNameDto
} from "@wpptrack/shared";

export type ConversionEventDefinition = {
  eventName: ConversionEventNameDto;
  requiresValue: boolean;
};

/**
 * A politica de valor vive no catalogo compartilhado. Este registro era uma
 * copia manual que divergiu dele: marcava ViewContent, AddToCart, CartAbandoned
 * e OrderCreated como "requiresValue", entao um evento desses sem valor ficava
 * preso em `pending_value` mesmo com o catalogo dizendo que o valor e opcional.
 */
const conversionEventDefinitionsByName = Object.fromEntries(
  (Object.keys(conversionEventCatalog) as ConversionEventNameDto[]).map(
    (eventName) => [
      eventName,
      { requiresValue: conversionEventRequiresValue(eventName) }
    ]
  )
) as Record<ConversionEventNameDto, { requiresValue: boolean }>;

export const conversionEventDefinitions: ConversionEventDefinition[] = (
  Object.keys(conversionEventDefinitionsByName) as ConversionEventNameDto[]
).map((eventName) => ({
  eventName,
  requiresValue: conversionEventDefinitionsByName[eventName].requiresValue
}));

export function getConversionEventDefinition(
  eventName: ConversionEventNameDto
): ConversionEventDefinition {
  if (!isSupportedConversionEventName(eventName)) {
    throw new Error(`Unsupported conversion event name: ${String(eventName)}`);
  }

  const definition = conversionEventDefinitionsByName[eventName];

  return {
    eventName,
    requiresValue: definition.requiresValue
  };
}

export function isSupportedConversionEventName(
  eventName: unknown
): eventName is ConversionEventNameDto {
  return (
    typeof eventName === "string" &&
    Object.prototype.hasOwnProperty.call(
      conversionEventDefinitionsByName,
      eventName
    )
  );
}

export function isConversionEventRequiringValue(
  eventName: ConversionEventNameDto
): boolean {
  return getConversionEventDefinition(eventName).requiresValue;
}
