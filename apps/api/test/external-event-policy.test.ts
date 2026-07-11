import { describe, expect, it } from "vitest";
import {
  buildExternalEventIdentity,
  ExternalEventIdentityError
} from "../src/external-data/external-event-policy";

const base = {
  connectorId: "connector_1",
  connectorProvider: "kinbox_mysql",
  leadIdentity: "phone_hash_1",
  timezone: "America/Sao_Paulo"
};

describe("external event identity policies", () => {
  it("deduplicates Kinbox purchases by lead and local calendar day", () => {
    const first = buildExternalEventIdentity({
      ...base,
      eventType: "purchase",
      occurredAt: new Date("2026-07-11T02:30:00.000Z")
    });
    const retry = buildExternalEventIdentity({
      ...base,
      eventType: "purchase",
      occurredAt: new Date("2026-07-11T02:50:00.000Z")
    });

    expect(first.localDate).toBe("2026-07-10");
    expect(retry.dedupeKey).toBe(first.dedupeKey);
    expect(retry.eventId).toBe(first.eventId);
    expect(first.policy).toBe("kinbox_daily");
  });

  it("creates a new Kinbox purchase on another local day", () => {
    const first = buildExternalEventIdentity({
      ...base,
      eventType: "purchase",
      occurredAt: new Date("2026-07-11T03:30:00.000Z")
    });
    const nextDay = buildExternalEventIdentity({
      ...base,
      eventType: "purchase",
      occurredAt: new Date("2026-07-12T03:30:00.000Z")
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
      occurredAt: new Date("2026-07-11T12:00:00.000Z")
    };
    const first = buildExternalEventIdentity({
      ...providerBase,
      transactionId: "order_1"
    });
    const second = buildExternalEventIdentity({
      ...providerBase,
      transactionId: "order_2"
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
        occurredAt: new Date("2026-07-11T12:00:00.000Z")
      })
    ).toThrowError(ExternalEventIdentityError);
  });

  it("prioritizes a provider event id for official conversation events", () => {
    const identity = buildExternalEventIdentity({
      ...base,
      connectorProvider: "meta_cloud_api",
      eventType: "conversation_started",
      occurredAt: new Date("2026-07-11T12:00:00.000Z"),
      externalEventId: "wamid.message_1"
    });

    expect(identity.policy).toBe("provider_event");
    expect(identity.dedupeKey).toContain("wamid.message_1");
  });
});
