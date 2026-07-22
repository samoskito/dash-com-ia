import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
    $queryRaw: vi.fn(async () => [{ pg_advisory_xact_lock: null }]),
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
      updateMany: vi.fn(async () => ({ count: 1 })),
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
    $transaction: vi.fn(async (operation: any) => operation(transaction)),
  };
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
  const service = new ProviderConversionProductionService(
    prisma as never,
    payloadEncryption as never,
    parserRegistry,
    catalogs as never,
    routes as never,
    conversions as never,
    conversionQueue as never,
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
    conversionQueue,
    conversions,
    execution,
    executionUpdate,
    parsed,
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
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledWith(
      "conversion_1",
      workspaceId,
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
    );
    expect(harness.conversionQueue.enqueueSend).toHaveBeenCalledWith(
      "conversion_1",
      workspaceId,
    );
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
    );
    expect(harness.execution).toMatchObject({
      status: "materialized",
      leadId: "lead_1",
      conversionEventLogId: "conversion_1",
    });
  });
});
