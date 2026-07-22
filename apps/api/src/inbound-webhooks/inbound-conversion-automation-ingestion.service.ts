import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ProviderConversionAutomationReprocessResultDto } from "@wpptrack/shared";
import { hashPhoneIdentity } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import {
  INBOUND_WEBHOOK_RAW_RETENTION_DAYS,
  parseInboundWebhooksConfig,
} from "../config/deployment-config";
import {
  MAX_INBOUND_WEBHOOK_PAYLOAD_BYTES,
  matchesInboundWebhookSecret,
  parseInboundWebhookProviderAttempt,
} from "./inbound-webhook-ingestion.service";
import { InboundWebhookPayloadEncryptionService } from "./inbound-webhook-payload-encryption.service";
import { InboundWebhookProductionQueueService } from "./inbound-webhook-production-queue.service";
import {
  parseUmblerAutomationV1,
  type ParsedUmblerAutomationV1,
  UMBLER_AUTOMATION_V1_PARSER_VERSION,
} from "./providers/umbler/umbler-automation-v1.parser";

const publicEndpointNotFoundMessage = "Webhook nao encontrado";
const publicPersistenceFailureMessage = "Webhook temporariamente indisponivel";
const fallbackDedupeWindowMs = 5 * 60 * 1_000;

const publicEndpointInclude = {
  providerRule: {
    include: {
      conversionRule: true,
      connection: {
        include: {
          parserRelease: true,
        },
      },
      parserRelease: true,
      channels: {
        include: {
          channel: true,
        },
      },
    },
  },
} satisfies Prisma.ProviderConversionRuleEndpointInclude;

type PublicConversionEndpoint =
  Prisma.ProviderConversionRuleEndpointGetPayload<{
    include: typeof publicEndpointInclude;
  }>;

type AutomationObservationStatus =
  "observed" | "eligible" | "blocked" | "invalid_payload" | "duplicate";

type AutomationChannel = {
  id: string;
  status: string;
  productionActivatedAt: Date | null;
};

type AutomationLead = {
  id: string;
  adId: string | null;
  ctwaClid: string | null;
};

type PreparedAutomation = {
  parsed: ParsedUmblerAutomationV1;
  contactIdentityHash: string;
  channel: AutomationChannel | null;
  lead: AutomationLead | null;
  status: "observed" | "eligible" | "blocked";
  reasonCode: string;
  valueCents: number | null;
  currency: string | null;
};

export type InboundConversionAutomationIngestionInput = {
  endpointId: string;
  token: unknown;
  contentType: string | undefined;
  providerAttempt: unknown;
  rawBody: Buffer | undefined;
};

export type InboundConversionAutomationIngestionResult = {
  status: "accepted";
  deliveryId: string;
  duplicate: boolean;
  observationStatus: AutomationObservationStatus;
};

@Injectable()
export class InboundConversionAutomationIngestionService {
  private readonly logger = new Logger(
    InboundConversionAutomationIngestionService.name,
  );

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
    @Inject(InboundWebhookPayloadEncryptionService)
    private readonly encryption: InboundWebhookPayloadEncryptionService,
    @Inject(InboundWebhookProductionQueueService)
    private readonly productionQueue: InboundWebhookProductionQueueService,
  ) {}

  async ingest(
    input: InboundConversionAutomationIngestionInput,
  ): Promise<InboundConversionAutomationIngestionResult> {
    this.assertFeatureEnabled();
    const endpoint = await this.authenticateEndpoint(
      input.endpointId,
      input.token,
    );
    const rawBody = this.requireJsonBody(input.contentType, input.rawBody);
    const payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    const parsed = parseUmblerAutomationV1(payload);
    const providerAttempt = parseInboundWebhookProviderAttempt(
      input.providerAttempt,
    );
    const receivedAt = new Date();
    const ingressKey = parsed.ok
      ? this.parsedIngressKey(endpoint.id, parsed.value.externalExecutionKey)
      : this.fallbackIngressKey(endpoint.id, rawBody, receivedAt);
    const existing = await this.findExistingDelivery(
      endpoint.providerRule.connectionId,
      ingressKey,
    );

    if (existing) {
      await this.recordDuplicate(
        endpoint,
        existing.id,
        providerAttempt,
        receivedAt,
      );
      return {
        status: "accepted",
        deliveryId: existing.id,
        duplicate: true,
        observationStatus: "duplicate",
      };
    }

    const deliveryId = randomUUID();
    const encrypted = this.encryption.encrypt(rawBody, {
      workspaceId: endpoint.workspaceId,
      connectionId: endpoint.providerRule.connectionId,
      deliveryId,
    });
    const prepared = parsed.ok
      ? await this.prepareAutomation(endpoint, parsed.value, receivedAt)
      : null;

    let persisted: {
      observationStatus: Exclude<AutomationObservationStatus, "duplicate">;
      executionId: string | null;
    };
    try {
      persisted = await this.persistDelivery({
        endpoint,
        deliveryId,
        ingressKey,
        providerAttempt,
        rawBodyLength: rawBody.length,
        receivedAt,
        encrypted,
        prepared,
        parseErrorCode: parsed.ok ? null : parsed.errorCode,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.findExistingDelivery(
          endpoint.providerRule.connectionId,
          ingressKey,
        );
        if (duplicate) {
          await this.recordDuplicate(
            endpoint,
            duplicate.id,
            providerAttempt,
            receivedAt,
          );
          return {
            status: "accepted",
            deliveryId: duplicate.id,
            duplicate: true,
            observationStatus: "duplicate",
          };
        }
      }
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }

    if (persisted.observationStatus === "eligible" && persisted.executionId) {
      try {
        await this.productionQueue.enqueueProviderConversion({
          providerConversionExecutionId: persisted.executionId,
          workspaceId: endpoint.workspaceId,
        });
      } catch {
        this.logger.warn(
          `Automation execution ${persisted.executionId} remains eligible for recovery`,
        );
      }
    }

    return {
      status: "accepted",
      deliveryId,
      duplicate: false,
      observationStatus: persisted.observationStatus,
    };
  }

  async reprocessLatestObserved(
    workspaceId: string,
    providerRuleId: string,
    actorUserId: string,
  ): Promise<ProviderConversionAutomationReprocessResultDto> {
    const config = parseInboundWebhooksConfig(this.env);
    if (
      !config.enabled ||
      !config.productionEnabled ||
      !config.conversionRulesEnabled ||
      !config.conversionProductionEnabled
    ) {
      throw new ServiceUnavailableException(
        "O processamento de conversoes da Umbler esta desativado",
      );
    }

    const endpoint = await this.prisma.providerConversionRuleEndpoint.findFirst(
      {
        where: {
          workspaceId,
          providerRuleId,
          removedAt: null,
        },
        include: publicEndpointInclude,
      },
    );
    const rule = endpoint?.providerRule;
    if (
      !endpoint ||
      !rule ||
      rule.removedAt ||
      !rule.conversionRule.active ||
      rule.conversionRule.triggerType !== "provider_automation"
    ) {
      throw new NotFoundException("Regra de automacao Umbler nao encontrada");
    }
    if (
      rule.mode !== "production" ||
      !rule.productionActivatedAt ||
      rule.parserRelease.status !== "certified" ||
      rule.parserRelease.version !== UMBLER_AUTOMATION_V1_PARSER_VERSION ||
      rule.connection.status !== "production" ||
      rule.connection.parserRelease.status !== "certified"
    ) {
      throw new ConflictException(
        "Ative o envio automatico da regra antes de reprocessar o callback",
      );
    }

    const deliveryScope = {
      workspaceId,
      connectionId: rule.connectionId,
      providerRuleEndpointId: endpoint.id,
      purpose: "conversion_automation" as const,
      payloadExpiresAt: { gt: new Date() },
    };
    const deliveryOrder = [
      { lastReceivedAt: "desc" as const },
      { id: "desc" as const },
    ];
    const observedDelivery = await this.prisma.inboundWebhookDelivery.findFirst(
      {
        where: {
          ...deliveryScope,
          providerConversionExecutions: {
            some: {
              providerRuleId: rule.id,
              status: "observed",
            },
          },
        },
        orderBy: deliveryOrder,
      },
    );
    const delivery =
      observedDelivery ??
      (await this.prisma.inboundWebhookDelivery.findFirst({
        where: {
          ...deliveryScope,
          providerConversionExecutions: {
            none: { providerRuleId: rule.id },
          },
        },
        orderBy: deliveryOrder,
      }));
    if (!delivery) {
      throw new ConflictException("Nenhum callback observado foi encontrado");
    }
    if (
      delivery.payloadExpiresAt <= new Date() ||
      !delivery.encryptedPayload ||
      !delivery.payloadIv ||
      !delivery.payloadTag ||
      !delivery.encryptionKeyVersion
    ) {
      throw new ConflictException(
        "O payload deste callback nao esta mais disponivel",
      );
    }

    let parsed: ReturnType<typeof parseUmblerAutomationV1>;
    try {
      const rawBody = this.encryption.decrypt(
        {
          encryptedPayload: delivery.encryptedPayload,
          payloadIv: delivery.payloadIv,
          payloadTag: delivery.payloadTag,
          encryptionKeyVersion: delivery.encryptionKeyVersion,
        },
        {
          workspaceId,
          connectionId: delivery.connectionId,
          deliveryId: delivery.id,
        },
      );
      parsed = parseUmblerAutomationV1(
        JSON.parse(rawBody.toString("utf8")) as unknown,
      );
    } catch {
      throw new ConflictException(
        "O payload preservado nao pode ser validado pelo parser atual",
      );
    }
    if (!parsed.ok) {
      throw new ConflictException(
        "O payload preservado nao corresponde ao contrato Umbler atual",
      );
    }

    const prepared = await this.prepareAutomation(
      endpoint,
      parsed.value,
      delivery.firstReceivedAt,
    );
    if (prepared.status === "blocked") {
      throw new ConflictException(
        this.manualReprocessBlockMessage(prepared.reasonCode),
      );
    }

    const approvedAt = new Date();
    const execution = await this.prisma.$transaction(async (transaction) => {
      const deliveryUpdate =
        await transaction.inboundWebhookDelivery.updateMany({
          where: {
            id: delivery.id,
            workspaceId,
            connectionId: rule.connectionId,
            providerRuleEndpointId: endpoint.id,
            purpose: "conversion_automation",
          },
          data: {
            parserVersion: UMBLER_AUTOMATION_V1_PARSER_VERSION,
            status: "processed",
            classification:
              prepared.channel && prepared.lead?.adId && prepared.lead.ctwaClid
                ? "eligible_route_resolved"
                : "eligible_route_unresolved",
            normalizedSummary: this.toJson({
              purpose: "conversion_automation",
              parserStatus: "parsed",
              parserVersion: UMBLER_AUTOMATION_V1_PARSER_VERSION,
              automation: prepared.parsed.automation,
              eventName: prepared.parsed.eventName,
              executionStatus: "eligible",
              reasonCode: "automation_manual_reprocess_approved",
              channelResolved: Boolean(prepared.channel),
              paidLeadResolved: Boolean(
                prepared.lead?.adId && prepared.lead.ctwaClid,
              ),
              manuallyReprocessedAt: approvedAt.toISOString(),
            }),
            parseErrorCode: null,
            routingErrorCode: null,
            processedAt: approvedAt,
          },
        });
      if (deliveryUpdate.count !== 1) {
        throw new NotFoundException("Callback observado nao encontrado");
      }

      const existing =
        await transaction.providerConversionRuleExecution.findUnique({
          where: {
            providerRuleId_externalExecutionKey: {
              providerRuleId: rule.id,
              externalExecutionKey: prepared.parsed.externalExecutionKey,
            },
          },
        });
      if (existing && existing.status !== "observed") {
        throw new ConflictException(
          "Este callback ja foi liberado ou processado",
        );
      }

      const normalizedResult = this.toJson({
        schema: prepared.parsed.schema,
        source: prepared.parsed.source,
        automation: prepared.parsed.automation,
        eventName: prepared.parsed.eventName,
        sourceConversationCreatedAt: prepared.parsed.occurredAt.toISOString(),
        channelResolved: Boolean(prepared.channel),
        paidLeadResolved: Boolean(
          prepared.lead?.adId && prepared.lead.ctwaClid,
        ),
        manualReplayApproval: {
          approved: true,
          approvedAt: approvedAt.toISOString(),
          actorUserId,
        },
      });
      const data = {
        sourceDeliveryId: delivery.id,
        channelWorkspaceId: prepared.channel ? workspaceId : null,
        channelId: prepared.channel?.id ?? null,
        occurredAt: delivery.firstReceivedAt,
        contactIdentityHash: prepared.contactIdentityHash,
        status: "eligible" as const,
        reasonCode: "automation_manual_reprocess_approved",
        normalizedResult,
        valueCents: prepared.valueCents,
        currency: prepared.currency,
        leadId: prepared.lead?.id ?? null,
        processedAt: null,
      };
      const saved = existing
        ? await transaction.providerConversionRuleExecution.update({
            where: { id: existing.id },
            data,
          })
        : await transaction.providerConversionRuleExecution.create({
            data: {
              workspaceId,
              providerRuleId: rule.id,
              externalExecutionKey: prepared.parsed.externalExecutionKey,
              ...data,
            },
          });

      if (prepared.parsed.eventName === "Purchase") {
        await transaction.purchaseReview.upsert({
          where: {
            providerRuleId_externalOccurrenceKey: {
              providerRuleId: rule.id,
              externalOccurrenceKey: prepared.parsed.externalExecutionKey,
            },
          },
          create: {
            workspaceId,
            providerRuleId: rule.id,
            sourceDeliveryId: delivery.id,
            channelWorkspaceId: prepared.channel ? workspaceId : null,
            channelId: prepared.channel?.id ?? null,
            providerExecutionWorkspaceId: workspaceId,
            providerExecutionId: saved.id,
            externalOccurrenceKey: prepared.parsed.externalExecutionKey,
            occurredAt: delivery.firstReceivedAt,
            contactIdentityHash: prepared.contactIdentityHash,
            sourceType: "provider_automation",
            status: "approved",
            classificationCode: "automation_callback_manual_reprocess",
            reasonCode: "automation_manual_reprocess_approved",
            calculatedValueCents: prepared.valueCents,
            effectiveValueCents: prepared.valueCents,
            currency: prepared.currency ?? "BRL",
            leadWorkspaceId: prepared.lead ? workspaceId : null,
            leadId: prepared.lead?.id ?? null,
            decidedByUserId: actorUserId,
            decidedAt: approvedAt,
          },
          update: {
            providerExecutionWorkspaceId: workspaceId,
            providerExecutionId: saved.id,
            status: "approved",
            reasonCode: "automation_manual_reprocess_approved",
            effectiveValueCents: prepared.valueCents,
            leadWorkspaceId: prepared.lead ? workspaceId : null,
            leadId: prepared.lead?.id ?? null,
            decidedByUserId: actorUserId,
            decidedAt: approvedAt,
            version: { increment: 1 },
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          workspaceId,
          actorUserId,
          actorType: "user",
          action: "provider_conversion_automation.manual_reprocess",
          targetType: "ProviderConversionRuleExecution",
          targetId: saved.id,
          reason: "Explicit replay of the latest observed callback",
          sourceIp: null,
          resultStatus: "eligible",
          beforeSummary: existing
            ? this.toJson({ status: existing.status })
            : undefined,
          afterSummary: this.toJson({
            status: "eligible",
            providerRuleId: rule.id,
            sourceDeliveryId: delivery.id,
            eventName: prepared.parsed.eventName,
          }),
        },
      });

      return saved;
    });

    const queued = await this.productionQueue.enqueueProviderConversion({
      providerConversionExecutionId: execution.id,
      workspaceId,
    });

    return {
      executionId: execution.id,
      sourceDeliveryId: delivery.id,
      queueStatus: queued.status,
    };
  }

  private assertFeatureEnabled(): void {
    const config = parseInboundWebhooksConfig(this.env);
    if (!config.enabled || !config.conversionRulesEnabled) {
      throw new NotFoundException(publicEndpointNotFoundMessage);
    }
  }

  private async authenticateEndpoint(
    endpointId: string,
    token: unknown,
  ): Promise<PublicConversionEndpoint> {
    let endpoint: PublicConversionEndpoint | null;
    try {
      endpoint = await this.prisma.providerConversionRuleEndpoint.findUnique({
        where: { id: endpointId },
        include: publicEndpointInclude,
      });
    } catch {
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }

    const tokenMatches = matchesInboundWebhookSecret(
      endpoint?.secretHash,
      token,
    );
    const rule = endpoint?.providerRule;

    if (
      !endpoint ||
      !rule ||
      !tokenMatches ||
      endpoint.removedAt !== null ||
      rule.removedAt !== null ||
      !rule.conversionRule.active ||
      rule.conversionRule.triggerType !== "provider_automation" ||
      rule.connection.provider !== "umbler" ||
      rule.connection.removedAt !== null ||
      !["observation", "production"].includes(rule.connection.status) ||
      rule.parserRelease.status === "retired"
    ) {
      throw new NotFoundException(publicEndpointNotFoundMessage);
    }

    return endpoint;
  }

  private requireJsonBody(
    contentType: string | undefined,
    rawBody: Buffer | undefined,
  ): Buffer {
    const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      throw new UnsupportedMediaTypeException(
        "Webhook requer Content-Type application/json",
      );
    }
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException("Payload JSON obrigatorio");
    }
    if (rawBody.length > MAX_INBOUND_WEBHOOK_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException("Payload do webhook excede o limite");
    }
    try {
      JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new BadRequestException("Payload JSON invalido");
    }
    return rawBody;
  }

  private parsedIngressKey(
    endpointId: string,
    externalExecutionKey: string,
  ): string {
    return createHash("sha256")
      .update("umbler-automation-v1\0", "utf8")
      .update(endpointId, "utf8")
      .update("\0", "utf8")
      .update(externalExecutionKey, "utf8")
      .digest("hex");
  }

  private fallbackIngressKey(
    endpointId: string,
    rawBody: Buffer,
    receivedAt: Date,
  ): string {
    const bucket = Math.floor(receivedAt.getTime() / fallbackDedupeWindowMs);
    return createHash("sha256")
      .update("umbler-automation-fallback-v1\0", "utf8")
      .update(endpointId, "utf8")
      .update("\0", "utf8")
      .update(String(bucket), "utf8")
      .update("\0", "utf8")
      .update(rawBody)
      .digest("hex");
  }

  private async prepareAutomation(
    endpoint: PublicConversionEndpoint,
    parsed: ParsedUmblerAutomationV1,
    receivedAt: Date,
  ): Promise<PreparedAutomation> {
    const contactIdentityHash = hashPhoneIdentity(parsed.phone)!;
    const scopedChannelIds = endpoint.providerRule.channels.map(
      (scope) => scope.channelId,
    );

    try {
      const recentEvent =
        scopedChannelIds.length > 0
          ? await this.prisma.inboundWebhookEvent.findFirst({
              where: {
                workspaceId: endpoint.workspaceId,
                connectionId: endpoint.providerRule.connectionId,
                channelId: { in: scopedChannelIds },
                contactIdentityHash,
                occurredAt: {
                  lte: new Date(receivedAt.getTime() + 5 * 60 * 1_000),
                },
              },
              orderBy: { occurredAt: "desc" },
              select: {
                channel: {
                  select: {
                    id: true,
                    status: true,
                    productionActivatedAt: true,
                  },
                },
              },
            })
          : null;
      const fallbackChannel =
        endpoint.providerRule.channels.length === 1
          ? endpoint.providerRule.channels[0].channel
          : null;
      const channel = recentEvent?.channel ?? fallbackChannel;
      const lead = await this.prisma.lead.findFirst({
        where: {
          workspaceId: endpoint.workspaceId,
          phoneHash: contactIdentityHash,
        },
        select: {
          id: true,
          adId: true,
          ctwaClid: true,
        },
      });
      const readiness = this.readiness({
        endpoint,
        parsed,
        channel,
        lead,
        receivedAt,
      });

      return {
        parsed,
        contactIdentityHash,
        channel,
        lead,
        ...readiness,
        valueCents:
          parsed.eventName === "Purchase"
            ? endpoint.providerRule.conversionRule.defaultValueCents
            : null,
        currency:
          parsed.eventName === "Purchase"
            ? endpoint.providerRule.conversionRule.defaultCurrency
            : null,
      };
    } catch {
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }
  }

  private readiness(input: {
    endpoint: PublicConversionEndpoint;
    parsed: ParsedUmblerAutomationV1;
    channel: AutomationChannel | null;
    lead: AutomationLead | null;
    receivedAt: Date;
  }): { status: "observed" | "eligible" | "blocked"; reasonCode: string } {
    const rule = input.endpoint.providerRule;
    const config = parseInboundWebhooksConfig(this.env);

    if (input.parsed.eventName !== rule.conversionRule.eventName) {
      return { status: "blocked", reasonCode: "automation_event_mismatch" };
    }
    if (!input.channel) {
      return { status: "blocked", reasonCode: "automation_channel_unresolved" };
    }
    if (!input.lead?.adId || !input.lead.ctwaClid) {
      return { status: "blocked", reasonCode: "automation_paid_lead_missing" };
    }
    if (
      input.parsed.eventName === "Purchase" &&
      (!rule.conversionRule.defaultValueCents ||
        !rule.conversionRule.defaultCurrency)
    ) {
      return { status: "blocked", reasonCode: "automation_value_missing" };
    }
    if (
      !config.enabled ||
      !config.productionEnabled ||
      !config.conversionProductionEnabled ||
      rule.mode !== "production"
    ) {
      return {
        status: "observed",
        reasonCode: "automation_matched_observation",
      };
    }
    if (
      rule.parserRelease.status !== "certified" ||
      rule.connection.parserRelease.status !== "certified" ||
      rule.connection.status !== "production" ||
      rule.connection.removedAt !== null ||
      input.channel.status !== "active"
    ) {
      return { status: "blocked", reasonCode: "production_context_invalid" };
    }
    if (
      !rule.productionActivatedAt ||
      !input.channel.productionActivatedAt ||
      input.receivedAt < rule.productionActivatedAt ||
      input.receivedAt < input.channel.productionActivatedAt
    ) {
      return { status: "observed", reasonCode: "before_production_activation" };
    }

    return { status: "eligible", reasonCode: "automation_matched" };
  }

  private async findExistingDelivery(
    connectionId: string,
    ingressKey: string,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.inboundWebhookDelivery.findUnique({
        where: {
          connectionId_ingressKey: { connectionId, ingressKey },
        },
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }
  }

  private async persistDelivery(input: {
    endpoint: PublicConversionEndpoint;
    deliveryId: string;
    ingressKey: string;
    providerAttempt: number | null;
    rawBodyLength: number;
    receivedAt: Date;
    encrypted: {
      encryptedPayload: string;
      payloadIv: string;
      payloadTag: string;
      encryptionKeyVersion: number;
    };
    prepared: PreparedAutomation | null;
    parseErrorCode: string | null;
  }): Promise<{
    observationStatus: Exclude<AutomationObservationStatus, "duplicate">;
    executionId: string | null;
  }> {
    return this.prisma.$transaction(async (transaction) => {
      await this.revalidateEndpoint(transaction, input.endpoint);
      const prepared = input.prepared;
      await transaction.inboundWebhookDelivery.create({
        data: {
          id: input.deliveryId,
          workspaceId: input.endpoint.workspaceId,
          connectionId: input.endpoint.providerRule.connectionId,
          provider: "umbler",
          ingressKey: input.ingressKey,
          externalDeliveryId: prepared?.parsed.externalExecutionKey ?? null,
          providerEventType:
            prepared?.parsed.automation ?? "automation_callback",
          parserVersion: UMBLER_AUTOMATION_V1_PARSER_VERSION,
          purpose: "conversion_automation",
          providerRuleEndpointWorkspaceId: input.endpoint.workspaceId,
          providerRuleEndpointId: input.endpoint.id,
          status: prepared ? "processed" : "failed",
          classification: prepared
            ? prepared.channel && prepared.lead?.adId && prepared.lead.ctwaClid
              ? "eligible_route_resolved"
              : "eligible_route_unresolved"
            : "invalid_payload",
          firstReceivedAt: input.receivedAt,
          lastReceivedAt: input.receivedAt,
          providerAttempt: input.providerAttempt,
          ...input.encrypted,
          payloadExpiresAt: new Date(
            input.receivedAt.getTime() +
              INBOUND_WEBHOOK_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
          ),
          normalizedSummary: this.toJson(
            prepared
              ? {
                  purpose: "conversion_automation",
                  parserStatus: "parsed",
                  automation: prepared.parsed.automation,
                  eventName: prepared.parsed.eventName,
                  executionStatus: prepared.status,
                  reasonCode: prepared.reasonCode,
                  channelResolved: Boolean(prepared.channel),
                  paidLeadResolved: Boolean(
                    prepared.lead?.adId && prepared.lead.ctwaClid,
                  ),
                  rawBodyLength: input.rawBodyLength,
                }
              : {
                  purpose: "conversion_automation",
                  parserStatus: "invalid_payload",
                  rawBodyLength: input.rawBodyLength,
                },
          ),
          parseErrorCode: input.parseErrorCode,
          routingErrorCode:
            prepared?.status === "blocked" ? prepared.reasonCode : null,
          processedAt: input.receivedAt,
        },
      });

      let execution: { id: string; status: string } | null = null;
      if (prepared) {
        execution = await transaction.providerConversionRuleExecution.upsert({
          where: {
            providerRuleId_externalExecutionKey: {
              providerRuleId: input.endpoint.providerRule.id,
              externalExecutionKey: prepared.parsed.externalExecutionKey,
            },
          },
          create: {
            workspaceId: input.endpoint.workspaceId,
            providerRuleId: input.endpoint.providerRule.id,
            sourceDeliveryId: input.deliveryId,
            channelWorkspaceId: prepared.channel
              ? input.endpoint.workspaceId
              : null,
            channelId: prepared.channel?.id ?? null,
            externalExecutionKey: prepared.parsed.externalExecutionKey,
            occurredAt: input.receivedAt,
            contactIdentityHash: prepared.contactIdentityHash,
            status: prepared.status,
            reasonCode: prepared.reasonCode,
            normalizedResult: this.toJson({
              schema: prepared.parsed.schema,
              source: prepared.parsed.source,
              automation: prepared.parsed.automation,
              eventName: prepared.parsed.eventName,
              sourceConversationCreatedAt:
                prepared.parsed.occurredAt.toISOString(),
              channelResolved: Boolean(prepared.channel),
              paidLeadResolved: Boolean(
                prepared.lead?.adId && prepared.lead.ctwaClid,
              ),
            }),
            valueCents: prepared.valueCents,
            currency: prepared.currency,
            leadId: prepared.lead?.id ?? null,
          },
          update: {},
          select: { id: true, status: true },
        });

        if (prepared.parsed.eventName === "Purchase") {
          await transaction.purchaseReview.upsert({
            where: {
              providerRuleId_externalOccurrenceKey: {
                providerRuleId: input.endpoint.providerRule.id,
                externalOccurrenceKey: prepared.parsed.externalExecutionKey,
              },
            },
            create: {
              workspaceId: input.endpoint.workspaceId,
              providerRuleId: input.endpoint.providerRule.id,
              sourceDeliveryId: input.deliveryId,
              channelWorkspaceId: prepared.channel
                ? input.endpoint.workspaceId
                : null,
              channelId: prepared.channel?.id ?? null,
              providerExecutionWorkspaceId: input.endpoint.workspaceId,
              providerExecutionId: execution.id,
              externalOccurrenceKey: prepared.parsed.externalExecutionKey,
              occurredAt: input.receivedAt,
              contactIdentityHash: prepared.contactIdentityHash,
              sourceType: "provider_automation",
              status: "recognized",
              classificationCode: "automation_callback_recognized",
              reasonCode: prepared.reasonCode,
              calculatedValueCents: prepared.valueCents,
              effectiveValueCents: prepared.valueCents,
              currency: prepared.currency ?? "BRL",
              leadWorkspaceId: prepared.lead
                ? input.endpoint.workspaceId
                : null,
              leadId: prepared.lead?.id ?? null,
            },
            update: {},
          });
        }
      }

      await this.touchEndpointAndConnection(
        transaction,
        input.endpoint,
        input.receivedAt,
        Boolean(prepared),
      );

      return {
        observationStatus: prepared
          ? (execution!.status as "observed" | "eligible" | "blocked")
          : "invalid_payload",
        executionId: execution?.id ?? null,
      };
    });
  }

  private async recordDuplicate(
    endpoint: PublicConversionEndpoint,
    deliveryId: string,
    providerAttempt: number | null,
    receivedAt: Date,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.revalidateEndpoint(transaction, endpoint);
        const updated = await transaction.inboundWebhookDelivery.updateMany({
          where: {
            id: deliveryId,
            workspaceId: endpoint.workspaceId,
            connectionId: endpoint.providerRule.connectionId,
            purpose: "conversion_automation",
            providerRuleEndpointId: endpoint.id,
          },
          data: {
            attemptCount: { increment: 1 },
            lastReceivedAt: receivedAt,
            providerAttempt: providerAttempt ?? undefined,
          },
        });
        if (updated.count !== 1) {
          throw new NotFoundException(publicEndpointNotFoundMessage);
        }
        await this.touchEndpointAndConnection(
          transaction,
          endpoint,
          receivedAt,
          false,
        );
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }
  }

  private async revalidateEndpoint(
    transaction: Prisma.TransactionClient,
    endpoint: PublicConversionEndpoint,
  ): Promise<void> {
    const current = await transaction.providerConversionRuleEndpoint.findFirst({
      where: {
        id: endpoint.id,
        workspaceId: endpoint.workspaceId,
        secretHash: endpoint.secretHash,
        removedAt: null,
        providerRule: {
          removedAt: null,
          parserRelease: { status: { not: "retired" } },
          conversionRule: {
            active: true,
            triggerType: "provider_automation",
          },
          connection: {
            removedAt: null,
            status: { in: ["observation", "production"] },
          },
        },
      },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundException(publicEndpointNotFoundMessage);
    }
  }

  private async touchEndpointAndConnection(
    transaction: Prisma.TransactionClient,
    endpoint: PublicConversionEndpoint,
    receivedAt: Date,
    parsedSuccessfully: boolean,
  ): Promise<void> {
    const data = {
      lastDeliveryAt: receivedAt,
      ...(parsedSuccessfully ? { lastSuccessfulParseAt: receivedAt } : {}),
    };
    const [endpointUpdate, connectionUpdate] = await Promise.all([
      transaction.providerConversionRuleEndpoint.updateMany({
        where: {
          id: endpoint.id,
          workspaceId: endpoint.workspaceId,
          secretHash: endpoint.secretHash,
          removedAt: null,
        },
        data,
      }),
      transaction.inboundWebhookConnection.updateMany({
        where: {
          id: endpoint.providerRule.connectionId,
          workspaceId: endpoint.workspaceId,
          removedAt: null,
          status: { in: ["observation", "production"] },
        },
        data,
      }),
    ]);

    if (endpointUpdate.count !== 1 || connectionUpdate.count !== 1) {
      throw new NotFoundException(publicEndpointNotFoundMessage);
    }
  }

  private manualReprocessBlockMessage(reasonCode: string): string {
    const messages: Record<string, string> = {
      automation_event_mismatch:
        "O callback nao corresponde ao evento configurado nesta regra",
      automation_channel_unresolved:
        "O canal do callback ainda nao foi localizado",
      automation_paid_lead_missing:
        "O callback ainda nao possui um lead pago com CTWA",
      automation_value_missing:
        "Configure o valor medio antes de reprocessar a compra",
      production_context_invalid:
        "A conexao ou o canal ainda nao esta pronto para producao",
    };

    return messages[reasonCode] ?? "O callback ainda nao pode ser reprocessado";
  }

  private toJson(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
