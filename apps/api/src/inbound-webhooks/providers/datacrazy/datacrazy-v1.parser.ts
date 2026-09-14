import { boundedString } from "../inbound-webhook-delivery-identity";
import {
  buildInboundWebhookEventDedupeKey,
  type InboundWebhookDeliveryNormalizedSummary,
  type InboundWebhookEventClassification,
  type InboundWebhookEventNormalizedSummary,
  type InboundWebhookParser,
  type InboundWebhookParserContext,
  type InboundWebhookParserResult,
  type ParsedInboundWebhookAd,
  type ParsedInboundWebhookEvent,
} from "../inbound-webhook-parser";

export const DATACRAZY_V1_PROVIDER = "datacrazy";
export const DATACRAZY_V1_PARSER_VERSION = "v1";

const MAX_ENCODED_JSON_LENGTH = 256 * 1024;
const invalidPayloadError = {
  code: "datacrazy_v1_invalid_payload",
  message: "Inbound webhook payload failed validation",
} as const;

type OptionalString = { valid: boolean; value: string | null };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown, maximumLength: number): OptionalString {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }
  if (typeof value !== "string") return { valid: false, value: null };
  if (value.trim().length === 0) return { valid: true, value: null };
  const normalized = boundedString(value, maximumLength);
  return normalized
    ? { valid: true, value: normalized }
    : { valid: false, value: null };
}

function optionalText(value: unknown, maximumLength: number): OptionalString {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }
  if (typeof value !== "string") return { valid: false, value: null };
  const normalized = value.trim();
  if (normalized.length === 0) return { valid: true, value: null };
  if (
    normalized.length > maximumLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
  ) {
    return { valid: false, value: null };
  }
  return { valid: true, value: normalized };
}

function parsePhone(value: unknown): string | null {
  const raw = boundedString(value, 256);
  if (!raw) return null;
  const localPart = raw.split("@", 1)[0] ?? raw;
  const digits = localPart.replace(/\D/gu, "");
  return digits.length >= 8 && digits.length <= 20 ? digits : null;
}

function parseOccurredAt(value: unknown): Date | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
    const result = new Date(milliseconds);
    return Number.isFinite(result.getTime()) ? result : null;
  }
  const raw = boundedString(value, 80);
  if (!raw) return null;
  if (/^\d{9,13}$/u.test(raw)) return parseOccurredAt(Number(raw));
  const milliseconds = Date.parse(raw);
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

function parseEncodedJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (
    raw.length === 0 ||
    raw.length > MAX_ENCODED_JSON_LENGTH ||
    /\u0000/u.test(raw)
  ) {
    return null;
  }
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseReferral(value: unknown): {
  valid: boolean;
  adId: string | null;
  ctwaClid: string | null;
  ad: ParsedInboundWebhookAd | null;
} {
  if (value === null || value === undefined) {
    return { valid: true, adId: null, ctwaClid: null, ad: null };
  }
  const referral = asRecord(value);
  if (!referral) return { valid: false, adId: null, ctwaClid: null, ad: null };

  const adId = optionalString(referral.source_id, 255);
  const ctwaClid = optionalString(referral.ctwa_clid, 2_048);
  const sourceUrl = optionalString(referral.source_url, 4_096);
  const description = optionalText(referral.body, 4_096);
  const title = optionalString(referral.headline, 512);
  const thumbnailUrl = optionalString(referral.thumbnail_url, 4_096);
  const mediaUrl = optionalString(referral.video_url, 4_096);
  const sourceType = optionalString(referral.source_type, 120);
  if (
    [
      adId,
      ctwaClid,
      sourceUrl,
      description,
      title,
      thumbnailUrl,
      mediaUrl,
      sourceType,
    ].some((item) => !item.valid)
  ) {
    return { valid: false, adId: null, ctwaClid: null, ad: null };
  }

  // Referral metadata without a CTWA click ID is not ad attribution.
  if (!ctwaClid.value) {
    return { valid: true, adId: null, ctwaClid: null, ad: null };
  }
  return {
    valid: true,
    adId: adId.value,
    ctwaClid: ctwaClid.value,
    ad: {
      sourceUrl: sourceUrl.value,
      description: description.value,
      title: title.value,
      thumbnailUrl: thumbnailUrl.value,
      mediaUrl: mediaUrl.value,
      sourceType: sourceType.value,
    },
  };
}

function summary(input: {
  providerEventType: string | null;
  externalDeliveryId: string | null;
  classification: InboundWebhookEventClassification;
  classificationReason: string;
  eventCount: number;
}): InboundWebhookDeliveryNormalizedSummary {
  return {
    provider: DATACRAZY_V1_PROVIDER,
    parserVersion: DATACRAZY_V1_PARSER_VERSION,
    ...input,
  };
}

function emptyResult(input: {
  classification: "invalid_payload" | "unsupported_event";
  classificationReason: string;
}): InboundWebhookParserResult {
  return {
    provider: DATACRAZY_V1_PROVIDER,
    parserVersion: DATACRAZY_V1_PARSER_VERSION,
    providerEventType: null,
    externalDeliveryId: null,
    classification: input.classification,
    classificationReason: input.classificationReason,
    events: [],
    normalizedSummary: summary({
      providerEventType: null,
      externalDeliveryId: null,
      classification: input.classification,
      classificationReason: input.classificationReason,
      eventCount: 0,
    }),
    error:
      input.classification === "invalid_payload"
        ? { ...invalidPayloadError }
        : null,
  };
}

function identifier(value: unknown, maximumLength = 255): string | null {
  return boundedString(value, maximumLength);
}

function parseItem(
  item: unknown,
  organizationId: string,
): ParsedInboundWebhookEvent | null {
  const envelopeItem = asRecord(item);
  if (!envelopeItem) return null;
  const body = parseEncodedJsonRecord(envelopeItem.body);
  if (!body) return null;
  const mensagem = parseEncodedJsonRecord(body.mensagem);
  if (!mensagem) return null;

  const leadId = identifier(envelopeItem.leadId);
  const messageData = asRecord(mensagem.messageData);
  const contact = asRecord(messageData?.contact);
  const instanceData = asRecord(mensagem.instanceData);
  if (!leadId || !messageData || !contact || !instanceData) return null;

  const externalMessageId = identifier(messageData.id);
  const providerChannelId = identifier(instanceData.id);
  const connectedPhone = parsePhone(body.telefone);
  const contactPhone = parsePhone(contact.phoneNumber);
  const senderPhone = parsePhone(mensagem.from);
  const occurredAt =
    parseOccurredAt(messageData.date) ?? parseOccurredAt(mensagem.timestamp);
  if (
    !externalMessageId ||
    !providerChannelId ||
    !connectedPhone ||
    !contactPhone ||
    !senderPhone ||
    !occurredAt
  ) {
    return null;
  }

  const contactName = optionalText(contact.name, 160);
  const text = optionalText(messageData.text, 16_384);
  const rawMessageType = mensagem.type;
  const messageType = optionalString(rawMessageType, 120);
  const channelName = optionalString(instanceData.name, 160);
  const referral = parseReferral(mensagem.referral);
  if (
    !contactName.valid ||
    !text.valid ||
    !messageType.valid ||
    !channelName.valid ||
    !referral.valid ||
    (messageType.value === null &&
      rawMessageType !== undefined &&
      rawMessageType !== null)
  ) {
    return null;
  }

  const hasCtwa = referral.ctwaClid !== null;
  const classification: InboundWebhookEventClassification = hasCtwa
    ? "eligible_route_unresolved"
    : "ignored_no_ctwa";
  const classificationReason = hasCtwa
    ? "route_resolution_pending"
    : "ctwa_missing";
  const externalEventId = externalMessageId;
  const phoneDivergenceDetected =
    connectedPhone !== contactPhone || connectedPhone !== senderPhone;
  const normalizedSummary: InboundWebhookEventNormalizedSummary & {
    phoneDivergenceDetected: boolean;
  } = {
    provider: DATACRAZY_V1_PROVIDER,
    providerEventType: "message",
    externalEventId,
    externalMessageId,
    organizationId,
    providerChannelId,
    connectedPhoneSuffix: connectedPhone.slice(-4),
    occurredAt: occurredAt.toISOString(),
    adId: referral.adId,
    hasCtwa,
    messageDirection: "inbound",
    messageAuthorType: "contact",
    messageType: messageType.value ?? "text",
    classification,
    classificationReason,
    phoneDivergenceDetected,
  };

  return {
    provider: DATACRAZY_V1_PROVIDER,
    providerEventType: "message",
    externalEventId,
    externalMessageId,
    dedupeKey: buildInboundWebhookEventDedupeKey({
      provider: DATACRAZY_V1_PROVIDER,
      organizationId,
      providerChannelId,
      externalMessageId,
    }),
    organizationId,
    occurredAt,
    channel: {
      providerChannelId,
      connectedPhone,
      name: channelName.value,
    },
    contact: {
      externalContactId: leadId,
      phoneNumber: contactPhone,
      name: contactName.value,
    },
    message: {
      direction: "inbound",
      authorType: "contact",
      messageType: messageType.value ?? "text",
      text: text.value,
      isPrivate: false,
    },
    adId: referral.adId,
    ad: referral.ad,
    ctwaClid: referral.ctwaClid,
    hasCtwa,
    classification,
    classificationReason,
    normalizedSummary,
  };
}

function parsePayload(
  payload: unknown,
  context: InboundWebhookParserContext | undefined,
): InboundWebhookParserResult {
  const organizationId = identifier(context?.organizationId);
  if (!organizationId) {
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "organization_context_missing",
    });
  }
  if (!Array.isArray(payload)) {
    return emptyResult({
      classification: "unsupported_event",
      classificationReason: "payload_envelope_unsupported",
    });
  }
  if (payload.length === 0) {
    return emptyResult({
      classification: "unsupported_event",
      classificationReason: "payload_batch_empty",
    });
  }

  const events = payload.map((item) => parseItem(item, organizationId));
  if (events.some((event) => event === null)) {
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });
  }
  const parsedEvents = events as ParsedInboundWebhookEvent[];
  const hasEligibleEvent = parsedEvents.some(
    (event) => event.classification === "eligible_route_unresolved",
  );
  const classification: InboundWebhookEventClassification = hasEligibleEvent
    ? "eligible_route_unresolved"
    : "ignored_no_ctwa";
  const classificationReason = hasEligibleEvent
    ? "route_resolution_pending"
    : "ctwa_missing";
  const externalDeliveryId =
    parsedEvents.length === 1 ? parsedEvents[0]!.externalEventId : null;

  return {
    provider: DATACRAZY_V1_PROVIDER,
    parserVersion: DATACRAZY_V1_PARSER_VERSION,
    providerEventType: "message",
    externalDeliveryId,
    classification,
    classificationReason,
    events: parsedEvents,
    normalizedSummary: summary({
      providerEventType: "message",
      externalDeliveryId,
      classification,
      classificationReason,
      eventCount: parsedEvents.length,
    }),
    error: null,
  };
}

export function parseDataCrazyV1Webhook(
  payload: unknown,
  context?: InboundWebhookParserContext,
): InboundWebhookParserResult {
  try {
    return parsePayload(payload, context);
  } catch {
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });
  }
}

export class DataCrazyV1Parser implements InboundWebhookParser {
  readonly provider = DATACRAZY_V1_PROVIDER;
  readonly parserVersion = DATACRAZY_V1_PARSER_VERSION;

  parse(
    payload: unknown,
    context?: InboundWebhookParserContext,
  ): InboundWebhookParserResult {
    return parseDataCrazyV1Webhook(payload, context);
  }
}
