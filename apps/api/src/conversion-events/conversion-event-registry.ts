import type { ConversionEventNameDto } from "@wpptrack/shared";

export type ConversionEventDefinition = {
  eventName: ConversionEventNameDto;
  requiresValue: boolean;
};

export const conversionEventDefinitions: ConversionEventDefinition[] = [
  { eventName: "LeadSubmitted", requiresValue: false },
  { eventName: "QualifiedLead", requiresValue: false },
  { eventName: "OrderShipped", requiresValue: false },
  { eventName: "OrderDelivered", requiresValue: false },
  { eventName: "OrderCanceled", requiresValue: false },
  { eventName: "OrderReturned", requiresValue: false },
  { eventName: "RatingProvided", requiresValue: false },
  { eventName: "ReviewProvided", requiresValue: false },
  { eventName: "ViewContent", requiresValue: true },
  { eventName: "AddToCart", requiresValue: true },
  { eventName: "CartAbandoned", requiresValue: true },
  { eventName: "InitiateCheckout", requiresValue: true },
  { eventName: "Purchase", requiresValue: true },
  { eventName: "OrderCreated", requiresValue: true }
];

const definitionsByName = new Map(
  conversionEventDefinitions.map((definition) => [
    definition.eventName,
    definition
  ])
);

export function getConversionEventDefinition(
  eventName: ConversionEventNameDto
): ConversionEventDefinition {
  const definition = definitionsByName.get(eventName);

  if (!definition) {
    throw new Error(`Unsupported conversion event: ${eventName}`);
  }

  return definition;
}

export function isConversionEventRequiringValue(
  eventName: ConversionEventNameDto
): boolean {
  return getConversionEventDefinition(eventName).requiresValue;
}
