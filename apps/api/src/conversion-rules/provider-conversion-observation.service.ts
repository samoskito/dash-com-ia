import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ProviderConversionCatalogDto,
  ProviderConversionDecisionCatalogSnapshotDto,
  ProviderConversionDecisionDto,
  ProviderConversionDecisionRuleSnapshotDto,
  ProviderConversionPaidLeadResolutionDto,
} from "@wpptrack/shared";
import {
  conversionEventNameSchema,
  readMessagePhraseConfig,
  type ConversionEventNameDto,
} from "@wpptrack/shared";
import { hashPhoneIdentity } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";
import type { ParsedInboundWebhookEvent } from "../inbound-webhooks/providers/inbound-webhook-parser";
import type { ParsedUmblerAutomationV1 } from "../inbound-webhooks/providers/umbler/umbler-automation-v1.parser";
import {
  ProviderConversionDecisionRepository,
  type PersistedProviderConversionDecision,
} from "./provider-conversion-decision.repository";
import type { ProviderConversionDecisionInput } from "./provider-conversion-decision.types";
import { ProviderConversionEngineRolloutService } from "./provider-conversion-engine-rollout.service";
import {
  ProviderConversionOrchestrator,
  type ProviderConversionTechnicalDisposition,
} from "./provider-conversion-orchestrator.service";
import { ProviderConversionPaidLeadResolver } from "./provider-conversion-paid-lead-resolver.service";
import type { ProviderConversionEngineMode } from "./provider-conversion-shadow-comparison.service";

const observedRuleInclude = {
  conversionRule: true,
  connection: {
    include: {
      parserRelease: true,
    },
  },
  parserRelease: true,
  channels: {
    include: {
      channel: {
        select: {
          id: true,
          status: true,
          productionActivatedAt: true,
          conversionEngineMode: true,
        },
      },
    },
  },
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

type ObservedChannel = {
  id: string;
  organizationId: string;
  providerChannelId: string;
  status: string;
  productionActivatedAt: Date | null;
  conversionEngineMode: ProviderConversionEngineMode;
};

export type ProviderConversionObservationResult = {
  executionIds: string[];
  eligibleExecutionIds: string[];
};

export type ProviderConversionAutomationObservationResult = {
  decisionId: string | null;
  decisionCode: ProviderConversionDecisionDto["decisionCode"] | null;
  reasonCode: string;
  disposition: ProviderConversionTechnicalDisposition["state"] | "ignored";
  executionId: string | null;
  eligibleExecutionId: string | null;
  reviewId: string | null;
  channelId: string | null;
  leadResolved: boolean;
};

export type ProviderConversionEvaluationMode =
  | {
      type: "reuse";
    }
  | {
      type: "reevaluate";
      requestKey: string;
    };

export type ProviderConversionReevaluationTarget = {
  providerRuleId: string;
  occurrenceKey: string;
};

@Injectable()
export class ProviderConversionObservationService {
  private readonly logger = new Logger(
    ProviderConversionObservationService.name,
  );

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProviderConversionEngineRolloutService)
    private readonly engineRollout: ProviderConversionEngineRolloutService,
    @Inject(ProviderConversionDecisionRepository)
    private readonly decisions: ProviderConversionDecisionRepository,
    @Inject(ProviderConversionPaidLeadResolver)
    private readonly paidLeads: ProviderConversionPaidLeadResolver,
    @Inject(ProviderConversionOrchestrator)
    private readonly orchestrator: ProviderConversionOrchestrator,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv = process.env,
  ) {}

  async observeDelivery(input: {
    workspaceId: string;
    connectionId: string;
    deliveryId: string;
    externalDeliveryId?: string | null;
    deliveryReceivedAt: Date;
    events: ParsedInboundWebhookEvent[];
    manualRecovery?: boolean;
  }): Promise<ProviderConversionObservationResult> {
    return this.evaluateMessageDelivery(input, { type: "reuse" });
  }

  async reevaluateDelivery(input: {
    workspaceId: string;
    connectionId: string;
    deliveryId: string;
    externalDeliveryId?: string | null;
    deliveryReceivedAt: Date;
    events: ParsedInboundWebhookEvent[];
    manualRecovery?: boolean;
    requestKey: string;
    target: ProviderConversionReevaluationTarget;
  }): Promise<ProviderConversionObservationResult> {
    return this.evaluateMessageDelivery(
      input,
      {
        type: "reevaluate",
        requestKey: input.requestKey,
      },
      input.target,
    );
  }

  async observeAutomation(input: {
    workspaceId: string;
    connectionId: string;
    deliveryId: string;
    externalDeliveryId?: string | null;
    deliveryReceivedAt: Date;
    providerRuleId: string;
    automation: ParsedUmblerAutomationV1;
    manualRecovery?: boolean;
    evaluationMode?: ProviderConversionEvaluationMode;
  }): Promise<ProviderConversionAutomationObservationResult> {
    const config = parseInboundWebhooksConfig(this.env);
    if (!config.enabled || !config.conversionRulesEnabled) {
      return {
        decisionId: null,
        decisionCode: null,
        reasonCode: "conversion_rules_disabled",
        disposition: "ignored",
        executionId: null,
        eligibleExecutionId: null,
        reviewId: null,
        channelId: null,
        leadResolved: false,
      };
    }

    const rule = await this.loadAutomationRule(input);
    if (!rule) {
      return {
        decisionId: null,
        decisionCode: null,
        reasonCode: "automation_rule_unavailable",
        disposition: "ignored",
        executionId: null,
        eligibleExecutionId: null,
        reviewId: null,
        channelId: null,
        leadResolved: false,
      };
    }
    const channel = await this.resolveAutomationChannel({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      phone: input.automation.phone,
      deliveryReceivedAt: input.deliveryReceivedAt,
      rule,
    });
    const leadResolution = await this.paidLeads.resolve({
      workspaceId: input.workspaceId,
      phone: input.automation.phone,
    });
    const persistedDecision = await this.resolveAutomationDecision({
      input,
      rule,
      channel,
      leadResolution,
      evaluationMode: input.evaluationMode ?? { type: "reuse" },
    });
    if (!persistedDecision) {
      return {
        decisionId: null,
        decisionCode: null,
        reasonCode: "automation_event_mismatch",
        disposition: "ignored",
        executionId: null,
        eligibleExecutionId: null,
        reviewId: null,
        channelId: channel?.id ?? null,
        leadResolved: leadResolution.status === "resolved",
      };
    }

    const disposition = this.disposition({
      config,
      decision: persistedDecision.decision,
      rule,
      channel,
      deliveryReceivedAt: input.deliveryReceivedAt,
      manualRecovery: input.manualRecovery === true,
    });
    const orchestration = await this.orchestrator.orchestrate({
      persistedDecision,
      disposition,
    });

    return {
      decisionId: persistedDecision.id,
      decisionCode: persistedDecision.decisionCode,
      reasonCode: persistedDecision.reasonCode,
      disposition:
        persistedDecision.decisionCode === "ignored_empty_template" ||
        persistedDecision.decisionCode === "ignored_untracked_lead" ||
        persistedDecision.decisionCode === "duplicate"
          ? "ignored"
          : disposition.state,
      executionId: orchestration.executionId,
      eligibleExecutionId: orchestration.eligibleExecutionId,
      reviewId: orchestration.reviewId,
      channelId: channel?.id ?? null,
      leadResolved: leadResolution.status === "resolved",
    };
  }

  private async evaluateMessageDelivery(
    input: {
      workspaceId: string;
      connectionId: string;
      deliveryId: string;
      externalDeliveryId?: string | null;
      deliveryReceivedAt: Date;
      events: ParsedInboundWebhookEvent[];
      manualRecovery?: boolean;
    },
    evaluationMode: ProviderConversionEvaluationMode,
    target?: ProviderConversionReevaluationTarget,
  ): Promise<ProviderConversionObservationResult> {
    const config = parseInboundWebhooksConfig(this.env);
    if (!config.enabled || !config.conversionRulesEnabled) {
      return this.emptyResult();
    }

    const candidates = input.events.filter((event) => {
      if (
        event.provider !== "umbler" ||
        event.message.isPrivate ||
        event.message.text === null
      ) {
        return false;
      }

      return !target || event.dedupeKey === target.occurrenceKey;
    });
    if (candidates.length === 0) {
      return this.emptyResult();
    }

    const channels = await this.loadChannels(input, candidates);
    if (channels.length === 0) {
      return this.emptyResult();
    }
    const loadedRules = await this.loadRules(input, channels);
    const rules = target
      ? loadedRules.filter((rule) => rule.id === target.providerRuleId)
      : loadedRules;
    if (rules.length === 0) {
      return this.emptyResult();
    }

    const leadResolutionByPhone = new Map<
      string,
      Promise<ProviderConversionPaidLeadResolutionDto>
    >();
    const executionIds: string[] = [];
    const eligibleExecutionIds: string[] = [];

    for (const event of candidates) {
      const channel = this.channelForEvent(channels, event);
      if (!channel) continue;

      for (const rule of rules) {
        if (!rule.channels.some((scope) => scope.channelId === channel.id)) {
          continue;
        }

        const persistedDecision = await this.resolveDecision({
          input,
          event,
          channel,
          rule,
          leadResolutionByPhone,
          evaluationMode,
        });
        if (!persistedDecision) continue;

        const disposition = this.disposition({
          config,
          decision: persistedDecision.decision,
          rule,
          channel,
          deliveryReceivedAt: input.deliveryReceivedAt,
          manualRecovery: input.manualRecovery === true,
        });
        const orchestration = await this.orchestrator.orchestrate({
          persistedDecision,
          disposition,
        });

        if (orchestration.executionId) {
          executionIds.push(orchestration.executionId);
        }
        if (orchestration.eligibleExecutionId) {
          eligibleExecutionIds.push(orchestration.eligibleExecutionId);
        }
      }
    }

    return {
      executionIds: [...new Set(executionIds)],
      eligibleExecutionIds: [...new Set(eligibleExecutionIds)],
    };
  }

  private async resolveDecision(input: {
    input: {
      workspaceId: string;
      connectionId: string;
      deliveryId: string;
      externalDeliveryId?: string | null;
    };
    event: ParsedInboundWebhookEvent;
    channel: ObservedChannel;
    rule: ObservedRule;
    leadResolutionByPhone: Map<
      string,
      Promise<ProviderConversionPaidLeadResolutionDto>
    >;
    evaluationMode: ProviderConversionEvaluationMode;
  }): Promise<PersistedProviderConversionDecision | null> {
    const existing = await this.decisions.findLatestByOccurrence({
      workspaceId: input.input.workspaceId,
      providerRuleId: input.rule.id,
      occurrenceKey: input.event.dedupeKey,
    });
    if (existing && input.evaluationMode.type === "reuse") {
      this.logDecision(existing, false);
      return existing;
    }

    const leadResolution = await this.resolvePaidLead(
      input.input.workspaceId,
      input.event.contact.phoneNumber,
      input.leadResolutionByPhone,
    );
    const ruleSnapshot = this.ruleSnapshot(input.rule);
    const decisionInput: ProviderConversionDecisionInput = {
      parserVersion: input.rule.parserRelease.version,
      rule: ruleSnapshot,
      catalog: this.catalogSnapshot(input.rule),
      leadResolution,
      contactIdentityHash: hashPhoneIdentity(
        input.event.contact.phoneNumber,
      ) ?? null,
      occurrence: {
        source: "message",
        provider: input.event.provider,
        workspaceId: input.input.workspaceId,
        connectionId: input.input.connectionId,
        channelId: input.channel.id,
        externalDeliveryId:
          input.input.externalDeliveryId ?? input.event.externalEventId,
        externalEventId: input.event.externalEventId,
        externalMessageId: input.event.externalMessageId,
        occurrenceKey: input.event.dedupeKey,
        eventName: ruleSnapshot.eventName,
        occurredAt: input.event.occurredAt.toISOString(),
        authorType: input.event.message.authorType,
        messageText: input.event.message.text!,
      },
    };
    const decision = await this.engineRollout.evaluate({
      mode: input.channel.conversionEngineMode,
      decisionInput,
      sourceDeliveryId: input.input.deliveryId,
    });
    if (!decision) return null;

    const persisted =
      input.evaluationMode.type === "reevaluate"
        ? await this.decisions.appendReevaluation({
            decision,
            sourceDeliveryId: input.input.deliveryId,
            supersedesDecisionId: this.requiredExistingDecision(existing).id,
            reevaluationRequestKey: input.evaluationMode.requestKey,
          })
        : await this.decisions.recordInitial({
            decision,
            sourceDeliveryId: input.input.deliveryId,
          });
    this.logDecision(persisted, persisted.created);
    return persisted;
  }

  private async resolveAutomationDecision(input: {
    input: {
      workspaceId: string;
      connectionId: string;
      deliveryId: string;
      externalDeliveryId?: string | null;
      automation: ParsedUmblerAutomationV1;
    };
    rule: ObservedRule;
    channel: ObservedChannel | null;
    leadResolution: ProviderConversionPaidLeadResolutionDto;
    evaluationMode: ProviderConversionEvaluationMode;
  }): Promise<PersistedProviderConversionDecision | null> {
    const occurrenceKey = input.input.automation.externalExecutionKey;
    const existing = await this.decisions.findLatestByOccurrence({
      workspaceId: input.input.workspaceId,
      providerRuleId: input.rule.id,
      occurrenceKey,
    });
    if (existing && input.evaluationMode.type === "reuse") {
      this.logDecision(existing, false);
      return existing;
    }

    const ruleSnapshot = this.ruleSnapshot(input.rule);
    const decisionInput: ProviderConversionDecisionInput = {
      parserVersion: input.rule.parserRelease.version,
      rule: ruleSnapshot,
      catalog: null,
      leadResolution: input.leadResolution,
      contactIdentityHash: hashPhoneIdentity(
        input.input.automation.phone,
      ) ?? null,
      occurrence: {
        source: "automation",
        provider: "umbler",
        workspaceId: input.input.workspaceId,
        connectionId: input.input.connectionId,
        channelId: input.channel?.id ?? null,
        externalDeliveryId:
          input.input.externalDeliveryId ??
          input.input.automation.externalExecutionKey,
        externalEventId: input.input.automation.externalExecutionKey,
        externalMessageId: null,
        occurrenceKey,
        eventName: input.input.automation.eventName,
        occurredAt: input.input.automation.occurredAt.toISOString(),
        authorType: null,
        automation: input.input.automation.automation,
      },
    };
    const decision = await this.engineRollout.evaluate({
      mode: input.channel?.conversionEngineMode ?? "legacy",
      decisionInput,
      sourceDeliveryId: input.input.deliveryId,
    });
    if (!decision) return null;

    const persisted =
      input.evaluationMode.type === "reevaluate"
        ? await this.decisions.appendReevaluation({
            decision,
            sourceDeliveryId: input.input.deliveryId,
            supersedesDecisionId: this.requiredExistingDecision(existing).id,
            reevaluationRequestKey: input.evaluationMode.requestKey,
          })
        : await this.decisions.recordInitial({
            decision,
            sourceDeliveryId: input.input.deliveryId,
          });
    this.logDecision(persisted, persisted.created);
    return persisted;
  }

  private async loadAutomationRule(input: {
    workspaceId: string;
    connectionId: string;
    providerRuleId: string;
  }): Promise<ObservedRule | null> {
    return this.prisma.providerConversionRuleConfig.findFirst({
      where: {
        id: input.providerRuleId,
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        removedAt: null,
        conversionRule: {
          active: true,
          triggerType: "provider_automation",
        },
      },
      include: observedRuleInclude,
    });
  }

  private async resolveAutomationChannel(input: {
    workspaceId: string;
    connectionId: string;
    phone: string;
    deliveryReceivedAt: Date;
    rule: ObservedRule;
  }): Promise<ObservedChannel | null> {
    const contactIdentityHash = hashPhoneIdentity(input.phone);
    const channelIds = input.rule.channels.map((scope) => scope.channelId);
    if (!contactIdentityHash || channelIds.length === 0) return null;

    const recentEvent = await this.prisma.inboundWebhookEvent.findFirst({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        channelId: { in: channelIds },
        contactIdentityHash,
        occurredAt: {
          lte: new Date(input.deliveryReceivedAt.getTime() + 5 * 60 * 1_000),
        },
      },
      orderBy: { occurredAt: "desc" },
      select: {
        channel: {
          select: {
            id: true,
            organizationId: true,
            providerChannelId: true,
            status: true,
            productionActivatedAt: true,
            conversionEngineMode: true,
          },
        },
      },
    });
    if (recentEvent?.channel) return recentEvent.channel;

    if (input.rule.channels.length !== 1) return null;
    const fallback = input.rule.channels[0]!.channel;
    return {
      id: fallback.id,
      organizationId: "",
      providerChannelId: "",
      status: fallback.status,
      productionActivatedAt: fallback.productionActivatedAt,
      conversionEngineMode: fallback.conversionEngineMode,
    };
  }

  private async loadChannels(
    input: {
      workspaceId: string;
      connectionId: string;
    },
    candidates: ParsedInboundWebhookEvent[],
  ): Promise<ObservedChannel[]> {
    return this.prisma.inboundWebhookChannel.findMany({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        OR: candidates.map((event) => ({
          organizationId: event.organizationId,
          providerChannelId: event.channel.providerChannelId,
        })),
      },
      select: {
        id: true,
        organizationId: true,
        providerChannelId: true,
        status: true,
        productionActivatedAt: true,
        conversionEngineMode: true,
      },
    });
  }

  private async loadRules(
    input: {
      workspaceId: string;
      connectionId: string;
    },
    channels: ObservedChannel[],
  ): Promise<ObservedRule[]> {
    return this.prisma.providerConversionRuleConfig.findMany({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        removedAt: null,
        conversionRule: {
          active: true,
          triggerType: { in: ["structured_catalog", "message_phrase"] },
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
  }

  private async resolvePaidLead(
    workspaceId: string,
    phone: string,
    cache: Map<
      string,
      Promise<ProviderConversionPaidLeadResolutionDto>
    >,
  ): Promise<ProviderConversionPaidLeadResolutionDto> {
    const cacheKey = phone.trim();
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const resolution = this.paidLeads.resolve({
      workspaceId,
      phone,
    });
    cache.set(cacheKey, resolution);
    return resolution;
  }

  private disposition(input: {
    config: ReturnType<typeof parseInboundWebhooksConfig>;
    decision: ProviderConversionDecisionDto;
    rule: ObservedRule;
    channel: ObservedChannel | null;
    deliveryReceivedAt: Date;
    manualRecovery: boolean;
  }): ProviderConversionTechnicalDisposition {
    if (!input.channel) {
      return {
        state: "blocked",
        reasonCode: "automation_channel_unresolved",
      };
    }
    if (
      !input.config.conversionProductionEnabled ||
      input.decision.rule.mode !== "production"
    ) {
      return {
        state: "observed",
        reasonCode: `${input.decision.reasonCode}_observation`,
      };
    }
    if (
      input.rule.parserRelease.status !== "certified" ||
      input.rule.connection.parserRelease.status !== "certified" ||
      (input.decision.rule.triggerType !== "provider_automation" &&
        input.rule.parserReleaseId !== input.rule.connection.parserReleaseId) ||
      input.rule.connection.status !== "production" ||
      input.rule.connection.removedAt !== null ||
      input.channel.status !== "active"
    ) {
      return {
        state: "blocked",
        reasonCode: "production_context_invalid",
      };
    }
    if (
      !input.rule.productionActivatedAt ||
      !input.channel.productionActivatedAt ||
      (!input.manualRecovery &&
        (input.deliveryReceivedAt < input.rule.productionActivatedAt ||
          input.deliveryReceivedAt < input.channel.productionActivatedAt))
    ) {
      return {
        state: "observed",
        reasonCode: "before_production_activation",
      };
    }

    return {
      state: "eligible",
      reasonCode: input.decision.reasonCode,
    };
  }

  private ruleSnapshot(
    rule: ObservedRule,
  ): ProviderConversionDecisionRuleSnapshotDto {
    const triggerType = this.providerTriggerType(rule);
    const eventName = this.providerEventName(rule);
    const messagePhrase = readMessagePhraseConfig(
      rule.conversionRule.defaultItems,
    );
    const base = {
      providerRuleId: rule.id,
      conversionRuleId: rule.conversionRuleId,
      triggerType,
      eventName,
      mode: rule.mode,
      active: rule.conversionRule.active && rule.removedAt === null,
      authorScope: rule.messageAuthorScope,
      triggerPhrases: [...rule.messageTriggerPhrases],
      defaultValueCents: rule.conversionRule.defaultValueCents,
      defaultCurrency: rule.conversionRule.defaultCurrency,
      defaultContentName: rule.conversionRule.defaultContentName,
      valueMode:
        triggerType === "message_phrase" ? messagePhrase.valueMode : "fixed",
      exampleMessage:
        triggerType === "message_phrase" ? messagePhrase.exampleMessage : null,
    } satisfies Omit<ProviderConversionDecisionRuleSnapshotDto, "version">;

    return {
      ...base,
      version: this.snapshotVersion("rule", {
        ...base,
        providerRuleUpdatedAt: rule.updatedAt.toISOString(),
        conversionRuleUpdatedAt: rule.conversionRule.updatedAt.toISOString(),
      }),
    };
  }

  private catalogSnapshot(
    rule: ObservedRule,
  ): ProviderConversionDecisionCatalogSnapshotDto | null {
    if (!rule.catalog) return null;

    const catalog = this.catalogDto(rule);
    return {
      version: this.snapshotVersion("catalog", catalog),
      catalog,
    };
  }

  private catalogDto(rule: ObservedRule): ProviderConversionCatalogDto {
    const catalog = rule.catalog;
    if (!catalog) {
      throw new Error("Structured catalog rule is missing its catalog");
    }

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

  private providerTriggerType(
    rule: ObservedRule,
  ): "structured_catalog" | "message_phrase" | "provider_automation" {
    const triggerType = rule.conversionRule.triggerType;
    if (
      triggerType !== "structured_catalog" &&
      triggerType !== "message_phrase" &&
      triggerType !== "provider_automation"
    ) {
      throw new Error(`Unsupported provider message rule: ${triggerType}`);
    }

    return triggerType;
  }

  private providerEventName(rule: ObservedRule): ConversionEventNameDto {
    const eventName = conversionEventNameSchema.safeParse(
      rule.conversionRule.eventName,
    );
    // Fail closed on junk in the database, but accept every catalog event.
    if (!eventName.success) {
      throw new Error(
        `Unsupported provider conversion event: ${rule.conversionRule.eventName}`,
      );
    }

    return eventName.data;
  }

  private requiredExistingDecision(
    decision: PersistedProviderConversionDecision | null,
  ): PersistedProviderConversionDecision {
    if (decision) return decision;

    throw new Error(
      "Provider conversion reevaluation requires an existing decision",
    );
  }

  private channelForEvent(
    channels: ObservedChannel[],
    event: ParsedInboundWebhookEvent,
  ): ObservedChannel | null {
    return (
      channels.find(
        (candidate) =>
          candidate.organizationId === event.organizationId &&
          candidate.providerChannelId === event.channel.providerChannelId,
      ) ?? null
    );
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

  private snapshotVersion(prefix: string, value: unknown): string {
    const digest = createHash("sha256")
      .update(JSON.stringify(value), "utf8")
      .digest("hex");

    return `${prefix}-v1:${digest}`;
  }

  private logDecision(
    persisted: PersistedProviderConversionDecision,
    created: boolean,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: "provider_conversion_decided",
        workspaceId: persisted.workspaceId,
        sourceDeliveryId: persisted.sourceDeliveryId,
        decisionId: persisted.id,
        decisionVersion: persisted.decisionVersion,
        occurrenceKey: persisted.occurrenceKey,
        decisionCode: persisted.decisionCode,
        reasonCode: persisted.reasonCode,
        created,
      }),
    );
  }

  private emptyResult(): ProviderConversionObservationResult {
    return {
      executionIds: [],
      eligibleExecutionIds: [],
    };
  }
}
