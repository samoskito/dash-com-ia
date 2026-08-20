import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ProviderConversionDecisionRuleSnapshotDto } from "@wpptrack/shared";
import {
  conversionEventNameSchema,
  readMessagePhraseConfig,
  type ConversionEventNameDto,
} from "@wpptrack/shared";
import { hashPhoneIdentity } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import {
  INBOUND_WEBHOOK_RAW_RETENTION_DAYS,
  parseInboundWebhooksConfig,
} from "../config/deployment-config";
import { ProviderConversionDecisionEngine } from "../conversion-rules/provider-conversion-decision.engine";
import type { ProviderConversionDecisionInput } from "../conversion-rules/provider-conversion-decision.types";
import { ProviderConversionDecisionRepository } from "../conversion-rules/provider-conversion-decision.repository";
import {
  ProviderConversionOrchestrator,
  type ProviderConversionTechnicalDisposition,
} from "../conversion-rules/provider-conversion-orchestrator.service";
import { ProviderConversionPaidLeadResolver } from "../conversion-rules/provider-conversion-paid-lead-resolver.service";
import { InboundWebhookProductionQueueService } from "./inbound-webhook-production-queue.service";
import {
  UazapiConversionBridgeService,
  type UazapiBridgeInstance,
} from "./uazapi-conversion-bridge.service";

const PARSER_VERSION = "v1";

const ruleInclude = {
  conversionRule: true,
  connection: {
    include: {
      parserRelease: true,
    },
  },
  parserRelease: true,
} satisfies Prisma.ProviderConversionRuleConfigInclude;

type Rule = Prisma.ProviderConversionRuleConfigGetPayload<{
  include: typeof ruleInclude;
}>;

export type UazapiTeamMessageInput = {
  workspaceId: string;
  instance: UazapiBridgeInstance;
  phone: string;
  messageText: string;
  externalMessageId?: string | null;
  occurredAt?: Date;
};

export type UazapiTeamMessageResult = {
  /** True once at least one active message_phrase rule matched the event. */
  evaluated: boolean;
  eligibleExecutionId: string | null;
};

export type UazapiLabelInput = {
  workspaceId: string;
  instance: UazapiBridgeInstance;
  phone: string;
  labels: string[];
  externalEventId?: string | null;
  occurredAt?: Date;
};

/**
 * U2c: evaluates message_phrase conversion rules for `fromMe=true` (team)
 * messages on a UAZAPI/NOD WhatsApp instance, reusing the same decision
 * engine + orchestrator + production pipeline as the Umbler provider
 * conversion flow (see ProviderConversionObservationService). Paid-lead-only,
 * fail-closed: no resolved lead (adId + ctwaClid) means no CAPI, ever.
 */
@Injectable()
export class UazapiProviderConversionService {
  private readonly logger = new Logger(UazapiProviderConversionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
    @Inject(UazapiConversionBridgeService)
    private readonly bridge: UazapiConversionBridgeService,
    @Inject(ProviderConversionDecisionEngine)
    private readonly decisionEngine: ProviderConversionDecisionEngine,
    @Inject(ProviderConversionDecisionRepository)
    private readonly decisions: ProviderConversionDecisionRepository,
    @Inject(ProviderConversionOrchestrator)
    private readonly orchestrator: ProviderConversionOrchestrator,
    @Inject(ProviderConversionPaidLeadResolver)
    private readonly paidLeads: ProviderConversionPaidLeadResolver,
    @Inject(InboundWebhookProductionQueueService)
    private readonly productionQueue: InboundWebhookProductionQueueService,
  ) {}

  async evaluateTeamMessage(
    input: UazapiTeamMessageInput,
  ): Promise<UazapiTeamMessageResult> {
    const config = parseInboundWebhooksConfig(this.env);
    if (!config.enabled || !config.conversionRulesEnabled) {
      return { evaluated: false, eligibleExecutionId: null };
    }

    const phone = input.phone.trim();
    const messageText = input.messageText.trim();
    if (!phone || !messageText) {
      return { evaluated: false, eligibleExecutionId: null };
    }

    const bridged = await this.bridge.ensureBridge(input.instance);
    const rules = await this.loadRules(
      input.workspaceId,
      bridged.connectionId,
      bridged.channelId,
    );
    if (rules.length === 0) {
      return { evaluated: false, eligibleExecutionId: null };
    }

    const channel = await this.prisma.inboundWebhookChannel.findFirst({
      where: { id: bridged.channelId, workspaceId: input.workspaceId },
      select: { status: true, productionActivatedAt: true },
    });
    if (!channel) {
      return { evaluated: false, eligibleExecutionId: null };
    }

    const leadResolution = await this.paidLeads.resolve({
      workspaceId: input.workspaceId,
      phone,
    });
    const occurredAt = input.occurredAt ?? new Date();
    const externalEventId = this.externalEventId(input, occurredAt);
    const occurrenceKey = `uazapi:${bridged.channelId}:${externalEventId}`;

    let evaluated = false;
    let eligibleExecutionId: string | null = null;

    for (const rule of rules) {
      const ruleSnapshot = this.ruleSnapshot(rule);
      const decisionInput: ProviderConversionDecisionInput = {
        parserVersion: PARSER_VERSION,
        rule: ruleSnapshot,
        catalog: null,
        leadResolution,
        contactIdentityHash: hashPhoneIdentity(phone) ?? null,
        occurrence: {
          source: "message",
          provider: "uazapi",
          workspaceId: input.workspaceId,
          connectionId: bridged.connectionId,
          channelId: bridged.channelId,
          externalDeliveryId: null,
          externalEventId,
          externalMessageId: externalEventId,
          occurrenceKey,
          eventName: ruleSnapshot.eventName,
          occurredAt: occurredAt.toISOString(),
          // fromMe=true is always the workspace's team/bot sending from the
          // connected number; contacts never reach this branch.
          authorType: "organization_member",
          messageText,
        },
      };

      const decision = this.decisionEngine.evaluate(decisionInput);
      if (!decision) continue;
      evaluated = true;

      const deliveryId = await this.ensureDelivery({
        workspaceId: input.workspaceId,
        connectionId: bridged.connectionId,
        ingressKey: occurrenceKey,
      });
      const persistedDecision = await this.decisions.recordInitial({
        decision,
        sourceDeliveryId: deliveryId,
      });
      const disposition = this.disposition({
        config,
        decisionMode: persistedDecision.decision.rule.mode,
        reasonCode: persistedDecision.decision.reasonCode,
        rule,
        channel,
        occurredAt,
      });
      const orchestration = await this.orchestrator.orchestrate({
        persistedDecision,
        disposition,
      });

      if (orchestration.eligibleExecutionId) {
        eligibleExecutionId = orchestration.eligibleExecutionId;
        await this.productionQueue.enqueueProviderConversion({
          providerConversionExecutionId: orchestration.eligibleExecutionId,
          workspaceId: input.workspaceId,
        });
      }
    }

    return { evaluated, eligibleExecutionId };
  }

  /** Evaluates UAZAPI WhatsApp labels through the same paid-lead-only path. */
  async evaluateLabels(input: UazapiLabelInput): Promise<UazapiTeamMessageResult> {
    const config = parseInboundWebhooksConfig(this.env);
    const phone = input.phone.trim();
    const labels = [...new Set(input.labels.map((label) => label.trim()).filter(Boolean))];
    if (!config.enabled || !config.conversionRulesEnabled || !phone || labels.length === 0) {
      return { evaluated: false, eligibleExecutionId: null };
    }

    const bridged = await this.bridge.ensureBridge(input.instance);
    const rules = await this.loadRules(input.workspaceId, bridged.connectionId, bridged.channelId, "provider_automation");
    if (rules.length === 0) return { evaluated: false, eligibleExecutionId: null };

    const channel = await this.prisma.inboundWebhookChannel.findFirst({
      where: { id: bridged.channelId, workspaceId: input.workspaceId },
      select: { status: true, productionActivatedAt: true },
    });
    if (!channel) return { evaluated: false, eligibleExecutionId: null };

    const leadResolution = await this.paidLeads.resolve({ workspaceId: input.workspaceId, phone });
    const occurredAt = input.occurredAt ?? new Date();
    const externalEventId = input.externalEventId?.trim() || this.labelEventId(phone, labels, occurredAt);
    let evaluated = false;
    let eligibleExecutionId: string | null = null;

    for (const rule of rules) {
      const ruleSnapshot = this.ruleSnapshot(rule, "provider_automation");
      const matchedLabel = labels.find((label) =>
        ruleSnapshot.triggerPhrases.some((phrase) =>
          phrase.trim().toLocaleLowerCase("pt-BR") === label.trim().toLocaleLowerCase("pt-BR"),
        ),
      );
      if (!matchedLabel) continue;

      const occurrenceKey = `uazapi:label:${bridged.channelId}:${rule.id}:${phone}:${matchedLabel}:${externalEventId}`;
      const decision = this.decisionEngine.evaluate({
        parserVersion: PARSER_VERSION,
        rule: ruleSnapshot,
        catalog: null,
        leadResolution,
        contactIdentityHash: hashPhoneIdentity(phone) ?? null,
        occurrence: {
          source: "automation",
          provider: "uazapi",
          workspaceId: input.workspaceId,
          connectionId: bridged.connectionId,
          channelId: bridged.channelId,
          externalDeliveryId: null,
          externalEventId,
          externalMessageId: null,
          occurrenceKey,
          eventName: ruleSnapshot.eventName,
          occurredAt: occurredAt.toISOString(),
          authorType: null,
          automation: "label",
          labels,
          matchedLabel,
        },
      });
      if (!decision) continue;
      evaluated = true;
      const deliveryId = await this.ensureDelivery({ workspaceId: input.workspaceId, connectionId: bridged.connectionId, ingressKey: occurrenceKey });
      const persistedDecision = await this.decisions.recordInitial({ decision, sourceDeliveryId: deliveryId });
      const orchestration = await this.orchestrator.orchestrate({
        persistedDecision,
        disposition: this.disposition({ config, decisionMode: persistedDecision.decision.rule.mode, reasonCode: persistedDecision.decision.reasonCode, rule, channel, occurredAt }),
      });
      if (orchestration.eligibleExecutionId) {
        eligibleExecutionId = orchestration.eligibleExecutionId;
        await this.productionQueue.enqueueProviderConversion({ providerConversionExecutionId: eligibleExecutionId, workspaceId: input.workspaceId });
      }
    }
    return { evaluated, eligibleExecutionId };
  }

  private async loadRules(
    workspaceId: string,
    connectionId: string,
    channelId: string,
    triggerType: "message_phrase" | "provider_automation" = "message_phrase",
  ): Promise<Rule[]> {
    return this.prisma.providerConversionRuleConfig.findMany({
      where: {
        workspaceId,
        connectionId,
        removedAt: null,
        conversionRule: {
          active: true,
          triggerType,
        },
        channels: {
          some: { channelId },
        },
      },
      include: ruleInclude,
      orderBy: { createdAt: "asc" },
    });
  }

  private async ensureDelivery(input: {
    workspaceId: string;
    connectionId: string;
    ingressKey: string;
  }): Promise<string> {
    const existing = await this.prisma.inboundWebhookDelivery.findUnique({
      where: {
        connectionId_ingressKey: {
          connectionId: input.connectionId,
          ingressKey: input.ingressKey,
        },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const receivedAt = new Date();
    try {
      const created = await this.prisma.inboundWebhookDelivery.create({
        data: {
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          provider: "uazapi",
          ingressKey: input.ingressKey,
          parserVersion: PARSER_VERSION,
          status: "processed",
          firstReceivedAt: receivedAt,
          lastReceivedAt: receivedAt,
          processedAt: receivedAt,
          payloadExpiresAt: new Date(
            receivedAt.getTime() +
              INBOUND_WEBHOOK_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
          ),
        },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const raced = await this.prisma.inboundWebhookDelivery.findUnique({
          where: {
            connectionId_ingressKey: {
              connectionId: input.connectionId,
              ingressKey: input.ingressKey,
            },
          },
          select: { id: true },
        });
        if (raced) return raced.id;
      }
      throw error;
    }
  }

  /**
   * Mirrors ProviderConversionObservationService's disposition() for the
   * message-source case: observation config off / rule in observation mode
   * -> observed; parser/connection/channel not production-ready -> blocked;
   * production not yet activated for the rule or channel at occurredAt ->
   * observed; otherwise eligible (CAPI queued by the caller).
   */
  private disposition(input: {
    config: ReturnType<typeof parseInboundWebhooksConfig>;
    decisionMode: "observation" | "production";
    reasonCode: string;
    rule: Rule;
    channel: { status: string; productionActivatedAt: Date | null };
    occurredAt: Date;
  }): ProviderConversionTechnicalDisposition {
    if (
      !input.config.conversionProductionEnabled ||
      input.decisionMode !== "production"
    ) {
      return {
        state: "observed",
        reasonCode: `${input.reasonCode}_observation`,
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
      return { state: "blocked", reasonCode: "production_context_invalid" };
    }
    if (
      !input.rule.productionActivatedAt ||
      !input.channel.productionActivatedAt ||
      input.occurredAt < input.rule.productionActivatedAt ||
      input.occurredAt < input.channel.productionActivatedAt
    ) {
      return { state: "observed", reasonCode: "before_production_activation" };
    }

    return { state: "eligible", reasonCode: input.reasonCode };
  }

  private ruleSnapshot(
    rule: Rule,
    triggerType: "message_phrase" | "provider_automation" = "message_phrase",
  ): ProviderConversionDecisionRuleSnapshotDto {
    const eventName = this.eventName(rule);
    const messagePhrase = readMessagePhraseConfig(
      rule.conversionRule.defaultItems,
    );

    return {
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
      valueMode: messagePhrase.valueMode,
      exampleMessage: messagePhrase.exampleMessage,
      version: `rule-v1:${rule.updatedAt.getTime()}:${rule.conversionRule.updatedAt.getTime()}`,
    };
  }

  private eventName(rule: Rule): ConversionEventNameDto {
    const eventName = conversionEventNameSchema.safeParse(
      rule.conversionRule.eventName,
    );
    // Fail closed on junk in the database, but accept every catalog event.
    if (!eventName.success) {
      throw new Error(
        `Unsupported uazapi conversion event: ${rule.conversionRule.eventName}`,
      );
    }
    return eventName.data;
  }

  private externalEventId(
    input: UazapiTeamMessageInput,
    occurredAt: Date,
  ): string {
    const trimmed = input.externalMessageId?.trim();
    if (trimmed) return trimmed;

    // No stable provider message id: fall back to a coarse (minute-bucket)
    // fingerprint so identical retried webhooks still dedupe.
    return createHash("sha256")
      .update(
        `${input.phone} ${input.messageText} ${occurredAt
          .toISOString()
          .slice(0, 16)}`,
        "utf8",
      )
      .digest("hex");
  }

  private labelEventId(phone: string, labels: string[], occurredAt: Date): string {
    return createHash("sha256")
      .update(`${phone}\u0000${labels.join("\u0000")}\u0000${occurredAt.toISOString().slice(0, 16)}`, "utf8")
      .digest("hex");
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
