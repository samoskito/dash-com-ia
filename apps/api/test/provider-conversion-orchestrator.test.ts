import type { ProviderConversionDecisionDto } from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import type { PersistedProviderConversionDecision } from "../src/conversion-rules/provider-conversion-decision.repository";
import { ProviderConversionOrchestrator } from "../src/conversion-rules/provider-conversion-orchestrator.service";

function decision(
  decisionCode:
    | "eligible"
    | "review_required"
    | "ignored_empty_template"
    | "ignored_untracked_lead"
    | "duplicate",
): ProviderConversionDecisionDto {
  const resolvedLead = {
    status: "resolved" as const,
    reasonCode: "paid_lead_resolved" as const,
    lead: {
      id: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "campaign_1",
      adSetId: "adset_1",
      adId: "ad_1",
      ctwaClid: "ctwa_1",
    },
  };
  const base = {
    engineVersion: "decision-v1",
    parserVersion: "v1",
    reasonCode:
      decisionCode === "review_required"
        ? "unknown_combination"
        : decisionCode === "ignored_empty_template"
          ? "empty_template"
          : decisionCode === "ignored_untracked_lead"
            ? "paid_lead_not_found"
          : decisionCode === "duplicate"
            ? "business_duplicate"
            : "catalog_matched",
    occurrence: {
      source: "message" as const,
      provider: "umbler",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      externalDeliveryId: "external_delivery_1",
      externalEventId: "external_event_1",
      externalMessageId: "external_message_1",
      occurrenceKey: "occurrence_1",
      businessDedupePolicy: {
        mode: "rolling_window" as const,
        scopeKey: "Purchase:workspace_1:lead_1",
        windowSeconds: 86_400,
      },
      eventName: "Purchase" as const,
      occurredAt: "2026-07-23T13:36:00.000Z",
      authorType: "organization_member" as const,
      contactIdentityHash: "phone_hash_1",
    },
    rule: {
      providerRuleId: "provider_rule_1",
      conversionRuleId: "conversion_rule_1",
      version: "rule-v1",
      triggerType: "structured_catalog" as const,
      eventName: "Purchase" as const,
      mode: "production" as const,
      active: true,
      authorScope: "both" as const,
      triggerPhrases: ["Dados para confirmar o pedido"],
      defaultValueCents: null,
      defaultCurrency: "BRL",
      defaultContentName: "Cama elastica",
      valueMode: "fixed" as const,
      exampleMessage: null,    },
    catalog: {
      version: "catalog-v1",
      catalog: {
        id: "catalog_1",
        name: "Tabela",
        productName: "Cama elastica",
        currency: "BRL",
        active: true,
        attributes: [
          {
            id: "attribute_1",
            position: 1,
            key: "tamanho",
            label: "Tamanho",
          },
          {
            id: "attribute_2",
            position: 2,
            key: "modelo",
            label: "Modelo",
          },
        ],
        variants: [],
      },
    },
    conversion: {
      matchedTriggerPhrase: "Dados para confirmar o pedido",
      items: [
        {
          position: 1,
          quantity: 1,
          parsedAttributes: [
            { key: "tamanho", label: "Tamanho", value: "4,90" },
            { key: "modelo", label: "Modelo", value: "Nacional" },
          ],
          catalogVariantId:
            decisionCode === "review_required" ? null : "variant_1",
          unitValueCents:
            decisionCode === "review_required" ? null : 359_700,
          subtotalValueCents:
            decisionCode === "review_required" ? null : 359_700,
          contentName:
            decisionCode === "review_required"
              ? null
              : "Cama elastica 4,90 Nacional",
          reasonCode:
            decisionCode === "review_required"
              ? ("unknown_combination" as const)
              : ("matched" as const),
        },
      ],
      valueCents:
        decisionCode === "review_required" ||
        decisionCode === "ignored_empty_template"
          ? null
          : 359_700,
      observedPaymentValueCents: null,
      currency: "BRL",
      contentName:
        decisionCode === "review_required"
          ? null
          : "Cama elastica 4,90 Nacional",
    },
  };

  if (decisionCode === "ignored_empty_template") {
    return {
      ...base,
      decisionCode,
      occurrence: {
        ...base.occurrence,
        businessDedupePolicy: null,
      },
      conversion: {
        ...base.conversion,
        items: [],
      },
      leadResolution: resolvedLead,
    };
  }
  if (decisionCode === "ignored_untracked_lead") {
    return {
      ...base,
      decisionCode,
      occurrence: {
        ...base.occurrence,
        businessDedupePolicy: null,
      },
      leadResolution: {
        status: "not_found",
        reasonCode: "paid_lead_not_found",
        candidateLeadId: null,
      },
    };
  }
  if (decisionCode === "duplicate") {
    return {
      ...base,
      decisionCode,
      leadResolution: resolvedLead,
      duplicateOfDecisionId: "decision_previous",
      duplicateOfConversionEventLogId: "conversion_previous",
    };
  }

  return {
    ...base,
    decisionCode,
    leadResolution: resolvedLead,
  };
}

function persisted(
  canonicalDecision: ProviderConversionDecisionDto,
): PersistedProviderConversionDecision {
  return {
    id: "decision_1",
    workspaceId: "workspace_1",
    providerRuleId: "provider_rule_1",
    sourceDeliveryId: "delivery_1",
    channelId: "channel_1",
    leadId:
      canonicalDecision.leadResolution.status === "resolved"
        ? canonicalDecision.leadResolution.lead.id
        : null,
    evaluationKey: "initial",
    decisionFingerprint: "fingerprint_1",
    decisionVersion: 1,
    supersedesDecisionId: null,
    decisionCode: canonicalDecision.decisionCode,
    reasonCode: canonicalDecision.reasonCode,
    eventName: canonicalDecision.occurrence.eventName,
    occurredAt: new Date(canonicalDecision.occurrence.occurredAt),
    occurrenceKey: canonicalDecision.occurrence.occurrenceKey,
    decision: canonicalDecision,
    createdAt: new Date("2026-07-23T13:36:01.000Z"),
  };
}

function createHarness() {
  const providerConversionRuleExecution = {
    findUnique: vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(null),
    upsert: vi.fn(async ({ create }: any) => ({
      id: "execution_1",
      status: create.status,
    })),
  };
  const purchaseReview = {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async () => ({ id: "review_1" })),
  };
  const purchaseReviewItem = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
  };
  const prisma: Record<string, any> = {
    providerConversionRuleExecution,
    purchaseReview,
    purchaseReviewItem,
  };
  prisma.$transaction = vi.fn(
    async (callback: (client: typeof prisma) => unknown) => callback(prisma),
  );

  return {
    orchestrator: new ProviderConversionOrchestrator(prisma as never),
    prisma,
    providerConversionRuleExecution,
    purchaseReview,
    purchaseReviewItem,
  };
}

describe("provider conversion orchestrator", () => {
  it("upgrades an observed execution to eligible during recovery", async () => {
    const harness = createHarness();
    harness.providerConversionRuleExecution.findUnique.mockResolvedValue({
      id: "execution_observed",
      status: "observed",
      providerDecisionId: "decision_1",
    });
    harness.providerConversionRuleExecution.upsert.mockResolvedValue({
      id: "execution_observed",
      status: "eligible",
    });

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(decision("eligible")),
      disposition: { state: "eligible", reasonCode: "catalog_matched" },
    });

    expect(result).toEqual({
      executionId: "execution_observed",
      eligibleExecutionId: "execution_observed",
      reviewId: null,
    });
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "eligible",
          processedAt: null,
        }),
      }),
    );
  });

  it.each(["ignored_empty_template", "duplicate"] as const)(
    "keeps %s as internal audit only",
    async (decisionCode) => {
      const harness = createHarness();

      const result = await harness.orchestrator.orchestrate({
        persistedDecision: persisted(decision(decisionCode)),
        disposition: { state: "eligible", reasonCode: "catalog_matched" },
      });

      expect(result).toEqual({
        executionId: null,
        eligibleExecutionId: null,
        reviewId: null,
      });
      expect(harness.prisma.$transaction).not.toHaveBeenCalled();
      expect(
        harness.providerConversionRuleExecution.upsert,
      ).not.toHaveBeenCalled();
      expect(harness.purchaseReview.upsert).not.toHaveBeenCalled();
    },
  );

  it("creates one actionable review without a technical execution", async () => {
    const harness = createHarness();

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(decision("review_required")),
      disposition: { state: "eligible", reasonCode: "unknown_combination" },
    });

    expect(result).toEqual({
      executionId: null,
      eligibleExecutionId: null,
      reviewId: "review_1",
    });
    expect(harness.purchaseReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          providerDecisionId: "decision_1",
          status: "review_required",
          reasonCode: "unknown_combination",
          leadId: "lead_1",
        }),
      }),
    );
    expect(harness.purchaseReviewItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          catalogVariantId: null,
          attributeValues: ["4,90", "Nacional"],
          quantity: 1,
        }),
      ],
    });
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).not.toHaveBeenCalled();
  });

  it("materializes an eligible observation decision as a visible observed execution", async () => {
    const harness = createHarness();

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(decision("eligible")),
      disposition: {
        state: "observed",
        reasonCode: "catalog_matched_observation",
      },
    });

    // The operator must see the match in the audit UI, which lists executions
    // and not decision audits. Observation stays out of production: the
    // execution is never `eligible`, so nothing is ever queued for CAPI.
    expect(result).toEqual({
      executionId: "execution_1",
      eligibleExecutionId: null,
      reviewId: null,
    });
    expect(harness.providerConversionRuleExecution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          providerDecisionId: "decision_1",
          status: "observed",
          reasonCode: "catalog_matched_observation",
          valueCents: 359_700,
          leadId: "lead_1",
        }),
      }),
    );
    expect(harness.purchaseReview.upsert).not.toHaveBeenCalled();
  });

  it("keeps an observed execution out of the production queue on recovery", async () => {
    const harness = createHarness();
    harness.providerConversionRuleExecution.findUnique.mockResolvedValueOnce({
      id: "execution_existing",
      status: "observed",
      providerDecisionId: "decision_1",
    });

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(decision("eligible")),
      disposition: {
        state: "observed",
        reasonCode: "average_value_message_matched_observation",
      },
    });

    expect(result).toEqual({
      executionId: "execution_existing",
      eligibleExecutionId: null,
      reviewId: null,
    });
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).not.toHaveBeenCalled();
  });

  it("still skips observed dispositions for ignored decisions", async () => {
    const harness = createHarness();

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(decision("ignored_untracked_lead")),
      disposition: {
        state: "observed",
        reasonCode: "paid_lead_not_found_observation",
      },
    });

    expect(result).toEqual({
      executionId: null,
      eligibleExecutionId: null,
      reviewId: null,
    });
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).not.toHaveBeenCalled();
  });

  it("records an unpaid observation match as a blocked execution", async () => {
    const harness = createHarness();
    const unpaidObservation = decision("ignored_untracked_lead");
    unpaidObservation.rule.mode = "observation";

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(unpaidObservation),
      disposition: { state: "blocked", reasonCode: "paid_lead_not_found" },
      recordIgnoredObservation: true,
    });

    expect(result).toEqual({
      executionId: "execution_1",
      eligibleExecutionId: null,
      reviewId: null,
    });
    expect(harness.providerConversionRuleExecution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "blocked",
          reasonCode: "paid_lead_not_found",
          leadId: null,
        }),
      }),
    );
  });

  it("creates one linked technical execution for eligible production", async () => {
    const harness = createHarness();

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(decision("eligible")),
      disposition: { state: "eligible", reasonCode: "catalog_matched" },
    });

    expect(result).toEqual({
      executionId: "execution_1",
      eligibleExecutionId: "execution_1",
      reviewId: null,
    });
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          providerDecisionId: "decision_1",
          status: "eligible",
          reasonCode: "catalog_matched",
          matchedCatalogVariantId: "variant_1",
          valueCents: 359_700,
          leadId: "lead_1",
        }),
      }),
    );
    expect(harness.purchaseReview.upsert).not.toHaveBeenCalled();
  });

  it("records invalid production context as a blocked technical execution", async () => {
    const harness = createHarness();

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(decision("eligible")),
      disposition: {
        state: "blocked",
        reasonCode: "production_context_invalid",
      },
    });

    expect(result).toEqual({
      executionId: "execution_1",
      eligibleExecutionId: null,
      reviewId: null,
    });
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "blocked",
          reasonCode: "production_context_invalid",
        }),
      }),
    );
  });

  it("does not recreate an execution already eligible for the same decision", async () => {
    const harness = createHarness();
    harness.providerConversionRuleExecution.findUnique.mockResolvedValueOnce({
      id: "execution_existing",
      status: "eligible",
      providerDecisionId: "decision_1",
    });

    const result = await harness.orchestrator.orchestrate({
      persistedDecision: persisted(decision("eligible")),
      disposition: { state: "eligible", reasonCode: "catalog_matched" },
    });

    expect(result).toEqual({
      executionId: "execution_existing",
      eligibleExecutionId: "execution_existing",
      reviewId: null,
    });
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).not.toHaveBeenCalled();
  });

  it.each(["blocked", "failed"] as const)(
    "recovers a %s execution using the same frozen decision",
    async (status) => {
      const harness = createHarness();
      harness.providerConversionRuleExecution.findUnique.mockResolvedValueOnce({
        id: "execution_existing",
        status,
        providerDecisionId: "decision_1",
      });

      const result = await harness.orchestrator.orchestrate({
        persistedDecision: persisted(decision("eligible")),
        disposition: { state: "eligible", reasonCode: "catalog_matched" },
      });

      expect(result).toEqual({
        executionId: "execution_1",
        eligibleExecutionId: "execution_1",
        reviewId: null,
      });
      expect(
        harness.providerConversionRuleExecution.upsert,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            providerDecisionId: "decision_1",
            status: "eligible",
            reasonCode: "catalog_matched",
            processedAt: null,
          }),
        }),
      );
    },
  );

  it.each(["materialized", "duplicate"] as const)(
    "preserves the terminal %s execution",
    async (status) => {
      const harness = createHarness();
      harness.providerConversionRuleExecution.findUnique.mockResolvedValueOnce({
        id: "execution_terminal",
        status,
        providerDecisionId: "decision_1",
      });

      const result = await harness.orchestrator.orchestrate({
        persistedDecision: persisted(decision("eligible")),
        disposition: { state: "eligible", reasonCode: "catalog_matched" },
      });

      expect(result).toEqual({
        executionId: "execution_terminal",
        eligibleExecutionId: null,
        reviewId: null,
      });
      expect(
        harness.providerConversionRuleExecution.upsert,
      ).not.toHaveBeenCalled();
    },
  );
});
