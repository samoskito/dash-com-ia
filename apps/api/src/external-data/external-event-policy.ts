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
  ctwaClid?: string | null;
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
    eventId: deliveryEventId(input, externalEventId, leadIdentity, localDate, digest),
    localDate,
    policy
  };
}

function deliveryEventId(
  input: ExternalEventIdentityInput,
  externalEventId: string | null,
  leadIdentity: string,
  localDate: string,
  digest: string
): string {
  if (input.eventType === "conversation_started" && externalEventId) {
    return `lead_${externalEventId}`;
  }

  if (input.connectorProvider === "kinbox_mysql") {
    if (input.eventType === "qualified_lead") {
      const ctwaClid = optional(input.ctwaClid);
      if (ctwaClid) {
        return `qualified_${ctwaClid}`;
      }
    }

    if (input.eventType === "purchase") {
      return `purchase_${leadIdentity}_${localDate}`;
    }
  }

  return `ext_${digest.slice(0, 48)}`;
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

export function startOfDateInTimezone(
  dateText: string,
  timezone: string
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);

  if (!match) {
    throw new Error("Invalid local date");
  }

  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    0,
    0,
    0
  );
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const observed = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second")
    );
    const correction = target - observed;

    candidate += correction;

    if (correction === 0) {
      break;
    }
  }

  return new Date(candidate);
}

export function dateRangeInTimezone(
  since: string | undefined,
  until: string | undefined,
  timezone: string
): { gte?: Date; lte?: Date } {
  return {
    ...(since ? { gte: startOfDateInTimezone(since, timezone) } : {}),
    ...(until
      ? {
          lte: new Date(
            startOfDateInTimezone(nextCalendarDate(until), timezone).getTime() -
              1
          )
        }
      : {})
  };
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

function nextCalendarDate(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid local date");
  }

  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
