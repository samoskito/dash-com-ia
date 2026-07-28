import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProviderConversionDecisionDto } from "@wpptrack/shared";
import { describe, expect, it, vi } from "vitest";
import { ExternalChannelBillingAccessError } from "../src/billing/external-channel-billing-access.service";
import { hashPhoneIdentity } from "../src/common/phone/phone-identity";
import { ProviderConversionProductionService } from "../src/inbound-webhook-production/provider-conversion-production.service";
import { InboundWebhookParserRegistry } from "../src/inbound-webhooks/providers/inbound-webhook-parser.registry";
import { parseUmblerAutomationV1 } from "../src/inbound-webhooks/providers/umbler/umbler-automation-v1.parser";

const workspaceId = "workspace_1";
const fixturePath = resolve(
  __dirname,
  "fixtures",
  "umbler",
  "message-with-ctwa.json",
);

function createHarness(
  input: {
    duplicateHoursAgo?: number;
    deliveryStatus?: string;
    automationEventName?: "QualifiedLead" | "Purchase";
    canonicalDecision?: boolean;
    serializeTransactions?: boolean;
  } = {},
) {
  const isAutomation = Boolean(input.automationEventName);
  const body = isAutomation
    ? {
        schema: "wpptrack.umbler.automation.v1",
        source: "umbler_tag_automation",
        automation:
          input.automationEventName === "QualifiedLead"
            ? "lead_qualificado"
            : "compra_aprovada",
        contact: { phone: "+5511999999999", name: "Redacted Test" },
        conversation: {
          id: "conversation_1",
          created_at_utc: "2026-07-18 12:00:00",
        },
      }
    : JSON.parse(readFileSync(fixturePath, "utf8"));
  if (!isAutomation) {
    body.Payload.Content.LastMessage.Source = "Bot";
    body.Payload.Content.LastMessage.BotInstance = { Id: "bot_1" };
    body.Payload.Content.LastMessage.SentByOrganizationMember = null;
    body.Payload.Content.LastMessage.Content =
      "Dados para confirmar o pedido\nTamanho: 4,90\nModelo: Nacional\n3.597,00";
  }
  const parserRegistry = new InboundWebhookParserRegistry();
  const parsed = isAutomation
    ? (() => {
        const result = parseUmblerAutomationV1(body);
        if (!result.ok) throw new Error("invalid automation test fixture");
        return {
          dedupeKey: result.value.externalExecutionKey,
          occurredAt: result.value.occurredAt,
          contact: { phoneNumber: result.value.phone },
        };
      })()
    : parserRegistry
        .resolve({
          provider: "umbler",
          parserVersion: "v1",
          parserReleaseStatus: "certified",
        })
        .parse(body).events[0]!;
  const activatedAt = new Date("2026-07-18T00:00:00.000Z");
  const execution: any = {
    id: "execution_1",
    workspaceId,
    providerRuleId: "provider_rule_1",
    sourceDeliveryId: "delivery_1",
    channelWorkspaceId: workspaceId,
    channelId: "channel_1",
    matchedCatalogVariantWorkspaceId: isAutomation ? null : workspaceId,
    matchedCatalogVariantId: isAutomation ? null : "variant_1",
    externalExecutionKey: parsed.dedupeKey,
    occurredAt: parsed.occurredAt,
    contactIdentityHash: hashPhoneIdentity(parsed.contact.phoneNumber),
    status: "eligible",
    reasonCode: isAutomation ? "automation_matched" : "catalog_matched",
    normalizedResult: isAutomation
      ? {
          schema: "wpptrack.umbler.automation.v1",
          automation:
            input.automationEventName === "QualifiedLead"
              ? "lead_qualificado"
              : "compra_aprovada",
        }
      : {
          items: [
            {
              position: 1,
              parsedAttributes: [
                { key: "tamanho", label: "Tamanho", value: "4,90" },
                { key: "modelo", label: "Modelo", value: "Nacional" },
              ],
              quantity: 1,
              catalogVariantId: "variant_1",
              unitValueCents: 359_700,
              subtotalValueCents: 359_700,
              contentName: "Cama elastica 4,90 Nacional",
            },
          ],
        },
    valueCents:
      input.automationEventName === "Purchase"
        ? 29_990
        : isAutomation
          ? null
          : 359_700,
    currency:
      input.automationEventName === "Purchase"
        ? "BRL"
        : isAutomation
          ? null
          : "BRL",
    leadId: null,
    conversionEventLogId: null,
    attemptCount: 0,
    lastAttemptedAt: null,
    processedAt: null,
    createdAt: activatedAt,
    updatedAt: activatedAt,
    providerDecisionWorkspaceId: null,
    providerDecisionId: null,
    providerDecision: null,
    providerRule: {
      id: "provider_rule_1",
      workspaceId,
      connectionId: "connection_1",
      parserReleaseId: isAutomation
        ? "inbound_parser_umbler_automation_v1"
        : "parser_release_1",
      mode: "production",
      productionActivatedAt: activatedAt,
      removedAt: null,
      messageTriggerPhrases: isAutomation
        ? null
        : ["Dados para confirmar o pedido"],
      messageAuthorScope: isAutomation ? null : "team",
      conversionRule: {
        active: true,
        triggerType: isAutomation
          ? "provider_automation"
          : "structured_catalog",
        eventName: input.automationEventName ?? "Purchase",
        defaultValueCents:
          input.automationEventName === "Purchase" ? 29_990 : null,
        defaultCurrency:
          input.automationEventName === "Purchase" ? "BRL" : null,
        defaultContentName:
          input.automationEventName === "Purchase" ? "Pedido medio" : null,
      },
      parserRelease: {
        id: isAutomation
          ? "inbound_parser_umbler_automation_v1"
          : "parser_release_1",
        version: isAutomation ? "automation-v1" : "v1",
        status: "certified",
      },
      connection: {
        id: "connection_1",
        provider: "umbler",
        status: "production",
        removedAt: null,
        parserReleaseId: "parser_release_1",
        parserRelease: {
          id: "parser_release_1",
          version: "v1",
          status: "certified",
        },
      },
      channels: [{ channelId: "channel_1" }],
      catalog: null,
    },
    sourceDelivery: {
      id: "delivery_1",
      workspaceId,
      connectionId: "connection_1",
      parserVersion: isAutomation ? "automation-v1" : "v1",
      purpose: isAutomation ? "conversion_automation" : "message_observation",
      providerRuleEndpointId: isAutomation ? "endpoint_1" : null,
      firstReceivedAt: new Date("2026-07-18T12:00:00.000Z"),
      payloadExpiresAt: new Date("2099-07-18T00:00:00.000Z"),
      encryptedPayload: "ciphertext",
      payloadIv: "iv",
      payloadTag: "tag",
      encryptionKeyVersion: 1,
    },
    channel: {
      id: "channel_1",
      status: "active",
      productionActivatedAt: activatedAt,
    },
    purchaseReview:
      input.automationEventName === "Purchase"
        ? {
            id: "review_automation_1",
            status: "recognized",
            effectiveValueCents: 29_990,
            currency: "BRL",
            items: [],
          }
        : null,
  };
  if (input.canonicalDecision) {
    const eventName = input.automationEventName ?? "Purchase";
    const triggerType = isAutomation
      ? "provider_automation"
      : "structured_catalog";
    const decision: ProviderConversionDecisionDto = {
      decisionCode: "eligible",
      engineVersion: "decision-v1",
      parserVersion: isAutomation ? "automation-v1" : "v1",
      reasonCode: isAutomation ? "automation_matched" : "catalog_matched",
      occurrence: {
        source: isAutomation ? "automation" : "message",
        provider: "umbler",
        workspaceId,
        connectionId: "connection_1",
        channelId: "channel_1",
        externalDeliveryId: "external_delivery_1",
        externalEventId: "external_event_1",
        externalMessageId: isAutomation ? null : "external_message_1",
        occurrenceKey: parsed.dedupeKey,
        businessDedupePolicy:
          eventName === "Purchase"
            ? {
                mode: "rolling_window",
                scopeKey: `Purchase:${workspaceId}:lead_1`,
                windowSeconds: 86_400,
              }
            : {
                mode: "lifetime",
                scopeKey: `QualifiedLead:${workspaceId}:lead_1`,
              },
        eventName,
        occurredAt: parsed.occurredAt.toISOString(),
        authorType: isAutomation ? null : "bot",
        contactIdentityHash: execution.contactIdentityHash,
      },
      rule: {
        providerRuleId: "provider_rule_1",
        conversionRuleId: "conversion_rule_1",
        version: "rule-v1:frozen",
        triggerType,
        eventName,
        mode: "production",
        active: true,
        authorScope: isAutomation ? null : "both",
        triggerPhrases: isAutomation
          ? []
          : ["Dados para confirmar o pedido"],
        defaultValueCents:
          input.automationEventName === "Purchase" ? 29_990 : null,
        defaultCurrency:
          input.automationEventName === "Purchase" ? "BRL" : null,
        defaultContentName:
          input.automationEventName === "Purchase" ? "Pedido medio" : null,
      },
      catalog: isAutomation
        ? null
        : {
            version: "catalog-v1:frozen",
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
        matchedTriggerPhrase: isAutomation
          ? null
          : "Dados para confirmar o pedido",
        items: isAutomation
          ? []
          : [
              {
                position: 1,
                parsedAttributes: [
                  { key: "tamanho", label: "Tamanho", value: "4,90" },
                  { key: "modelo", label: "Modelo", value: "Nacional" },
                ],
                quantity: 1,
                catalogVariantId: "variant_1",
                unitValueCents: 359_700,
                subtotalValueCents: 359_700,
                contentName: "Cama elastica 4,90 Nacional",
                reasonCode: "matched",
              },
            ],
        valueCents:
          eventName === "Purchase"
            ? isAutomation
              ? 29_990
              : 359_700
            : null,
        observedPaymentValueCents: null,
        currency: eventName === "Purchase" ? "BRL" : null,
        contentName:
          eventName === "Purchase"
            ? isAutomation
              ? "Pedido medio"
              : "Cama elastica 4,90 Nacional"
            : null,
      },
      leadResolution: {
        status: "resolved",
        reasonCode: "paid_lead_resolved",
        lead: {
          id: "lead_1",
          phoneHash: execution.contactIdentityHash,
          campaignId: "campaign_1",
          adSetId: "adset_1",
          adId: "ad_1",
          ctwaClid: "ctwa_1",
        },
      },
    };

    execution.providerDecisionWorkspaceId = workspaceId;
    execution.providerDecisionId = "decision_1";
    execution.providerDecision = {
      id: "decision_1",
      workspaceId,
      providerRuleId: execution.providerRuleId,
      sourceDeliveryId: execution.sourceDeliveryId,
      decisionCode: "eligible",
      eventName,
      occurredAt: execution.occurredAt,
      occurrenceKey: execution.externalExecutionKey,
      decisionVersion: 1,
      leadId: "lead_1",
      decisionJson: decision,
    };
    execution.leadId = "lead_1";
  }
  const duplicateOccurredAt = input.duplicateHoursAgo
    ? new Date(
        execution.occurredAt.getTime() -
          input.duplicateHoursAgo * 60 * 60 * 1_000,
      )
    : null;
  const executionFindFirst = vi.fn(async ({ where }: any) => {
    if (where.id && typeof where.id === "object") {
      if (!duplicateOccurredAt) return null;
      if (!where.occurredAt) return { id: "older_conversion" };
      return duplicateOccurredAt > where.occurredAt.gt &&
        duplicateOccurredAt < where.occurredAt.lt
        ? { id: "older_purchase" }
        : null;
    }
    return execution;
  });
  const executionUpdate = vi.fn(async ({ data }: any) => {
    if (data.attemptCount?.increment) {
      execution.attemptCount += data.attemptCount.increment;
    }
    if (typeof data.status === "string") execution.status = data.status;
    if (data.reasonCode !== undefined) execution.reasonCode = data.reasonCode;
    if (data.leadId !== undefined) execution.leadId = data.leadId;
    if (data.conversionEventLogId !== undefined) {
      execution.conversionEventLogId = data.conversionEventLogId;
    }
    return execution;
  });
  const transaction = {
    $queryRaw: vi.fn(async () => [{ lockAcquired: "" }]),
    providerConversionRuleExecution: {
      findFirst: executionFindFirst,
      update: executionUpdate,
    },
    purchaseReview: {
      update: vi.fn(async () => ({})),
    },
  };
  const prisma = {
    providerConversionRuleExecution: {
      findFirst: vi.fn(async () => execution),
      update: executionUpdate,
      updateMany: vi.fn(async ({ data }: any) => {
        if (typeof data.status === "string") execution.status = data.status;
        if (data.reasonCode !== undefined) execution.reasonCode = data.reasonCode;
        if (data.normalizedResult !== undefined) {
          execution.normalizedResult = data.normalizedResult;
        }
        return { count: 1 };
      }),
    },
    purchaseReview: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    lead: {
      findFirst: vi.fn(async () => ({
        id: "lead_1",
        phoneHash: execution.contactIdentityHash,
        campaignId: "campaign_1",
        adSetId: "adset_1",
        adId: "ad_1",
        ctwaClid: "ctwa_1",
      })),
    },
    conversionEventLog: {
      findFirst: vi.fn(async () => ({ status: "ready_to_send" })),
    },
    $transaction: vi.fn(),
  };
  let transactionTail = Promise.resolve();
  prisma.$transaction.mockImplementation(async (operation: any) => {
    if (!input.serializeTransactions) {
      return operation(transaction);
    }

    const previous = transactionTail;
    let release!: () => void;
    transactionTail = new Promise<void>((resolveTransaction) => {
      release = resolveTransaction;
    });
    await previous;
    try {
      return await operation(transaction);
    } finally {
      release();
    }
  });
  const payloadEncryption = {
    decrypt: vi.fn(() => Buffer.from(JSON.stringify(body), "utf8")),
  };
  const catalogs = {
    matchRuleMessage: vi.fn(async () => ({
      matched: true,
      reasonCode: "matched",
      parsedAttributes: [
        { key: "tamanho", label: "Tamanho", value: "4,90" },
        { key: "modelo", label: "Modelo", value: "Nacional" },
      ],
      parsedValueCents: 359_700,
      calculatedValueCents: 359_700,
      observedPaymentValueCents: 359_700,
      catalogVariantId: "variant_1",
      contentName: "Cama elastica 4,90 Nacional",
      currency: "BRL",
      matchedTriggerPhrase: "Dados para confirmar o pedido",
      classification: "recognized",
      items: [
        {
          position: 1,
          parsedAttributes: [
            { key: "tamanho", label: "Tamanho", value: "4,90" },
            { key: "modelo", label: "Modelo", value: "Nacional" },
          ],
          quantity: 1,
          catalogVariantId: "variant_1",
          unitValueCents: 359_700,
          subtotalValueCents: 359_700,
          contentName: "Cama elastica 4,90 Nacional",
        },
      ],
    })),
  };
  const routes = {
    previewRoute: vi.fn(async () => ({
      status: "resolved",
      reason: "route_resolved",
      reportingAccountId: "reporting_1",
      adAccountId: "act_1",
      businessConnectionId: "business_1",
      conversionDestinationId: "destination_1",
      pixelId: "pixel_1",
      pageId: "page_1",
    })),
  };
  const conversions = {
    recordExternalConversion: vi.fn(async () => ({
      conversionEventLogId: "conversion_1",
      status: "created",
      deliveryStatus: input.deliveryStatus ?? "ready_to_send",
    })),
  };
  const conversionQueue = {
    enqueueSend: vi.fn(async () => ({ status: "queued" })),
  };
  const billingAccess = {
    assertProductionAccess: vi.fn(async () => undefined),
  };
  const service = new ProviderConversionProductionService(
    prisma as never,
    payloadEncryption as never,
    parserRegistry,
    catalogs as never,
    routes as never,
    conversions as never,
    conversionQueue as never,
    billingAccess as never,
    {
      NODE_ENV: "test",
      API_PUBLIC_URL: "http://localhost:3333",
      INBOUND_WEBHOOKS_ENABLED: "true",
      INBOUND_WEBHOOK_PRODUCTION_ENABLED: "true",
      INBOUND_CONVERSION_RULES_ENABLED: "true",
      INBOUND_CONVERSION_PRODUCTION_ENABLED: "true",
      INBOUND_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString("base64"),
    },
  );

  return {
    billingAccess,
    catalogs,
    conversionQueue,
    conversions,
    execution,
    executionUpdate,
    payloadEncryption,
    parsed,
    prisma,
    routes,
    service,
    transaction,
  };
}

describe("provider conversion production service", () => {
  it("materializes and queues an attributed catalog purchase", async () => {
    const harness = createHarness();

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        eventName: "Purchase",
        sourceTrigger: "inbound_webhook:umbler:structured_catalog",
        leadId: "lead_1",
        adId: "ad_1",
        ctwaClid: "ctwa_1",
        valueCents: 359_700,
        valueSource: "actual",
        currency: "BRL",
        metaConversionDestinationId: "destination_1",
      }),
      harness.transaction,
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledWith(
      "conversion_1",
      workspaceId,
    );
    expect(harness.execution).toMatchObject({
      status: "materialized",
      leadId: "lead_1",
      conversionEventLogId: "conversion_1",
    });
    expect(harness.transaction.$queryRaw).toHaveBeenCalledOnce();
    const [queryParts, firstLockKey, secondLockKey] = harness.transaction
      .$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      number,
      number,
    ];
    expect(queryParts.join("?").match(/CAST\(\? AS integer\)/g)).toHaveLength(
      2,
    );
    expect(queryParts.join("?")).toMatch(
      /AS text\s*\)\s*AS "lockAcquired"/,
    );
    expect(Number.isInteger(firstLockKey)).toBe(true);
    expect(Number.isInteger(secondLockKey)).toBe(true);
  });

  it("blocks a second accepted purchase inside the rolling 24-hour window", async () => {
    const harness = createHarness({ duplicateHoursAgo: 23 });

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "duplicate" });

    expect(harness.conversions.recordExternalConversion).not.toHaveBeenCalled();
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
    expect(harness.execution).toMatchObject({
      status: "duplicate",
      reasonCode: "purchase_within_24h",
      leadId: "lead_1",
    });
  });

  it("accepts a repurchase exactly 24 hours after the previous purchase", async () => {
    const harness = createHarness({ duplicateHoursAgo: 24 });

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledOnce();
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledOnce();
  });

  it("keeps a billing-blocked conversion retryable without creating a Meta event", async () => {
    const harness = createHarness();
    harness.billingAccess.assertProductionAccess.mockRejectedValueOnce(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_contract_inactive",
      ),
    );

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).rejects.toMatchObject({
      code: "external_channel_billing_contract_inactive",
      retryable: true,
    });

    expect(harness.execution.status).toBe("failed");
    expect(harness.execution.reasonCode).toBe(
      "external_channel_billing_contract_inactive",
    );
    expect(harness.execution.normalizedResult).toMatchObject({
      technicalDelivery: {
        state: "failed_retryable",
        retryable: true,
        reasonCode: "external_channel_billing_contract_inactive",
      },
    });
    expect(harness.conversions.recordExternalConversion).not.toHaveBeenCalled();
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
  });

  it("does not enqueue a conversion that is no longer ready to send", async () => {
    const harness = createHarness({ deliveryStatus: "sent" });

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledOnce();
    expect(harness.conversionQueue.enqueueSend).not.toHaveBeenCalled();
  });

  it("materializes a manually approved average-value purchase without catalog items", async () => {
    const harness = createHarness();
    harness.execution.providerRule.conversionRule = {
      active: true,
      triggerType: "message_phrase",
      eventName: "Purchase",
      defaultValueCents: 29_990,
      defaultCurrency: "BRL",
      defaultContentName: "Pedido medio",
    };
    harness.execution.valueCents = 29_990;
    harness.execution.currency = "BRL";
    harness.execution.matchedCatalogVariantId = null;
    harness.execution.purchaseReview = {
      id: "review_1",
      status: "approved",
      effectiveValueCents: 29_990,
      currency: "BRL",
      items: [],
    };

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Purchase",
        sourceTrigger: "inbound_webhook:umbler:message_phrase",
        valueCents: 29_990,
        valueSource: "actual",
      }),
      harness.transaction,
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledWith(
      "conversion_1",
      workspaceId,
    );
    const [queryParts] = harness.transaction.$queryRaw.mock
      .calls[0] as unknown as [TemplateStringsArray, number, number];
    expect(queryParts.join("?")).toMatch(
      /AS text\s*\)\s*AS "lockAcquired"/,
    );
  });

  it("materializes a certified qualified-lead automation without monetary value", async () => {
    const harness = createHarness({ automationEventName: "QualifiedLead" });

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        eventName: "QualifiedLead",
        sourceTrigger: "inbound_webhook:umbler:provider_automation",
        leadId: "lead_1",
        adId: "ad_1",
        ctwaClid: "ctwa_1",
        valueCents: null,
        valueSource: null,
        currency: null,
        metaConversionDestinationId: "destination_1",
      }),
      harness.transaction,
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledWith(
      "conversion_1",
      workspaceId,
    );
  });

  it("honors a legacy audited replay recorded with attemptedAt", async () => {
    const harness = createHarness({ automationEventName: "QualifiedLead" });
    const activatedAfterCallback = new Date("2026-07-18T13:00:00.000Z");
    harness.execution.providerRule.productionActivatedAt =
      activatedAfterCallback;
    harness.execution.channel.productionActivatedAt = activatedAfterCallback;
    harness.execution.normalizedResult.manualReplayApproval = {
      approved: true,
      attemptedAt: "2026-07-22T18:00:00.000Z",
      actorUserId: "manager_1",
    };

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "QualifiedLead",
        leadId: "lead_1",
      }),
      harness.transaction,
    );
  });

  it("keeps pre-activation automation callbacks blocked without manual approval", async () => {
    const harness = createHarness({ automationEventName: "QualifiedLead" });
    const activatedAfterCallback = new Date("2026-07-18T13:00:00.000Z");
    harness.execution.providerRule.productionActivatedAt =
      activatedAfterCallback;
    harness.execution.channel.productionActivatedAt = activatedAfterCallback;

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).rejects.toMatchObject({
      code: "provider_conversion_production_context_invalid",
    });
  });

  it("materializes a certified purchase automation with the configured average", async () => {
    const harness = createHarness({ automationEventName: "Purchase" });

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        eventName: "Purchase",
        sourceTrigger: "inbound_webhook:umbler:provider_automation",
        valueCents: 29_990,
        valueSource: "configured_average",
        currency: "BRL",
        contentName: "Pedido medio",
      }),
      harness.transaction,
    );
    expect(harness.execution).toMatchObject({
      status: "materialized",
      leadId: "lead_1",
      conversionEventLogId: "conversion_1",
    });
  });

  it("materializes a canonical purchase from the frozen decision without reparsing mutable input", async () => {
    const harness = createHarness({ canonicalDecision: true });
    harness.execution.providerRule.conversionRule.defaultValueCents = 1;
    harness.payloadEncryption.decrypt.mockImplementation(() => {
      throw new Error("raw payload must not be read");
    });
    harness.catalogs.matchRuleMessage.mockRejectedValue(
      new Error("mutable catalog must not be read"),
    );

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.payloadEncryption.decrypt).not.toHaveBeenCalled();
    expect(harness.catalogs.matchRuleMessage).not.toHaveBeenCalled();
    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Purchase",
        sourceEventId: "external_message_1",
        sourceTrigger: "inbound_webhook:umbler:structured_catalog",
        leadId: "lead_1",
        valueCents: 359_700,
        currency: "BRL",
        sourcePayload: expect.objectContaining({
          providerConversionDecisionId: "decision_1",
          providerConversionDecisionVersion: 1,
          processingMode: "frozen_provider_conversion",
        }),
      }),
      harness.transaction,
    );
  });

  it("materializes a canonical qualified lead from frozen attribution", async () => {
    const harness = createHarness({
      automationEventName: "QualifiedLead",
      canonicalDecision: true,
    });

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.payloadEncryption.decrypt).not.toHaveBeenCalled();
    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "QualifiedLead",
        sourceTrigger: "inbound_webhook:umbler:provider_automation",
        leadId: "lead_1",
        adId: "ad_1",
        ctwaClid: "ctwa_1",
        valueCents: null,
        currency: null,
      }),
      harness.transaction,
    );
  });

  it("does not retry a permanent canonical decision failure", async () => {
    const harness = createHarness({ canonicalDecision: true });
    harness.execution.providerDecision.decisionJson = {
      decisionCode: "eligible",
    };

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).rejects.toMatchObject({
      code: "provider_conversion_frozen_decision_mismatch",
    });
    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "unchanged" });

    expect(harness.execution).toMatchObject({
      status: "failed",
      reasonCode: "provider_conversion_frozen_decision_mismatch",
      attemptCount: 1,
      normalizedResult: {
        technicalDelivery: {
          state: "failed_permanent",
          retryable: false,
        },
      },
    });
    expect(harness.conversions.recordExternalConversion).not.toHaveBeenCalled();
  });

  it("retries an unexpected canonical infrastructure failure with the same decision", async () => {
    const harness = createHarness({ canonicalDecision: true });
    harness.routes.previewRoute.mockRejectedValueOnce(
      new Error("temporary routing dependency failure"),
    );

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).rejects.toMatchObject({
      code: "provider_conversion_production_unexpected",
    });
    expect(harness.execution).toMatchObject({
      status: "failed",
      normalizedResult: {
        technicalDelivery: {
          state: "failed_retryable",
          retryable: true,
        },
      },
    });

    await expect(
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ).resolves.toEqual({ status: "materialized" });

    expect(harness.payloadEncryption.decrypt).not.toHaveBeenCalled();
    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledOnce();
    expect(harness.execution.attemptCount).toBe(2);
  });

  it("creates at most one event when canonical workers run concurrently", async () => {
    const harness = createHarness({
      canonicalDecision: true,
      serializeTransactions: true,
    });

    await Promise.all([
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
      harness.service.processExecution({
        providerConversionExecutionId: harness.execution.id,
        workspaceId,
      }),
    ]);

    expect(harness.conversions.recordExternalConversion).toHaveBeenCalledOnce();
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledOnce();
    expect(harness.execution.status).toBe("materialized");
  });
});
