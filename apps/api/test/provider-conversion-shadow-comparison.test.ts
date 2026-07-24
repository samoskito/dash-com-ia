import {
  providerConversionDecisionSchema,
  type ProviderConversionDecisionDto,
} from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import { ProviderConversionShadowComparisonService } from "../src/conversion-rules/provider-conversion-shadow-comparison.service";

function decision(input?: {
  decisionCode?: ProviderConversionDecisionDto["decisionCode"];
  reasonCode?: string;
  valueCents?: number | null;
}): ProviderConversionDecisionDto {
  const decisionCode = input?.decisionCode ?? "eligible";

  return providerConversionDecisionSchema.parse({
    engineVersion: "decision-v1",
    parserVersion: "umbler-v1",
    decisionCode,
    reasonCode: input?.reasonCode ?? "catalog_matched",
    occurrence: {
      source: "message",
      provider: "umbler",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      externalDeliveryId: "delivery_1",
      externalEventId: "event_1",
      externalMessageId: "message_1",
      occurrenceKey: "occurrence_1",
      businessDedupePolicy:
        decisionCode === "eligible"
          ? {
              mode: "rolling_window",
              scopeKey: "Purchase:workspace_1:lead_1",
              windowSeconds: 86_400,
            }
          : null,
      eventName: "Purchase",
      occurredAt: "2026-07-23T13:00:00.000Z",
      authorType: "organization_member",
      contactIdentityHash: "phone_hash_1",
    },
    rule: {
      providerRuleId: "provider_rule_1",
      conversionRuleId: "conversion_rule_1",
      version: "2026-07-23T12:00:00.000Z",
      triggerType: "structured_catalog",
      eventName: "Purchase",
      mode: "production",
      active: true,
      authorScope: "both",
      triggerPhrases: ["Dados para confirmar o pedido"],
      defaultValueCents: null,
      defaultCurrency: null,
      defaultContentName: null,
    },
    catalog: null,
    conversion: {
      matchedTriggerPhrase: "Dados para confirmar o pedido",
      items: [],
      valueCents: input?.valueCents ?? 359_700,
      observedPaymentValueCents: null,
      currency: "BRL",
      contentName: "Cama elastica",
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

function createHarness(existing: Record<string, unknown> | null = null) {
  const findUnique = vi.fn(async () => existing);
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "comparison_1",
    matches: data.matches,
    mismatchCode: data.mismatchCode,
  }));
  const prisma = {
    providerConversionShadowComparison: {
      findUnique,
      create,
    },
  };

  return {
    create,
    findUnique,
    service: new ProviderConversionShadowComparisonService(prisma as never),
  };
}

const baseInput = {
  workspaceId: "workspace_1",
  providerRuleId: "provider_rule_1",
  sourceDeliveryId: "delivery_1",
  channelId: "channel_1",
  occurrenceKey: "occurrence_1",
  authoritativeEngine: "legacy" as const,
};

describe("provider conversion shadow comparison", () => {
  it("records semantic matches without treating engine versions as a mismatch", async () => {
    const harness = createHarness();
    const legacy = {
      ...decision(),
      engineVersion: "legacy-v1",
    };
    const canonical = decision();

    const result = await harness.service.record({
      ...baseInput,
      legacyDecision: legacy,
      canonicalDecision: canonical,
    });

    expect(result).toEqual({
      id: "comparison_1",
      matches: true,
      mismatchCode: null,
      created: true,
    });
    expect(harness.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authoritativeEngine: "legacy",
        legacyEngineVersion: "legacy-v1",
        canonicalEngineVersion: "decision-v1",
        matches: true,
        mismatchCode: null,
      }),
      select: {
        id: true,
        matches: true,
        mismatchCode: true,
      },
    });
  });

  it("classifies an applicability mismatch when only canonical decides", async () => {
    const harness = createHarness();

    const result = await harness.service.record({
      ...baseInput,
      legacyDecision: null,
      canonicalDecision: decision({
        decisionCode: "ignored_empty_template",
        reasonCode: "empty_template",
        valueCents: null,
      }),
    });

    expect(result).toMatchObject({
      matches: false,
      mismatchCode: "applicability_mismatch",
    });
  });

  it("classifies conversion payload differences independently", async () => {
    const harness = createHarness();

    const result = await harness.service.record({
      ...baseInput,
      legacyDecision: decision({ valueCents: 100_000 }),
      canonicalDecision: decision({ valueCents: 359_700 }),
    });

    expect(result).toMatchObject({
      matches: false,
      mismatchCode: "conversion_payload_mismatch",
    });
  });

  it("reuses an existing append-only comparison idempotently", async () => {
    const harness = createHarness({
      id: "comparison_existing",
      matches: true,
      mismatchCode: null,
    });

    const result = await harness.service.record({
      ...baseInput,
      legacyDecision: decision(),
      canonicalDecision: decision(),
    });

    expect(result).toEqual({
      id: "comparison_existing",
      matches: true,
      mismatchCode: null,
      created: false,
    });
    expect(harness.create).not.toHaveBeenCalled();
  });
});
