import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { StructuredCatalogTestMessageResultDto } from "@wpptrack/shared";
import { hashPhoneIdentity } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import type { ProviderConversionProductionJobPayload } from "../common/queue/queue.constants";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";
import { ConversionCatalogService } from "../conversion-rules/conversion-catalog.service";
import {
  matchProviderMessageTrigger,
  providerMessageAuthorAllowed,
} from "../conversion-rules/structured-catalog-message.parser";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { InboundWebhookMetaRouteReaderService } from "../inbound-webhooks/inbound-webhook-meta-route-reader.service";
import { InboundWebhookPayloadEncryptionService } from "../inbound-webhooks/inbound-webhook-payload-encryption.service";
import type { ParsedInboundWebhookEvent } from "../inbound-webhooks/providers/inbound-webhook-parser";
import { InboundWebhookParserRegistry } from "../inbound-webhooks/providers/inbound-webhook-parser.registry";
import {
  parseUmblerAutomationV1,
  type ParsedUmblerAutomationV1,
  UMBLER_AUTOMATION_V1_PARSER_VERSION,
} from "../inbound-webhooks/providers/umbler/umbler-automation-v1.parser";

const PURCHASE_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const terminalStatuses = new Set(["materialized", "duplicate", "blocked"]);
const executionInclude = {
  providerRule: {
    include: {
      conversionRule: true,
      parserRelease: true,
      connection: {
        include: {
          parserRelease: true,
        },
      },
      channels: true,
      catalog: {
        include: {
          variants: true,
        },
      },
    },
  },
  sourceDelivery: true,
  channel: true,
  purchaseReview: {
    include: {
      items: { orderBy: { position: "asc" } },
    },
  },
} satisfies Prisma.ProviderConversionRuleExecutionInclude;

type ExecutionRecord = Prisma.ProviderConversionRuleExecutionGetPayload<{
  include: typeof executionInclude;
}>;

class ProviderConversionProductionFailure extends Error {
  constructor(readonly code: string) {
    super("Provider conversion production failed");
    this.name = "ProviderConversionProductionFailure";
  }
}

@Injectable()
export class ProviderConversionProductionService {
  private readonly logger = new Logger(
    ProviderConversionProductionService.name,
  );

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InboundWebhookPayloadEncryptionService)
    private readonly payloadEncryption: InboundWebhookPayloadEncryptionService,
    @Inject(InboundWebhookParserRegistry)
    private readonly parserRegistry: InboundWebhookParserRegistry,
    @Inject(ConversionCatalogService)
    private readonly catalogs: ConversionCatalogService,
    @Inject(InboundWebhookMetaRouteReaderService)
    private readonly routes: InboundWebhookMetaRouteReaderService,
    @Inject(ConversionEventsService)
    private readonly conversions: ConversionEventsService,
    @Inject(ConversionEventsQueueService)
    private readonly conversionQueue: ConversionEventsQueueService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv = process.env,
  ) {}

  async processExecution(
    input: Readonly<ProviderConversionProductionJobPayload>,
  ): Promise<{ status: "materialized" | "duplicate" | "unchanged" }> {
    this.assertInput(input);
    if (!this.productionEnabled()) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_production_disabled",
      );
    }

    const execution = await this.loadExecution(input);
    if (!execution) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_execution_not_found",
      );
    }
    if (execution.status === "materialized") {
      await this.enqueueMaterialized(execution);
      return { status: "unchanged" };
    }
    if (terminalStatuses.has(execution.status)) {
      return { status: "unchanged" };
    }
    if (!["eligible", "failed"].includes(execution.status)) {
      return { status: "unchanged" };
    }

    await this.prisma.providerConversionRuleExecution.update({
      where: { id: execution.id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptedAt: new Date(),
        reasonCode: null,
      },
    });

    try {
      const materialized = await this.materialize(execution);
      if (materialized.status === "duplicate") {
        return materialized;
      }

      if (materialized.queueRequired) {
        await this.conversionQueue.enqueueSend(
          materialized.conversionEventLogId,
          execution.workspaceId,
        );
      }
      return { status: "materialized" };
    } catch (error) {
      const code = this.errorCode(error);
      const failure = this.failureSummary(error, code);
      const normalizedResult = this.jsonObject(execution.normalizedResult);
      await this.prisma.providerConversionRuleExecution.updateMany({
        where: {
          id: execution.id,
          workspaceId: execution.workspaceId,
          status: { in: ["eligible", "failed"] },
        },
        data: {
          status: "failed",
          reasonCode: code,
          processedAt: new Date(),
          normalizedResult: {
            ...(normalizedResult ?? {}),
            lastProductionFailure: failure,
          } as Prisma.InputJsonValue,
        },
      });
      await this.prisma.purchaseReview.updateMany({
        where: {
          providerExecutionId: execution.id,
          workspaceId: execution.workspaceId,
          status: { in: ["recognized", "approved", "failed"] },
        },
        data: {
          status: "failed",
          reasonCode: code,
          version: { increment: 1 },
        },
      });
      if (code === "provider_conversion_production_unexpected") {
        this.logger.error(
          `Provider conversion ${execution.id} failed with ${code}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
      throw new ProviderConversionProductionFailure(code);
    }
  }

  private async materialize(execution: ExecutionRecord): Promise<
    | { status: "duplicate" }
    | {
        status: "materialized";
        conversionEventLogId: string;
        queueRequired: boolean;
      }
  > {
    if (
      execution.providerRule.conversionRule.triggerType ===
      "provider_automation"
    ) {
      return this.materializeAutomation(execution);
    }

    this.assertProductionContext(execution);
    const parsedEvent = this.reparseEvent(execution);
    const match = await this.matchExecution(execution, parsedEvent);
    const manualOverride = execution.purchaseReview?.status === "approved";
    const purchase = manualOverride
      ? this.reviewPurchase(execution)
      : this.matchedPurchase(match);

    if (
      !purchase ||
      (!manualOverride && !this.matchConsistent(execution, match))
    ) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_catalog_mismatch",
      );
    }
    if (!execution.contactIdentityHash) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_identity_missing",
      );
    }

    const lead = await this.prisma.lead.findFirst({
      where: {
        workspaceId: execution.workspaceId,
        phoneHash: execution.contactIdentityHash,
      },
      select: {
        id: true,
        phoneHash: true,
        campaignId: true,
        adSetId: true,
        adId: true,
        ctwaClid: true,
      },
    });
    if (!lead?.adId || !lead.ctwaClid) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_paid_lead_missing",
      );
    }

    const route = await this.routes.previewRoute({
      workspaceId: execution.workspaceId,
      adId: lead.adId,
    });
    if (
      route.status !== "resolved" ||
      !route.reportingAccountId ||
      !route.adAccountId ||
      !route.businessConnectionId ||
      !route.conversionDestinationId
    ) {
      throw new ProviderConversionProductionFailure(
        `provider_conversion_route_${route.reason}`,
      );
    }

    const lock = this.lockKeys(
      execution.workspaceId,
      lead.phoneHash,
      "Purchase",
    );
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          CAST(${lock.first} AS integer),
          CAST(${lock.second} AS integer)
        )
      `;

      const current =
        await transaction.providerConversionRuleExecution.findFirst({
          where: {
            id: execution.id,
            workspaceId: execution.workspaceId,
          },
          select: { status: true },
        });
      if (current?.status === "materialized") {
        return {
          status: "materialized" as const,
          conversionEventLogId: execution.conversionEventLogId!,
          queueRequired: false,
        };
      }
      if (current?.status === "duplicate") {
        return { status: "duplicate" as const };
      }
      if (!current || !["eligible", "failed"].includes(current.status)) {
        throw new ProviderConversionProductionFailure(
          "provider_conversion_execution_state_changed",
        );
      }

      const duplicate =
        await transaction.providerConversionRuleExecution.findFirst({
          where: {
            id: { not: execution.id },
            workspaceId: execution.workspaceId,
            contactIdentityHash: lead.phoneHash,
            status: "materialized",
            occurredAt: {
              gt: new Date(
                execution.occurredAt.getTime() - PURCHASE_DEDUPE_WINDOW_MS,
              ),
              lt: new Date(
                execution.occurredAt.getTime() + PURCHASE_DEDUPE_WINDOW_MS,
              ),
            },
            providerRule: {
              conversionRule: { eventName: "Purchase" },
            },
          },
          select: { id: true },
        });

      if (duplicate) {
        await transaction.providerConversionRuleExecution.update({
          where: { id: execution.id },
          data: {
            status: "duplicate",
            reasonCode: "purchase_within_24h",
            leadId: lead.id,
            processedAt: new Date(),
          },
        });
        if (execution.purchaseReview) {
          await transaction.purchaseReview.update({
            where: { id: execution.purchaseReview.id },
            data: {
              status: "duplicate",
              reasonCode: "purchase_within_24h",
              leadWorkspaceId: execution.workspaceId,
              leadId: lead.id,
              decidedAt: new Date(),
              version: { increment: 1 },
            },
          });
        }
        return { status: "duplicate" as const };
      }

      const conversion = await this.conversions.recordExternalConversion(
        {
          workspaceId: execution.workspaceId,
          externalConnectorId: null,
          sourceEventId: parsedEvent.externalMessageId,
          sourceTrigger: `inbound_webhook:umbler:${execution.providerRule.conversionRule.triggerType}`,
          eventName: "Purchase",
          eventId: this.metaEventId(execution.id, "Purchase"),
          dedupeKey: `provider-conversion:${execution.id}`,
          leadId: lead.id,
          phoneHash: lead.phoneHash,
          businessSource: "paid",
          metaAccountId: route.adAccountId,
          metaBusinessConnectionId: route.businessConnectionId,
          metaConversionDestinationId: route.conversionDestinationId,
          campaignId: lead.campaignId,
          adSetId: lead.adSetId,
          adId: lead.adId,
          ctwaClid: lead.ctwaClid,
          valueCents: purchase.valueCents,
          valueSource: "actual",
          currency: purchase.currency,
          contentName: purchase.contentName,
          eventOccurredAt: execution.occurredAt,
          sourcePayload: {
            provider: "umbler",
            providerRuleId: execution.providerRuleId,
            providerConversionExecutionId: execution.id,
            sourceDeliveryId: execution.sourceDeliveryId,
            channelId: execution.channelId,
            catalogVariantId: match.catalogVariantId,
            purchaseReviewId: execution.purchaseReview?.id ?? null,
            items: purchase.items,
            manualReviewOverride: manualOverride,
            processingMode: "live_provider_conversion",
          },
        },
        transaction,
      );

      await transaction.providerConversionRuleExecution.update({
        where: { id: execution.id },
        data: {
          status: "materialized",
          reasonCode: null,
          leadId: lead.id,
          conversionEventLogId: conversion.conversionEventLogId,
          processedAt: new Date(),
        },
      });
      if (execution.purchaseReview) {
        await transaction.purchaseReview.update({
          where: { id: execution.purchaseReview.id },
          data: {
            status: "approved",
            leadWorkspaceId: execution.workspaceId,
            leadId: lead.id,
            conversionEventLogId: conversion.conversionEventLogId,
            effectiveValueCents: purchase.valueCents,
            currency: purchase.currency,
            reasonCode: null,
            version: { increment: 1 },
          },
        });
      }

      return {
        status: "materialized" as const,
        conversionEventLogId: conversion.conversionEventLogId,
        queueRequired: conversion.deliveryStatus === "ready_to_send",
      };
    });

    return result;
  }

  private async materializeAutomation(execution: ExecutionRecord): Promise<
    | { status: "duplicate" }
    | {
        status: "materialized";
        conversionEventLogId: string;
        queueRequired: boolean;
      }
  > {
    this.assertAutomationProductionContext(execution);
    const parsed = this.reparseAutomation(execution);
    const rule = execution.providerRule.conversionRule;
    const contactIdentityHash = hashPhoneIdentity(parsed.phone);

    if (
      parsed.externalExecutionKey !== execution.externalExecutionKey ||
      parsed.eventName !== rule.eventName ||
      !contactIdentityHash ||
      contactIdentityHash !== execution.contactIdentityHash
    ) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_source_event_mismatch",
      );
    }

    const lead = await this.prisma.lead.findFirst({
      where: {
        workspaceId: execution.workspaceId,
        phoneHash: contactIdentityHash,
      },
      select: {
        id: true,
        phoneHash: true,
        campaignId: true,
        adSetId: true,
        adId: true,
        ctwaClid: true,
      },
    });
    if (!lead?.adId || !lead.ctwaClid) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_paid_lead_missing",
      );
    }

    const route = await this.routes.previewRoute({
      workspaceId: execution.workspaceId,
      adId: lead.adId,
    });
    if (
      route.status !== "resolved" ||
      !route.reportingAccountId ||
      !route.adAccountId ||
      !route.businessConnectionId ||
      !route.conversionDestinationId
    ) {
      throw new ProviderConversionProductionFailure(
        `provider_conversion_route_${route.reason}`,
      );
    }

    const isPurchase = parsed.eventName === "Purchase";
    const valueCents = isPurchase ? rule.defaultValueCents : null;
    const currency = isPurchase ? rule.defaultCurrency : null;
    if (isPurchase && (!valueCents || !currency)) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_value_missing",
      );
    }

    const lock = this.lockKeys(
      execution.workspaceId,
      lead.phoneHash,
      parsed.eventName,
    );
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          CAST(${lock.first} AS integer),
          CAST(${lock.second} AS integer)
        )
      `;

      const current =
        await transaction.providerConversionRuleExecution.findFirst({
          where: {
            id: execution.id,
            workspaceId: execution.workspaceId,
          },
          select: { status: true },
        });
      if (current?.status === "materialized") {
        return {
          status: "materialized" as const,
          conversionEventLogId: execution.conversionEventLogId!,
          queueRequired: false,
        };
      }
      if (current?.status === "duplicate") {
        return { status: "duplicate" as const };
      }
      if (!current || !["eligible", "failed"].includes(current.status)) {
        throw new ProviderConversionProductionFailure(
          "provider_conversion_execution_state_changed",
        );
      }

      const duplicate =
        await transaction.providerConversionRuleExecution.findFirst({
          where: {
            id: { not: execution.id },
            workspaceId: execution.workspaceId,
            contactIdentityHash: lead.phoneHash,
            status: "materialized",
            ...(isPurchase
              ? {
                  occurredAt: {
                    gt: new Date(
                      execution.occurredAt.getTime() -
                        PURCHASE_DEDUPE_WINDOW_MS,
                    ),
                    lt: new Date(
                      execution.occurredAt.getTime() +
                        PURCHASE_DEDUPE_WINDOW_MS,
                    ),
                  },
                }
              : {}),
            providerRule: {
              conversionRule: { eventName: parsed.eventName },
            },
          },
          select: { id: true },
        });

      if (duplicate) {
        const reasonCode = isPurchase
          ? "purchase_within_24h"
          : "qualified_lead_already_materialized";
        await transaction.providerConversionRuleExecution.update({
          where: { id: execution.id },
          data: {
            status: "duplicate",
            reasonCode,
            leadId: lead.id,
            processedAt: new Date(),
          },
        });
        if (execution.purchaseReview) {
          await transaction.purchaseReview.update({
            where: { id: execution.purchaseReview.id },
            data: {
              status: "duplicate",
              reasonCode,
              leadWorkspaceId: execution.workspaceId,
              leadId: lead.id,
              decidedAt: new Date(),
              version: { increment: 1 },
            },
          });
        }
        return { status: "duplicate" as const };
      }

      const conversion = await this.conversions.recordExternalConversion(
        {
          workspaceId: execution.workspaceId,
          externalConnectorId: null,
          sourceEventId: parsed.externalExecutionKey,
          sourceTrigger: "inbound_webhook:umbler:provider_automation",
          eventName: parsed.eventName,
          eventId: this.metaEventId(execution.id, parsed.eventName),
          dedupeKey: `provider-conversion:${execution.id}`,
          leadId: lead.id,
          phoneHash: lead.phoneHash,
          businessSource: "paid",
          metaAccountId: route.adAccountId,
          metaBusinessConnectionId: route.businessConnectionId,
          metaConversionDestinationId: route.conversionDestinationId,
          campaignId: lead.campaignId,
          adSetId: lead.adSetId,
          adId: lead.adId,
          ctwaClid: lead.ctwaClid,
          valueCents,
          valueSource: isPurchase ? "configured_average" : null,
          currency,
          contentName: isPurchase ? rule.defaultContentName : null,
          eventOccurredAt: execution.occurredAt,
          sourcePayload: {
            provider: "umbler",
            providerRuleId: execution.providerRuleId,
            providerConversionExecutionId: execution.id,
            sourceDeliveryId: execution.sourceDeliveryId,
            channelId: execution.channelId,
            automation: parsed.automation,
            purchaseReviewId: execution.purchaseReview?.id ?? null,
            processingMode: "live_provider_automation",
          },
        },
        transaction,
      );

      await transaction.providerConversionRuleExecution.update({
        where: { id: execution.id },
        data: {
          status: "materialized",
          reasonCode: null,
          leadId: lead.id,
          conversionEventLogId: conversion.conversionEventLogId,
          processedAt: new Date(),
        },
      });
      if (execution.purchaseReview) {
        await transaction.purchaseReview.update({
          where: { id: execution.purchaseReview.id },
          data: {
            status: "approved",
            leadWorkspaceId: execution.workspaceId,
            leadId: lead.id,
            conversionEventLogId: conversion.conversionEventLogId,
            effectiveValueCents: valueCents,
            currency: currency ?? "BRL",
            reasonCode: null,
            version: { increment: 1 },
          },
        });
      }

      return {
        status: "materialized" as const,
        conversionEventLogId: conversion.conversionEventLogId,
        queueRequired: conversion.deliveryStatus === "ready_to_send",
      };
    });
  }

  private async matchExecution(
    execution: ExecutionRecord,
    event: ParsedInboundWebhookEvent,
  ): Promise<StructuredCatalogTestMessageResultDto> {
    if (
      execution.providerRule.conversionRule.triggerType === "structured_catalog"
    ) {
      return this.catalogs.matchRuleMessage(
        execution.workspaceId,
        execution.providerRuleId,
        event.message.text!,
      );
    }

    const rule = execution.providerRule;
    const matchedTriggerPhrase = matchProviderMessageTrigger(
      event.message.text!,
      rule.messageTriggerPhrases,
    );
    const valueCents = rule.conversionRule.defaultValueCents;
    const currency = rule.conversionRule.defaultCurrency;
    const matched = Boolean(matchedTriggerPhrase && valueCents && currency);

    return {
      matched,
      reasonCode: matched ? "matched" : "trigger_missing",
      classification: matched ? "recognized" : "ignored",
      matchedTriggerPhrase,
      parsedAttributes: [],
      items: [],
      parsedValueCents: matched ? valueCents : null,
      calculatedValueCents: matched ? valueCents : null,
      observedPaymentValueCents: null,
      catalogVariantId: null,
      contentName: rule.conversionRule.defaultContentName,
      currency,
    };
  }

  private matchConsistent(
    execution: ExecutionRecord,
    match: StructuredCatalogTestMessageResultDto,
  ): boolean {
    if (
      !match.matched ||
      match.calculatedValueCents !== execution.valueCents ||
      match.currency !== execution.currency
    ) {
      return false;
    }

    const normalized = this.jsonObject(execution.normalizedResult);
    return this.jsonEquals(normalized?.items, match.items);
  }

  private matchedPurchase(match: StructuredCatalogTestMessageResultDto): {
    valueCents: number;
    currency: string;
    contentName: string | null;
    items: unknown[];
  } | null {
    if (!match.matched || !match.calculatedValueCents || !match.currency) {
      return null;
    }

    return {
      valueCents: match.calculatedValueCents,
      currency: match.currency,
      contentName: match.contentName,
      items: match.items,
    };
  }

  private reviewPurchase(execution: ExecutionRecord): {
    valueCents: number;
    currency: string;
    contentName: string | null;
    items: unknown[];
  } | null {
    const review = execution.purchaseReview;
    const catalogPurchase =
      execution.providerRule.conversionRule.triggerType ===
      "structured_catalog";
    if (
      !review?.effectiveValueCents ||
      (catalogPurchase && review.items.length === 0)
    ) {
      return null;
    }

    const items = review.items.map((item) => ({
      catalogVariantId: item.catalogVariantId,
      attributeValues: this.stringArray(item.attributeValues),
      quantity: item.quantity,
      unitValueCents: item.unitValueCents,
      subtotalValueCents: item.subtotalValueCents,
      contentName: item.contentName,
    }));
    if (
      catalogPurchase &&
      items.some(
        (item) =>
          !item.catalogVariantId ||
          !item.unitValueCents ||
          !item.subtotalValueCents,
      )
    ) {
      return null;
    }

    const names = [
      ...new Set(
        items
          .map((item) => item.contentName)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    return {
      valueCents: review.effectiveValueCents,
      currency: review.currency,
      contentName:
        names.length === 1
          ? names[0]
          : execution.providerRule.conversionRule.defaultContentName,
      items,
    };
  }

  private jsonObject(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private jsonEquals(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private automationManualReplayApproved(execution: ExecutionRecord): boolean {
    const normalized = this.jsonObject(execution.normalizedResult);
    const approval = this.jsonObject(
      (normalized?.manualReplayApproval ?? null) as Prisma.JsonValue | null,
    );
    const approvedAt = approval?.approvedAt ?? approval?.attemptedAt;

    return (
      approval?.approved === true &&
      this.identifier(approval.actorUserId) &&
      typeof approvedAt === "string"
    );
  }

  private stringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private assertProductionContext(execution: ExecutionRecord): void {
    const rule = execution.providerRule;
    const delivery = execution.sourceDelivery;
    const channel = execution.channel;
    const manuallyApproved = execution.purchaseReview?.status === "approved";
    const channelScoped = rule.channels.some(
      (scope) => scope.channelId === execution.channelId,
    );

    if (
      rule.removedAt ||
      !rule.conversionRule.active ||
      !["structured_catalog", "message_phrase"].includes(
        rule.conversionRule.triggerType,
      ) ||
      rule.conversionRule.eventName !== "Purchase" ||
      (!manuallyApproved && rule.mode !== "production") ||
      (!manuallyApproved && !rule.productionActivatedAt) ||
      rule.parserRelease.status !== "certified" ||
      rule.connection.removedAt ||
      rule.connection.status !== "production" ||
      rule.connection.parserRelease.status !== "certified" ||
      rule.connectionId !== delivery.connectionId ||
      rule.parserReleaseId !== rule.connection.parserReleaseId ||
      rule.connection.parserRelease.version !== delivery.parserVersion ||
      !channel ||
      channel.status !== "active" ||
      !channel.productionActivatedAt ||
      !channelScoped ||
      (!manuallyApproved &&
        rule.productionActivatedAt !== null &&
        delivery.firstReceivedAt < rule.productionActivatedAt) ||
      delivery.firstReceivedAt < channel.productionActivatedAt
    ) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_production_context_invalid",
      );
    }
  }

  private assertAutomationProductionContext(execution: ExecutionRecord): void {
    const rule = execution.providerRule;
    const delivery = execution.sourceDelivery;
    const channel = execution.channel;
    const manuallyApproved = this.automationManualReplayApproved(execution);
    const channelScoped = rule.channels.some(
      (scope) => scope.channelId === execution.channelId,
    );

    if (
      rule.removedAt ||
      !rule.conversionRule.active ||
      rule.conversionRule.triggerType !== "provider_automation" ||
      !["QualifiedLead", "Purchase"].includes(rule.conversionRule.eventName) ||
      rule.mode !== "production" ||
      !rule.productionActivatedAt ||
      rule.parserRelease.status !== "certified" ||
      rule.parserRelease.version !== UMBLER_AUTOMATION_V1_PARSER_VERSION ||
      rule.connection.removedAt ||
      rule.connection.status !== "production" ||
      rule.connection.parserRelease.status !== "certified" ||
      rule.connectionId !== delivery.connectionId ||
      delivery.parserVersion !== UMBLER_AUTOMATION_V1_PARSER_VERSION ||
      delivery.purpose !== "conversion_automation" ||
      delivery.providerRuleEndpointId === null ||
      !channel ||
      channel.status !== "active" ||
      !channel.productionActivatedAt ||
      !channelScoped ||
      (!manuallyApproved &&
        delivery.firstReceivedAt < rule.productionActivatedAt) ||
      (!manuallyApproved &&
        delivery.firstReceivedAt < channel.productionActivatedAt)
    ) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_production_context_invalid",
      );
    }
  }

  private reparseAutomation(
    execution: ExecutionRecord,
  ): ParsedUmblerAutomationV1 {
    const parsed = parseUmblerAutomationV1(this.decryptedPayload(execution));
    if (!parsed.ok) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_payload_invalid",
      );
    }
    return parsed.value;
  }

  private reparseEvent(execution: ExecutionRecord): ParsedInboundWebhookEvent {
    const payload = this.decryptedPayload(execution);

    const rule = execution.providerRule;
    const parser = this.parserRegistry.resolve({
      provider: rule.connection.provider,
      parserVersion: rule.connection.parserRelease.version,
      parserReleaseStatus: rule.connection.parserRelease.status,
    });
    const result = parser.parse(payload);
    const parsedEvent = result.events.find(
      (event) => event.dedupeKey === execution.externalExecutionKey,
    );

    if (
      result.error ||
      !parsedEvent ||
      parsedEvent.provider !== "umbler" ||
      !providerMessageAuthorAllowed(
        rule.messageAuthorScope ?? "team",
        parsedEvent.message.authorType,
      ) ||
      parsedEvent.message.isPrivate ||
      !parsedEvent.message.text
    ) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_source_event_mismatch",
      );
    }

    return parsedEvent;
  }

  private decryptedPayload(execution: ExecutionRecord): unknown {
    const delivery = execution.sourceDelivery;
    if (
      delivery.payloadExpiresAt <= new Date() ||
      !delivery.encryptedPayload ||
      !delivery.payloadIv ||
      !delivery.payloadTag ||
      delivery.encryptionKeyVersion === null
    ) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_payload_unavailable",
      );
    }

    const decrypted = this.payloadEncryption.decrypt(
      {
        encryptedPayload: delivery.encryptedPayload,
        payloadIv: delivery.payloadIv,
        payloadTag: delivery.payloadTag,
        encryptionKeyVersion: delivery.encryptionKeyVersion,
      },
      {
        workspaceId: delivery.workspaceId,
        connectionId: delivery.connectionId,
        deliveryId: delivery.id,
      },
    );
    try {
      return JSON.parse(decrypted.toString("utf8")) as unknown;
    } catch {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_payload_invalid",
      );
    }
  }

  private loadExecution(
    input: Readonly<ProviderConversionProductionJobPayload>,
  ): Promise<ExecutionRecord | null> {
    return this.prisma.providerConversionRuleExecution.findFirst({
      where: {
        id: input.providerConversionExecutionId,
        workspaceId: input.workspaceId,
      },
      include: executionInclude,
    });
  }

  private async enqueueMaterialized(execution: ExecutionRecord): Promise<void> {
    if (!execution.conversionEventLogId) return;
    const conversion = await this.prisma.conversionEventLog.findFirst({
      where: {
        id: execution.conversionEventLogId,
        workspaceId: execution.workspaceId,
      },
      select: { status: true },
    });
    if (conversion?.status === "ready_to_send") {
      await this.conversionQueue.enqueueSend(
        execution.conversionEventLogId,
        execution.workspaceId,
      );
    }
  }

  private lockKeys(
    workspaceId: string,
    phoneHash: string,
    eventName: string,
  ): {
    first: number;
    second: number;
  } {
    const digest = createHash("sha256")
      .update(`${workspaceId}\0${phoneHash}\0${eventName}`, "utf8")
      .digest();

    return {
      first: digest.readInt32BE(0),
      second: digest.readInt32BE(4),
    };
  }

  private metaEventId(executionId: string, eventName: string): string {
    const digest = createHash("sha256").update(executionId).digest("hex");
    const prefix = eventName === "QualifiedLead" ? "qualified" : "purchase";
    return `umbler_${prefix}_${digest}`;
  }

  private productionEnabled(): boolean {
    const config = parseInboundWebhooksConfig(this.env);
    return (
      config.enabled &&
      config.productionEnabled &&
      config.conversionRulesEnabled &&
      config.conversionProductionEnabled
    );
  }

  private assertInput(
    input: Readonly<ProviderConversionProductionJobPayload>,
  ): void {
    if (
      !input ||
      !this.identifier(input.providerConversionExecutionId) ||
      !this.identifier(input.workspaceId)
    ) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_production_context_invalid",
      );
    }
  }

  private identifier(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= 255 &&
      !value.includes("\0")
    );
  }

  private errorCode(error: unknown): string {
    return error instanceof ProviderConversionProductionFailure &&
      /^[a-z0-9_]{1,160}$/u.test(error.code)
      ? error.code
      : "provider_conversion_production_unexpected";
  }

  private failureSummary(error: unknown, code: string): Prisma.InputJsonValue {
    const prismaCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : null;

    return {
      code,
      prismaCode,
      failedAt: new Date().toISOString(),
    };
  }
}
