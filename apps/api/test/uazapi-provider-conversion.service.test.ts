import { beforeEach, describe, expect, it, vi } from "vitest";
import { UazapiProviderConversionService } from "../src/inbound-webhooks/uazapi-provider-conversion.service";

function enabledEnv() {
  return {
    NODE_ENV: "test",
    API_PUBLIC_URL: "http://localhost:3333",
    INBOUND_WEBHOOKS_ENABLED: "true",
    INBOUND_CONVERSION_RULES_ENABLED: "true",
    INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
    INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString("base64"),
  };
}

function sampleRule(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "provider_rule_1",
    workspaceId: "workspace_1",
    connectionId: "connection_1",
    conversionRuleId: "rule_1",
    mode: "production",
    productionActivatedAt: now,
    removedAt: null,
    updatedAt: now,
    createdAt: now,
    parserReleaseId: "release_1",
    messageTriggerPhrases: ["iniciou checkout"],
    messageAuthorScope: "organization_member",
    conversionRule: {
      id: "rule_1",
      active: true,
      triggerType: "message_phrase",
      eventName: "InitiateCheckout",
      defaultValueCents: 25_000,
      defaultCurrency: "BRL",
      defaultContentName: "Checkout",
      defaultItems: {
        kind: "message_phrase_config_v1",
        valueMode: "fixed",
        exampleMessage: null,
      },
      updatedAt: now,
    },
    connection: {
      removedAt: null,
      status: "production",
      parserReleaseId: "release_1",
      parserRelease: { status: "certified", version: "v1" },
    },
    parserRelease: { status: "certified", version: "v1" },
    ...overrides,
  };
}

/**
 * Mirrors the shape of the production row that exposed the bug: an `eligible`
 * decision for a paid lead, frozen while the rule was in observation mode and
 * left without any linked ProviderConversionRuleExecution.
 */
function frozenDecision(
  overrides: { ruleMode?: string; provider?: string } = {},
) {
  const ruleMode = overrides.ruleMode ?? "observation";
  return {
    id: "decision_frozen",
    workspaceId: "workspace_1",
    providerRuleId: "provider_rule_1",
    sourceDeliveryId: "delivery_frozen",
    channelId: "channel_1",
    leadId: "lead_1",
    evaluationKey: "initial",
    decisionFingerprint: "fingerprint_frozen",
    decisionVersion: 1,
    supersedesDecisionId: null,
    decisionCode: "eligible",
    reasonCode: "average_value_message_matched",
    eventName: "InitiateCheckout",
    occurredAt: new Date("2026-08-22T12:00:00.000Z"),
    occurrenceKey: "uazapi:channel_1:msg_frozen",
    createdAt: new Date("2026-08-22T12:00:01.000Z"),
    decision: {
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      rule: {
        mode: ruleMode,
        eventName: "InitiateCheckout",
        triggerType: "message_phrase",
      },
      occurrence: {
        provider: overrides.provider ?? "uazapi",
        channelId: "channel_1",
        eventName: "InitiateCheckout",
        matchedTriggerPhrase: "A sua consulta está agendada",
      },
      conversion: { valueCents: 25_000, currency: "BRL" },
      leadResolution: { status: "resolved", leadId: "lead_1" },
    },
  };
}

describe("UazapiProviderConversionService", () => {
  const prisma = {
    uazapiChatLabelState: { findUnique: vi.fn(), upsert: vi.fn() },
    inboundWebhookChannel: { findFirst: vi.fn() },
    inboundWebhookDelivery: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    providerConversionRuleConfig: { findMany: vi.fn(), findFirst: vi.fn() },
    providerConversionDecisionAudit: { findFirst: vi.fn() },
  };
  const bridge = { ensureBridge: vi.fn() };
  const decisionEngine = { evaluate: vi.fn() };
  const decisions = {
    recordInitial: vi.fn(),
    findLatestByOccurrence: vi.fn(),
    findById: vi.fn(),
  };
  const orchestrator = { orchestrate: vi.fn() };
  const paidLeads = { resolve: vi.fn() };
  const productionQueue = { enqueueProviderConversion: vi.fn() };
  const uazapi = { listLabels: vi.fn() };
  const tokenEncryption = { decrypt: vi.fn() };

  const service = new UazapiProviderConversionService(
    prisma as never,
    enabledEnv() as never,
    bridge as never,
    decisionEngine as never,
    decisions as never,
    orchestrator as never,
    paidLeads as never,
    productionQueue as never,
    uazapi as never,
    tokenEncryption as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    bridge.ensureBridge.mockResolvedValue({
      connectionId: "connection_1",
      channelId: "channel_1",
    });
    prisma.inboundWebhookChannel.findFirst.mockResolvedValue({
      status: "active",
      productionActivatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.uazapiChatLabelState.findUnique.mockResolvedValue(null);
    decisions.findLatestByOccurrence.mockResolvedValue(null);
    prisma.uazapiChatLabelState.upsert.mockResolvedValue({});
    uazapi.listLabels.mockResolvedValue({
      labels: [{ id: "10", name: "Venda fechada" }],
    });
  });

  it("skips when phone or message text is missing", async () => {
    await expect(
      service.evaluateTeamMessage({
        workspaceId: "workspace_1",
        instance: {
          id: "instance_1",
          workspaceId: "workspace_1",
          name: "NOD",
          providerInstanceId: "p1",
        },
        phone: "",
        messageText: "iniciou checkout",
      }),
    ).resolves.toEqual({ evaluated: false, eligibleExecutionId: null });
    expect(bridge.ensureBridge).not.toHaveBeenCalled();
  });

  it("returns not evaluated when no message_phrase rules exist", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([]);

    await expect(
      service.evaluateTeamMessage({
        workspaceId: "workspace_1",
        instance: {
          id: "instance_1",
          workspaceId: "workspace_1",
          name: "NOD",
          providerInstanceId: "p1",
        },
        phone: "+5541999999999",
        messageText: "Cliente iniciou checkout",
      }),
    ).resolves.toEqual({ evaluated: false, eligibleExecutionId: null });
    expect(paidLeads.resolve).not.toHaveBeenCalled();
  });

  it("does not enqueue CAPI when the decision is not eligible", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([
      sampleRule(),
    ]);
    paidLeads.resolve.mockResolvedValue({
      status: "not_found",
      reasonCode: "paid_lead_not_found",
      candidateLeadId: null,
    });
    decisionEngine.evaluate.mockReturnValue({
      decisionCode: "ignored_untracked_lead",
      reasonCode: "paid_lead_not_found",
      rule: {
        mode: "production",
        eventName: "InitiateCheckout",
        triggerType: "message_phrase",
      },
      occurrence: {},
      conversion: { valueCents: null },
      leadResolution: { status: "not_found" },
    });
    prisma.inboundWebhookDelivery.findUnique.mockResolvedValue(null);
    prisma.inboundWebhookDelivery.create.mockResolvedValue({
      id: "delivery_1",
    });
    decisions.recordInitial.mockResolvedValue({
      decision: {
        decisionCode: "ignored_untracked_lead",
        reasonCode: "paid_lead_not_found",
        rule: { mode: "production", eventName: "InitiateCheckout" },
      },
    });
    orchestrator.orchestrate.mockResolvedValue({
      eligibleExecutionId: null,
    });

    const result = await service.evaluateTeamMessage({
      workspaceId: "workspace_1",
      instance: {
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD",
        providerInstanceId: "p1",
      },
      phone: "+5541999999999",
      messageText: "Cliente iniciou checkout",
    });

    expect(result.evaluated).toBe(true);
    expect(result.eligibleExecutionId).toBeNull();
    expect(productionQueue.enqueueProviderConversion).not.toHaveBeenCalled();
    expect(decisionEngine.evaluate).toHaveBeenCalled();
    // Production stays fail-closed: an unpaid contact is never materialized
    // as a visible observation.
    expect(orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ recordIgnoredObservation: false }),
    );
  });

  it("records an unpaid team message in observation mode as a blocked observation", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([
      sampleRule({
        mode: "observation",
        messageTriggerPhrases: ["consulta esta agendada"],
      }),
    ]);
    paidLeads.resolve.mockResolvedValue({
      status: "not_found",
      reasonCode: "paid_lead_not_found",
      candidateLeadId: null,
    });
    decisionEngine.evaluate.mockReturnValue({
      decisionCode: "ignored_untracked_lead",
      reasonCode: "paid_lead_not_found",
      rule: {
        mode: "observation",
        eventName: "InitiateCheckout",
        triggerType: "message_phrase",
      },
      occurrence: {},
      conversion: { valueCents: null },
      leadResolution: { status: "not_found" },
    });
    prisma.inboundWebhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_team_observation",
    });
    decisions.recordInitial.mockResolvedValue({
      decision: {
        decisionCode: "ignored_untracked_lead",
        reasonCode: "paid_lead_not_found",
        rule: { mode: "observation", eventName: "InitiateCheckout" },
      },
    });
    orchestrator.orchestrate.mockResolvedValue({ eligibleExecutionId: null });

    const result = await service.evaluateTeamMessage({
      workspaceId: "workspace_1",
      instance: {
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD",
        providerInstanceId: "p1",
      },
      phone: "+5541999999999",
      messageText: "Sua consulta esta agendada para amanha",
      externalMessageId: "msg_observation",
    });

    expect(result).toEqual({ evaluated: true, eligibleExecutionId: null });
    expect(orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        recordIgnoredObservation: true,
        disposition: {
          state: "blocked",
          reasonCode: "paid_lead_not_found",
        },
      }),
    );
    expect(productionQueue.enqueueProviderConversion).not.toHaveBeenCalled();
  });

  it("enqueues CAPI when orchestrator marks execution eligible", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([
      sampleRule(),
    ]);
    paidLeads.resolve.mockResolvedValue({
      status: "resolved",
      reasonCode: "paid_lead_resolved",
      candidateLeadId: "lead_1",
      leadId: "lead_1",
    });
    decisionEngine.evaluate.mockReturnValue({
      decisionCode: "eligible",
      reasonCode: "matched_message_phrase",
      rule: {
        mode: "production",
        eventName: "InitiateCheckout",
        triggerType: "message_phrase",
      },
      occurrence: {},
      conversion: { valueCents: 25_000 },
      leadResolution: { status: "resolved", leadId: "lead_1" },
    });
    prisma.inboundWebhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_1",
    });
    decisions.recordInitial.mockResolvedValue({
      decision: {
        decisionCode: "eligible",
        reasonCode: "matched_message_phrase",
        rule: { mode: "production", eventName: "InitiateCheckout" },
      },
    });
    orchestrator.orchestrate.mockResolvedValue({
      eligibleExecutionId: "execution_1",
    });

    const result = await service.evaluateTeamMessage({
      workspaceId: "workspace_1",
      instance: {
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD",
        providerInstanceId: "p1",
      },
      phone: "+5541999999999",
      messageText: "Cliente iniciou checkout",
      externalMessageId: "msg_1",
    });

    expect(result).toEqual({
      evaluated: true,
      eligibleExecutionId: "execution_1",
    });
    expect(productionQueue.enqueueProviderConversion).toHaveBeenCalledWith({
      providerConversionExecutionId: "execution_1",
      workspaceId: "workspace_1",
    });
  });

  it("evaluates a qualified-lead message rule without a value", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([
      sampleRule({
        messageTriggerPhrases: ["vou te passar os valores"],
        conversionRule: {
          ...sampleRule().conversionRule,
          eventName: "QualifiedLead",
          defaultValueCents: null,
          defaultCurrency: null,
          defaultContentName: null,
          defaultItems: {
            uazapiLabels: [
              {
                id: "10",
                labelId: "10",
                matchKeys: ["10", "554237420132:10"],
                name: "Venda fechada",
              },
            ],
          },
        },
      }),
    ]);
    paidLeads.resolve.mockResolvedValue({
      status: "resolved",
      reasonCode: "paid_lead_resolved",
      candidateLeadId: "lead_1",
      leadId: "lead_1",
    });
    decisionEngine.evaluate.mockReturnValue({
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      rule: {
        mode: "production",
        eventName: "QualifiedLead",
        triggerType: "message_phrase",
      },
      occurrence: {},
      conversion: { valueCents: null },
      leadResolution: { status: "resolved", leadId: "lead_1" },
    });
    prisma.inboundWebhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_1",
    });
    decisions.recordInitial.mockResolvedValue({
      decision: {
        decisionCode: "eligible",
        reasonCode: "average_value_message_matched",
        rule: { mode: "production", eventName: "QualifiedLead" },
      },
    });
    orchestrator.orchestrate.mockResolvedValue({
      eligibleExecutionId: "execution_ql",
    });

    const result = await service.evaluateTeamMessage({
      workspaceId: "workspace_1",
      instance: {
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD",
        providerInstanceId: "p1",
      },
      phone: "+5541999999999",
      messageText: "Vou te passar os valores do procedimento",
      externalMessageId: "msg_ql",
    });

    expect(result).toEqual({
      evaluated: true,
      eligibleExecutionId: "execution_ql",
    });
    // The rule query must not filter events, otherwise QualifiedLead by
    // message never reaches the engine on the UAZAPI path.
    expect(
      prisma.providerConversionRuleConfig.findMany.mock.calls[0][0].where
        .conversionRule,
    ).not.toHaveProperty("eventName");
    expect(decisionEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        rule: expect.objectContaining({ eventName: "QualifiedLead" }),
        occurrence: expect.objectContaining({ eventName: "QualifiedLead" }),
      }),
    );
  });

  it("evaluates matching UAZAPI labels and queues eligible production", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([
      sampleRule({
        messageTriggerPhrases: ["Venda fechada"],
        conversionRule: {
          ...sampleRule().conversionRule,
          triggerType: "provider_automation",
          eventName: "QualifiedLead",
          defaultValueCents: null,
          defaultCurrency: null,
          defaultContentName: null,
        },
      }),
    ]);
    paidLeads.resolve.mockResolvedValue({
      status: "resolved",
      reasonCode: "paid_lead_resolved",
      leadId: "lead_1",
      candidateLeadId: "lead_1",
    });
    decisionEngine.evaluate.mockReturnValue({
      decisionCode: "eligible",
      reasonCode: "automation_matched",
      rule: { mode: "production", eventName: "QualifiedLead" },
    });
    prisma.inboundWebhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_label_1",
    });
    decisions.recordInitial.mockResolvedValue({
      decision: {
        decisionCode: "eligible",
        reasonCode: "automation_matched",
        rule: { mode: "production", eventName: "QualifiedLead" },
      },
    });
    orchestrator.orchestrate.mockResolvedValue({
      eligibleExecutionId: "execution_label_1",
    });

    await expect(
      service.evaluateLabels({
        workspaceId: "workspace_1",
        instance: {
          id: "instance_1",
          workspaceId: "workspace_1",
          name: "NOD",
          providerInstanceId: "p1",
        },
        phone: "+5541999999999",
        labelIds: ["554237420132:10"],
        waChatId: "5541999999999@s.whatsapp.net",
        externalEventId: "event_label_1",
      }),
    ).resolves.toEqual({
      evaluated: true,
      eligibleExecutionId: "execution_label_1",
    });

    expect(decisionEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrence: expect.objectContaining({
          labels: ["554237420132:10", "10"],
          matchedLabel: "Venda fechada",
        }),
      }),
    );
    expect(productionQueue.enqueueProviderConversion).toHaveBeenCalledWith({
      providerConversionExecutionId: "execution_label_1",
      workspaceId: "workspace_1",
    });
  });

  it("records a matched unpaid UAZAPI label as a blocked observation", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([
      sampleRule({
        mode: "observation",
        messageTriggerPhrases: ["Venda fechada"],
        conversionRule: {
          ...sampleRule().conversionRule,
          triggerType: "provider_automation",
          eventName: "QualifiedLead",
          defaultValueCents: null,
          defaultCurrency: null,
          defaultContentName: null,
        },
      }),
    ]);
    paidLeads.resolve.mockResolvedValue({
      status: "not_found",
      reasonCode: "paid_lead_not_found",
      candidateLeadId: null,
    });
    decisionEngine.evaluate.mockReturnValue({
      decisionCode: "ignored_untracked_lead",
      reasonCode: "paid_lead_not_found",
      rule: { mode: "observation", eventName: "QualifiedLead" },
    });
    prisma.inboundWebhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_label_observation",
    });
    decisions.recordInitial.mockResolvedValue({
      decision: {
        decisionCode: "ignored_untracked_lead",
        reasonCode: "paid_lead_not_found",
        rule: { mode: "observation", eventName: "QualifiedLead" },
      },
    });
    orchestrator.orchestrate.mockResolvedValue({ eligibleExecutionId: null });

    await service.evaluateLabels({
      workspaceId: "workspace_1",
      instance: {
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD",
        providerInstanceId: "p1",
      },
      phone: "+5541999999999",
      labelIds: ["554237420132:10"],
      waChatId: "5541999999999@s.whatsapp.net",
      externalEventId: "event_label_observation",
    });

    expect(orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        recordIgnoredObservation: true,
        disposition: {
          state: "blocked",
          reasonCode: "paid_lead_not_found",
        },
      }),
    );
    expect(productionQueue.enqueueProviderConversion).not.toHaveBeenCalled();
  });

  it("does not materialize an unpaid UAZAPI label in production", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([
      sampleRule({
        messageTriggerPhrases: ["Venda fechada"],
        conversionRule: {
          ...sampleRule().conversionRule,
          triggerType: "provider_automation",
          eventName: "QualifiedLead",
          defaultValueCents: null,
          defaultCurrency: null,
          defaultContentName: null,
        },
      }),
    ]);
    paidLeads.resolve.mockResolvedValue({
      status: "not_found",
      reasonCode: "paid_lead_not_found",
      candidateLeadId: null,
    });
    decisionEngine.evaluate.mockReturnValue({
      decisionCode: "ignored_untracked_lead",
      reasonCode: "paid_lead_not_found",
      rule: { mode: "production", eventName: "QualifiedLead" },
    });
    prisma.inboundWebhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_label_production",
    });
    decisions.recordInitial.mockResolvedValue({
      decision: {
        decisionCode: "ignored_untracked_lead",
        reasonCode: "paid_lead_not_found",
        rule: { mode: "production", eventName: "QualifiedLead" },
      },
    });
    orchestrator.orchestrate.mockResolvedValue({ eligibleExecutionId: null });

    await service.evaluateLabels({
      workspaceId: "workspace_1",
      instance: {
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD",
        providerInstanceId: "p1",
      },
      phone: "+5541999999999",
      labelIds: ["554237420132:10"],
      waChatId: "5541999999999@s.whatsapp.net",
      externalEventId: "event_label_production",
    });

    expect(orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ recordIgnoredObservation: false }),
    );
    expect(productionQueue.enqueueProviderConversion).not.toHaveBeenCalled();
  });

  it("reuses the frozen decision of a re-delivered occurrence", async () => {
    prisma.providerConversionRuleConfig.findMany.mockResolvedValue([
      sampleRule({ mode: "observation" }),
    ]);
    paidLeads.resolve.mockResolvedValue({
      status: "resolved",
      reasonCode: "paid_lead_resolved",
      candidateLeadId: "lead_1",
      leadId: "lead_1",
    });
    decisionEngine.evaluate.mockReturnValue({
      decisionCode: "eligible",
      reasonCode: "average_value_message_matched",
      rule: {
        mode: "observation",
        eventName: "InitiateCheckout",
        triggerType: "message_phrase",
      },
      occurrence: {},
      conversion: { valueCents: 25_000 },
      leadResolution: { status: "resolved", leadId: "lead_1" },
    });
    prisma.inboundWebhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_frozen",
    });
    decisions.findLatestByOccurrence.mockResolvedValue(frozenDecision());
    orchestrator.orchestrate.mockResolvedValue({
      executionId: "execution_observed",
      eligibleExecutionId: null,
      reviewId: null,
    });

    const result = await service.evaluateTeamMessage({
      workspaceId: "workspace_1",
      instance: {
        id: "instance_1",
        workspaceId: "workspace_1",
        name: "NOD",
        providerInstanceId: "p1",
      },
      phone: "+5541999999999",
      messageText: "A sua consulta esta agendada",
      externalMessageId: "msg_frozen",
    });

    expect(result).toEqual({ evaluated: true, eligibleExecutionId: null });
    // Re-recording would explode with evaluation_key_conflict as soon as any
    // rule/lead input drifted since the original webhook.
    expect(decisions.recordInitial).not.toHaveBeenCalled();
    expect(orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        persistedDecision: expect.objectContaining({ id: "decision_frozen" }),
      }),
    );
  });

  it("recovers a frozen eligible observation decision by id", async () => {
    prisma.providerConversionDecisionAudit.findFirst.mockResolvedValue({
      id: "decision_frozen",
      workspaceId: "workspace_1",
      providerRuleId: "provider_rule_1",
    });
    decisions.findById.mockResolvedValue(frozenDecision());
    prisma.providerConversionRuleConfig.findFirst.mockResolvedValue(
      sampleRule({ mode: "observation" }),
    );
    orchestrator.orchestrate.mockResolvedValue({
      executionId: "execution_recovered",
      eligibleExecutionId: null,
      reviewId: null,
    });

    const result = await service.recoverDecision({
      decisionId: "decision_frozen",
      execute: true,
    });

    expect(result).toMatchObject({
      mode: "execute",
      decisionId: "decision_frozen",
      decisionCode: "eligible",
      ruleMode: "observation",
      disposition: {
        state: "observed",
        reasonCode: "average_value_message_matched_observation",
      },
      executionId: "execution_recovered",
      eligibleExecutionId: null,
      enqueued: false,
    });
    // Recovery must never freeze a second decision for the same occurrence.
    expect(decisions.recordInitial).not.toHaveBeenCalled();
    expect(orchestrator.orchestrate).toHaveBeenCalledWith({
      persistedDecision: expect.objectContaining({ id: "decision_frozen" }),
      disposition: {
        state: "observed",
        reasonCode: "average_value_message_matched_observation",
      },
      recordIgnoredObservation: false,
    });
    expect(productionQueue.enqueueProviderConversion).not.toHaveBeenCalled();
  });

  it("does not write anything when recovering in dry-run", async () => {
    prisma.providerConversionDecisionAudit.findFirst.mockResolvedValue({
      id: "decision_frozen",
      workspaceId: "workspace_1",
      providerRuleId: "provider_rule_1",
    });
    decisions.findById.mockResolvedValue(frozenDecision());
    prisma.providerConversionRuleConfig.findFirst.mockResolvedValue(
      sampleRule({ mode: "observation" }),
    );

    const result = await service.recoverDecision({
      decisionId: "decision_frozen",
    });

    expect(result).toMatchObject({
      mode: "dry-run",
      disposition: {
        state: "observed",
        reasonCode: "average_value_message_matched_observation",
      },
      executionId: null,
      enqueued: false,
    });
    expect(orchestrator.orchestrate).not.toHaveBeenCalled();
    expect(productionQueue.enqueueProviderConversion).not.toHaveBeenCalled();
  });

  it("upgrades a frozen observation decision to eligible and queues it when the live rule is production", async () => {
    prisma.providerConversionDecisionAudit.findFirst.mockResolvedValue({
      id: "decision_frozen",
      workspaceId: "workspace_1",
      providerRuleId: "provider_rule_1",
    });
    decisions.findById.mockResolvedValue(frozenDecision());
    prisma.providerConversionRuleConfig.findFirst.mockResolvedValue(
      sampleRule(),
    );
    orchestrator.orchestrate.mockResolvedValue({
      executionId: "execution_recovered",
      eligibleExecutionId: "execution_recovered",
      reviewId: null,
    });

    const result = await service.recoverDecision({
      decisionId: "decision_frozen",
      execute: true,
    });

    expect(result).toMatchObject({
      disposition: {
        state: "eligible",
        reasonCode: "average_value_message_matched",
      },
      eligibleExecutionId: "execution_recovered",
      enqueued: true,
    });
    expect(productionQueue.enqueueProviderConversion).toHaveBeenCalledWith({
      providerConversionExecutionId: "execution_recovered",
      workspaceId: "workspace_1",
    });
  });

  it("keeps recovery fail-closed when live production context is invalid", async () => {
    prisma.providerConversionDecisionAudit.findFirst.mockResolvedValue({
      id: "decision_frozen",
      workspaceId: "workspace_1",
      providerRuleId: "provider_rule_1",
    });
    decisions.findById.mockResolvedValue(frozenDecision());
    prisma.providerConversionRuleConfig.findFirst.mockResolvedValue(
      sampleRule({
        connection: { ...sampleRule().connection, status: "draft" },
      }),
    );
    orchestrator.orchestrate.mockResolvedValue({
      executionId: "execution_blocked",
      eligibleExecutionId: null,
      reviewId: null,
    });

    const result = await service.recoverDecision({
      decisionId: "decision_frozen",
      execute: true,
    });

    expect(result).toMatchObject({
      disposition: {
        state: "blocked",
        reasonCode: "production_context_invalid",
      },
      enqueued: false,
    });
    expect(productionQueue.enqueueProviderConversion).not.toHaveBeenCalled();
  });

  it("refuses to recover a decision from another provider", async () => {
    prisma.providerConversionDecisionAudit.findFirst.mockResolvedValue({
      id: "decision_umbler",
      workspaceId: "workspace_1",
      providerRuleId: "provider_rule_1",
    });
    decisions.findById.mockResolvedValue(
      frozenDecision({ provider: "umbler" }),
    );

    await expect(
      service.recoverDecision({ decisionId: "decision_umbler" }),
    ).rejects.toThrow(/uazapi/i);
    expect(orchestrator.orchestrate).not.toHaveBeenCalled();
  });

  it("records snapshots but does not evaluate re-delivery or label removal", async () => {
    prisma.uazapiChatLabelState.findUnique.mockResolvedValue({
      labelIds: ["554237420132:10"],
    });
    await expect(
      service.evaluateLabels({
        workspaceId: "workspace_1",
        instance: {
          id: "instance_1",
          workspaceId: "workspace_1",
          name: "NOD",
          providerInstanceId: "p1",
        },
        phone: "+5541999999999",
        waChatId: "5541999999999@s.whatsapp.net",
        labelIds: ["554237420132:10"],
      }),
    ).resolves.toEqual({ evaluated: false, eligibleExecutionId: null });
    await expect(
      service.evaluateLabels({
        workspaceId: "workspace_1",
        instance: {
          id: "instance_1",
          workspaceId: "workspace_1",
          name: "NOD",
          providerInstanceId: "p1",
        },
        phone: "+5541999999999",
        waChatId: "5541999999999@s.whatsapp.net",
        labelIds: [],
      }),
    ).resolves.toEqual({ evaluated: false, eligibleExecutionId: null });
    expect(prisma.uazapiChatLabelState.upsert).toHaveBeenCalledTimes(2);
    expect(decisionEngine.evaluate).not.toHaveBeenCalled();
  });
});
