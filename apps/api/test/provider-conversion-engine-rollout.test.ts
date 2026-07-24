import {
  providerConversionDecisionSchema,
  type ProviderConversionDecisionDto,
} from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import type { ProviderConversionDecisionEngine } from "../src/conversion-rules/provider-conversion-decision.engine";
import type { ProviderConversionDecisionInput } from "../src/conversion-rules/provider-conversion-decision.types";
import { ProviderConversionEngineRolloutService } from "../src/conversion-rules/provider-conversion-engine-rollout.service";
import type { ProviderConversionLegacyDecisionEngine } from "../src/conversion-rules/provider-conversion-legacy-decision.engine";
import type { ProviderConversionShadowComparisonService } from "../src/conversion-rules/provider-conversion-shadow-comparison.service";

function decision(
  engineVersion: string,
  decisionCode: ProviderConversionDecisionDto["decisionCode"] = "eligible",
): ProviderConversionDecisionDto {
  return providerConversionDecisionSchema.parse({
    engineVersion,
    parserVersion: "umbler-v1",
    decisionCode,
    reasonCode:
      decisionCode === "eligible" ? "automation_matched" : "empty_template",
    occurrence: {
      source: "automation",
      provider: "umbler",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      externalDeliveryId: "delivery_1",
      externalEventId: "event_1",
      externalMessageId: null,
      occurrenceKey: "occurrence_1",
      businessDedupePolicy:
        decisionCode === "eligible"
          ? {
              mode: "lifetime",
              scopeKey: "QualifiedLead:workspace_1:lead_1",
            }
          : null,
      eventName: "QualifiedLead",
      occurredAt: "2026-07-23T13:00:00.000Z",
      authorType: null,
      contactIdentityHash: "phone_hash_1",
    },
    rule: {
      providerRuleId: "provider_rule_1",
      conversionRuleId: "conversion_rule_1",
      version: "2026-07-23T12:00:00.000Z",
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
    duplicateOfDecisionId: null,
    duplicateOfConversionEventLogId: null,
  });
}

function createHarness(input?: {
  legacyDecision?: ProviderConversionDecisionDto | null;
  canonicalDecision?: ProviderConversionDecisionDto | null;
  comparisonError?: Error;
}) {
  const legacyDecision =
    input && "legacyDecision" in input
      ? input.legacyDecision
      : decision("legacy-v1");
  const canonicalDecision =
    input && "canonicalDecision" in input
      ? input.canonicalDecision
      : decision("decision-v1");
  const legacy = {
    evaluate: vi.fn(() => legacyDecision),
  };
  const canonical = {
    evaluate: vi.fn(() => canonicalDecision),
  };
  const comparisons = {
    record: input?.comparisonError
      ? vi.fn(async () => {
          throw input.comparisonError;
        })
      : vi.fn(async () => ({
          id: "comparison_1",
          matches: true,
          mismatchCode: null,
          created: true,
        })),
  };
  const service = new ProviderConversionEngineRolloutService(
    canonical as unknown as ProviderConversionDecisionEngine,
    legacy as unknown as ProviderConversionLegacyDecisionEngine,
    comparisons as unknown as ProviderConversionShadowComparisonService,
  );
  const decisionInput = {
    rule: { providerRuleId: "provider_rule_1" },
    occurrence: {
      workspaceId: "workspace_1",
      channelId: "channel_1",
      occurrenceKey: "occurrence_1",
    },
  } as ProviderConversionDecisionInput;

  return { canonical, comparisons, decisionInput, legacy, service };
}

describe("provider conversion engine rollout", () => {
  it("keeps legacy authoritative without evaluating canonical", async () => {
    const harness = createHarness();

    const result = await harness.service.evaluate({
      mode: "legacy",
      decisionInput: harness.decisionInput,
      sourceDeliveryId: "delivery_1",
    });

    expect(result?.engineVersion).toBe("legacy-v1");
    expect(harness.legacy.evaluate).toHaveBeenCalledOnce();
    expect(harness.canonical.evaluate).not.toHaveBeenCalled();
    expect(harness.comparisons.record).not.toHaveBeenCalled();
  });

  it("uses only canonical after an explicit channel promotion", async () => {
    const harness = createHarness();

    const result = await harness.service.evaluate({
      mode: "canonical",
      decisionInput: harness.decisionInput,
      sourceDeliveryId: "delivery_1",
    });

    expect(result?.engineVersion).toBe("decision-v1");
    expect(harness.canonical.evaluate).toHaveBeenCalledOnce();
    expect(harness.legacy.evaluate).not.toHaveBeenCalled();
    expect(harness.comparisons.record).not.toHaveBeenCalled();
  });

  it("compares both engines in shadow but returns only legacy", async () => {
    const canonicalDecision = decision(
      "decision-v1",
      "ignored_empty_template",
    );
    const harness = createHarness({
      legacyDecision: null,
      canonicalDecision,
    });

    const result = await harness.service.evaluate({
      mode: "shadow",
      decisionInput: harness.decisionInput,
      sourceDeliveryId: "delivery_1",
    });

    expect(result).toBeNull();
    expect(harness.legacy.evaluate).toHaveBeenCalledOnce();
    expect(harness.canonical.evaluate).toHaveBeenCalledOnce();
    expect(harness.comparisons.record).toHaveBeenCalledWith(
      expect.objectContaining({
        authoritativeEngine: "legacy",
        legacyDecision: null,
        canonicalDecision,
      }),
    );
  });

  it("does not interrupt legacy processing when comparison persistence fails", async () => {
    const harness = createHarness({
      comparisonError: new Error("comparison database unavailable"),
    });

    const result = await harness.service.evaluate({
      mode: "shadow",
      decisionInput: harness.decisionInput,
      sourceDeliveryId: "delivery_1",
    });

    expect(result?.engineVersion).toBe("legacy-v1");
    expect(harness.comparisons.record).toHaveBeenCalledOnce();
  });

  it("does not persist a comparison when the channel is unresolved", async () => {
    const harness = createHarness();
    harness.decisionInput.occurrence.channelId = null;

    const result = await harness.service.evaluate({
      mode: "shadow",
      decisionInput: harness.decisionInput,
      sourceDeliveryId: "delivery_1",
    });

    expect(result?.engineVersion).toBe("legacy-v1");
    expect(harness.comparisons.record).not.toHaveBeenCalled();
  });
});
