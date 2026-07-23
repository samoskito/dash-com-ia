import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ProviderConversionCatalogDto,
  ProviderConversionMessageAuthorScopeDto,
  StructuredCatalogTestMessageResultDto,
} from "@wpptrack/shared";
import { hashPhoneIdentity } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";
import type { ParsedInboundWebhookEvent } from "../inbound-webhooks/providers/inbound-webhook-parser";
import {
  matchProviderMessageTrigger,
  matchStructuredCatalogMessage,
  providerMessageAuthorAllowed,
} from "./structured-catalog-message.parser";

const observedRuleInclude = {
  conversionRule: true,
  connection: {
    include: {
      parserRelease: true,
    },
  },
  parserRelease: true,
  channels: true,
  catalog: {
    include: {
      attributes: { orderBy: { position: "asc" } },
      variants: { orderBy: { createdAt: "asc" } },
    },
  },
} satisfies Prisma.ProviderConversionRuleConfigInclude;

type ObservedRule = Prisma.ProviderConversionRuleConfigGetPayload<{
  include: typeof observedRuleInclude;
}>;

type ProviderConversionPersistenceClient = Pick<
  Prisma.TransactionClient,
  "providerConversionRuleExecution" | "purchaseReview" | "purchaseReviewItem"
>;

const terminalExecutionStatuses = new Set(["materialized", "duplicate"]);
const preservedReviewStatuses = new Set([
  "approved",
  "sent",
  "duplicate",
  "rejected",
  "corrected_after_send",
]);

export type ProviderConversionObservationResult = {
  executionIds: string[];
  eligibleExecutionIds: string[];
};

@Injectable()
export class ProviderConversionObservationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv = process.env,
  ) {}

  async observeDelivery(input: {
    workspaceId: string;
    connectionId: string;
    deliveryId: string;
    deliveryReceivedAt: Date;
    events: ParsedInboundWebhookEvent[];
    manualRecovery?: boolean;
  }): Promise<ProviderConversionObservationResult> {
    const config = parseInboundWebhooksConfig(this.env);
    if (!config.enabled || !config.conversionRulesEnabled) {
      return { executionIds: [], eligibleExecutionIds: [] };
    }

    const candidates = input.events.filter(
      (event) =>
        event.provider === "umbler" &&
        !event.message.isPrivate &&
        event.message.text !== null,
    );
    if (candidates.length === 0) {
      return { executionIds: [], eligibleExecutionIds: [] };
    }

    const channelIdentities = candidates.map((event) => ({
      organizationId: event.organizationId,
      providerChannelId: event.channel.providerChannelId,
    }));
    const channels = await this.prisma.inboundWebhookChannel.findMany({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        OR: channelIdentities,
      },
      select: {
        id: true,
        organizationId: true,
        providerChannelId: true,
        status: true,
        productionActivatedAt: true,
      },
    });
    const rules = await this.prisma.providerConversionRuleConfig.findMany({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        removedAt: null,
        conversionRule: {
          active: true,
          triggerType: { in: ["structured_catalog", "message_phrase"] },
          eventName: "Purchase",
        },
        channels: {
          some: {
            channelId: { in: channels.map((channel) => channel.id) },
          },
        },
      },
      include: observedRuleInclude,
      orderBy: { createdAt: "asc" },
    });
    const identityHashes = [
      ...new Set(
        candidates
          .map((event) => hashPhoneIdentity(event.contact.phoneNumber))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const leads = await this.prisma.lead.findMany({
      where: {
        workspaceId: input.workspaceId,
        phoneHash: { in: identityHashes },
      },
      select: { id: true, phoneHash: true },
    });
    const leadByPhoneHash = new Map(
      leads.map((lead) => [lead.phoneHash, lead.id]),
    );
    const executionIds: string[] = [];
    const eligibleExecutionIds: string[] = [];

    for (const event of candidates) {
      const channel = channels.find(
        (candidate) =>
          candidate.organizationId === event.organizationId &&
          candidate.providerChannelId === event.channel.providerChannelId,
      );
      if (!channel) continue;

      const contactIdentityHash = hashPhoneIdentity(event.contact.phoneNumber);
      if (!contactIdentityHash) continue;

      const leadId = leadByPhoneHash.get(contactIdentityHash) ?? null;
      for (const rule of rules.filter((candidate) =>
        candidate.channels.some((scope) => scope.channelId === channel.id),
      )) {
        const authorScope = this.authorScope(rule);
        if (
          !providerMessageAuthorAllowed(authorScope, event.message.authorType)
        ) {
          continue;
        }

        const match = this.match(rule, event.message.text!);
        if (match.classification === "ignored") continue;

        const readiness = this.readiness({
          config,
          rule,
          channel,
          deliveryReceivedAt: input.deliveryReceivedAt,
          match,
          manualRecovery: input.manualRecovery === true,
        });
        const normalizedResult = this.toJson({
          matched: match.matched,
          classification: match.classification,
          reasonCode: match.reasonCode,
          matchedTriggerPhrase: match.matchedTriggerPhrase,
          items: match.items,
          calculatedValueCents: match.calculatedValueCents,
          observedPaymentValueCents: match.observedPaymentValueCents,
          contentName: match.contentName,
          currency: match.currency,
          messageDirection: event.message.direction,
          messageAuthorType: event.message.authorType,
          messageType: event.message.messageType,
        });
        const execution = await this.prisma.$transaction(
          async (transaction) => {
            const existing =
              await transaction.providerConversionRuleExecution.findUnique({
                where: {
                  providerRuleId_externalExecutionKey: {
                    providerRuleId: rule.id,
                    externalExecutionKey: event.dedupeKey,
                  },
                },
                select: {
                  id: true,
                  status: true,
                },
              });
            if (existing && terminalExecutionStatuses.has(existing.status)) {
              return existing;
            }

            const persisted =
              await transaction.providerConversionRuleExecution.upsert({
                where: {
                  providerRuleId_externalExecutionKey: {
                    providerRuleId: rule.id,
                    externalExecutionKey: event.dedupeKey,
                  },
                },
                create: {
                  workspaceId: input.workspaceId,
                  providerRuleId: rule.id,
                  sourceDeliveryId: input.deliveryId,
                  channelWorkspaceId: input.workspaceId,
                  channelId: channel.id,
                  matchedCatalogVariantWorkspaceId: match.catalogVariantId
                    ? input.workspaceId
                    : null,
                  matchedCatalogVariantId: match.catalogVariantId,
                  externalExecutionKey: event.dedupeKey,
                  occurredAt: event.occurredAt,
                  contactIdentityHash,
                  status: readiness.status,
                  reasonCode: readiness.reasonCode,
                  normalizedResult,
                  valueCents: match.matched ? match.calculatedValueCents : null,
                  currency: match.currency,
                },
                update: {
                  sourceDeliveryId: input.deliveryId,
                  channelWorkspaceId: input.workspaceId,
                  channelId: channel.id,
                  matchedCatalogVariantWorkspaceId: match.catalogVariantId
                    ? input.workspaceId
                    : null,
                  matchedCatalogVariantId: match.catalogVariantId,
                  occurredAt: event.occurredAt,
                  contactIdentityHash,
                  status: readiness.status,
                  reasonCode: readiness.reasonCode,
                  normalizedResult,
                  valueCents: match.matched ? match.calculatedValueCents : null,
                  currency: match.currency,
                  processedAt: null,
                },
                select: {
                  id: true,
                  status: true,
                },
              });

            await this.persistPurchaseReview(transaction, {
              workspaceId: input.workspaceId,
              providerRuleId: rule.id,
              sourceDeliveryId: input.deliveryId,
              channelId: channel.id,
              executionId: persisted.id,
              externalOccurrenceKey: event.dedupeKey,
              occurredAt: event.occurredAt,
              contactIdentityHash,
              leadId,
              messageAuthorType: event.message.authorType,
              match,
            });

            return persisted;
          },
        );

        executionIds.push(execution.id);
        if (execution.status === "eligible") {
          eligibleExecutionIds.push(execution.id);
        }
      }
    }

    return {
      executionIds: [...new Set(executionIds)],
      eligibleExecutionIds: [...new Set(eligibleExecutionIds)],
    };
  }

  private match(
    rule: ObservedRule,
    messageText: string,
  ): StructuredCatalogTestMessageResultDto {
    if (rule.conversionRule.triggerType === "structured_catalog") {
      return matchStructuredCatalogMessage(this.catalogDto(rule), messageText, {
        triggerPhrases: rule.messageTriggerPhrases,
      });
    }

    const matchedTriggerPhrase = matchProviderMessageTrigger(
      messageText,
      rule.messageTriggerPhrases,
    );
    const matched = Boolean(
      matchedTriggerPhrase &&
      rule.conversionRule.defaultValueCents &&
      rule.conversionRule.defaultCurrency,
    );

    return {
      matched,
      reasonCode: matched ? "matched" : "trigger_missing",
      classification: matched ? "recognized" : "ignored",
      matchedTriggerPhrase,
      parsedAttributes: [],
      items: [],
      parsedValueCents: matched ? rule.conversionRule.defaultValueCents : null,
      calculatedValueCents: matched
        ? rule.conversionRule.defaultValueCents
        : null,
      observedPaymentValueCents: null,
      catalogVariantId: null,
      contentName: rule.conversionRule.defaultContentName,
      currency: rule.conversionRule.defaultCurrency,
    };
  }

  private async persistPurchaseReview(
    client: ProviderConversionPersistenceClient,
    input: {
      workspaceId: string;
      providerRuleId: string;
      sourceDeliveryId: string;
      channelId: string;
      executionId: string;
      externalOccurrenceKey: string;
      occurredAt: Date;
      contactIdentityHash: string;
      leadId: string | null;
      messageAuthorType: string;
      match: StructuredCatalogTestMessageResultDto;
    },
  ): Promise<void> {
    const reviewStatus = input.match.matched
      ? "recognized"
      : input.match.classification === "awaiting_data"
        ? "awaiting_data"
        : "review_required";
    const existing = await client.purchaseReview.findUnique({
      where: {
        providerRuleId_externalOccurrenceKey: {
          providerRuleId: input.providerRuleId,
          externalOccurrenceKey: input.externalOccurrenceKey,
        },
      },
      select: { id: true, status: true },
    });
    if (existing && preservedReviewStatuses.has(existing.status)) {
      return;
    }

    const review = await client.purchaseReview.upsert({
      where: {
        providerRuleId_externalOccurrenceKey: {
          providerRuleId: input.providerRuleId,
          externalOccurrenceKey: input.externalOccurrenceKey,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        providerRuleId: input.providerRuleId,
        sourceDeliveryId: input.sourceDeliveryId,
        channelWorkspaceId: input.workspaceId,
        channelId: input.channelId,
        providerExecutionWorkspaceId: input.workspaceId,
        providerExecutionId: input.executionId,
        externalOccurrenceKey: input.externalOccurrenceKey,
        occurredAt: input.occurredAt,
        contactIdentityHash: input.contactIdentityHash,
        sourceType: "provider_message",
        messageAuthorType: input.messageAuthorType,
        matchedTriggerPhrase: input.match.matchedTriggerPhrase,
        status: reviewStatus,
        classificationCode: input.match.classification,
        reasonCode: input.match.reasonCode,
        observedPaymentValueCents: input.match.observedPaymentValueCents,
        calculatedValueCents: input.match.calculatedValueCents,
        effectiveValueCents: input.match.calculatedValueCents,
        currency: input.match.currency ?? "BRL",
        leadWorkspaceId: input.leadId ? input.workspaceId : null,
        leadId: input.leadId,
      },
      update: {
        sourceDeliveryId: input.sourceDeliveryId,
        channelWorkspaceId: input.workspaceId,
        channelId: input.channelId,
        providerExecutionWorkspaceId: input.workspaceId,
        providerExecutionId: input.executionId,
        occurredAt: input.occurredAt,
        contactIdentityHash: input.contactIdentityHash,
        messageAuthorType: input.messageAuthorType,
        matchedTriggerPhrase: input.match.matchedTriggerPhrase,
        status: reviewStatus,
        classificationCode: input.match.classification,
        reasonCode: input.match.reasonCode,
        observedPaymentValueCents: input.match.observedPaymentValueCents,
        calculatedValueCents: input.match.calculatedValueCents,
        effectiveValueCents: input.match.calculatedValueCents,
        currency: input.match.currency ?? "BRL",
        leadWorkspaceId: input.leadId ? input.workspaceId : null,
        leadId: input.leadId,
        version: { increment: 1 },
      },
      select: { id: true },
    });

    await client.purchaseReviewItem.deleteMany({
      where: {
        workspaceId: input.workspaceId,
        purchaseReviewId: review.id,
      },
    });
    if (input.match.items.length > 0) {
      await client.purchaseReviewItem.createMany({
        data: input.match.items.map((item) => ({
          workspaceId: input.workspaceId,
          purchaseReviewId: review.id,
          position: item.position,
          catalogVariantWorkspaceId: item.catalogVariantId
            ? input.workspaceId
            : null,
          catalogVariantId: item.catalogVariantId,
          attributeValues: item.parsedAttributes.map(
            (attribute) => attribute.value,
          ),
          quantity: item.quantity,
          unitValueCents: item.unitValueCents,
          subtotalValueCents: item.subtotalValueCents,
          contentName: item.contentName,
        })),
      });
    }

    if (reviewStatus === "recognized") {
      await client.purchaseReview.updateMany({
        where: {
          id: { not: review.id },
          workspaceId: input.workspaceId,
          providerRuleId: input.providerRuleId,
          channelId: input.channelId,
          contactIdentityHash: input.contactIdentityHash,
          status: "awaiting_data",
          occurredAt: { lte: input.occurredAt },
        },
        data: {
          status: "rejected",
          reasonCode: "superseded_by_complete_message",
          decisionReason: "Substituido pela resposta completa recebida depois",
          decidedAt: new Date(),
          version: { increment: 1 },
        },
      });
    }
  }

  private readiness(input: {
    config: ReturnType<typeof parseInboundWebhooksConfig>;
    rule: ObservedRule;
    channel: {
      status: string;
      productionActivatedAt: Date | null;
    };
    deliveryReceivedAt: Date;
    match: StructuredCatalogTestMessageResultDto;
    manualRecovery: boolean;
  }): { status: "observed" | "eligible" | "blocked"; reasonCode: string } {
    if (!input.match.matched) {
      return { status: "blocked", reasonCode: input.match.reasonCode };
    }
    if (
      !input.config.enabled ||
      !input.config.conversionProductionEnabled ||
      input.rule.mode !== "production"
    ) {
      return {
        status: "observed",
        reasonCode:
          input.rule.conversionRule.triggerType === "structured_catalog"
            ? "catalog_matched_observation"
            : "message_matched_observation",
      };
    }
    if (
      input.rule.parserRelease.status !== "certified" ||
      input.rule.connection.parserRelease.status !== "certified" ||
      input.rule.parserReleaseId !== input.rule.connection.parserReleaseId ||
      input.rule.connection.status !== "production" ||
      input.rule.connection.removedAt !== null ||
      input.channel.status !== "active"
    ) {
      return { status: "blocked", reasonCode: "production_context_invalid" };
    }
    if (
      !input.rule.productionActivatedAt ||
      !input.channel.productionActivatedAt ||
      (!input.manualRecovery &&
        (input.deliveryReceivedAt < input.rule.productionActivatedAt ||
          input.deliveryReceivedAt < input.channel.productionActivatedAt))
    ) {
      return {
        status: "observed",
        reasonCode: "before_production_activation",
      };
    }

    return {
      status: "eligible",
      reasonCode:
        input.rule.conversionRule.triggerType === "structured_catalog"
          ? "catalog_matched"
          : "message_matched",
    };
  }

  private authorScope(
    rule: ObservedRule,
  ): ProviderConversionMessageAuthorScopeDto {
    return rule.messageAuthorScope ?? "team";
  }

  private catalogDto(rule: ObservedRule): ProviderConversionCatalogDto {
    const catalog = rule.catalog!;

    return {
      id: catalog.id,
      name: catalog.name,
      productName: catalog.productName,
      currency: catalog.currency,
      active: catalog.active,
      attributes: catalog.attributes.map((attribute) => ({
        id: attribute.id,
        position: attribute.position,
        key: attribute.key,
        label: attribute.label,
      })),
      variants: catalog.variants.map((variant) => ({
        id: variant.id,
        normalizedKey: variant.normalizedKey,
        attributeValues: this.stringArray(variant.attributeValues),
        aliases: this.nestedStringArray(variant.aliases),
        valueCents: variant.valueCents,
        contentName: variant.contentName,
        active: variant.active,
      })),
    };
  }

  private stringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private nestedStringArray(value: Prisma.JsonValue | null): string[][] {
    return Array.isArray(value)
      ? value.map((item) => this.stringArray(item))
      : [];
  }

  private toJson(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
