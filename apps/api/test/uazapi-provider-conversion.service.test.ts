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

describe("UazapiProviderConversionService", () => {
  const prisma = {
    inboundWebhookChannel: { findFirst: vi.fn() },
    inboundWebhookDelivery: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    providerConversionRuleConfig: { findMany: vi.fn() },
  };
  const bridge = { ensureBridge: vi.fn() };
  const decisionEngine = { evaluate: vi.fn() };
  const decisions = { recordInitial: vi.fn() };
  const orchestrator = { orchestrate: vi.fn() };
  const paidLeads = { resolve: vi.fn() };
  const productionQueue = { enqueueProviderConversion: vi.fn() };

  const service = new UazapiProviderConversionService(
    prisma as never,
    enabledEnv() as never,
    bridge as never,
    decisionEngine as never,
    decisions as never,
    orchestrator as never,
    paidLeads as never,
    productionQueue as never,
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
    prisma.inboundWebhookDelivery.create.mockResolvedValue({ id: "delivery_1" });
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
});
