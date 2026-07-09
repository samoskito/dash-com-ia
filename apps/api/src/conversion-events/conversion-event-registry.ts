import type { ConversionEventNameDto } from "@wpptrack/shared";

export type ConversionEventDefinition = {
  eventName: ConversionEventNameDto;
  requiresValue: boolean;
};

const conversionEventDefinitionsByName = {
  LeadSubmitted: { requiresValue: false },
  QualifiedLead: { requiresValue: false },
  OrderShipped: { requiresValue: false },
  OrderDelivered: { requiresValue: false },
  OrderCanceled: { requiresValue: false },
  OrderReturned: { requiresValue: false },
  RatingProvided: { requiresValue: false },
  ReviewProvided: { requiresValue: false },
  ViewContent: { requiresValue: true },
  AddToCart: { requiresValue: true },
  CartAbandoned: { requiresValue: true },
  InitiateCheckout: { requiresValue: true },
  Purchase: { requiresValue: true },
  OrderCreated: { requiresValue: true }
} satisfies Record<ConversionEventNameDto, { requiresValue: boolean }>;

export const conversionEventDefinitions: ConversionEventDefinition[] = (
  Object.keys(conversionEventDefinitionsByName) as ConversionEventNameDto[]
).map((eventName) => ({
  eventName,
  requiresValue: conversionEventDefinitionsByName[eventName].requiresValue
}));

export function getConversionEventDefinition(
  eventName: ConversionEventNameDto
): ConversionEventDefinition {
  const definition = conversionEventDefinitionsByName[eventName];

  return {
    eventName,
    requiresValue: definition.requiresValue
  };
}

export function isConversionEventRequiringValue(
  eventName: ConversionEventNameDto
): boolean {
  return getConversionEventDefinition(eventName).requiresValue;
}
