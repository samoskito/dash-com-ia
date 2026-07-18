import { createHash } from "node:crypto";

export type InboundWebhookEventClassification =
  | "eligible_route_resolved"
  | "eligible_route_unresolved"
  | "ignored_no_ctwa"
  | "ignored_outbound"
  | "ignored_private"
  | "unsupported_event"
  | "invalid_payload";

export type InboundWebhookParserError = {
  code: string;
  message: string;
};

export type InboundWebhookDeliveryNormalizedSummary = {
  provider: string;
  parserVersion: string;
  providerEventType: string | null;
  externalDeliveryId: string | null;
  classification: InboundWebhookEventClassification;
  classificationReason: string;
  eventCount: number;
};

export type InboundWebhookEventNormalizedSummary = {
  provider: string;
  providerEventType: string;
  externalEventId: string;
  externalMessageId: string;
  organizationId: string;
  providerChannelId: string;
  connectedPhoneSuffix: string;
  occurredAt: string;
  adId: string | null;
  hasCtwa: boolean;
  classification: InboundWebhookEventClassification;
  classificationReason: string;
};

export type ParsedInboundWebhookChannel = {
  providerChannelId: string;
  connectedPhone: string;
  name: string | null;
};

export type ParsedInboundWebhookContact = {
  externalContactId: string;
  phoneNumber: string;
  name: string | null;
};

export type ParsedInboundWebhookAd = {
  sourceUrl: string | null;
  description: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  sourceType: string | null;
};

export type ParsedInboundWebhookEvent = {
  provider: string;
  providerEventType: string;
  externalEventId: string;
  externalMessageId: string;
  dedupeKey: string;
  organizationId: string;
  occurredAt: Date;
  channel: ParsedInboundWebhookChannel;
  contact: ParsedInboundWebhookContact;
  adId: string | null;
  ad: ParsedInboundWebhookAd | null;
  ctwaClid: string | null;
  hasCtwa: boolean;
  classification: InboundWebhookEventClassification;
  classificationReason: string;
  normalizedSummary: InboundWebhookEventNormalizedSummary;
};

export type InboundWebhookParserResult = {
  provider: string;
  parserVersion: string;
  externalDeliveryId: string | null;
  providerEventType: string | null;
  classification: InboundWebhookEventClassification;
  classificationReason: string;
  events: ParsedInboundWebhookEvent[];
  normalizedSummary: InboundWebhookDeliveryNormalizedSummary;
  error: InboundWebhookParserError | null;
};

export interface InboundWebhookParser {
  readonly provider: string;
  readonly parserVersion: string;
  parse(payload: unknown): InboundWebhookParserResult;
}

export type InboundWebhookEventDedupeIdentity = {
  provider: string;
  organizationId: string;
  providerChannelId: string;
  externalMessageId: string;
};

export function buildInboundWebhookEventDedupeKey(
  identity: InboundWebhookEventDedupeIdentity,
): string {
  const canonicalIdentity = JSON.stringify([
    identity.provider,
    identity.organizationId,
    identity.providerChannelId,
    identity.externalMessageId,
  ]);
  const digest = createHash("sha256")
    .update(canonicalIdentity, "utf8")
    .digest("hex");

  return `sha256:${digest}`;
}
