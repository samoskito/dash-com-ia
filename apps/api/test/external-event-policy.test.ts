import { describe, expect, it } from "vitest";
import { dateTimeRangeInTimezone } from "../src/common/date-time/timezone-range";
import {
  buildExternalEventIdentity,
  dateRangeInTimezone,
  dateInTimezone,
  ExternalEventIdentityError,
  shouldFilterExternalConversationWithoutCtwa,
  shouldFilterExternalLeadWithoutCtwa,
  startOfDateInTimezone,
} from "../src/external-data/external-event-policy";

const base = {
  connectorId: "connector_1",
  connectorProvider: "kinbox_mysql",
  leadIdentity: "phone_hash_1",
  timezone: "America/Sao_Paulo",
};

describe("external event identity policies", () => {
  it("requires CTWA only for the paid-only Kinbox external flow", () => {
    expect(shouldFilterExternalLeadWithoutCtwa("kinbox_mysql", null)).toBe(
      true,
    );
    expect(
      shouldFilterExternalConversationWithoutCtwa(
        "kinbox_mysql",
        "conversation_started",
        "",
      ),
    ).toBe(true);
    expect(
      shouldFilterExternalConversationWithoutCtwa(
        "kinbox_mysql",
        "qualified_lead",
        null,
      ),
    ).toBe(false);
    expect(shouldFilterExternalLeadWithoutCtwa("direct_api", null)).toBe(false);
  });

  it("deduplicates Kinbox purchases by lead and local calendar day", () => {
    const first = buildExternalEventIdentity({
      ...base,
      eventType: "purchase",
      occurredAt: new Date("2026-07-11T02:30:00.000Z"),
    });
    const retry = buildExternalEventIdentity({
      ...base,
      eventType: "purchase",
      occurredAt: new Date("2026-07-11T02:50:00.000Z"),
    });

    expect(first.localDate).toBe("2026-07-10");
    expect(retry.dedupeKey).toBe(first.dedupeKey);
    expect(retry.eventId).toBe(first.eventId);
    expect(first.eventId).toBe("purchase_phone_hash_1_2026-07-10");
    expect(first.policy).toBe("kinbox_daily");
  });

  it("creates a new Kinbox purchase on another local day", () => {
    const first = buildExternalEventIdentity({
      ...base,
      eventType: "purchase",
      occurredAt: new Date("2026-07-11T03:30:00.000Z"),
    });
    const nextDay = buildExternalEventIdentity({
      ...base,
      eventType: "purchase",
      occurredAt: new Date("2026-07-12T03:30:00.000Z"),
    });

    expect(first.localDate).toBe("2026-07-11");
    expect(nextDay.localDate).toBe("2026-07-12");
    expect(nextDay.dedupeKey).not.toBe(first.dedupeKey);
  });

  it("allows another provider to record multiple same-day purchases", () => {
    const providerBase = {
      ...base,
      connectorProvider: "commerce_provider",
      eventType: "purchase" as const,
      occurredAt: new Date("2026-07-11T12:00:00.000Z"),
    };
    const first = buildExternalEventIdentity({
      ...providerBase,
      transactionId: "order_1",
    });
    const second = buildExternalEventIdentity({
      ...providerBase,
      transactionId: "order_2",
    });

    expect(first.localDate).toBe(second.localDate);
    expect(first.policy).toBe("transaction");
    expect(second.dedupeKey).not.toBe(first.dedupeKey);
  });

  it("requires a stable event identity for non-Kinbox providers", () => {
    expect(() =>
      buildExternalEventIdentity({
        ...base,
        connectorProvider: "commerce_provider",
        eventType: "purchase",
        occurredAt: new Date("2026-07-11T12:00:00.000Z"),
      }),
    ).toThrowError(ExternalEventIdentityError);
  });

  it("prioritizes a provider event id for official conversation events", () => {
    const identity = buildExternalEventIdentity({
      ...base,
      connectorProvider: "meta_cloud_api",
      eventType: "conversation_started",
      occurredAt: new Date("2026-07-11T12:00:00.000Z"),
      externalEventId: "wamid.message_1",
    });

    expect(identity.policy).toBe("provider_event");
    expect(identity.dedupeKey).toContain("wamid.message_1");
    expect(identity.eventId).toBe("lead_wamid.message_1");
  });

  it("matches the qualified event id already used by n8n", () => {
    const identity = buildExternalEventIdentity({
      ...base,
      eventType: "qualified_lead",
      occurredAt: new Date("2026-07-11T12:00:00.000Z"),
      ctwaClid: "ctwa_click_1",
    });

    expect(identity.eventId).toBe("qualified_ctwa_click_1");
  });

  it("converts a date-only Kinbox milestone from Sao Paulo to UTC", () => {
    const occurredAt = startOfDateInTimezone("2026-07-11", "America/Sao_Paulo");

    expect(occurredAt.toISOString()).toBe("2026-07-11T03:00:00.000Z");
    expect(dateInTimezone(occurredAt, "America/Sao_Paulo")).toBe("2026-07-11");
  });

  it("builds an inclusive Sao Paulo period without shifting calendar days", () => {
    const range = dateRangeInTimezone(
      "2026-07-12",
      "2026-07-13",
      "America/Sao_Paulo",
    );

    expect(range.gte?.toISOString()).toBe("2026-07-12T03:00:00.000Z");
    expect(range.lte?.toISOString()).toBe("2026-07-14T02:59:59.999Z");
  });

  it("builds an inclusive exact-minute Sao Paulo period", () => {
    const range = dateTimeRangeInTimezone(
      "2026-07-23T10:36",
      "2026-07-23T10:36",
      "America/Sao_Paulo",
    );

    expect(range.gte?.toISOString()).toBe("2026-07-23T13:36:00.000Z");
    expect(range.lte?.toISOString()).toBe("2026-07-23T13:36:59.999Z");
  });
});
