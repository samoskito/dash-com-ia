import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ProviderConversionCatalogDto,
  StructuredCatalogTestMessageResultDto,
} from "@wpptrack/shared";
import { hashPhoneIdentity } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";
import type { ParsedInboundWebhookEvent } from "../inbound-webhooks/providers/inbound-webhook-parser";
import { matchStructuredCatalogMessage } from "./structured-catalog-message.parser";

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
  }): Promise<ProviderConversionObservationResult> {
    const config = parseInboundWebhooksConfig(this.env);
    if (!config.enabled || !config.conversionRulesEnabled) {
      return { executionIds: [], eligibleExecutionIds: [] };
    }

    const candidates = input.events.filter(
      (event) =>
        event.provider === "umbler" &&
        !event.message.isPrivate &&
        event.message.direction === "outbound" &&
        ["organization_member", "bot"].includes(event.message.authorType) &&
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
          triggerType: "structured_catalog",
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
    const executionIds: string[] = [];
    const eligibleExecutionIds: string[] = [];

    for (const event of candidates) {
      const channel = channels.find(
        (candidate) =>
          candidate.organizationId === event.organizationId &&
          candidate.providerChannelId === event.channel.providerChannelId,
      );
      if (!channel) continue;

      for (const rule of rules.filter((candidate) =>
        candidate.channels.some((scope) => scope.channelId === channel.id),
      )) {
        if (!rule.catalog) continue;

        const match = this.match(rule, event.message.text!);
        const readiness = this.readiness({
          config,
          rule,
          channel,
          deliveryReceivedAt: input.deliveryReceivedAt,
          match,
        });
        const execution =
          await this.prisma.providerConversionRuleExecution.upsert({
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
              contactIdentityHash: hashPhoneIdentity(event.contact.phoneNumber),
              status: readiness.status,
              reasonCode: readiness.reasonCode,
              normalizedResult: this.toJson({
                matched: match.matched,
                reasonCode: match.reasonCode,
                parsedAttributes: match.parsedAttributes,
                parsedValueCents: match.parsedValueCents,
                catalogVariantId: match.catalogVariantId,
                contentName: match.contentName,
                currency: match.currency,
                messageDirection: event.message.direction,
                messageAuthorType: event.message.authorType,
                messageType: event.message.messageType,
              }),
              valueCents: match.matched ? match.parsedValueCents : null,
              currency: match.currency,
            },
            update: {},
            select: {
              id: true,
              status: true,
            },
          });

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
    return matchStructuredCatalogMessage(this.catalogDto(rule), messageText);
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
  }): { status: "observed" | "eligible" | "blocked"; reasonCode: string } {
    if (!input.match.matched) {
      return { status: "blocked", reasonCode: input.match.reasonCode };
    }
    if (
      !input.config.enabled ||
      !input.config.conversionProductionEnabled ||
      input.rule.mode !== "production"
    ) {
      return { status: "observed", reasonCode: "catalog_matched_observation" };
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
      input.deliveryReceivedAt < input.rule.productionActivatedAt ||
      input.deliveryReceivedAt < input.channel.productionActivatedAt
    ) {
      return { status: "observed", reasonCode: "before_production_activation" };
    }

    return { status: "eligible", reasonCode: "catalog_matched" };
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
