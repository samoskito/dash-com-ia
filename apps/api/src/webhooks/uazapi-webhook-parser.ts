import { createHash } from "node:crypto";

export type UazapiWebhookBody = Record<string, unknown>;

export type ParsedUazapiWebhook = {
  eventType: string;
  externalEventId?: string;
  leadId?: string;
  phone?: string;
  phoneHash?: string;
  contactName?: string;
  messageText?: string;
  labels: string[];
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  ctwaClid?: string;
  ctwaSourceUrl?: string;
  providerInstanceId?: string;
};

export function parseUazapiWebhook(
  body: UazapiWebhookBody
): ParsedUazapiWebhook {
  const message = recordValue(body.message);
  const context = recordValue(body.context);
  const bodyReferral = recordValue(body.referral);
  const messageReferral = recordValue(message?.referral);
  const contextReferral = recordValue(context?.referral);
  const referral = bodyReferral ?? messageReferral ?? contextReferral;
  const referralCandidates = [bodyReferral, messageReferral, contextReferral];
  const adsContext =
    recordValue(body.ads_context_data) ??
    recordValue(body.adsContextData) ??
    recordValue(referral?.ads_context_data) ??
    recordValue(referral?.adsContextData);
  const phone = getPhone(body);

  return {
    eventType: firstString(body.event) ?? firstString(body.type) ?? "uazapi.webhook",
    externalEventId:
      firstString(body.id) ??
      firstString(body.eventId) ??
      firstString(body.externalEventId),
    leadId: firstString(body.leadId),
    phone,
    phoneHash: firstString(body.phoneHash) ?? hashPhone(phone),
    contactName: getContactName(body),
    messageText: getMessageText(body),
    labels: getLabels(body),
    campaignId:
      firstString(body.campaignId) ??
      firstString(body.campaign_id) ??
      firstString(body.utm_campaign) ??
      firstString(referral?.campaignId) ??
      firstString(referral?.campaign_id) ??
      firstString(adsContext?.campaignId) ??
      firstString(adsContext?.campaign_id),
    adSetId:
      firstString(body.adSetId) ??
      firstString(body.adsetId) ??
      firstString(body.ad_set_id) ??
      firstString(body.adset_id) ??
      firstString(body.utm_adset) ??
      firstString(referral?.adSetId) ??
      firstString(referral?.adsetId) ??
      firstString(referral?.ad_set_id) ??
      firstString(referral?.adset_id) ??
      firstString(adsContext?.adSetId) ??
      firstString(adsContext?.adsetId) ??
      firstString(adsContext?.ad_set_id) ??
      firstString(adsContext?.adset_id),
    adId:
      firstString(body.adId) ??
      firstString(body.ad_id) ??
      firstString(body.sourceId) ??
      firstString(body.source_id) ??
      firstString(referral?.adId) ??
      firstString(referral?.ad_id) ??
      firstString(referral?.sourceId) ??
      firstString(referral?.source_id) ??
      firstString(adsContext?.adId) ??
      firstString(adsContext?.ad_id),
    ctwaClid:
      firstString(body.ctwa_clid) ??
      firstString(body.ctwaClid) ??
      firstStringFromRecords(referralCandidates, ["ctwa_clid", "ctwaClid"]),
    ctwaSourceUrl:
      firstString(body.ctwaSourceUrl) ??
      firstString(body.source_url) ??
      firstStringFromRecords(referralCandidates, ["source_url", "sourceUrl"]),
    providerInstanceId: getProviderInstanceId(body)
  };
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstStringFromRecords(
  records: Array<Record<string, unknown> | undefined>,
  keys: string[]
): string | undefined {
  for (const record of records) {
    if (!record) {
      continue;
    }

    for (const key of keys) {
      const value = firstString(record[key]);

      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function getMessageText(body: UazapiWebhookBody): string | undefined {
  const message = body.message;

  if (typeof message === "string") {
    return firstString(message);
  }

  if (message && typeof message === "object" && !Array.isArray(message)) {
    const messageObject = message as Record<string, unknown>;
    return (
      firstString(messageObject.text) ??
      firstString(messageObject.body) ??
      firstString(messageObject.message) ??
      firstString(messageObject.conversation)
    );
  }

  return (
    firstString(body.text) ??
    firstString(body.body) ??
    firstString(body.messageText)
  );
}

function getLabels(body: UazapiWebhookBody): string[] {
  const rawLabels =
    body.labels ??
    (body.chat && typeof body.chat === "object" && !Array.isArray(body.chat)
      ? (body.chat as Record<string, unknown>).labels
      : undefined) ??
    body.label;

  if (!rawLabels) {
    return [];
  }

  const list = Array.isArray(rawLabels) ? rawLabels : [rawLabels];

  return list
    .map((label) => labelToString(label))
    .filter((label): label is string => Boolean(label));
}

function getPhone(body: UazapiWebhookBody): string | undefined {
  const contact = body.contact;
  const chat = body.chat;

  return (
    firstString(body.phone) ??
    firstString(body.from) ??
    firstString(body.sender) ??
    (contact && typeof contact === "object" && !Array.isArray(contact)
      ? firstString((contact as Record<string, unknown>).phone)
      : undefined) ??
    (chat && typeof chat === "object" && !Array.isArray(chat)
      ? firstString((chat as Record<string, unknown>).phone)
      : undefined)
  );
}

function getContactName(body: UazapiWebhookBody): string | undefined {
  const contact = body.contact;

  return (
    firstString(body.name) ??
    firstString(body.contactName) ??
    firstString(body.pushName) ??
    (contact && typeof contact === "object" && !Array.isArray(contact)
      ? firstString((contact as Record<string, unknown>).name)
      : undefined)
  );
}

function getProviderInstanceId(body: UazapiWebhookBody): string | undefined {
  const instance = body.instance;
  const whatsappInstance = body.whatsappInstance;

  return (
    firstString(body.providerInstanceId) ??
    firstString(body.instanceId) ??
    firstString(body.instance_id) ??
    (instance && typeof instance === "object" && !Array.isArray(instance)
      ? firstString((instance as Record<string, unknown>).id) ??
        firstString((instance as Record<string, unknown>).instanceId) ??
        firstString((instance as Record<string, unknown>).instance_id)
      : undefined) ??
    (whatsappInstance &&
    typeof whatsappInstance === "object" &&
    !Array.isArray(whatsappInstance)
      ? firstString(
          (whatsappInstance as Record<string, unknown>).providerInstanceId
        ) ?? firstString((whatsappInstance as Record<string, unknown>).id)
      : undefined)
  );
}

function labelToString(label: unknown): string | undefined {
  if (typeof label === "string") {
    return firstString(label);
  }

  if (label && typeof label === "object" && !Array.isArray(label)) {
    const labelObject = label as Record<string, unknown>;
    return (
      firstString(labelObject.name) ??
      firstString(labelObject.title) ??
      firstString(labelObject.label)
    );
  }

  return undefined;
}

function normalizePhone(phone?: string): string | undefined {
  const digits = phone?.replace(/\D/g, "");

  return digits || undefined;
}

function hashPhone(phone?: string): string | undefined {
  const normalized = normalizePhone(phone);

  return normalized
    ? createHash("sha256").update(normalized).digest("hex")
    : undefined;
}
