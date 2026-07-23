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
import type {
  ProviderConversionAutomationAuditDto,
  ProviderConversionAutomationAuditItemDto,
  ProviderConversionAutomationPayloadDto,
  ProviderConversionAutomationReprocessBatchItemDto,
  ProviderConversionAutomationReprocessBatchResultDto,
  ProviderConversionAutomationReprocessResultDto,
} from "@wpptrack/shared";
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
const missingPaidLeadRecoveryWindowMs = 24 * 60 * 60 * 1_000;
const missingPaidLeadReasonCodes = [
  "automation_paid_lead_missing",
  "provider_conversion_paid_lead_missing",
] as const;

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

const automationAuditDeliveryInclude = {
  providerConversionExecutions: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
    include: {
      channel: {
        select: {
          id: true,
          channelName: true,
          connectedPhone: true,
        },
      },
    },
  },
} satisfies Prisma.InboundWebhookDeliveryInclude;

type AutomationAuditDelivery = Prisma.InboundWebhookDeliveryGetPayload<{
  include: typeof automationAuditDeliveryInclude;
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

type AutomationReprocessOutcome =
  ProviderConversionAutomationReprocessBatchItemDto;

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
    const endpoint = await this.requireProductionAutomationEndpoint(
      workspaceId,
      providerRuleId,
    );
    const rule = endpoint.providerRule;

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
    const outcome = await this.reprocessDelivery(
      endpoint,
      delivery.id,
      actorUserId,
    );
    if (outcome.status === "blocked" || outcome.status === "skipped") {
      throw new ConflictException(outcome.message);
    }
    if (!outcome.executionId) {
      throw new ConflictException("O callback ainda nao pode ser reprocessado");
    }

    return {
      executionId: outcome.executionId,
      sourceDeliveryId: outcome.deliveryId,
      queueStatus: outcome.status === "existing" ? "existing" : "queued",
    };
  }

  async listAutomationCallbacks(
    workspaceId: string,
    providerRuleId: string,
  ): Promise<ProviderConversionAutomationAuditDto> {
    const endpoint = await this.requireAutomationEndpoint(
      workspaceId,
      providerRuleId,
    );
    const now = new Date();
    const missingPaidLeadRecoveryCutoff = new Date(
      now.getTime() - missingPaidLeadRecoveryWindowMs,
    );
    const scope = {
      workspaceId,
      connectionId: endpoint.providerRule.connectionId,
      providerRuleEndpointId: endpoint.id,
      purpose: "conversion_automation" as const,
    };
    const [deliveries, total, grouped, recoverable] = await Promise.all([
      this.prisma.inboundWebhookDelivery.findMany({
        where: scope,
        include: automationAuditDeliveryInclude,
        orderBy: [{ lastReceivedAt: "desc" }, { id: "desc" }],
        take: 100,
      }),
      this.prisma.inboundWebhookDelivery.count({ where: scope }),
      this.prisma.providerConversionRuleExecution.groupBy({
        by: ["status"],
        where: { workspaceId, providerRuleId },
        _count: { _all: true },
      }),
      this.prisma.providerConversionRuleExecution.count({
        where: {
          workspaceId,
          providerRuleId,
          status: { in: ["observed", "blocked", "failed"] },
          OR: [
            { reasonCode: null },
            { reasonCode: { notIn: [...missingPaidLeadReasonCodes] } },
            {
              reasonCode: { in: [...missingPaidLeadReasonCodes] },
              sourceDelivery: {
                firstReceivedAt: { gt: missingPaidLeadRecoveryCutoff },
              },
            },
          ],
          sourceDelivery: {
            payloadExpiresAt: { gt: now },
            encryptedPayload: { not: null },
            payloadIv: { not: null },
            payloadTag: { not: null },
            encryptionKeyVersion: { not: null },
          },
        },
      }),
    ]);
    const counts = new Map(
      grouped.map((group) => [group.status, group._count._all]),
    );
    const executionCount = grouped.reduce(
      (sum, group) => sum + group._count._all,
      0,
    );

    return {
      providerRuleId,
      summary: {
        total,
        observed: counts.get("observed") ?? 0,
        blocked: counts.get("blocked") ?? 0,
        queued: counts.get("eligible") ?? 0,
        materialized: counts.get("materialized") ?? 0,
        failed: counts.get("failed") ?? 0,
        invalid: Math.max(total - executionCount, 0),
        recoverable,
      },
      items: deliveries.map((delivery) =>
        this.automationAuditItem(delivery, now),
      ),
    };
  }

  async readAutomationPayload(
    workspaceId: string,
    providerRuleId: string,
    deliveryId: string,
    actorUserId: string,
  ): Promise<ProviderConversionAutomationPayloadDto> {
    const endpoint = await this.requireAutomationEndpoint(
      workspaceId,
      providerRuleId,
    );
    const delivery = await this.findAutomationDelivery(endpoint, deliveryId);
    const payload = this.decryptAutomationPayload(delivery);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ConflictException("O payload preservado nao e um objeto JSON");
    }

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId,
        actorType: "user",
        action: "provider_conversion_automation.payload.read",
        targetType: "InboundWebhookDelivery",
        targetId: delivery.id,
        reason: "Explicit workspace callback audit",
        sourceIp: null,
        resultStatus: "success",
        afterSummary: this.toJson({ providerRuleId }),
      },
    });

    return {
      providerRuleId,
      deliveryId: delivery.id,
      receivedAt: delivery.firstReceivedAt.toISOString(),
      payloadExpiresAt: delivery.payloadExpiresAt.toISOString(),
      payload: payload as Record<string, unknown>,
    };
  }

  async reprocessSelectedCallbacks(
    workspaceId: string,
    providerRuleId: string,
    deliveryIds: string[],
    actorUserId: string,
  ): Promise<ProviderConversionAutomationReprocessBatchResultDto> {
    const endpoint = await this.requireProductionAutomationEndpoint(
      workspaceId,
      providerRuleId,
    );
    const selected = [...new Set(deliveryIds)].slice(0, 50);
    const items: ProviderConversionAutomationReprocessBatchItemDto[] = [];

    for (const deliveryId of selected) {
      try {
        items.push(
          await this.reprocessDelivery(endpoint, deliveryId, actorUserId),
        );
      } catch (error) {
        items.push({
          deliveryId,
          executionId: null,
          status: "skipped",
          reasonCode: "reprocess_failed",
          message:
            error instanceof Error
              ? error.message
              : "Nao foi possivel reprocessar este callback",
        });
      }
    }

    return {
      providerRuleId,
      requested: selected.length,
      queued: items.filter((item) =>
        ["queued", "existing", "eligible"].includes(item.status),
      ).length,
      blocked: items.filter((item) => item.status === "blocked").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      items,
    };
  }

  private async requireAutomationEndpoint(
    workspaceId: string,
    providerRuleId: string,
  ): Promise<PublicConversionEndpoint> {
    this.assertFeatureEnabled();
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
      rule.conversionRule.triggerType !== "provider_automation" ||
      rule.connection.removedAt
    ) {
      throw new NotFoundException("Regra de automacao Umbler nao encontrada");
    }

    return endpoint;
  }

  private async requireProductionAutomationEndpoint(
    workspaceId: string,
    providerRuleId: string,
  ): Promise<PublicConversionEndpoint> {
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
    const endpoint = await this.requireAutomationEndpoint(
      workspaceId,
      providerRuleId,
    );
    const rule = endpoint.providerRule;
    if (
      rule.mode !== "production" ||
      !rule.productionActivatedAt ||
      rule.parserRelease.status !== "certified" ||
      rule.parserRelease.version !== UMBLER_AUTOMATION_V1_PARSER_VERSION ||
      rule.connection.status !== "production" ||
      rule.connection.parserRelease.status !== "certified"
    ) {
      throw new ConflictException(
        "Ative o envio automatico da regra antes de reprocessar callbacks",
      );
    }

    return endpoint;
  }

  private async findAutomationDelivery(
    endpoint: PublicConversionEndpoint,
    deliveryId: string,
  ): Promise<AutomationAuditDelivery> {
    const delivery = await this.prisma.inboundWebhookDelivery.findFirst({
      where: {
        id: deliveryId,
        workspaceId: endpoint.workspaceId,
        connectionId: endpoint.providerRule.connectionId,
        providerRuleEndpointId: endpoint.id,
        purpose: "conversion_automation",
      },
      include: automationAuditDeliveryInclude,
    });
    if (!delivery) {
      throw new NotFoundException("Callback nao encontrado nesta regra");
    }

    return delivery;
  }

  private decryptAutomationPayload(delivery: AutomationAuditDelivery): unknown {
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

    try {
      const rawBody = this.encryption.decrypt(
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
      return JSON.parse(rawBody.toString("utf8")) as unknown;
    } catch {
      throw new ConflictException(
        "O payload preservado nao pode ser descriptografado",
      );
    }
  }

  private automationAuditItem(
    delivery: AutomationAuditDelivery,
    now: Date,
  ): ProviderConversionAutomationAuditItemDto {
    const execution = delivery.providerConversionExecutions[0] ?? null;
    const normalized = this.jsonRecord(execution?.normalizedResult);
    const payloadAvailable = Boolean(
      delivery.payloadExpiresAt > now &&
      delivery.encryptedPayload &&
      delivery.payloadIv &&
      delivery.payloadTag &&
      delivery.encryptionKeyVersion,
    );
    const status = execution?.status ?? "invalid_payload";
    const missingPaidLeadRecoveryExpired = Boolean(
      execution?.reasonCode &&
        missingPaidLeadReasonCodes.includes(
          execution.reasonCode as (typeof missingPaidLeadReasonCodes)[number],
        ) &&
        delivery.firstReceivedAt.getTime() <=
          now.getTime() - missingPaidLeadRecoveryWindowMs,
    );

    return {
      deliveryId: delivery.id,
      executionId: execution?.id ?? null,
      receivedAt: delivery.firstReceivedAt.toISOString(),
      lastReceivedAt: delivery.lastReceivedAt.toISOString(),
      providerEventType: delivery.providerEventType,
      eventName: this.conversionEventName(normalized?.eventName),
      automation:
        typeof normalized?.automation === "string"
          ? normalized.automation
          : delivery.providerEventType,
      status,
      reasonCode:
        execution?.reasonCode ??
        delivery.routingErrorCode ??
        delivery.parseErrorCode,
      attemptCount: delivery.attemptCount,
      executionAttemptCount: execution?.attemptCount ?? 0,
      channel: execution?.channel
        ? {
            id: execution.channel.id,
            name: execution.channel.channelName,
            connectedPhone: execution.channel.connectedPhone,
          }
        : null,
      leadResolved: Boolean(execution?.leadId),
      payloadAvailable,
      payloadExpiresAt: delivery.payloadExpiresAt.toISOString(),
      reprocessable:
        payloadAvailable &&
        !missingPaidLeadRecoveryExpired &&
        ["observed", "blocked", "failed"].includes(status),
    };
  }

  private async reprocessDelivery(
    endpoint: PublicConversionEndpoint,
    deliveryId: string,
    actorUserId: string,
  ): Promise<AutomationReprocessOutcome> {
    const workspaceId = endpoint.workspaceId;
    const rule = endpoint.providerRule;
    const delivery = await this.findAutomationDelivery(endpoint, deliveryId);
    const currentExecution = delivery.providerConversionExecutions[0] ?? null;

    if (currentExecution?.status === "materialized") {
      return {
        deliveryId,
        executionId: currentExecution.id,
        status: "skipped",
        reasonCode: "already_materialized",
        message:
          "Este callback ja criou um evento; acompanhe a entrega em Eventos Meta",
      };
    }
    if (currentExecution?.status === "duplicate") {
      return {
        deliveryId,
        executionId: currentExecution?.id ?? null,
        status: "skipped",
        reasonCode: "execution_duplicate",
        message: "Este callback foi identificado como duplicado",
      };
    }
    if (
      currentExecution?.status === "eligible" ||
      currentExecution?.status === "failed"
    ) {
      const retryingFailure = currentExecution.status === "failed";
      const approvedAt = new Date();
      if (retryingFailure) {
        const normalizedResult = this.jsonRecord(
          currentExecution.normalizedResult,
        );
        await this.prisma.providerConversionRuleExecution.update({
          where: { id: currentExecution.id },
          data: {
            status: "eligible",
            reasonCode: "automation_manual_reprocess_approved",
            processedAt: null,
            lastAttemptedAt: approvedAt,
            normalizedResult: {
              ...(normalizedResult ?? {}),
              manualReplayApproval: {
                approved: true,
                approvedAt: approvedAt.toISOString(),
                actorUserId,
              },
            } as Prisma.InputJsonValue,
          },
        });
      }
      const queued = await this.productionQueue.enqueueProviderConversion(
        {
          providerConversionExecutionId: currentExecution.id,
          workspaceId,
        },
        {
          attemptKey: `manual-${approvedAt.getTime()}`,
        },
      );
      return {
        deliveryId,
        executionId: currentExecution.id,
        status: queued.status,
        reasonCode: retryingFailure
          ? "automation_manual_reprocess_approved"
          : currentExecution.reasonCode,
        message:
          queued.status === "queued"
            ? retryingFailure
              ? "Falha anterior encaminhada para uma nova tentativa"
              : "Callback encaminhado para a fila da Meta"
            : "Callback ja estava na fila da Meta",
      };
    }

    const payload = this.decryptAutomationPayload(delivery);
    const parsed = parseUmblerAutomationV1(payload);
    if (!parsed.ok) {
      return {
        deliveryId,
        executionId: currentExecution?.id ?? null,
        status: "skipped",
        reasonCode: parsed.errorCode,
        message: "O payload nao corresponde ao contrato Umbler atual",
      };
    }
    const prepared = await this.prepareAutomation(
      endpoint,
      parsed.value,
      delivery.firstReceivedAt,
    );
    const attemptedAt = new Date();

    if (prepared.status === "blocked") {
      const blocked = await this.prisma.$transaction(async (transaction) => {
        const existing =
          await transaction.providerConversionRuleExecution.findUnique({
            where: {
              providerRuleId_externalExecutionKey: {
                providerRuleId: rule.id,
                externalExecutionKey: prepared.parsed.externalExecutionKey,
              },
            },
          });
        if (existing && !["observed", "blocked"].includes(existing.status)) {
          throw new ConflictException("Este callback ja avancou no fluxo");
        }
        const data = {
          sourceDeliveryId: delivery.id,
          channelWorkspaceId: prepared.channel ? workspaceId : null,
          channelId: prepared.channel?.id ?? null,
          occurredAt: delivery.firstReceivedAt,
          contactIdentityHash: prepared.contactIdentityHash,
          status: "blocked" as const,
          reasonCode: prepared.reasonCode,
          normalizedResult: this.automationNormalizedResult(
            prepared,
            actorUserId,
            attemptedAt,
            false,
          ),
          valueCents: prepared.valueCents,
          currency: prepared.currency,
          leadId: prepared.lead?.id ?? null,
          attemptCount: { increment: 1 },
          lastAttemptedAt: attemptedAt,
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
                attemptCount: 1,
              },
            });

        await transaction.inboundWebhookDelivery.updateMany({
          where: {
            id: delivery.id,
            workspaceId,
            providerRuleEndpointId: endpoint.id,
          },
          data: {
            routingErrorCode: prepared.reasonCode,
            normalizedSummary: this.automationDeliverySummary(
              prepared,
              "blocked",
              prepared.reasonCode,
              attemptedAt,
            ),
          },
        });
        await transaction.auditLog.create({
          data: {
            workspaceId,
            actorUserId,
            actorType: "user",
            action: "provider_conversion_automation.manual_reprocess",
            targetType: "ProviderConversionRuleExecution",
            targetId: saved.id,
            reason: "Explicit callback re-evaluation",
            sourceIp: null,
            resultStatus: "blocked",
            afterSummary: this.toJson({
              providerRuleId: rule.id,
              sourceDeliveryId: delivery.id,
              reasonCode: prepared.reasonCode,
            }),
          },
        });
        return saved;
      });

      return {
        deliveryId,
        executionId: blocked.id,
        status: "blocked",
        reasonCode: prepared.reasonCode,
        message: this.manualReprocessBlockMessage(prepared.reasonCode),
      };
    }

    const execution = await this.prisma.$transaction(async (transaction) => {
      const existing =
        await transaction.providerConversionRuleExecution.findUnique({
          where: {
            providerRuleId_externalExecutionKey: {
              providerRuleId: rule.id,
              externalExecutionKey: prepared.parsed.externalExecutionKey,
            },
          },
        });
      if (existing && !["observed", "blocked"].includes(existing.status)) {
        throw new ConflictException("Este callback ja avancou no fluxo");
      }

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
            classification: "eligible_route_resolved",
            normalizedSummary: this.automationDeliverySummary(
              prepared,
              "eligible",
              "automation_manual_reprocess_approved",
              attemptedAt,
            ),
            parseErrorCode: null,
            routingErrorCode: null,
            processedAt: attemptedAt,
          },
        });
      if (deliveryUpdate.count !== 1) {
        throw new NotFoundException("Callback selecionado nao encontrado");
      }

      const data = {
        sourceDeliveryId: delivery.id,
        channelWorkspaceId: prepared.channel ? workspaceId : null,
        channelId: prepared.channel?.id ?? null,
        occurredAt: delivery.firstReceivedAt,
        contactIdentityHash: prepared.contactIdentityHash,
        status: "eligible" as const,
        reasonCode: "automation_manual_reprocess_approved",
        normalizedResult: this.automationNormalizedResult(
          prepared,
          actorUserId,
          attemptedAt,
          true,
        ),
        valueCents: prepared.valueCents,
        currency: prepared.currency,
        leadId: prepared.lead?.id ?? null,
        processedAt: null,
        attemptCount: { increment: 1 },
        lastAttemptedAt: attemptedAt,
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
              attemptCount: 1,
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
            decidedAt: attemptedAt,
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
            decidedAt: attemptedAt,
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
          reason: "Explicit callback selection",
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

    try {
      const queued = await this.productionQueue.enqueueProviderConversion({
        providerConversionExecutionId: execution.id,
        workspaceId,
      });
      return {
        deliveryId,
        executionId: execution.id,
        status: queued.status,
        reasonCode: "automation_manual_reprocess_approved",
        message:
          queued.status === "queued"
            ? "Callback encaminhado para a fila da Meta"
            : "Callback ja estava na fila da Meta",
      };
    } catch {
      this.logger.warn(
        `Automation execution ${execution.id} remains eligible for recovery`,
      );
      return {
        deliveryId,
        executionId: execution.id,
        status: "eligible",
        reasonCode: "queue_recovery_pending",
        message:
          "Callback liberado e aguardando a recuperacao automatica da fila",
      };
    }
  }

  private automationDeliverySummary(
    prepared: PreparedAutomation,
    status: "eligible" | "blocked",
    reasonCode: string,
    attemptedAt: Date,
  ): Prisma.InputJsonValue {
    return this.toJson({
      purpose: "conversion_automation",
      parserStatus: "parsed",
      parserVersion: UMBLER_AUTOMATION_V1_PARSER_VERSION,
      automation: prepared.parsed.automation,
      eventName: prepared.parsed.eventName,
      executionStatus: status,
      reasonCode,
      channelResolved: Boolean(prepared.channel),
      paidLeadResolved: Boolean(prepared.lead?.adId && prepared.lead.ctwaClid),
      manuallyReprocessedAt: attemptedAt.toISOString(),
    });
  }

  private automationNormalizedResult(
    prepared: PreparedAutomation,
    actorUserId: string,
    attemptedAt: Date,
    approved: boolean,
  ): Prisma.InputJsonValue {
    return this.toJson({
      schema: prepared.parsed.schema,
      source: prepared.parsed.source,
      automation: prepared.parsed.automation,
      eventName: prepared.parsed.eventName,
      sourceConversationCreatedAt: prepared.parsed.occurredAt.toISOString(),
      channelResolved: Boolean(prepared.channel),
      paidLeadResolved: Boolean(prepared.lead?.adId && prepared.lead.ctwaClid),
      manualReplayApproval: {
        approved,
        approvedAt: attemptedAt.toISOString(),
        actorUserId,
      },
    });
  }

  private jsonRecord(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, Prisma.JsonValue> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : null;
  }

  private conversionEventName(
    value: Prisma.JsonValue | undefined,
  ): ProviderConversionAutomationAuditItemDto["eventName"] {
    return value === "QualifiedLead" || value === "Purchase" ? value : null;
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
