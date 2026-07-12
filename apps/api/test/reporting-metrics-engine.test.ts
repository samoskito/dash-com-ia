import { describe, expect, it } from "vitest";
import {
  ReportingMetricsEngine,
  type ReportingInsightInput,
  type ReportingMetricEvent,
  type ReportingMetricLead,
} from "../src/reporting/reporting-metrics.engine";

const engine = new ReportingMetricsEngine();

const insight: ReportingInsightInput = {
  metaConversationsStarted: 20,
  spendCents: 100000,
};

function lead(input: Partial<ReportingMetricLead>): ReportingMetricLead {
  return {
    adId: null,
    adSetId: null,
    businessSource: null,
    campaignId: null,
    ctwaClid: null,
    customerIdentityKey: "phone_a",
    firstMessageAt: new Date("2026-07-10T10:00:00.000Z"),
    id: "lead_1",
    phoneHash: "phone_a",
    ...input,
  };
}

function event(input: Partial<ReportingMetricEvent>): ReportingMetricEvent {
  return {
    adId: null,
    adSetId: null,
    businessSource: null,
    campaignId: null,
    ctwaClid: null,
    currency: "BRL",
    customerIdentityKey: "phone_a",
    eventName: "Purchase",
    eventOccurredAt: new Date("2026-07-10T11:00:00.000Z"),
    id: "event_1",
    phoneHash: "phone_a",
    purchaseKind: null,
    status: "sent",
    valueCents: 10000,
    ...input,
  };
}

describe("ReportingMetricsEngine", () => {
  it("deduplicates paid leads and LeadSubmitted events as real conversations", () => {
    const metrics = engine.calculate({
      events: [
        event({
          campaignId: "cmp_1",
          eventName: "LeadSubmitted",
          id: "lead_submitted_1",
          valueCents: null,
        }),
      ],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.realConversations).toBe(1);
    expect(metrics.totalReceived).toBe(1);
    expect(metrics.trackingRate).toBe(1);
    expect(metrics.costPerRealConversationCents).toBe(100000);
    expect(metrics.funnelSteps).toEqual([
      {
        key: "real_conversations",
        label: "Conversas reais iniciadas",
        value: 1,
        costCents: 100000,
      },
    ]);
  });

  it("separates paid conversations from organic leads and calculates tracking rate", () => {
    const metrics = engine.calculate({
      events: [],
      insight,
      leads: [
        lead({ campaignId: "cmp_1", id: "lead_paid", phoneHash: "phone_a" }),
        lead({
          businessSource: "organic",
          customerIdentityKey: "phone_b",
          id: "lead_organic",
          phoneHash: "phone_b",
        }),
        lead({
          customerIdentityKey: "phone_c",
          id: "lead_unattributed",
          phoneHash: "phone_c",
        }),
      ],
      scope: {},
    });

    expect(metrics.realConversations).toBe(1);
    expect(metrics.organicLeads).toBe(2);
    expect(metrics.totalReceived).toBe(3);
    expect(metrics.trackingRate).toBe(1 / 3);
  });

  it("treats ctwa_clid as paid attribution before Meta hierarchy is resolved", () => {
    const metrics = engine.calculate({
      events: [
        event({
          businessSource: "paid",
          ctwaClid: "ctwa_1",
          eventName: "LeadSubmitted",
          id: "lead_submitted_1",
          valueCents: null,
        }),
      ],
      insight,
      leads: [lead({ ctwaClid: "ctwa_1" })],
      scope: {},
    });

    expect(metrics.realConversations).toBe(1);
    expect(metrics.organicLeads).toBe(0);
    expect(metrics.totalReceived).toBe(1);
    expect(metrics.trackingRate).toBe(1);
  });

  it("counts failed business events and ignores skipped events", () => {
    const metrics = engine.calculate({
      events: [
        event({
          campaignId: "cmp_1",
          eventName: "QualifiedLead",
          id: "qualified_error",
          status: "error",
          valueCents: null,
        }),
        event({
          campaignId: "cmp_1",
          eventName: "Purchase",
          id: "purchase_error",
          status: "error",
          valueCents: 50000,
        }),
        event({
          campaignId: "cmp_1",
          eventName: "Purchase",
          id: "purchase_skipped",
          status: "skipped",
          valueCents: 90000,
        }),
      ],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.qualifiedLead).toBe(1);
    expect(metrics.purchases).toBe(1);
    expect(metrics.trafficRevenueCents).toBe(50000);
    expect(metrics.funnelSteps.map((step) => step.key)).toEqual([
      "real_conversations",
      "qualified_lead",
      "purchase",
      "first_purchase",
    ]);
  });

  it("splits traffic purchases by explicit and inferred purchase kind", () => {
    const metrics = engine.calculate({
      events: [
        event({
          campaignId: "cmp_1",
          eventOccurredAt: new Date("2026-07-10T11:00:00.000Z"),
          id: "explicit_first",
          purchaseKind: "first_purchase",
          valueCents: 100000,
        }),
        event({
          campaignId: "cmp_1",
          customerIdentityKey: "phone_b",
          eventOccurredAt: new Date("2026-07-11T11:00:00.000Z"),
          id: "inferred_first",
          phoneHash: "phone_b",
          valueCents: 70000,
        }),
        event({
          campaignId: "cmp_1",
          customerIdentityKey: "phone_b",
          eventOccurredAt: new Date("2026-07-12T11:00:00.000Z"),
          id: "inferred_repurchase",
          phoneHash: "phone_b",
          valueCents: 30000,
        }),
        event({
          campaignId: "cmp_1",
          customerIdentityKey: null,
          eventOccurredAt: new Date("2026-07-13T11:00:00.000Z"),
          id: "identity_missing",
          phoneHash: null,
          valueCents: 20000,
        }),
      ],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.purchases).toBe(4);
    expect(metrics.firstPurchases).toBe(3);
    expect(metrics.repurchases).toBe(1);
    expect(metrics.firstPurchaseRevenueCents).toBe(190000);
    expect(metrics.repurchaseRevenueCents).toBe(30000);
    expect(metrics.roasAcquisition).toBe(1.9);
    expect(metrics.roasWithRepurchase).toBe(2.2);
  });

  it("keeps configured empty funnel events visible and keeps organic revenue out of ROAS", () => {
    const metrics = engine.calculate({
      configuredEvents: new Set(["QualifiedLead", "Purchase"]),
      events: [
        event({
          businessSource: "organic",
          campaignId: null,
          customerIdentityKey: "phone_b",
          id: "organic_purchase",
          phoneHash: "phone_b",
          valueCents: 25000,
        }),
      ],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: {},
    });

    expect(metrics.qualifiedLead).toBe(0);
    expect(metrics.purchases).toBe(1);
    expect(metrics.trafficRevenueCents).toBe(0);
    expect(metrics.organicRevenueCents).toBe(25000);
    expect(metrics.totalRevenueCents).toBe(25000);
    expect(metrics.firstPurchaseRevenueCents).toBe(25000);
    expect(metrics.roasAcquisition).toBeNull();
    expect(metrics.roasWithRepurchase).toBeNull();
    expect(metrics.funnelSteps.map((step) => step.key)).toEqual([
      "real_conversations",
      "qualified_lead",
      "purchase",
      "first_purchase",
    ]);
  });

  it("counts organic LeadSubmitted as organic instead of paid real conversations", () => {
    const metrics = engine.calculate({
      events: [
        event({
          businessSource: "organic",
          customerIdentityKey: "phone_b",
          eventName: "LeadSubmitted",
          id: "organic_lead_submitted",
          phoneHash: "phone_b",
          valueCents: null,
        }),
      ],
      insight,
      leads: [],
      scope: {},
    });

    expect(metrics.realConversations).toBe(0);
    expect(metrics.organicLeads).toBe(1);
    expect(metrics.totalReceived).toBe(1);
    expect(metrics.trackingRate).toBe(0);
  });

  it("does not inflate real conversations from downstream attributed events", () => {
    const metrics = engine.calculate({
      events: [
        event({
          campaignId: "cmp_1",
          eventName: "QualifiedLead",
          id: "qualified_without_lead",
          valueCents: null,
        }),
        event({
          campaignId: "cmp_1",
          eventName: "Purchase",
          id: "purchase_without_lead",
          valueCents: 50000,
        }),
      ],
      insight,
      leads: [],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.realConversations).toBe(0);
    expect(metrics.organicLeads).toBe(0);
    expect(metrics.totalReceived).toBe(0);
    expect(metrics.qualifiedLead).toBe(1);
    expect(metrics.purchases).toBe(1);
  });

  it("does not inflate organic leads from organic downstream purchase events", () => {
    const metrics = engine.calculate({
      events: [
        event({
          businessSource: "organic",
          customerIdentityKey: "phone_b",
          id: "organic_purchase_without_lead",
          phoneHash: "phone_b",
          valueCents: 25000,
        }),
      ],
      insight,
      leads: [],
      scope: {},
    });

    expect(metrics.organicLeads).toBe(0);
    expect(metrics.totalReceived).toBe(0);
    expect(metrics.organicRevenueCents).toBe(25000);
    expect(metrics.firstPurchaseRevenueCents).toBe(25000);
  });

  it("includes organic repurchase revenue in the first and repurchase split without changing paid ROAS", () => {
    const metrics = engine.calculate({
      events: [
        event({
          campaignId: "cmp_1",
          customerIdentityKey: "phone_paid",
          eventOccurredAt: new Date("2026-07-10T11:00:00.000Z"),
          id: "paid_first",
          phoneHash: "phone_paid",
          valueCents: 100000,
        }),
        event({
          businessSource: "organic",
          customerIdentityKey: "phone_organic",
          eventOccurredAt: new Date("2026-07-10T12:00:00.000Z"),
          id: "organic_first",
          phoneHash: "phone_organic",
          valueCents: 25000,
        }),
        event({
          businessSource: "organic",
          customerIdentityKey: "phone_organic",
          eventOccurredAt: new Date("2026-07-11T12:00:00.000Z"),
          id: "organic_repurchase",
          phoneHash: "phone_organic",
          valueCents: 15000,
        }),
      ],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: {},
    });

    expect(metrics.trafficRevenueCents).toBe(100000);
    expect(metrics.organicRevenueCents).toBe(40000);
    expect(metrics.firstPurchaseRevenueCents).toBe(125000);
    expect(metrics.repurchaseRevenueCents).toBe(15000);
    expect(metrics.roasAcquisition).toBe(1);
    expect(metrics.roasWithRepurchase).toBe(1);
  });

  it("labels revenue calculated from the configured average purchase value", () => {
    const metrics = engine.calculate({
      events: [
        event({
          campaignId: "cmp_1",
          id: "estimated_purchase",
          valueCents: 400000,
          valueSource: "configured_average",
        }),
      ],
      insight,
      leads: [lead({ campaignId: "cmp_1" })],
      scope: { campaignId: "cmp_1" },
    });

    expect(metrics.totalRevenueCents).toBe(400000);
    expect(metrics.estimatedRevenueCents).toBe(400000);
    expect(metrics.hasEstimatedRevenue).toBe(true);
  });
});
