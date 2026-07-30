import { boundedString } from "../inbound-webhook-delivery-identity";
import {
  buildInboundWebhookEventDedupeKey,
  type InboundWebhookDeliveryNormalizedSummary,
  type InboundWebhookEventClassification,
  type InboundWebhookEventNormalizedSummary,
  type InboundWebhookParser,
  type InboundWebhookParserResult,
  type ParsedInboundWebhookAd,
  type ParsedInboundWebhookEvent,
} from "../inbound-webhook-parser";

export const GUPSHUP_V1_PROVIDER = "gupshup";
export const GUPSHUP_V1_PARSER_VERSION = "v1";

const observationReason = "gupshup_observation_only";
const invalidPayloadError = {
  code: "gupshup_v1_invalid_payload",
  message: "Inbound webhook payload failed validation",
} as const;

type OptionalStringResult = {
  valid: boolean;
  value: string | null;
};

type ParsedReferral = {
  valid: boolean;
  adId: string | null;
  ctwaClid: string | null;
  ad: ParsedInboundWebhookAd | null;
};

type ParsedCloudEnvelope = {
  providerEventType: string | null;
  externalDeliveryId: string | null;
  events: ParsedInboundWebhookEvent[];
  sawMessagesField: boolean;
  invalid: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
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

function parseUnixTimestamp(value: unknown): Date | null {
  const raw =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : boundedString(value, 16);

  if (!raw || !/^\d{9,12}$/u.test(raw)) {
    return null;
  }

  const seconds = Number(raw);

  if (
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    seconds > 253_402_300_799
  ) {
    return null;
  }

  const occurredAt = new Date(seconds * 1_000);

  return Number.isFinite(occurredAt.getTime()) ? occurredAt : null;
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
    provider: GUPSHUP_V1_PROVIDER,
    parserVersion: GUPSHUP_V1_PARSER_VERSION,
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
    provider: GUPSHUP_V1_PROVIDER,
    parserVersion: GUPSHUP_V1_PARSER_VERSION,
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

function unsupportedResult(input: {
  providerEventType: string | null;
  externalDeliveryId: string | null;
  classificationReason: string;
}): InboundWebhookParserResult {
  return emptyResult({
    ...input,
    classification: "unsupported_event",
  });
}

function parseReferral(value: unknown): ParsedReferral {
  if (value === null || value === undefined) {
    return {
      valid: true,
      adId: null,
      ctwaClid: null,
      ad: null,
    };
  }

  const referral = asRecord(value);

  if (!referral) {
    return {
      valid: false,
      adId: null,
      ctwaClid: null,
      ad: null,
    };
  }

  const adId = optionalString(referral.source_id, 255);
  const ctwaClid = optionalString(referral.ctwa_clid, 2_048);
  const sourceUrl = optionalString(referral.source_url, 4_096);
  const description = optionalText(referral.body, 4_096);
  const title = optionalString(referral.headline, 512);
  const thumbnailUrl = optionalString(referral.thumbnail_url, 4_096);
  const imageUrl = optionalString(referral.image_url, 4_096);
  const videoUrl = optionalString(referral.video_url, 4_096);
  const sourceType = optionalString(referral.source_type, 120);
  const fields = [
    adId,
    ctwaClid,
    sourceUrl,
    description,
    title,
    thumbnailUrl,
    imageUrl,
    videoUrl,
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
      mediaUrl: imageUrl.value ?? videoUrl.value,
      sourceType: sourceType.value,
    },
  };
}

function contactName(
  contacts: readonly unknown[],
  messagePhone: string,
): OptionalStringResult {
  for (const value of contacts) {
    const contact = asRecord(value);
    const waId = contact ? parsePhone(contact.wa_id) : null;

    if (!contact || !waId) {
      continue;
    }

    if (
      waId.replace(/\D/gu, "") !== messagePhone.replace(/\D/gu, "")
    ) {
      continue;
    }

    const profile = asRecord(contact.profile);

    return optionalText(profile?.name, 160);
  }

  return { valid: true, value: null };
}

function parseMessage(input: {
  organizationId: string;
  providerChannelId: string;
  connectedPhone: string;
  contacts: readonly unknown[];
  messageValue: unknown;
}): ParsedInboundWebhookEvent | null {
  const message = asRecord(input.messageValue);

  if (!message) {
    return null;
  }

  const externalMessageId = boundedString(message.id, 255);
  const contactPhone = parsePhone(message.from);
  const occurredAt = parseUnixTimestamp(message.timestamp);
  const messageType = optionalString(message.type, 120);
  const textPayload =
    message.text === null || message.text === undefined
      ? null
      : asRecord(message.text);
  const messageText =
    textPayload === null
      ? { valid: true, value: null }
      : optionalText(textPayload.body, 16_384);
  const name = contactPhone
    ? contactName(input.contacts, contactPhone)
    : { valid: false, value: null };
  const referral = parseReferral(message.referral);

  if (
    !externalMessageId ||
    !contactPhone ||
    !occurredAt ||
    !messageType.valid ||
    !messageText.valid ||
    !name.valid ||
    !referral.valid
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
  const normalizedSummary: InboundWebhookEventNormalizedSummary = {
    provider: GUPSHUP_V1_PROVIDER,
    providerEventType: "messages",
    externalEventId: externalMessageId,
    externalMessageId,
    organizationId: input.organizationId,
    providerChannelId: input.providerChannelId,
    connectedPhoneSuffix: connectedPhoneSuffix(input.connectedPhone),
    occurredAt: occurredAt.toISOString(),
    adId: referral.adId,
    hasCtwa,
    messageDirection: "inbound",
    messageAuthorType: "contact",
    messageType: messageType.value,
    classification,
    classificationReason,
  };

  return {
    provider: GUPSHUP_V1_PROVIDER,
    providerEventType: "messages",
    externalEventId: externalMessageId,
    externalMessageId,
    dedupeKey: buildInboundWebhookEventDedupeKey({
      provider: GUPSHUP_V1_PROVIDER,
      organizationId: input.organizationId,
      providerChannelId: input.providerChannelId,
      externalMessageId,
    }),
    organizationId: input.organizationId,
    occurredAt,
    channel: {
      providerChannelId: input.providerChannelId,
      connectedPhone: input.connectedPhone,
      name: null,
    },
    contact: {
      externalContactId: contactPhone,
      phoneNumber: contactPhone,
      name: name.value,
    },
    message: {
      direction: "inbound",
      authorType: "contact",
      messageType: messageType.value,
      text: messageText.value,
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

function parseCloudEnvelope(
  envelope: Record<string, unknown>,
): ParsedCloudEnvelope {
  const entries = asArray(envelope.entry);
  const gsAppId = boundedString(envelope.gs_app_id, 255);
  const events: ParsedInboundWebhookEvent[] = [];
  let sawMessagesField = false;
  let invalid = false;

  if (!entries || entries.length === 0) {
    return {
      providerEventType: null,
      externalDeliveryId: null,
      events,
      sawMessagesField,
      invalid: true,
    };
  }

  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const entryId = entry ? boundedString(entry.id, 255) : null;
    const organizationId = gsAppId ?? entryId;
    const changes = entry ? asArray(entry.changes) : null;

    if (!entry || !organizationId || !changes) {
      invalid = true;
      continue;
    }

    for (const changeValue of changes) {
      const change = asRecord(changeValue);
      const field = change ? boundedString(change.field, 120) : null;

      if (!change || !field) {
        invalid = true;
        continue;
      }

      if (field !== "messages") {
        continue;
      }

      sawMessagesField = true;
      const value = asRecord(change.value);
      const metadata = value ? asRecord(value.metadata) : null;
      const providerChannelId = metadata
        ? boundedString(metadata.phone_number_id, 255)
        : null;
      const connectedPhone = metadata
        ? parsePhone(metadata.display_phone_number)
        : null;
      const contacts = value ? asArray(value.contacts) ?? [] : [];
      const messages = value ? asArray(value.messages) : null;

      if (!value || !providerChannelId || !connectedPhone) {
        invalid = true;
        continue;
      }

      if (!messages) {
        continue;
      }

      for (const messageValue of messages) {
        const event = parseMessage({
          organizationId,
          providerChannelId,
          connectedPhone,
          contacts,
          messageValue,
        });

        if (!event) {
          invalid = true;
          continue;
        }

        events.push(event);
      }
    }
  }

  return {
    providerEventType: sawMessagesField ? "messages" : null,
    externalDeliveryId: events[0]?.externalMessageId ?? null,
    events,
    sawMessagesField,
    invalid,
  };
}

function parsePayload(payload: unknown): InboundWebhookParserResult {
  const envelope = asRecord(payload);

  if (!envelope) {
    return unsupportedResult({
      providerEventType: null,
      externalDeliveryId: null,
      classificationReason: observationReason,
    });
  }

  const objectType = boundedString(envelope.object, 120);

  if (objectType !== "whatsapp_business_account") {
    const documentedPayload = asRecord(envelope.payload);

    return unsupportedResult({
      providerEventType: boundedString(envelope.type, 120),
      externalDeliveryId: documentedPayload
        ? boundedString(documentedPayload.id, 255)
        : null,
      classificationReason: observationReason,
    });
  }

  const parsed = parseCloudEnvelope(envelope);

  if (parsed.invalid) {
    return invalidResult(
      parsed.providerEventType,
      parsed.externalDeliveryId,
    );
  }

  if (!parsed.sawMessagesField || parsed.events.length === 0) {
    return unsupportedResult({
      providerEventType: parsed.providerEventType,
      externalDeliveryId: parsed.externalDeliveryId,
      classificationReason: "message_event_not_found",
    });
  }

  const hasEligibleEvent = parsed.events.some(
    (event) => event.classification === "eligible_route_unresolved",
  );
  const classification: InboundWebhookEventClassification = hasEligibleEvent
    ? "eligible_route_unresolved"
    : "ignored_no_ctwa";
  const classificationReason = hasEligibleEvent
    ? "route_resolution_pending"
    : "ctwa_missing";

  return {
    provider: GUPSHUP_V1_PROVIDER,
    parserVersion: GUPSHUP_V1_PARSER_VERSION,
    providerEventType: parsed.providerEventType,
    externalDeliveryId: parsed.externalDeliveryId,
    classification,
    classificationReason,
    events: parsed.events,
    normalizedSummary: deliverySummary({
      providerEventType: parsed.providerEventType,
      externalDeliveryId: parsed.externalDeliveryId,
      classification,
      classificationReason,
      eventCount: parsed.events.length,
    }),
    error: null,
  };
}

export function parseGupshupV1Webhook(
  payload: unknown,
): InboundWebhookParserResult {
  try {
    return parsePayload(payload);
  } catch {
    return invalidResult();
  }
}

export function observeGupshupV1Webhook(
  payload: unknown,
): InboundWebhookParserResult {
  return parseGupshupV1Webhook(payload);
}

export class GupshupV1Parser implements InboundWebhookParser {
  readonly provider = GUPSHUP_V1_PROVIDER;
  readonly parserVersion = GUPSHUP_V1_PARSER_VERSION;

  parse(payload: unknown): InboundWebhookParserResult {
    return parseGupshupV1Webhook(payload);
  }
}
