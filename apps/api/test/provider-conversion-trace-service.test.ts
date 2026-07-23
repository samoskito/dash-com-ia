import type { ProviderConversionDecisionDto } from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import { ProviderConversionTraceService } from "../src/conversion-rules/provider-conversion-trace.service";

function decision(version: string): ProviderConversionDecisionDto {
  return {
    decisionCode: "eligible",
    reasonCode: "automation_matched",
    engineVersion: "decision-v1",
    parserVersion: "umbler-automation-v1",
    occurrence: {
      source: "automation",
      provider: "umbler",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      externalDeliveryId: "external_delivery_1",
      externalEventId: "external_event_1",
      externalMessageId: null,
      occurrenceKey: "occurrence_1",
      businessDedupePolicy: {
        mode: "lifetime",
        scopeKey: "QualifiedLead:workspace_1:lead_1",
      },
      eventName: "QualifiedLead",
      occurredAt: "2026-07-23T12:00:00.000Z",
      authorType: null,
      contactIdentityHash: "phone_hash_1",
    },
    rule: {
      providerRuleId: "provider_rule_1",
      conversionRuleId: "conversion_rule_1",
      version,
      triggerType: "provider_automation",
      eventName: "QualifiedLead",
      mode: "production",
      active: true,
      authorScope: null,
      triggerPhrases: [],
      defaultValueCents: null,
      defaultCurrency: null,
      defaultContentName: null,
    },
    catalog: null,
    conversion: {
      matchedTriggerPhrase: null,
      items: [],
      valueCents: null,
      observedPaymentValueCents: null,
      currency: null,
      contentName: null,
    },
    leadResolution: {
      status: "resolved",
      reasonCode: "paid_lead_resolved",
      lead: {
        id: "lead_1",
        phoneHash: "phone_hash_1",
        campaignId: "campaign_1",
        adSetId: "adset_1",
        adId: "ad_1",
        ctwaClid: "ctwa_1",
      },
    },
  };
}

describe("provider conversion trace service", () => {
  it("returns ordered decision versions with separate technical state", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "decision_1",
        decisionVersion: 1,
        evaluationKey: "initial",
        decisionFingerprint: "fingerprint_1",
        supersedesDecisionId: null,
        decisionJson: decision("rule-v1"),
        createdAt: new Date("2026-07-23T12:01:00.000Z"),
        sourceDelivery: {
          id: "delivery_1",
          status: "processed",
          classification: "ctwa_routed",
          firstReceivedAt: new Date("2026-07-23T12:00:00.000Z"),
          lastReceivedAt: new Date("2026-07-23T12:00:00.000Z"),
        },
        providerExecution: null,
        purchaseReview: null,
      },
      {
        id: "decision_2",
        decisionVersion: 2,
        evaluationKey: "reevaluation:fingerprint",
        decisionFingerprint: "fingerprint_2",
        supersedesDecisionId: "decision_1",
        decisionJson: decision("rule-v2"),
        createdAt: new Date("2026-07-23T12:05:00.000Z"),
        sourceDelivery: {
          id: "delivery_1",
          status: "processed",
          classification: "ctwa_routed",
          firstReceivedAt: new Date("2026-07-23T12:00:00.000Z"),
          lastReceivedAt: new Date("2026-07-23T12:00:00.000Z"),
        },
        providerExecution: {
          id: "execution_1",
          status: "materialized",
          reasonCode: null,
          conversionEventLogId: "event_1",
          attemptCount: 1,
          lastAttemptedAt: new Date("2026-07-23T12:06:00.000Z"),
          processedAt: new Date("2026-07-23T12:06:00.000Z"),
        },
        purchaseReview: null,
      },
    ]);
    const service = new ProviderConversionTraceService({
      providerConversionDecisionAudit: { findMany },
    } as never);

    const trace = await service.getOccurrenceTrace({
      workspaceId: "workspace_1",
      providerRuleId: "provider_rule_1",
      occurrenceKey: "occurrence_1",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace_1",
          providerRuleId: "provider_rule_1",
          occurrenceKey: "occurrence_1",
        },
        orderBy: {
          decisionVersion: "asc",
        },
      }),
    );
    expect(trace.latestDecisionId).toBe("decision_2");
    expect(trace.versions).toHaveLength(2);
    expect(trace.versions[0]).toMatchObject({
      decisionId: "decision_1",
      technicalExecution: null,
      purchaseReview: null,
    });
    expect(trace.versions[1]).toMatchObject({
      decisionId: "decision_2",
      supersedesDecisionId: "decision_1",
      technicalExecution: {
        id: "execution_1",
        status: "materialized",
        conversionEventLogId: "event_1",
      },
    });
  });

  it("returns an empty trace when the occurrence has no frozen decision", async () => {
    const service = new ProviderConversionTraceService({
      providerConversionDecisionAudit: {
        findMany: vi.fn(async () => []),
      },
    } as never);

    await expect(
      service.getOccurrenceTrace({
        workspaceId: "workspace_1",
        providerRuleId: "provider_rule_1",
        occurrenceKey: "missing",
      }),
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      providerRuleId: "provider_rule_1",
      occurrenceKey: "missing",
      latestDecisionId: null,
      versions: [],
    });
  });
});
