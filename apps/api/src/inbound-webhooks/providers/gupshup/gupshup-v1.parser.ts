import type {
  InboundWebhookParser,
  InboundWebhookParserResult,
} from "../inbound-webhook-parser";

export const GUPSHUP_V1_PROVIDER = "gupshup";
export const GUPSHUP_V1_PARSER_VERSION = "v1";

const observationReason = "gupshup_observation_only";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

export function observeGupshupV1Webhook(
  payload: unknown,
): InboundWebhookParserResult {
  const envelope = isRecord(payload) ? payload : null;
  const messagePayload =
    envelope && isRecord(envelope.payload) ? envelope.payload : null;
  const providerEventType = safeText(envelope?.type, 120);
  const externalDeliveryId = safeText(messagePayload?.id, 255);

  return {
    provider: GUPSHUP_V1_PROVIDER,
    parserVersion: GUPSHUP_V1_PARSER_VERSION,
    externalDeliveryId,
    providerEventType,
    classification: "unsupported_event",
    classificationReason: observationReason,
    events: [],
    normalizedSummary: {
      provider: GUPSHUP_V1_PROVIDER,
      parserVersion: GUPSHUP_V1_PARSER_VERSION,
      providerEventType,
      externalDeliveryId,
      classification: "unsupported_event",
      classificationReason: observationReason,
      eventCount: 0,
    },
    error: null,
  };
}

export class GupshupV1Parser implements InboundWebhookParser {
  readonly provider = GUPSHUP_V1_PROVIDER;
  readonly parserVersion = GUPSHUP_V1_PARSER_VERSION;

  parse(payload: unknown): InboundWebhookParserResult {
    return observeGupshupV1Webhook(payload);
  }
}
