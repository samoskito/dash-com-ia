import { boundedString } from "../inbound-webhook-delivery-identity";
import {
  buildInboundWebhookEventDedupeKey,
  type InboundWebhookDeliveryNormalizedSummary,
  type InboundWebhookEventClassification,
  type InboundWebhookEventNormalizedSummary,
  type InboundWebhookParser,
  type InboundWebhookParserResult,
  type ParsedInboundWebhookAd,
} from "../inbound-webhook-parser";

export const UMBLER_V1_PROVIDER = "umbler";
export const UMBLER_V1_PARSER_VERSION = "v1";

const invalidPayloadError = {
  code: "umbler_v1_invalid_payload",
  message: "Inbound webhook payload failed validation",
} as const;

type OptionalStringResult = {
  valid: boolean;
  value: string | null;
};

type ParsedAdFields = {
  valid: boolean;
  adId: string | null;
  ctwaClid: string | null;
  ad: ParsedInboundWebhookAd | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  maximumLength: number,
): OptionalStringResult {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }

  if (typeof value !== "string") {
    return { valid: false, value: null };
  }

  if (value.trim().length === 0) {
    return { valid: true, value: null };
  }

  const normalized = boundedString(value, maximumLength);

  return normalized
    ? { valid: true, value: normalized }
    : { valid: false, value: null };
}

function optionalText(
  value: unknown,
  maximumLength: number,
): OptionalStringResult {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }

  if (typeof value !== "string") {
    return { valid: false, value: null };
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return { valid: true, value: null };
  }

  if (
    normalized.length > maximumLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
  ) {
    return { valid: false, value: null };
  }

  return { valid: true, value: normalized };
}

function parsePhone(value: unknown): string | null {
  const phone = boundedString(value, 32);

  if (!phone || !/^\+?[0-9 ()-]+$/u.test(phone)) {
    return null;
  }

  const digits = phone.replace(/\D/gu, "");

  if (digits.length < 8 || digits.length > 20) {
    return null;
  }

  return phone;
}

function parseTimestamp(value: unknown): Date | null {
  const timestamp = boundedString(value, 80);

  if (!timestamp || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(timestamp)) {
    return null;
  }

  const milliseconds = Date.parse(timestamp);

  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

function connectedPhoneSuffix(phone: string): string {
  return phone.replace(/\D/gu, "").slice(-4);
}

function deliverySummary(input: {
  providerEventType: string | null;
  externalDeliveryId: string | null;
  classification: InboundWebhookEventClassification;
  classificationReason: string;
  eventCount: number;
}): InboundWebhookDeliveryNormalizedSummary {
  return {
    provider: UMBLER_V1_PROVIDER,
    parserVersion: UMBLER_V1_PARSER_VERSION,
    providerEventType: input.providerEventType,
    externalDeliveryId: input.externalDeliveryId,
    classification: input.classification,
    classificationReason: input.classificationReason,
    eventCount: input.eventCount,
  };
}

function emptyResult(input: {
  providerEventType: string | null;
  externalDeliveryId: string | null;
  classification: "unsupported_event" | "invalid_payload";
  classificationReason: string;
}): InboundWebhookParserResult {
  return {
    provider: UMBLER_V1_PROVIDER,
    parserVersion: UMBLER_V1_PARSER_VERSION,
    providerEventType: input.providerEventType,
    externalDeliveryId: input.externalDeliveryId,
    classification: input.classification,
    classificationReason: input.classificationReason,
    events: [],
    normalizedSummary: deliverySummary({
      ...input,
      eventCount: 0,
    }),
    error:
      input.classification === "invalid_payload"
        ? { ...invalidPayloadError }
        : null,
  };
}

function invalidResult(
  providerEventType: string | null = null,
  externalDeliveryId: string | null = null,
): InboundWebhookParserResult {
  return emptyResult({
    providerEventType,
    externalDeliveryId,
    classification: "invalid_payload",
    classificationReason: "payload_validation_failed",
  });
}

function unsupportedResult(
  providerEventType: string,
  externalDeliveryId: string,
  classificationReason: string,
): InboundWebhookParserResult {
  return emptyResult({
    providerEventType,
    externalDeliveryId,
    classification: "unsupported_event",
    classificationReason,
  });
}

function optionalAdString(
  ad: Record<string, unknown>,
  field: string,
  maximumLength: number,
): OptionalStringResult {
  return optionalString(ad[field], maximumLength);
}

function parseAd(value: unknown): ParsedAdFields {
  if (value === null || value === undefined) {
    return {
      valid: true,
      adId: null,
      ctwaClid: null,
      ad: null,
    };
  }

  const ad = asRecord(value);

  if (!ad) {
    return {
      valid: false,
      adId: null,
      ctwaClid: null,
      ad: null,
    };
  }

  const adId = optionalAdString(ad, "SourceId", 255);
  const ctwaClid = optionalAdString(ad, "CTWaCLId", 2_048);
  const sourceUrl = optionalAdString(ad, "SourceUrl", 4_096);
  const description = optionalText(ad.Description, 4_096);
  const title = optionalAdString(ad, "Title", 512);
  const thumbnailUrl = optionalAdString(ad, "ThumbnailUrl", 4_096);
  const mediaUrl = optionalAdString(ad, "MediaUrl", 4_096);
  const sourceType = optionalAdString(ad, "SourceType", 120);
  const fields = [
    adId,
    ctwaClid,
    sourceUrl,
    description,
    title,
    thumbnailUrl,
    mediaUrl,
    sourceType,
  ];

  if (fields.some((field) => !field.valid)) {
    return {
      valid: false,
      adId: null,
      ctwaClid: null,
      ad: null,
    };
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

function classificationForMessage(input: {
  isPrivate: boolean;
  source: string;
  sentByOrganizationMember: unknown;
  ctwaClid: string | null;
}): {
  classification: InboundWebhookEventClassification;
  classificationReason: string;
} {
  if (input.isPrivate) {
    return {
      classification: "ignored_private",
      classificationReason: "private_message",
    };
  }

  if (
    input.source !== "Contact" ||
    (input.sentByOrganizationMember !== null &&
      input.sentByOrganizationMember !== undefined)
  ) {
    return {
      classification: "ignored_outbound",
      classificationReason: "message_not_from_contact",
    };
  }

  if (!input.ctwaClid) {
    return {
      classification: "ignored_no_ctwa",
      classificationReason: "ctwa_missing",
    };
  }

  return {
    classification: "eligible_route_unresolved",
    classificationReason: "route_resolution_pending",
  };
}

function parsePayload(payload: unknown): InboundWebhookParserResult {
  const envelope = asRecord(payload);

  if (!envelope) {
    return invalidResult();
  }

  const providerEventType = boundedString(envelope.Type, 120);
  const externalDeliveryId = boundedString(envelope.EventId, 255);

  if (!providerEventType || !externalDeliveryId) {
    return invalidResult(providerEventType, externalDeliveryId);
  }

  if (providerEventType !== "Message") {
    return unsupportedResult(
      providerEventType,
      externalDeliveryId,
      "event_type_unsupported",
    );
  }

  const providerPayload = asRecord(envelope.Payload);
  const payloadType = providerPayload
    ? boundedString(providerPayload.Type, 120)
    : null;

  if (!providerPayload || !payloadType) {
    return invalidResult(providerEventType, externalDeliveryId);
  }

  if (payloadType !== "Chat") {
    return unsupportedResult(
      providerEventType,
      externalDeliveryId,
      "payload_type_unsupported",
    );
  }

  const content = asRecord(providerPayload.Content);
  const organization = content ? asRecord(content.Organization) : null;
  const channel = content ? asRecord(content.Channel) : null;
  const contact = content ? asRecord(content.Contact) : null;
  const lastMessage = content ? asRecord(content.LastMessage) : null;

  if (!content || !organization || !channel || !contact || !lastMessage) {
    return invalidResult(providerEventType, externalDeliveryId);
  }

  const organizationId = boundedString(organization.Id, 255);
  const providerChannelId = boundedString(channel.Id, 255);
  const connectedPhone = parsePhone(channel.PhoneNumber);
  const channelName = optionalString(channel.Name, 160);
  const externalContactId = boundedString(contact.Id, 255);
  const contactPhone = parsePhone(contact.PhoneNumber);
  const externalMessageId = boundedString(lastMessage.Id, 255);
  const source = boundedString(lastMessage.Source, 120);
  const isPrivate =
    typeof lastMessage.IsPrivate === "boolean" ? lastMessage.IsPrivate : null;
  const preferredTimestamp = lastMessage.EventAtUTC;
  const hasPreferredTimestamp =
    preferredTimestamp !== null &&
    preferredTimestamp !== undefined &&
    !(
      typeof preferredTimestamp === "string" &&
      preferredTimestamp.trim().length === 0
    );
  const occurredAt = parseTimestamp(
    hasPreferredTimestamp ? preferredTimestamp : envelope.EventDate,
  );
  const parsedAd = parseAd(lastMessage.Ad);

  if (
    !organizationId ||
    !providerChannelId ||
    !connectedPhone ||
    !channelName.valid ||
    !externalContactId ||
    !contactPhone ||
    !externalMessageId ||
    !source ||
    isPrivate === null ||
    !occurredAt ||
    !parsedAd.valid
  ) {
    return invalidResult(providerEventType, externalDeliveryId);
  }

  const { classification, classificationReason } = classificationForMessage({
    isPrivate,
    source,
    sentByOrganizationMember: lastMessage.SentByOrganizationMember,
    ctwaClid: parsedAd.ctwaClid,
  });
  const hasCtwa = parsedAd.ctwaClid !== null;
  const normalizedSummary: InboundWebhookEventNormalizedSummary = {
    provider: UMBLER_V1_PROVIDER,
    providerEventType,
    externalEventId: externalDeliveryId,
    externalMessageId,
    organizationId,
    providerChannelId,
    connectedPhoneSuffix: connectedPhoneSuffix(connectedPhone),
    occurredAt: occurredAt.toISOString(),
    adId: parsedAd.adId,
    hasCtwa,
    classification,
    classificationReason,
  };
  const event = {
    provider: UMBLER_V1_PROVIDER,
    providerEventType,
    externalEventId: externalDeliveryId,
    externalMessageId,
    dedupeKey: buildInboundWebhookEventDedupeKey({
      provider: UMBLER_V1_PROVIDER,
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
      externalContactId,
      phoneNumber: contactPhone,
    },
    adId: parsedAd.adId,
    ad: parsedAd.ad,
    ctwaClid: parsedAd.ctwaClid,
    hasCtwa,
    classification,
    classificationReason,
    normalizedSummary,
  };

  return {
    provider: UMBLER_V1_PROVIDER,
    parserVersion: UMBLER_V1_PARSER_VERSION,
    providerEventType,
    externalDeliveryId,
    classification,
    classificationReason,
    events: [event],
    normalizedSummary: deliverySummary({
      providerEventType,
      externalDeliveryId,
      classification,
      classificationReason,
      eventCount: 1,
    }),
    error: null,
  };
}

export function parseUmblerV1Webhook(
  payload: unknown,
): InboundWebhookParserResult {
  try {
    return parsePayload(payload);
  } catch {
    return invalidResult();
  }
}

export class UmblerV1Parser implements InboundWebhookParser {
  readonly provider = UMBLER_V1_PROVIDER;
  readonly parserVersion = UMBLER_V1_PARSER_VERSION;

  parse(payload: unknown): InboundWebhookParserResult {
    return parseUmblerV1Webhook(payload);
  }
}
