import { createHash } from "node:crypto";
import type { CanonicalTrackingEventTypeDto } from "@wpptrack/shared";

export type ExternalEventIdentityInput = {
  connectorId: string;
  connectorProvider: string;
  eventType: CanonicalTrackingEventTypeDto;
  leadIdentity: string;
  occurredAt: Date;
  timezone: string;
  externalEventId?: string | null;
  transactionId?: string | null;
};

export type ExternalEventIdentity = {
  dedupeKey: string;
  eventId: string;
  localDate: string;
  policy: "provider_event" | "transaction" | "kinbox_lead" | "kinbox_daily";
};

export class ExternalEventIdentityError extends Error {
  constructor(readonly code: "MissingProviderEventIdentity") {
    super(code);
  }
}

export function buildExternalEventIdentity(
  input: ExternalEventIdentityInput
): ExternalEventIdentity {
  const localDate = dateInTimezone(input.occurredAt, input.timezone);
  const base = [
    "external",
    required(input.connectorId, "connectorId"),
    required(input.connectorProvider, "connectorProvider"),
    input.eventType
  ];
  const externalEventId = optional(input.externalEventId);
  const transactionId = optional(input.transactionId);
  const leadIdentity = required(input.leadIdentity, "leadIdentity");
  let parts: string[];
  let policy: ExternalEventIdentity["policy"];

  if (externalEventId) {
    parts = [...base, "event", externalEventId];
    policy = "provider_event";
  } else if (input.eventType === "purchase" && transactionId) {
    parts = [...base, "transaction", transactionId];
    policy = "transaction";
  } else if (
    input.connectorProvider === "kinbox_mysql" &&
    input.eventType === "purchase"
  ) {
    parts = [...base, "lead-day", leadIdentity, localDate];
    policy = "kinbox_daily";
  } else if (
    input.connectorProvider === "kinbox_mysql" &&
    input.eventType === "qualified_lead"
  ) {
    parts = [...base, "lead", leadIdentity];
    policy = "kinbox_lead";
  } else {
    throw new ExternalEventIdentityError("MissingProviderEventIdentity");
  }

  const dedupeKey = parts.map(encodePart).join(":");
  const digest = createHash("sha256").update(dedupeKey).digest("hex");

  return {
    dedupeKey,
    eventId: `ext_${digest.slice(0, 48)}`,
    localDate,
    policy
  };
}

export function dateInTimezone(date: Date, timezone: string): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid occurredAt");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not resolve local date");
  }

  return `${year}-${month}-${day}`;
}

function required(value: string, field: string): string {
  const parsed = optional(value);

  if (!parsed) {
    throw new Error(`Missing ${field}`);
  }

  return parsed;
}

function optional(value?: string | null): string | null {
  const parsed = value?.trim();
  return parsed || null;
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}
