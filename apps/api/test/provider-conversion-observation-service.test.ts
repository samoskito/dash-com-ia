import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ProviderConversionDecisionDto,
  ProviderConversionPaidLeadResolutionDto,
} from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import { hashPhoneIdentity } from "../src/common/phone/phone-identity";
import { ProviderConversionDecisionEngine } from "../src/conversion-rules/provider-conversion-decision.engine";
import type {
  PersistedProviderConversionDecision,
  ProviderConversionDecisionRepository,
} from "../src/conversion-rules/provider-conversion-decision.repository";
import type { ProviderConversionEngineRolloutService } from "../src/conversion-rules/provider-conversion-engine-rollout.service";
import { ProviderConversionObservationService } from "../src/conversion-rules/provider-conversion-observation.service";
import { ProviderConversionOrchestrator } from "../src/conversion-rules/provider-conversion-orchestrator.service";
import type { ProviderConversionPaidLeadResolver } from "../src/conversion-rules/provider-conversion-paid-lead-resolver.service";
import { UmblerV1Parser } from "../src/inbound-webhooks/providers/umbler/umbler-v1.parser";

const workspaceId = "workspace_1";
const connectionId = "connection_1";
const channelId = "channel_1";
const fixturePath = resolve(
  __dirname,
  "fixtures",
  "umbler",
  "message-with-ctwa.json",
);

function outboundCatalogEvent() {
  const body = JSON.parse(readFileSync(fixturePath, "utf8"));
  body.Payload.Content.LastMessage.Source = "Bot";
  body.Payload.Content.LastMessage.BotInstance = { Id: "bot_1" };
  body.Payload.Content.LastMessage.SentByOrganizationMember = null;
  body.Payload.Content.LastMessage.Content =
    "Dados para confirmar o pedido\nTamanho: 4,90\nModelo: Nacional\n3.597,00";
  return new UmblerV1Parser().parse(body).events[0]!;
}

function createHarness(
  mode: "observation" | "production",
  messageAuthorScope: "team" | "contact" | "both" = "team",
  paidLeadExists = true,
  conversionEngineMode: "legacy" | "shadow" | "canonical" = "canonical",
) {
  const activatedAt = new Date("2026-07-18T00:00:00.000Z");
  const channel = {
    id: channelId,
    organizationId: "org_fixture_001",
    providerChannelId: "channel_fixture_001",
    status: "active",
    productionActivatedAt: activatedAt,
    conversionEngineMode,
  };
  const rule = {
    id: "provider_rule_1",
    workspaceId,
    connectionId,
    parserReleaseId: "parser_release_1",
    mode,
    productionActivatedAt: mode === "production" ? activatedAt : null,
    removedAt: null,
    createdAt: activatedAt,
    updatedAt: activatedAt,
    conversionRuleId: "conversion_rule_1",
    createdByUserId: "user_1",
    messageTriggerPhrases: ["Dados para confirmar o pedido"],
    messageAuthorScope,
    conversionRule: {
      id: "conversion_rule_1",
      workspaceId,
      name: "Compra catalogo",
      triggerType: "structured_catalog",
      triggerValue: "structured_catalog",
      matchMode: "exact",
      eventName: "Purchase",
      pixelId: null,
      defaultValueCents: null,
      defaultCurrency: "BRL",
      defaultContentName: "Cama elastica",
      defaultItems: null,
      active: true,
      createdAt: activatedAt,
      updatedAt: activatedAt,
    },
    connection: {
      id: connectionId,
      workspaceId,
      provider: "umbler",
      status: "production",
      removedAt: null,
      parserReleaseId: "parser_release_1",
      parserRelease: {
        id: "parser_release_1",
        provider: "umbler",
        version: "v1",
        status: "certified",
      },
    },
    parserRelease: {
      id: "parser_release_1",
      provider: "umbler",
      version: "v1",
      status: "certified",
    },
    channels: [{ id: "scope_1", channelId }],
    catalog: {
      id: "catalog_1",
      workspaceId,
      providerRuleId: "provider_rule_1",
      name: "Tabela",
      productName: "Cama elastica",
      currency: "BRL",
      active: true,
      createdAt: activatedAt,
      updatedAt: activatedAt,
      attributes: [
        {
          id: "attribute_1",
          workspaceId,
          catalogId: "catalog_1",
          position: 1,
          key: "tamanho",
          label: "Tamanho",
          createdAt: activatedAt,
          updatedAt: activatedAt,
        },
        {
          id: "attribute_2",
          workspaceId,
          catalogId: "catalog_1",
          position: 2,
          key: "modelo",
          label: "Modelo",
          createdAt: activatedAt,
          updatedAt: activatedAt,
        },
      ],
      variants: [
        {
          id: "variant_1",
          workspaceId,
          catalogId: "catalog_1",
          normalizedKey: "4,90|nacional",
          attributeValues: ["4,90", "Nacional"],
          aliases: [[], []],
          valueCents: 359_700,
          contentName: "Cama elastica 4,90 Nacional",
          active: true,
          createdAt: activatedAt,
          updatedAt: activatedAt,
        },
        {
          id: "variant_2",
          workspaceId,
          catalogId: "catalog_1",
          normalizedKey: "3,05|europa",
          attributeValues: ["3,05", "Europa"],
          aliases: [[], []],
          valueCents: 179_700,
          contentName: "Cama elastica 3,05 Europa",
          active: true,
          createdAt: activatedAt,
          updatedAt: activatedAt,
        },
      ],
    },
  };

  const executions = new Map<string, Record<string, any>>();
  const purchaseReviews = new Map<string, Record<string, any>>();
  const persistedDecisions = new Map<
    string,
    PersistedProviderConversionDecision
  >();
  const executionKey = (where: any) =>
    `${where.providerRuleId_externalExecutionKey.providerRuleId}:${where.providerRuleId_externalExecutionKey.externalExecutionKey}`;
  const reviewKey = (where: any) =>
    `${where.providerRuleId_externalOccurrenceKey.providerRuleId}:${where.providerRuleId_externalOccurrenceKey.externalOccurrenceKey}`;
  const providerConversionRuleExecution = {
    findUnique: vi.fn(async ({ where }: any) => {
      const existing = executions.get(executionKey(where));
      return existing
        ? {
            id: existing.id,
            status: existing.status,
            providerDecisionId: existing.providerDecisionId ?? null,
          }
        : null;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = executionKey(where);
      const existing = executions.get(key);
      if (existing) {
        Object.assign(existing, update);
        return { id: existing.id, status: existing.status };
      }
      const execution = {
        id: `execution_${executions.size + 1}`,
        ...create,
      };
      executions.set(key, execution);
      return { id: execution.id, status: execution.status };
    }),
  };
  const purchaseReview = {
    findUnique: vi.fn(async ({ where }: any) => {
      const existing = purchaseReviews.get(reviewKey(where));
      return existing ? { id: existing.id, status: existing.status } : null;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = reviewKey(where);
      const existing = purchaseReviews.get(key);
      if (existing) {
        Object.assign(existing, update);
        return { id: existing.id };
      }
      const review = {
        id: `review_${purchaseReviews.size + 1}`,
        ...create,
      };
      purchaseReviews.set(key, review);
      return { id: review.id };
    }),
  };
  const purchaseReviewItem = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
  };
  const prisma: Record<string, any> = {
    inboundWebhookChannel: {
      findMany: vi.fn(async () => [channel]),
    },
    providerConversionRuleConfig: {
      findMany: vi.fn(async () => [rule]),
    },
    providerConversionRuleExecution,
    purchaseReview,
    purchaseReviewItem,
  };
  prisma.$transaction = vi.fn(
    async (callback: (client: typeof prisma) => unknown) => callback(prisma),
  );

  const paidLeadResolution: ProviderConversionPaidLeadResolutionDto =
    paidLeadExists
      ? {
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
        }
      : {
          status: "not_found",
          reasonCode: "paid_lead_not_found",
          candidateLeadId: null,
        };
  const paidLeads = {
    resolve: vi.fn(async () => paidLeadResolution),
  };
  const decisionKey = (providerRuleId: string, occurrenceKey: string) =>
    `${providerRuleId}:${occurrenceKey}`;
  const findLatestByOccurrence = vi.fn(
    async ({
      providerRuleId,
      occurrenceKey,
    }: {
      providerRuleId: string;
      occurrenceKey: string;
    }) =>
      persistedDecisions.get(decisionKey(providerRuleId, occurrenceKey)) ??
      null,
  );
  const recordInitial = vi.fn(
    async ({
      decision,
      sourceDeliveryId,
    }: {
      decision: ProviderConversionDecisionDto;
      sourceDeliveryId: string;
    }) => {
      const stored: PersistedProviderConversionDecision & { created: boolean } =
        {
          id: `decision_${persistedDecisions.size + 1}`,
          workspaceId,
          providerRuleId: decision.rule.providerRuleId,
          sourceDeliveryId,
          channelId: decision.occurrence.channelId,
          leadId:
            decision.leadResolution.status === "resolved"
              ? decision.leadResolution.lead.id
              : null,
          evaluationKey: "initial",
          decisionFingerprint: `fingerprint_${persistedDecisions.size + 1}`,
          decisionVersion: 1,
          supersedesDecisionId: null,
          decisionCode: decision.decisionCode,
          reasonCode: decision.reasonCode,
          eventName: decision.occurrence.eventName,
          occurredAt: new Date(decision.occurrence.occurredAt),
          occurrenceKey: decision.occurrence.occurrenceKey,
          decision,
          createdAt: new Date(),
          created: true,
        };
      persistedDecisions.set(
        decisionKey(stored.providerRuleId, stored.occurrenceKey),
        stored,
      );
      return stored;
    },
  );
  const appendReevaluation = vi.fn(
    async ({
      decision,
      sourceDeliveryId,
      supersedesDecisionId,
      reevaluationRequestKey,
    }: {
      decision: ProviderConversionDecisionDto;
      sourceDeliveryId: string;
      supersedesDecisionId: string;
      reevaluationRequestKey: string;
    }) => {
      const previous = persistedDecisions.get(
        decisionKey(
          decision.rule.providerRuleId,
          decision.occurrence.occurrenceKey,
        ),
      );
      if (!previous || previous.id !== supersedesDecisionId) {
        throw new Error("stale decision");
      }
      const stored: PersistedProviderConversionDecision & { created: boolean } =
        {
          id: `decision_${persistedDecisions.size + appendReevaluation.mock.calls.length}`,
          workspaceId,
          providerRuleId: decision.rule.providerRuleId,
          sourceDeliveryId,
          channelId: decision.occurrence.channelId,
          leadId:
            decision.leadResolution.status === "resolved"
              ? decision.leadResolution.lead.id
              : null,
          evaluationKey: `reevaluation:${reevaluationRequestKey}`,
          decisionFingerprint: `fingerprint_reevaluation_${appendReevaluation.mock.calls.length}`,
          decisionVersion: previous.decisionVersion + 1,
          supersedesDecisionId,
          decisionCode: decision.decisionCode,
          reasonCode: decision.reasonCode,
          eventName: decision.occurrence.eventName,
          occurredAt: new Date(decision.occurrence.occurredAt),
          occurrenceKey: decision.occurrence.occurrenceKey,
          decision,
          createdAt: new Date(),
          created: true,
        };
      persistedDecisions.set(
        decisionKey(stored.providerRuleId, stored.occurrenceKey),
        stored,
      );
      return stored;
    },
  );
  const decisions = {
    appendReevaluation,
    findLatestByOccurrence,
    recordInitial,
  };
  const canonicalEngine = new ProviderConversionDecisionEngine();
  const engineRollout = {
    evaluate: vi.fn(
      async ({
        decisionInput,
      }: {
        decisionInput: Parameters<
          ProviderConversionDecisionEngine["evaluate"]
        >[0];
      }) => canonicalEngine.evaluate(decisionInput),
    ),
  };
  const orchestrator = new ProviderConversionOrchestrator(prisma as never);
  const service = new ProviderConversionObservationService(
    prisma as never,
    engineRollout as unknown as ProviderConversionEngineRolloutService,
    decisions as unknown as ProviderConversionDecisionRepository,
    paidLeads as unknown as ProviderConversionPaidLeadResolver,
    orchestrator,
    {
      NODE_ENV: "test",
      API_PUBLIC_URL: "http://localhost:3333",
      INBOUND_WEBHOOKS_ENABLED: "true",
      INBOUND_WEBHOOK_PRODUCTION_ENABLED: "true",
      INBOUND_CONVERSION_RULES_ENABLED: "true",
      INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
      INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64"),
    },
  );

  return {
    channel,
    decisions,
    appendReevaluation,
    executions,
    engineRollout,
    paidLeads,
    persistedDecisions,
    prisma,
    providerConversionRuleExecution,
    purchaseReview,
    purchaseReviewItem,
    purchaseReviews,
    recordInitial,
    rule,
    service,
  };
}

describe("provider conversion observation service", () => {
  it("reevaluates only the targeted rule and occurrence in a multi-event delivery", async () => {
    const harness = createHarness("production");
    const firstEvent = outboundCatalogEvent();
    const secondEvent = {
      ...outboundCatalogEvent(),
      externalEventId: "event_second",
      externalMessageId: "message_second",
      dedupeKey: `sha256:${"b".repeat(64)}`,
    };

    await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_multi",
      externalDeliveryId: "external_delivery_multi",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [firstEvent, secondEvent],
    });

    const result = await harness.service.reevaluateDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_multi",
      externalDeliveryId: "external_delivery_multi",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [firstEvent, secondEvent],
      manualRecovery: true,
      requestKey: "operator_request_exact_occurrence",
      target: {
        providerRuleId: harness.rule.id,
        occurrenceKey: firstEvent.dedupeKey,
      },
    });

    expect(result.executionIds).toHaveLength(1);
    expect(harness.appendReevaluation).toHaveBeenCalledTimes(1);
    expect(harness.appendReevaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({
          occurrence: expect.objectContaining({
            occurrenceKey: firstEvent.dedupeKey,
          }),
        }),
      }),
    );
    expect(
      harness.persistedDecisions.get(
        `${harness.rule.id}:${firstEvent.dedupeKey}`,
      )?.decisionVersion,
    ).toBe(2);
    expect(
      harness.persistedDecisions.get(
        `${harness.rule.id}:${secondEvent.dedupeKey}`,
      )?.decisionVersion,
    ).toBe(1);
  });

  it("persists an eligible decision before creating a production execution", async () => {
    const harness = createHarness("production");
    const event = outboundCatalogEvent();

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_1",
      externalDeliveryId: "external_delivery_1",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [event],
    });

    expect(result).toEqual({
      executionIds: ["execution_1"],
      eligibleExecutionIds: ["execution_1"],
    });
    expect(harness.recordInitial).toHaveBeenCalledTimes(1);
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
          currency: "BRL",
        }),
      }),
    );
    expect(
      harness.recordInitial.mock.invocationCallOrder[0],
    ).toBeLessThan(
      harness.providerConversionRuleExecution.upsert.mock
        .invocationCallOrder[0]!,
    );
    expect(harness.purchaseReview.upsert).not.toHaveBeenCalled();
  });

  it("observes a qualified lead recognized by message without a value", async () => {
    const harness = createHarness("production");
    harness.rule.messageTriggerPhrases = ["vou te passar os valores"];
    harness.rule.messageAuthorScope = "both";
    Object.assign(harness.rule.conversionRule, {
      triggerType: "message_phrase",
      eventName: "QualifiedLead",
      defaultValueCents: null,
      defaultCurrency: null,
      defaultContentName: null,
    });
    const event = outboundCatalogEvent();
    event.message.text = "Vou te passar os valores do procedimento";

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_ql",
      externalDeliveryId: "external_delivery_ql",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [event],
    });

    expect(result.eligibleExecutionIds).toEqual(["execution_1"]);
    // The rule query must not filter events, otherwise a QualifiedLead rule by
    // message is never even loaded.
    expect(
      harness.prisma.providerConversionRuleConfig.findMany.mock.calls[0][0]
        .where.conversionRule,
    ).not.toHaveProperty("eventName");
    expect(harness.recordInitial).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({
          decisionCode: "eligible",
          occurrence: expect.objectContaining({
            eventName: "QualifiedLead",
            businessDedupePolicy: expect.objectContaining({ mode: "lifetime" }),
          }),
          conversion: expect.objectContaining({
            valueCents: null,
            currency: null,
          }),
        }),
      }),
    );
  });

  it("uses one authoritative decision and one execution while the channel is in shadow mode", async () => {
    const harness = createHarness("production", "team", true, "shadow");
    const event = outboundCatalogEvent();

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_shadow",
      externalDeliveryId: "external_delivery_shadow",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [event],
    });

    expect(result).toEqual({
      executionIds: ["execution_1"],
      eligibleExecutionIds: ["execution_1"],
    });
    expect(harness.engineRollout.evaluate).toHaveBeenCalledTimes(1);
    expect(harness.engineRollout.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "shadow",
        sourceDeliveryId: "delivery_shadow",
      }),
    );
    expect(harness.recordInitial).toHaveBeenCalledTimes(1);
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).toHaveBeenCalledTimes(1);
    expect(harness.purchaseReview.upsert).not.toHaveBeenCalled();
  });

  it("persists an eligible observation without execution or review", async () => {
    const harness = createHarness("observation");

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_1",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [outboundCatalogEvent()],
    });

    expect(result).toEqual({ executionIds: [], eligibleExecutionIds: [] });
    expect(
      harness.recordInitial.mock.calls[0]?.[0].decision.decisionCode,
    ).toBe("eligible");
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).not.toHaveBeenCalled();
    expect(harness.purchaseReview.upsert).not.toHaveBeenCalled();
  });

  it("uses the catalog price for the real metric-suffixed order", async () => {
    const harness = createHarness("production");
    const event = outboundCatalogEvent();
    event.message.text = [
      "Dados para confirmar o pedido:",
      "- Tamanho: 3,05 M",
      "- Modelo: EUROPA",
      "- Forma de pagamento: CARTAO DE CREDITO 12x de 170,00",
      "- Numero de telefone principal: 84_99182_9040",
    ].join("\n");

    await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_real_order",
      deliveryReceivedAt: new Date("2026-07-23T13:36:00.000Z"),
      events: [event],
    });

    const canonicalDecision =
      harness.recordInitial.mock.calls[0]?.[0].decision;
    expect(canonicalDecision).toEqual(
      expect.objectContaining({
        decisionCode: "eligible",
        conversion: expect.objectContaining({
          valueCents: 179_700,
          observedPaymentValueCents: 17_000,
          items: [
            expect.objectContaining({
              catalogVariantId: "variant_2",
              unitValueCents: 179_700,
            }),
          ],
        }),
      }),
    );
  });

  it("creates one review for a known paid lead with an unknown combination", async () => {
    const harness = createHarness("production", "both");
    const event = outboundCatalogEvent();
    event.message.authorType = "contact";
    event.message.direction = "inbound";
    event.message.text = [
      "COMPROVANTE DE ENCOMENDA",
      "Dados para confirmar o pedido:",
      "- Nome: Cliente",
      "- Tamanho: 3,5",
      "- Modelo: Nacional",
      "- Forma de pagamento: Pix",
    ].join("\n");

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_real_unknown_size",
      deliveryReceivedAt: new Date("2026-07-22T21:23:47.000Z"),
      events: [event],
    });

    expect(result).toEqual({ executionIds: [], eligibleExecutionIds: [] });
    expect(
      harness.recordInitial.mock.calls[0]?.[0].decision,
    ).toEqual(
      expect.objectContaining({
        decisionCode: "review_required",
        reasonCode: "unknown_combination",
      }),
    );
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
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).not.toHaveBeenCalled();
  });

  it.each([
    {
      authorType: "organization_member" as const,
      direction: "outbound" as const,
    },
    {
      authorType: "bot" as const,
      direction: "outbound" as const,
    },
    {
      authorType: "contact" as const,
      direction: "inbound" as const,
    },
  ])(
    "audits an empty template from $authorType without operational records",
    async ({ authorType, direction }) => {
      const harness = createHarness("production", "both");
      const event = outboundCatalogEvent();
      event.message.authorType = authorType;
      event.message.direction = direction;
      event.message.text = [
        "Dados para confirmar o pedido:",
        "Tamanho:",
        "Modelo:",
      ].join("\n");

      const result = await harness.service.observeDelivery({
        workspaceId,
        connectionId,
        deliveryId: `delivery_empty_${authorType}`,
        deliveryReceivedAt: new Date("2026-07-23T13:36:00.000Z"),
        events: [event],
      });

      expect(result).toEqual({ executionIds: [], eligibleExecutionIds: [] });
      expect(
        harness.recordInitial.mock.calls[0]?.[0].decision.decisionCode,
      ).toBe("ignored_empty_template");
      expect(
        harness.providerConversionRuleExecution.upsert,
      ).not.toHaveBeenCalled();
      expect(harness.purchaseReview.upsert).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      caseName: "complete catalog order",
      message: [
        "Dados para confirmar o pedido:",
        "Tamanho: 4,90",
        "Modelo: Nacional",
      ].join("\n"),
    },
    {
      caseName: "partial catalog order",
      message: [
        "Dados para confirmar o pedido:",
        "Tamanho: 4,90",
        "Modelo:",
      ].join("\n"),
    },
  ])(
    "audits an untracked paid lead for a $caseName without customer review",
    async ({ message }) => {
      const harness = createHarness("production", "both", false);
      const event = outboundCatalogEvent();
      event.message.text = message;

      const result = await harness.service.observeDelivery({
        workspaceId,
        connectionId,
        deliveryId: "delivery_untracked_lead",
        deliveryReceivedAt: new Date("2026-07-23T13:36:00.000Z"),
        events: [event],
      });

      expect(result).toEqual({ executionIds: [], eligibleExecutionIds: [] });
      expect(
        harness.recordInitial.mock.calls[0]?.[0].decision.decisionCode,
      ).toBe("ignored_untracked_lead");
      expect(harness.purchaseReview.upsert).not.toHaveBeenCalled();
      expect(
        harness.providerConversionRuleExecution.upsert,
      ).not.toHaveBeenCalled();
    },
  );

  it("recovers an observed callback when the active channel has no production activation timestamp", async () => {
    const harness = createHarness("production");
    const event = outboundCatalogEvent();
    const historicalReceivedAt = new Date("2026-07-17T12:00:00.000Z");
    harness.channel.productionActivatedAt = null;

    const observed = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_historical",
      deliveryReceivedAt: historicalReceivedAt,
      events: [event],
    });
    const recovered = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_historical",
      deliveryReceivedAt: historicalReceivedAt,
      events: [event],
      manualRecovery: true,
    });

    expect(observed).toEqual({ executionIds: [], eligibleExecutionIds: [] });
    expect(recovered).toEqual({
      executionIds: ["execution_1"],
      eligibleExecutionIds: ["execution_1"],
    });
    expect(harness.recordInitial).toHaveBeenCalledTimes(1);
    expect(harness.paidLeads.resolve).toHaveBeenCalledTimes(1);
    expect(harness.persistedDecisions.size).toBe(1);
  });

  it("does not evaluate a contact message outside the rule author scope", async () => {
    const harness = createHarness("production");
    const event = outboundCatalogEvent();
    event.message.direction = "inbound";
    event.message.authorType = "contact";

    const result = await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_1",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [event],
    });

    expect(result).toEqual({ executionIds: [], eligibleExecutionIds: [] });
    expect(harness.recordInitial).not.toHaveBeenCalled();
    expect(
      harness.providerConversionRuleExecution.upsert,
    ).not.toHaveBeenCalled();
  });

  it("uses the same normalized identity for paid-lead resolution", async () => {
    const harness = createHarness("production");
    const event = outboundCatalogEvent();

    await harness.service.observeDelivery({
      workspaceId,
      connectionId,
      deliveryId: "delivery_1",
      deliveryReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      events: [event],
    });

    expect(harness.paidLeads.resolve).toHaveBeenCalledWith({
      workspaceId,
      phone: event.contact.phoneNumber,
    });
    expect(
      harness.recordInitial.mock.calls[0]?.[0].decision.occurrence
        .contactIdentityHash,
    ).toBe(hashPhoneIdentity(event.contact.phoneNumber));
  });
});
