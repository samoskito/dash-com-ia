import { createHash } from "node:crypto";
import { boundedString } from "../inbound-webhook-delivery-identity";
import {
  buildInboundWebhookEventDedupeKey,
  type InboundWebhookDeliveryNormalizedSummary,
  type InboundWebhookEventClassification,
  type InboundWebhookEventNormalizedSummary,
  type InboundWebhookParser,
  type InboundWebhookParserResult,
  type ParsedInboundWebhookAd,
  type ParsedInboundWebhookMessage,
} from "../inbound-webhook-parser";

export const DATACRAZY_V1_PROVIDER = "datacrazy";
export const DATACRAZY_V1_PARSER_VERSION = "v1";

const invalidPayloadError = {
  code: "datacrazy_v1_invalid_payload",
  message: "Inbound webhook payload failed validation",
} as const;
const messageFieldNames = new Set([
  "mensagem",
  "message",
  "msg",
  "data",
  "json produtos",
  "jsonprodutos",
  "json_produtos",
]);

type OptionalString = { valid: boolean; value: string | null };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function field(record: Record<string, unknown> | null, name: string): unknown {
  if (!record) return undefined;
  const lowerName = name.toLocaleLowerCase("en-US");
  const key = Object.keys(record).find(
    (candidate) => candidate.toLocaleLowerCase("en-US") === lowerName,
  );
  return key === undefined ? undefined : record[key];
}

function optionalString(value: unknown, maximumLength: number): OptionalString {
  if (value === null || value === undefined)
    return { valid: true, value: null };
  if (typeof value !== "string") return { valid: false, value: null };
  if (value.trim().length === 0) return { valid: true, value: null };
  const normalized = boundedString(value, maximumLength);
  return normalized
    ? { valid: true, value: normalized }
    : { valid: false, value: null };
}

function optionalText(value: unknown, maximumLength: number): OptionalString {
  if (value === null || value === undefined)
    return { valid: true, value: null };
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

function escapeLiteralControlsInJsonStrings(raw: string): string {
  let inString = false;
  let escaped = false;
  let output = "";
  for (const character of raw) {
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      output += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      output += character;
      inString = !inString;
      continue;
    }
    if (inString && character === "\n") {
      output += "\\n";
    } else if (inString && character === "\r") {
      output += "\\r";
    } else if (inString && character === "\t") {
      output += "\\t";
    } else {
      output += character;
    }
  }
  return output;
}

function extractBalancedMessage(raw: string): Record<string, unknown> | null {
  const marker = /"(?:received|contact|conversationId|attendant)"/iu.exec(raw);
  if (!marker || marker.index === undefined) return null;
  const start = raw.lastIndexOf("{", marker.index);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = raw.slice(start, index + 1);
        for (const attempt of [
          candidate,
          escapeLiteralControlsInJsonStrings(candidate),
        ]) {
          try {
            return asRecord(JSON.parse(attempt));
          } catch {
            // Try the next safe representation.
          }
        }
      }
    }
  }
  return null;
}

function parseResilientObject(raw: string): Record<string, unknown> | null {
  for (const attempt of [raw, escapeLiteralControlsInJsonStrings(raw)]) {
    try {
      const parsed = asRecord(JSON.parse(attempt));
      if (parsed) return parsed;
    } catch {
      // A malformed nested template is expected for this provider.
    }
  }
  return extractBalancedMessage(raw);
}

function rawCtwaFallback(raw: string): Record<string, unknown> | null {
  const capture = (name: string) =>
    new RegExp(`"${name}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, "iu").exec(
      raw,
    )?.[1] ?? null;
  const ctwaClid = capture("ctwa_?clid");
  if (!ctwaClid) return null;
  return {
    ctwa_clid: ctwaClid,
    source_id: capture("source_?id"),
    source_url: capture("source_?url"),
    headline: capture("headline") ?? capture("title"),
    thumbnail_url: capture("thumbnail_?url"),
  };
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
  const adId = optionalString(
    field(referral, "source_id") ?? field(referral, "sourceId"),
    255,
  );
  const ctwaClid = optionalString(
    field(referral, "ctwa_clid") ?? field(referral, "ctwaClid"),
    2_048,
  );
  const sourceUrl = optionalString(
    field(referral, "source_url") ?? field(referral, "sourceUrl"),
    4_096,
  );
  const description = optionalText(
    field(referral, "body") ?? field(referral, "description"),
    4_096,
  );
  const title = optionalString(
    field(referral, "headline") ?? field(referral, "title"),
    512,
  );
  const thumbnailUrl = optionalString(
    field(referral, "thumbnail_url") ?? field(referral, "thumbnailUrl"),
    4_096,
  );
  const mediaUrl = optionalString(
    field(referral, "media_url") ??
      field(referral, "mediaUrl") ??
      field(referral, "image_url") ??
      field(referral, "imageUrl"),
    4_096,
  );
  const sourceType = optionalString(
    field(referral, "source_type") ?? field(referral, "sourceType"),
    120,
  );
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

function identifierOr(value: unknown, fallback: string): string {
  return boundedString(value, 255) ?? fallback;
}

function stableFallbackId(parts: readonly unknown[]): string {
  return `datacrazy:${createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex")}`;
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
  providerEventType?: string | null;
  externalDeliveryId?: string | null;
}): InboundWebhookParserResult {
  const providerEventType = input.providerEventType ?? null;
  const externalDeliveryId = input.externalDeliveryId ?? null;
  return {
    provider: DATACRAZY_V1_PROVIDER,
    parserVersion: DATACRAZY_V1_PARSER_VERSION,
    providerEventType,
    externalDeliveryId,
    classification: input.classification,
    classificationReason: input.classificationReason,
    events: [],
    normalizedSummary: summary({
      ...input,
      providerEventType,
      externalDeliveryId,
      eventCount: 0,
    }),
    error:
      input.classification === "invalid_payload"
        ? { ...invalidPayloadError }
        : null,
  };
}

function parsePayload(payload: unknown): InboundWebhookParserResult {
  const rawPayload = typeof payload === "string" ? payload : null;
  const envelope =
    asRecord(payload) ?? (rawPayload ? parseResilientObject(rawPayload) : null);
  if (!envelope)
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });

  const directMessage = [
    "received",
    "contact",
    "conversationId",
    "attendant",
  ].some((name) => field(envelope, name) !== undefined);
  let message: Record<string, unknown> | null = directMessage ? envelope : null;
  let topLevelText: unknown = null;
  let rawNestedMessage: string | null = null;
  if (!message) {
    for (const key of Object.keys(envelope)) {
      if (!messageFieldNames.has(key.toLocaleLowerCase("en-US"))) continue;
      const candidate = envelope[key];
      if (typeof candidate === "string") {
        rawNestedMessage = candidate;
        message = parseResilientObject(candidate);
        if (!message) topLevelText = candidate;
      } else {
        message = asRecord(candidate);
      }
      if (message || topLevelText !== null) break;
    }
  }
  if (!message && topLevelText === null) {
    return emptyResult({
      classification: "unsupported_event",
      classificationReason: "message_shape_unsupported",
    });
  }

  const contact = asRecord(field(message, "contact"));
  const instance = asRecord(field(message, "instanceData"));
  const phone = parsePhone(
    field(contact, "phoneNumber") ??
      field(contact, "contactId") ??
      field(envelope, "telefone") ??
      field(envelope, "phone"),
  );
  const contactName = optionalText(
    field(contact, "name") ??
      field(envelope, "nome") ??
      field(envelope, "name"),
    160,
  );
  const text = optionalText(
    field(message, "body") ??
      field(asRecord(field(message, "text")), "body") ??
      topLevelText,
    16_384,
  );
  if (!phone || !contactName.valid || !text.valid) {
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });
  }

  const rawForFallback = rawPayload ?? rawNestedMessage;
  const referral = parseReferral(
    field(message, "referral") ??
      (rawForFallback ? rawCtwaFallback(rawForFallback) : null),
  );
  if (!referral.valid)
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });

  const received = field(message, "received");
  const attendant = asRecord(field(message, "attendant"));
  if (received !== undefined && typeof received !== "boolean") {
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });
  }
  const outbound =
    received === false ||
    (received === undefined &&
      attendant !== null &&
      Object.keys(attendant).length > 0);
  const rawMessageType = field(message, "type");
  const messageType = optionalString(rawMessageType, 120);
  if (
    !messageType.valid ||
    (messageType.value === null &&
      rawMessageType !== undefined &&
      rawMessageType !== null)
  ) {
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });
  }

  const organizationId = boundedString(
    field(instance, "organizationId") ??
      field(message, "organizationId") ??
      field(instance, "accountId"),
    255,
  );
  const providerChannelId = boundedString(
    field(instance, "instanceId") ??
      field(instance, "id") ??
      field(message, "instanceId"),
    255,
  );
  const connectedPhone = parsePhone(
    field(instance, "phoneNumber") ??
      field(instance, "phone") ??
      field(instance, "number"),
  );
  if (!organizationId || !providerChannelId || !connectedPhone) {
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });
  }

  const parsedMessage: ParsedInboundWebhookMessage = {
    direction: outbound ? "outbound" : "inbound",
    authorType: outbound ? "organization_member" : "contact",
    messageType: messageType.value ?? "text",
    text: text.value,
    isPrivate: false,
  };
  const occurredAt =
    parseOccurredAt(
      field(message, "createdAt") ??
        field(message, "timestamp") ??
        field(message, "date") ??
        field(message, "updatedAt"),
    ) ?? new Date(0);
  const channelName = optionalString(
    field(instance, "name") ?? field(instance, "instanceName"),
    160,
  );
  if (!channelName.valid)
    return emptyResult({
      classification: "invalid_payload",
      classificationReason: "payload_validation_failed",
    });
  const externalMessageId = identifierOr(
    field(message, "id") ?? field(message, "messageId"),
    stableFallbackId([
      phone,
      text.value,
      occurredAt.toISOString(),
      referral.ctwaClid,
      referral.adId,
      outbound,
    ]),
  );
  const externalEventId = identifierOr(
    field(message, "eventId") ?? field(message, "id"),
    externalMessageId,
  );
  const hasCtwa = referral.ctwaClid !== null;
  const classification: InboundWebhookEventClassification = outbound
    ? "ignored_outbound"
    : hasCtwa
      ? "eligible_route_unresolved"
      : "ignored_no_ctwa";
  const classificationReason = outbound
    ? "message_not_from_contact"
    : hasCtwa
      ? "route_resolution_pending"
      : "ctwa_missing";
  const normalizedSummary: InboundWebhookEventNormalizedSummary = {
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
    messageDirection: parsedMessage.direction,
    messageAuthorType: parsedMessage.authorType,
    messageType: parsedMessage.messageType,
    classification,
    classificationReason,
  };
  const event = {
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
    channel: { providerChannelId, connectedPhone, name: channelName.value },
    contact: {
      externalContactId: identifierOr(
        field(contact, "id") ?? field(contact, "contactId"),
        phone,
      ),
      phoneNumber: phone,
      name: contactName.value,
    },
    message: parsedMessage,
    adId: referral.adId,
    ad: referral.ad,
    ctwaClid: referral.ctwaClid,
    hasCtwa,
    classification,
    classificationReason,
    normalizedSummary,
  };
  return {
    provider: DATACRAZY_V1_PROVIDER,
    parserVersion: DATACRAZY_V1_PARSER_VERSION,
    providerEventType: "message",
    externalDeliveryId: externalEventId,
    classification,
    classificationReason,
    events: [event],
    normalizedSummary: summary({
      providerEventType: "message",
      externalDeliveryId: externalEventId,
      classification,
      classificationReason,
      eventCount: 1,
    }),
    error: null,
  };
}

export function parseDataCrazyV1Webhook(
  payload: unknown,
): InboundWebhookParserResult {
  try {
    return parsePayload(payload);
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

  parse(payload: unknown): InboundWebhookParserResult {
    return parseDataCrazyV1Webhook(payload);
  }
}
