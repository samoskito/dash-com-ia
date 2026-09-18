import type { ProviderConversionDecisionDto } from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import type { PersistedProviderConversionDecision } from "../src/conversion-rules/provider-conversion-decision.repository";
import { ProviderConversionReviewApprovalService } from "../src/conversion-rules/provider-conversion-review-approval.service";

function reviewDecision(
  decisionCode: "review_required" | "eligible" = "review_required",
): ProviderConversionDecisionDto {
  return {
    engineVersion: "decision-v1",
    parserVersion: "umbler-v1",
    decisionCode,
    reasonCode:
      decisionCode === "eligible"
        ? "purchase_review_approved"
        : "unknown_combination",
    occurrence: {
      source: "message",
      provider: "umbler",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      externalDeliveryId: "external_delivery_1",
      externalEventId: "external_event_1",
      externalMessageId: "message_1",
      occurrenceKey: "occurrence_1",
      businessDedupePolicy: {
        mode: "rolling_window",
        scopeKey: "Purchase:workspace_1:lead_1",
        windowSeconds: 86_400,
      },
      eventName: "Purchase",
      occurredAt: "2026-07-23T13:36:00.000Z",
      authorType: "organization_member",
      contactIdentityHash: "phone_hash_1",
    },
    rule: {
      providerRuleId: "provider_rule_1",
      conversionRuleId: "conversion_rule_1",
      version: "rule-v1",
      triggerType: "structured_catalog",
      eventName: "Purchase",
      mode: "production",
      active: true,
      authorScope: "both",
      triggerPhrases: ["Dados para confirmar o pedido"],
      defaultValueCents: null,
      defaultCurrency: "BRL",
      defaultContentName: "Cama elastica",
      valueMode: "fixed",
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
        variants: [
          {
            id: "variant_1",
            normalizedKey: "4,90|nacional",
            attributeValues: ["4,90", "Nacional"],
            aliases: [[], ["Tradicional"]],
            valueCents: 359_700,
            contentName: "Cama elastica 4,90 Nacional",
            active: true,
          },
        ],
      },
    },
    conversion: {
      matchedTriggerPhrase: "Dados para confirmar o pedido",
      items:
        decisionCode === "eligible"
          ? [
              {
                position: 1,
                quantity: 1,
                parsedAttributes: [
                  { key: "tamanho", label: "Tamanho", value: "4,90" },
                  { key: "modelo", label: "Modelo", value: "Nacional" },
                ],
                catalogVariantId: "variant_1",
                unitValueCents: 359_700,
                subtotalValueCents: 359_700,
                contentName: "Cama elastica 4,90 Nacional",
                reasonCode: "matched",
              },
            ]
          : [
              {
                position: 1,
                quantity: 1,
                parsedAttributes: [
                  { key: "tamanho", label: "Tamanho", value: "4,90" },
                  { key: "modelo", label: "Modelo", value: "Nacional" },
                ],
                catalogVariantId: null,
                unitValueCents: null,
                subtotalValueCents: null,
                contentName: null,
                reasonCode: "unknown_combination",
              },
            ],
      valueCents: decisionCode === "eligible" ? 359_700 : null,
      observedPaymentValueCents: null,
      currency: "BRL",
      contentName:
        decisionCode === "eligible"
          ? "Cama elastica 4,90 Nacional"
          : null,
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

function persisted(
  decision: ProviderConversionDecisionDto,
  overrides: Partial<PersistedProviderConversionDecision> = {},
): PersistedProviderConversionDecision {
  return {
    id: "decision_1",
    workspaceId: "workspace_1",
    providerRuleId: "provider_rule_1",
    sourceDeliveryId: "delivery_1",
    channelId: "channel_1",
    leadId: "lead_1",
    evaluationKey: "initial",
    decisionFingerprint: "fingerprint_1",
    decisionVersion: 1,
    supersedesDecisionId: null,
    decisionCode: decision.decisionCode,
    reasonCode: decision.reasonCode,
    eventName: "Purchase",
    occurredAt: new Date("2026-07-23T13:36:00.000Z"),
    occurrenceKey: "occurrence_1",
    decision,
    createdAt: new Date("2026-07-23T13:36:01.000Z"),
    ...overrides,
  };
}

function review(): Record<string, any> {
  return {
    id: "review_1",
    workspaceId: "workspace_1",
    providerRuleId: "provider_rule_1",
    sourceDeliveryId: "delivery_1",
    providerDecisionId: "decision_1",
    providerExecutionId: null,
    conversionEventLogId: null,
    externalOccurrenceKey: "occurrence_1",
    status: "review_required",
    classificationCode: "review_required",
    version: 3,
    effectiveValueCents: 359_700,
    observedPaymentValueCents: null,
    currency: "BRL",
    matchedTriggerPhrase: "Dados para confirmar o pedido",
    providerDecision: {},
    providerExecution: null,
    channel: {
      id: "channel_1",
      status: "active",
      productionActivatedAt: new Date("2026-07-23T12:00:00.000Z"),
    },
    providerRule: {
      id: "provider_rule_1",
      conversionRuleId: "conversion_rule_1",
      parserReleaseId: "parser_release_1",
      mode: "production",
      messageTriggerPhrases: ["Dados para confirmar o pedido"],
      messageAuthorScope: "both",
      productionActivatedAt: new Date("2026-07-23T12:00:00.000Z"),
      removedAt: null,
      updatedAt: new Date("2026-07-23T12:30:00.000Z"),
      conversionRule: {
        active: true,
        triggerType: "structured_catalog",
        eventName: "Purchase",
        defaultValueCents: null,
        defaultCurrency: "BRL",
        defaultContentName: "Cama elastica",
      valueMode: "fixed",
      exampleMessage: null,        updatedAt: new Date("2026-07-23T12:30:00.000Z"),
      },
      connection: {
        status: "production",
        removedAt: null,
        parserReleaseId: "parser_release_1",
        parserRelease: {
          status: "certified",
        },
      },
      parserRelease: {
        status: "certified",
        version: "umbler-v1",
      },
      channels: [{ channelId: "channel_1" }],
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
        variants: [
          {
            id: "variant_1",
            normalizedKey: "4,90|nacional",
            attributeValues: ["4,90", "Nacional"],
            aliases: [[], ["Tradicional"]],
            valueCents: 359_700,
            contentName: "Cama elastica 4,90 Nacional",
            active: true,
            createdAt: new Date("2026-07-23T12:00:00.000Z"),
          },
        ],
      },
    },
    items: [
      {
        id: "review_item_1",
        position: 1,
        catalogVariantId: "variant_1",
        attributeValues: ["4,90", "Nacional"],
        quantity: 1,
        unitValueCents: 359_700,
        subtotalValueCents: 359_700,
        contentName: "Cama elastica 4,90 Nacional",
      },
    ],
  };
}

function createHarness(input?: {
  currentReview?: ReturnType<typeof review>;
  latest?: PersistedProviderConversionDecision;
}) {
  const currentReview = input?.currentReview ?? review();
  const latest = input?.latest ?? persisted(reviewDecision());
  const purchaseReview = {
    findFirst: vi.fn(async () => currentReview),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const auditLog = {
    create: vi.fn(async ({ data }: any) => ({ id: "audit_1", ...data })),
  };
  const transaction = { purchaseReview, auditLog };
  const prisma = {
    purchaseReview,
    $transaction: vi.fn(async (callback: (client: any) => unknown) =>
      callback(transaction),
    ),
  };
  const decisions = {
    findLatestByOccurrence: vi.fn(async () => latest),
    reevaluationEvaluationKey: vi.fn(
      () => "reevaluation:purchase-review-approval-3",
    ),
    appendReevaluation: vi.fn(async ({ decision }: any) =>
      persisted(decision, {
        id: "decision_2",
        evaluationKey: "reevaluation:purchase-review-approval-3",
        decisionVersion: 2,
        supersedesDecisionId: latest.id,
      }),
    ),
  };
  const orchestrator = {
    orchestrate: vi.fn(async () => ({
      executionId: "execution_1",
      eligibleExecutionId: "execution_1",
      reviewId: null,
    })),
  };
  const env = {
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_WEBHOOK_REPLAY_ENABLED: "true",
    INBOUND_WEBHOOK_PRODUCTION_ENABLED: "true",
    INBOUND_CONVERSION_RULES_ENABLED: "true",
    INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
    API_PUBLIC_URL: "https://api.wpptrack.test",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString("base64"),
  };
  const service = new ProviderConversionReviewApprovalService(
    prisma as never,
    decisions as never,
    orchestrator as never,
    env,
  );

  return {
    auditLog,
    currentReview,
    decisions,
    orchestrator,
    purchaseReview,
    service,
  };
}

describe("provider conversion review approval", () => {
  it("creates an eligible decision version before linking one execution", async () => {
    const harness = createHarness();

    const result = await harness.service.prepareApproval({
      workspaceId: "workspace_1",
      reviewId: "review_1",
      decision: { reason: "Compra conferida" },
      actorUserId: "user_1",
    });

    expect(result).toEqual({
      providerConversionExecutionId: "execution_1",
    });
    const reevaluation = harness.decisions.appendReevaluation.mock.calls[0]![0];
    expect(reevaluation).toMatchObject({
      sourceDeliveryId: "delivery_1",
      supersedesDecisionId: "decision_1",
      reevaluationRequestKey: "purchase-review:review_1:approval:3",
      decision: {
        decisionCode: "eligible",
        reasonCode: "purchase_review_approved",
        parserVersion: "umbler-v1",
        conversion: {
          valueCents: 359_700,
          currency: "BRL",
          contentName: "Cama elastica 4,90 Nacional",
          items: [
            {
              catalogVariantId: "variant_1",
              quantity: 1,
              subtotalValueCents: 359_700,
              reasonCode: "matched",
            },
          ],
        },
      },
    });
    expect(harness.orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        persistedDecision: expect.objectContaining({ id: "decision_2" }),
        disposition: {
          state: "eligible",
          reasonCode: "purchase_review_approved",
        },
      }),
    );
    expect(harness.purchaseReview.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 3 }),
        data: expect.objectContaining({
          providerDecisionId: "decision_2",
          providerExecutionId: "execution_1",
          status: "approved",
        }),
      }),
    );
    expect(harness.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("recovers the same reevaluation after a partial request failure", async () => {
    const eligible = persisted(reviewDecision("eligible"), {
      id: "decision_2",
      evaluationKey: "reevaluation:purchase-review-approval-3",
      decisionVersion: 2,
      supersedesDecisionId: "decision_1",
    });
    const harness = createHarness({ latest: eligible });

    await harness.service.prepareApproval({
      workspaceId: "workspace_1",
      reviewId: "review_1",
      decision: { reason: "Compra conferida" },
      actorUserId: "user_1",
    });

    expect(harness.decisions.appendReevaluation).not.toHaveBeenCalled();
    expect(harness.orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        persistedDecision: expect.objectContaining({ id: "decision_2" }),
      }),
    );
  });

  it("blocks approval when catalog pricing changed after item review", async () => {
    const changed = review();
    changed.providerRule.catalog.variants[0]!.valueCents = 399_700;
    const harness = createHarness({ currentReview: changed });

    await expect(
      harness.service.prepareApproval({
        workspaceId: "workspace_1",
        reviewId: "review_1",
        decision: { reason: "Compra conferida" },
        actorUserId: "user_1",
      }),
    ).rejects.toThrow(
      "O catalogo mudou. Revise os itens novamente antes de aprovar.",
    );
    expect(harness.decisions.appendReevaluation).not.toHaveBeenCalled();
    expect(harness.orchestrator.orchestrate).not.toHaveBeenCalled();
  });

  it("retries a transient technical failure with the same frozen decision", async () => {
    const failed = review();
    failed.status = "failed";
    failed.providerExecutionId = "execution_1";
    failed.providerExecution = {
      id: "execution_1",
      status: "failed",
      providerDecisionId: "decision_1",
      normalizedResult: {
        technicalDelivery: {
          state: "failed_retryable",
          retryable: true,
        },
      },
    };
    const harness = createHarness({ currentReview: failed });

    await expect(
      harness.service.prepareApproval({
        workspaceId: "workspace_1",
        reviewId: "review_1",
        decision: { reason: "Tentar novamente" },
        actorUserId: "user_1",
      }),
    ).resolves.toEqual({
      providerConversionExecutionId: "execution_1",
    });
    expect(harness.decisions.findLatestByOccurrence).not.toHaveBeenCalled();
    expect(harness.decisions.appendReevaluation).not.toHaveBeenCalled();
    expect(harness.orchestrator.orchestrate).not.toHaveBeenCalled();
  });

  it("leaves legacy reviews for the existing fallback path", async () => {
    const legacy = review();
    legacy.providerDecisionId = null;
    const harness = createHarness({ currentReview: legacy });

    await expect(
      harness.service.prepareApproval({
        workspaceId: "workspace_1",
        reviewId: "review_1",
        decision: { reason: "Compra conferida" },
        actorUserId: "user_1",
      }),
    ).resolves.toBeNull();
    expect(harness.decisions.findLatestByOccurrence).not.toHaveBeenCalled();
  });
});
