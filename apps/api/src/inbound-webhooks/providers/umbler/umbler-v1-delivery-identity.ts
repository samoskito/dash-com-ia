import {
  boundedString,
  rawBodyDeliveryIdentity,
  type InboundWebhookDeliveryIdentity,
} from "../inbound-webhook-delivery-identity";

export function extractUmblerV1DeliveryIdentity(
  rawBody: Buffer,
): InboundWebhookDeliveryIdentity {
  try {
    const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return rawBodyDeliveryIdentity(rawBody);
    }

    const envelope = parsed as Record<string, unknown>;
    const eventType = boundedString(envelope.Type, 120);
    const eventId = boundedString(envelope.EventId, 255);

    if (!eventId) {
      return rawBodyDeliveryIdentity(rawBody, eventType);
    }

    return {
      ingressKey: eventId,
      externalDeliveryId: eventId,
      providerEventType: eventType,
      identitySource: "provider_event_id",
    };
  } catch {
    return rawBodyDeliveryIdentity(rawBody);
  }
}
