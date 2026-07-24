import type {
  ProviderConversionDecisionDto,
  ProviderConversionPaidLeadResolutionDto,
} from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import { ProviderConversionDecisionRepository } from "../src/conversion-rules/provider-conversion-decision.repository";

function paidLead(): Extract<
  ProviderConversionPaidLeadResolutionDto,
  { status: "resolved" }
> {
  return {
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
  };
}

function eligibleDecision(
  occurrenceKey = "occurrence_1",
): ProviderConversionDecisionDto {
  return {
    engineVersion: "decision-v1",
    parserVersion: "umbler-v1",
    decisionCode: "eligible",
    reasonCode: "automation_matched",
    occurrence: {
      source: "automation",
      provider: "umbler",
      workspaceId: "workspace_1",
      connectionId: "connection_1",
      channelId: "channel_1",
      externalDeliveryId: "provider_delivery_1",
      externalEventId: "provider_event_1",
      externalMessageId: null,
      occurrenceKey,
      businessDedupePolicy: {
        mode: "lifetime",
        scopeKey: "QualifiedLead:workspace_1:lead_1",
      },
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
    leadResolution: paidLead(),
  };
}

function ignoredDecision(): ProviderConversionDecisionDto {
  const decision = eligibleDecision("occurrence_untracked");

  return {
    ...decision,
    decisionCode: "ignored_untracked_lead",
    reasonCode: "paid_lead_not_found",
    occurrence: {
      ...decision.occurrence,
      businessDedupePolicy: null,
    },
    leadResolution: {
      status: "not_found",
      reasonCode: "paid_lead_not_found",
      candidateLeadId: null,
    },
  };
}

function createHarness() {
  const records: Array<Record<string, any>> = [];
  const queryRaw = vi.fn(async () => [{ lockAcquired: "" }]);
  const findUnique = vi.fn(async ({ where }: any) => {
    const key = where.providerRuleId_occurrenceKey_evaluationKey;
    return (
      records.find(
        (record) =>
          record.providerRuleId === key.providerRuleId &&
          record.occurrenceKey === key.occurrenceKey &&
          record.evaluationKey === key.evaluationKey,
      ) ?? null
    );
  });
  const findFirst = vi.fn(async ({ where, orderBy }: any) => {
    if (where.id) {
      return (
        records.find(
          (record) =>
            record.id === where.id && record.workspaceId === where.workspaceId,
        ) ?? null
      );
    }

    const matching = records.filter(
      (record) =>
        record.workspaceId === where.workspaceId &&
        record.providerRuleId === where.providerRuleId &&
        record.occurrenceKey === where.occurrenceKey,
    );
    return orderBy?.decisionVersion === "desc"
      ? (matching.sort(
          (left, right) => right.decisionVersion - left.decisionVersion,
        )[0] ?? null)
      : (matching[0] ?? null);
  });
  const findMany = vi.fn(async ({ where, orderBy }: any) => {
    const matching = records.filter(
      (record) =>
        record.workspaceId === where.workspaceId &&
        record.providerRuleId === where.providerRuleId &&
        record.occurrenceKey === where.occurrenceKey,
    );
    return orderBy?.decisionVersion === "asc"
      ? matching.sort(
          (left, right) => left.decisionVersion - right.decisionVersion,
        )
      : matching;
  });
  const create = vi.fn(async ({ data }: any) => {
    const record = {
      id: `decision_${records.length + 1}`,
      createdAt: new Date(`2026-07-23T13:0${records.length}:00.000Z`),
      ...data,
    };
    records.push(record);
    return record;
  });
  const transaction = {
    $queryRaw: queryRaw,
    providerConversionDecisionAudit: {
      findUnique,
      findFirst,
      findMany,
      create,
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: any) => unknown) =>
      callback(transaction),
    ),
    providerConversionDecisionAudit: {
      findFirst,
      findMany,
    },
  };

  return {
    records,
    queryRaw,
    findUnique,
    findFirst,
    findMany,
    create,
    repository: new ProviderConversionDecisionRepository(prisma as never),
  };
}

describe("provider conversion decision repository", () => {
  it("appends a frozen canonical decision as version one", async () => {
    const harness = createHarness();

    const result = await harness.repository.recordInitial({
      decision: eligibleDecision(),
      sourceDeliveryId: "delivery_1",
    });

    expect(result).toMatchObject({
      id: "decision_1",
      created: true,
      decisionVersion: 1,
      supersedesDecisionId: null,
      evaluationKey: "initial",
      decision: {
        decisionCode: "eligible",
      },
    });
    expect(harness.queryRaw).toHaveBeenCalledTimes(1);
    expect(harness.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        providerRuleId: "provider_rule_1",
        sourceDeliveryId: "delivery_1",
        leadId: "lead_1",
        businessDedupeMode: "lifetime",
        businessDedupeScopeKey: "QualifiedLead:workspace_1:lead_1",
        normalizedOccurrence: expect.objectContaining({
          occurrenceKey: "occurrence_1",
        }),
        decisionJson: expect.objectContaining({
          decisionCode: "eligible",
        }),
      }),
    });
  });

  it("returns the existing row when the same evaluation is repeated", async () => {
    const harness = createHarness();
    const input = {
      decision: eligibleDecision(),
      sourceDeliveryId: "delivery_1",
    };

    await harness.repository.recordInitial(input);
    const repeated = await harness.repository.recordInitial(input);

    expect(repeated).toMatchObject({
      id: "decision_1",
      created: false,
      decisionVersion: 1,
    });
    expect(harness.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a reused evaluation key with a different frozen decision", async () => {
    const harness = createHarness();
    const initial = eligibleDecision();

    await harness.repository.recordInitial({
      decision: initial,
      sourceDeliveryId: "delivery_1",
    });

    await expect(
      harness.repository.recordInitial({
        decision: {
          ...initial,
          reasonCode: "catalog_matched",
        },
        sourceDeliveryId: "delivery_1",
      }),
    ).rejects.toMatchObject({
      code: "evaluation_key_conflict",
    });
    expect(harness.create).toHaveBeenCalledTimes(1);
  });

  it("appends a linked version for a distinct reevaluation key", async () => {
    const harness = createHarness();
    const decision = eligibleDecision();

    const initial = await harness.repository.recordInitial({
      decision,
      sourceDeliveryId: "delivery_1",
    });
    const reevaluated = await harness.repository.appendReevaluation({
      decision,
      sourceDeliveryId: "delivery_1",
      supersedesDecisionId: initial.id,
      reevaluationRequestKey: "reevaluation_operator_1",
    });

    expect(reevaluated).toMatchObject({
      id: "decision_2",
      created: true,
      decisionVersion: 2,
      supersedesDecisionId: "decision_1",
    });
    expect(harness.records[1]).toMatchObject({
      supersedesDecisionWorkspaceId: "workspace_1",
      supersedesDecisionId: "decision_1",
    });
  });

  it("deduplicates one explicit reevaluation request", async () => {
    const harness = createHarness();
    const initial = await harness.repository.recordInitial({
      decision: eligibleDecision(),
      sourceDeliveryId: "delivery_1",
    });

    const changed = eligibleDecision();
    changed.reasonCode = "catalog_matched";

    const input = {
      decision: changed,
      sourceDeliveryId: "delivery_1",
      supersedesDecisionId: initial.id,
      reevaluationRequestKey: "operator-command-1",
    };
    const first = await harness.repository.appendReevaluation(input);
    const repeated = await harness.repository.appendReevaluation(input);

    expect(repeated).toMatchObject({
      id: first.id,
      created: false,
      decisionVersion: 2,
    });
    expect(harness.create).toHaveBeenCalledTimes(2);
  });

  it("persists ignored untracked leads without an operational lead link", async () => {
    const harness = createHarness();

    const result = await harness.repository.recordInitial({
      decision: ignoredDecision(),
      sourceDeliveryId: "delivery_untracked",
    });

    expect(result.decision).toMatchObject({
      decisionCode: "ignored_untracked_lead",
    });
    expect(harness.records[0]).toMatchObject({
      leadWorkspaceId: null,
      leadId: null,
      businessDedupeMode: null,
      businessDedupeScopeKey: null,
      businessDedupeWindowSeconds: null,
    });
  });

  it("reads one frozen decision and its append-only history", async () => {
    const harness = createHarness();
    const decision = eligibleDecision();
    const first = await harness.repository.recordInitial({
      decision,
      sourceDeliveryId: "delivery_1",
    });
    await harness.repository.appendReevaluation({
      decision,
      sourceDeliveryId: "delivery_1",
      supersedesDecisionId: first.id,
      reevaluationRequestKey: "reevaluation_operator_1",
    });

    await expect(
      harness.repository.findById({
        workspaceId: "workspace_1",
        decisionId: first.id,
      }),
    ).resolves.toMatchObject({
      id: "decision_1",
      decisionVersion: 1,
    });
    await expect(
      harness.repository.listVersions({
        workspaceId: "workspace_1",
        providerRuleId: "provider_rule_1",
        occurrenceKey: "occurrence_1",
      }),
    ).resolves.toMatchObject([
      { id: "decision_1", decisionVersion: 1 },
      { id: "decision_2", decisionVersion: 2 },
    ]);
  });

  it("reads the latest frozen decision for replay without reevaluating it", async () => {
    const harness = createHarness();
    const decision = eligibleDecision();
    const first = await harness.repository.recordInitial({
      decision,
      sourceDeliveryId: "delivery_1",
    });
    const changed = eligibleDecision();
    changed.reasonCode = "catalog_matched";

    await harness.repository.appendReevaluation({
      decision: changed,
      sourceDeliveryId: "delivery_1",
      supersedesDecisionId: first.id,
      reevaluationRequestKey: "operator-command-1",
    });

    await expect(
      harness.repository.findLatestByOccurrence({
        workspaceId: "workspace_1",
        providerRuleId: "provider_rule_1",
        occurrenceKey: "occurrence_1",
      }),
    ).resolves.toMatchObject({
      id: "decision_2",
      decisionVersion: 2,
      decision: {
        reasonCode: "catalog_matched",
      },
    });
  });

  it("rejects a reevaluation that points to a stale decision version", async () => {
    const harness = createHarness();
    const first = await harness.repository.recordInitial({
      decision: eligibleDecision(),
      sourceDeliveryId: "delivery_1",
    });
    await harness.repository.appendReevaluation({
      decision: eligibleDecision(),
      sourceDeliveryId: "delivery_1",
      supersedesDecisionId: first.id,
      reevaluationRequestKey: "operator-command-1",
    });

    await expect(
      harness.repository.appendReevaluation({
        decision: eligibleDecision(),
        sourceDeliveryId: "delivery_1",
        supersedesDecisionId: first.id,
        reevaluationRequestKey: "operator-command-2",
      }),
    ).rejects.toMatchObject({
      code: "stale_superseded_decision",
    });
    expect(harness.create).toHaveBeenCalledTimes(2);
  });
});
