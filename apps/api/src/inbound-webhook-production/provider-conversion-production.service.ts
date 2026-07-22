import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import type { ProviderConversionProductionJobPayload } from "../common/queue/queue.constants";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";
import { ConversionCatalogService } from "../conversion-rules/conversion-catalog.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { InboundWebhookMetaRouteReaderService } from "../inbound-webhooks/inbound-webhook-meta-route-reader.service";
import { InboundWebhookPayloadEncryptionService } from "../inbound-webhooks/inbound-webhook-payload-encryption.service";
import type { ParsedInboundWebhookEvent } from "../inbound-webhooks/providers/inbound-webhook-parser";
import { InboundWebhookParserRegistry } from "../inbound-webhooks/providers/inbound-webhook-parser.registry";

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
    },
  },
  sourceDelivery: true,
  channel: true,
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
        },
      });
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
    this.assertProductionContext(execution);
    const parsedEvent = this.reparseEvent(execution);
    const match = await this.catalogs.matchRuleMessage(
      execution.workspaceId,
      execution.providerRuleId,
      parsedEvent.message.text!,
    );

    if (
      !match.matched ||
      match.catalogVariantId !== execution.matchedCatalogVariantId ||
      match.parsedValueCents !== execution.valueCents ||
      match.currency !== execution.currency
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

    const lock = this.lockKeys(execution.workspaceId, lead.phoneHash);
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(${lock.first}, ${lock.second})
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
        return { status: "duplicate" as const };
      }

      const conversion = await this.conversions.recordExternalConversion({
        workspaceId: execution.workspaceId,
        externalConnectorId: null,
        sourceEventId: parsedEvent.externalMessageId,
        sourceTrigger: "inbound_webhook:umbler:structured_catalog",
        eventName: "Purchase",
        eventId: this.metaEventId(execution.id),
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
        valueCents: match.parsedValueCents,
        valueSource: "actual",
        currency: match.currency,
        contentName: match.contentName,
        eventOccurredAt: execution.occurredAt,
        sourcePayload: {
          provider: "umbler",
          providerRuleId: execution.providerRuleId,
          providerConversionExecutionId: execution.id,
          sourceDeliveryId: execution.sourceDeliveryId,
          channelId: execution.channelId,
          catalogVariantId: match.catalogVariantId,
          processingMode: "live_provider_conversion",
        },
      });

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

      return {
        status: "materialized" as const,
        conversionEventLogId: conversion.conversionEventLogId,
        queueRequired: conversion.deliveryStatus === "ready_to_send",
      };
    });

    return result;
  }

  private assertProductionContext(execution: ExecutionRecord): void {
    const rule = execution.providerRule;
    const delivery = execution.sourceDelivery;
    const channel = execution.channel;
    const channelScoped = rule.channels.some(
      (scope) => scope.channelId === execution.channelId,
    );

    if (
      rule.removedAt ||
      !rule.conversionRule.active ||
      rule.conversionRule.triggerType !== "structured_catalog" ||
      rule.conversionRule.eventName !== "Purchase" ||
      rule.mode !== "production" ||
      !rule.productionActivatedAt ||
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
      delivery.firstReceivedAt < rule.productionActivatedAt ||
      delivery.firstReceivedAt < channel.productionActivatedAt
    ) {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_production_context_invalid",
      );
    }
  }

  private reparseEvent(execution: ExecutionRecord): ParsedInboundWebhookEvent {
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
    let payload: unknown;
    try {
      payload = JSON.parse(decrypted.toString("utf8"));
    } catch {
      throw new ProviderConversionProductionFailure(
        "provider_conversion_payload_invalid",
      );
    }

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
      parsedEvent.message.direction !== "outbound" ||
      !["organization_member", "bot"].includes(
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
  ): {
    first: number;
    second: number;
  } {
    const digest = createHash("sha256")
      .update(`${workspaceId}\0${phoneHash}\0purchase`, "utf8")
      .digest();

    return {
      first: digest.readInt32BE(0),
      second: digest.readInt32BE(4),
    };
  }

  private metaEventId(executionId: string): string {
    const digest = createHash("sha256").update(executionId).digest("hex");
    return `umbler_purchase_${digest}`;
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
}
