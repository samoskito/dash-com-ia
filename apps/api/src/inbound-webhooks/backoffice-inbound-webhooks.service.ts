import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  InboundWebhookDelivery,
  InboundWebhookEvent,
} from "@prisma/client";
import type {
  BackofficeInboundWebhookDeliveryDto,
  BackofficeInboundWebhookDeliveryQueryDto,
  BackofficeInboundWebhookDeliverySummaryDto,
  BackofficeInboundWebhookDeliverySummaryQueryDto,
  BackofficeInboundWebhookOperationsScopeDto,
  BackofficeInboundWebhookPayloadDto,
  BackofficeProviderConversionRolloutDto,
  BackofficeProviderConversionRolloutModeInputDto,
  BackofficeProviderConversionRolloutQueryDto,
  InboundWebhookNormalizedObservationDto,
} from "@wpptrack/shared";
import { backofficeProviderConversionRolloutSchema } from "@wpptrack/shared";
import { dateTimeRangeInTimezone } from "../common/date-time/timezone-range";
import { PrismaService } from "../common/prisma/prisma.service";
import { ProviderConversionDecisionRepository } from "../conversion-rules/provider-conversion-decision.repository";
import { InboundConversionAutomationIngestionService } from "./inbound-conversion-automation-ingestion.service";
import {
  InboundWebhookObservationError,
  InboundWebhookObservationService,
} from "./inbound-webhook-observation.service";
import { InboundWebhookPayloadEncryptionService } from "./inbound-webhook-payload-encryption.service";
import { InboundWebhookQueueService } from "./inbound-webhook-queue.service";
import {
  InboundWebhookParserRegistry,
  InboundWebhookParserResolutionError,
} from "./providers/inbound-webhook-parser.registry";

const payloadReadAction = "inbound_webhook.payload.read";
const conversionRecoveryAction =
  "inbound_webhook.provider_conversions.reprocess";
const parserRecoveryAction = "inbound_webhook.parser.reprocess";
const conversionReevaluationAction = "provider_conversion.decision.reevaluate";
const conversionEngineModeAction =
  "provider_conversion.channel_engine_mode.change";
const payloadTargetType = "inbound_webhook_delivery";
const genericPayloadError = "Payload indisponivel";
const backofficeTimezone = "America/Sao_Paulo";

const deliveryListSelect = {
  id: true,
  workspaceId: true,
  connectionId: true,
  provider: true,
  providerEventType: true,
  parserVersion: true,
  purpose: true,
  status: true,
  classification: true,
  firstReceivedAt: true,
  lastReceivedAt: true,
  attemptCount: true,
  encryptionKeyVersion: true,
  payloadExpiresAt: true,
  providerConversionsObservedAt: true,
  normalizedSummary: true,
  parseErrorCode: true,
  routingErrorCode: true,
  connection: {
    select: {
      displayName: true,
      parserRelease: {
        select: {
          status: true,
        },
      },
    },
  },
  workspace: {
    select: {
      name: true,
    },
  },
  events: {
    select: {
      channel: {
        select: {
          id: true,
          channelName: true,
          connectedPhone: true,
        },
      },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: 20,
  },
  _count: {
    select: {
      events: true,
    },
  },
} satisfies Prisma.InboundWebhookDeliverySelect;

type DeliveryListRecord = Prisma.InboundWebhookDeliveryGetPayload<{
  select: typeof deliveryListSelect;
}>;

export type InboundWebhookPayloadActor = {
  id: string;
  actorType: string;
  sourceIp: string | null;
};

@Injectable()
export class BackofficeInboundWebhooksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InboundWebhookPayloadEncryptionService)
    private readonly payloadEncryption: InboundWebhookPayloadEncryptionService,
    @Inject(InboundWebhookQueueService)
    private readonly queue: InboundWebhookQueueService,
    @Inject(InboundWebhookParserRegistry)
    private readonly parserRegistry: InboundWebhookParserRegistry,
    @Inject(ProviderConversionDecisionRepository)
    private readonly decisions: ProviderConversionDecisionRepository,
    @Inject(InboundWebhookObservationService)
    private readonly observation: InboundWebhookObservationService,
    @Inject(InboundConversionAutomationIngestionService)
    private readonly automation: InboundConversionAutomationIngestionService,
  ) {}

  async reevaluateProviderConversionDecision(
    decisionId: string,
    requestKey: string,
    actor: InboundWebhookPayloadActor,
  ): Promise<{
    previousDecisionId: string;
    decisionId: string;
    decisionVersion: number;
    status: "reevaluated" | "existing";
    executionIds: string[];
    eligibleExecutionIds: string[];
  }> {
    const decision =
      await this.prisma.providerConversionDecisionAudit.findUnique({
        where: { id: decisionId },
        select: {
          id: true,
          workspaceId: true,
          providerRuleId: true,
          occurrenceKey: true,
          evaluationKey: true,
          decisionVersion: true,
          decisionCode: true,
          sourceDelivery: {
            select: {
              id: true,
              connectionId: true,
              purpose: true,
              status: true,
              payloadExpiresAt: true,
              encryptedPayload: true,
              payloadIv: true,
              payloadTag: true,
              encryptionKeyVersion: true,
            },
          },
        },
      });
    if (!decision) {
      throw new NotFoundException("Decisao de conversao nao encontrada");
    }

    const latest = await this.decisions.findLatestByOccurrence({
      workspaceId: decision.workspaceId,
      providerRuleId: decision.providerRuleId,
      occurrenceKey: decision.occurrenceKey,
    });
    if (!latest) {
      throw new NotFoundException("Historico da decisao nao encontrado");
    }

    const expectedEvaluationKey =
      this.decisions.reevaluationEvaluationKey(requestKey);
    if (latest.id !== decision.id) {
      if (latest.evaluationKey === expectedEvaluationKey) {
        return {
          previousDecisionId: decision.id,
          decisionId: latest.id,
          decisionVersion: latest.decisionVersion,
          status: "existing",
          executionIds: [],
          eligibleExecutionIds: [],
        };
      }

      throw new ConflictException(
        "A decisao foi atualizada; recarregue a auditoria antes de reavaliar",
      );
    }
    if (["eligible", "duplicate"].includes(decision.decisionCode)) {
      throw new ConflictException(
        "Esta decisao nao exige reavaliacao de negocio",
      );
    }
    if (
      !["message_observation", "conversion_automation"].includes(
        decision.sourceDelivery.purpose,
      ) ||
      decision.sourceDelivery.status !== "processed"
    ) {
      throw new ConflictException(
        "A origem desta decisao nao permite reavaliacao",
      );
    }
    if (!this.payloadAvailable(decision.sourceDelivery, new Date())) {
      throw new ConflictException(
        "O payload desta decisao nao esta mais disponivel",
      );
    }

    let executionIds: string[] = [];
    let eligibleExecutionIds: string[] = [];

    try {
      if (decision.sourceDelivery.purpose === "message_observation") {
        const reevaluated =
          await this.observation.reevaluateProviderConversionDecision({
            workspaceId: decision.workspaceId,
            connectionId: decision.sourceDelivery.connectionId,
            deliveryId: decision.sourceDelivery.id,
            providerRuleId: decision.providerRuleId,
            occurrenceKey: decision.occurrenceKey,
            requestKey,
          });
        executionIds = reevaluated.executionIds;
        eligibleExecutionIds = reevaluated.eligibleExecutionIds;
      } else {
        const reevaluated =
          await this.automation.reevaluateProviderConversionDecision({
            workspaceId: decision.workspaceId,
            providerRuleId: decision.providerRuleId,
            deliveryId: decision.sourceDelivery.id,
            occurrenceKey: decision.occurrenceKey,
            requestKey,
          });
        executionIds = reevaluated.executionId ? [reevaluated.executionId] : [];
        eligibleExecutionIds = reevaluated.eligibleExecutionId
          ? [reevaluated.eligibleExecutionId]
          : [];
      }
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (error instanceof InboundWebhookObservationError) {
        throw new ConflictException(
          "O payload nao produziu uma nova decisao para esta ocorrencia",
        );
      }

      throw new ServiceUnavailableException(
        "Nao foi possivel reavaliar esta decisao",
      );
    }

    const reevaluated = await this.decisions.findLatestByOccurrence({
      workspaceId: decision.workspaceId,
      providerRuleId: decision.providerRuleId,
      occurrenceKey: decision.occurrenceKey,
    });
    if (
      !reevaluated ||
      reevaluated.evaluationKey !== expectedEvaluationKey ||
      reevaluated.supersedesDecisionId !== decision.id
    ) {
      throw new ConflictException(
        "A reavaliacao nao gerou uma nova versao da decisao",
      );
    }

    await this.prisma.auditLog.create({
      data: {
        workspaceId: decision.workspaceId,
        actorUserId: actor.id,
        actorType: actor.actorType,
        action: conversionReevaluationAction,
        targetType: "provider_conversion_decision",
        targetId: reevaluated.id,
        reason: "Explicit business decision reevaluation",
        sourceIp: this.sourceIp(actor.sourceIp),
        resultStatus: "completed",
        beforeSummary: {
          decisionId: decision.id,
          decisionVersion: decision.decisionVersion,
          decisionCode: decision.decisionCode,
        },
        afterSummary: {
          decisionId: reevaluated.id,
          decisionVersion: reevaluated.decisionVersion,
          decisionCode: reevaluated.decisionCode,
          executionIds,
          eligibleExecutionIds,
        },
      },
    });

    return {
      previousDecisionId: decision.id,
      decisionId: reevaluated.id,
      decisionVersion: reevaluated.decisionVersion,
      status: "reevaluated",
      executionIds,
      eligibleExecutionIds,
    };
  }

  async reprocessProviderConversions(
    deliveryId: string,
    actor: InboundWebhookPayloadActor,
  ): Promise<{
    deliveryId: string;
    status: "queued" | "existing";
  }> {
    const delivery = await this.prisma.inboundWebhookDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        workspaceId: true,
        connectionId: true,
        purpose: true,
        status: true,
        payloadExpiresAt: true,
        encryptedPayload: true,
        payloadIv: true,
        payloadTag: true,
        encryptionKeyVersion: true,
        providerConversionsObservedAt: true,
      },
    });

    if (!delivery) {
      throw new NotFoundException("Entrega nao encontrada");
    }

    if (
      delivery.purpose !== "message_observation" ||
      delivery.status !== "processed"
    ) {
      throw new ConflictException(
        "A entrega ainda nao pode reprocessar conversoes",
      );
    }

    if (!this.payloadAvailable(delivery, new Date())) {
      throw new ConflictException(
        "O payload desta entrega nao esta mais disponivel",
      );
    }

    await this.prisma.auditLog.create({
      data: {
        workspaceId: delivery.workspaceId,
        actorUserId: actor.id,
        actorType: actor.actorType,
        action: conversionRecoveryAction,
        targetType: payloadTargetType,
        targetId: delivery.id,
        reason: "Explicit provider conversion recovery",
        sourceIp: this.sourceIp(actor.sourceIp),
        resultStatus: "requested",
        beforeSummary: undefined,
        afterSummary: {
          connectionId: delivery.connectionId,
          previousProviderConversionsObservedAt:
            delivery.providerConversionsObservedAt?.toISOString() ?? null,
          forceProviderConversions: true,
        },
      },
    });

    try {
      await this.prisma.inboundWebhookDelivery.updateMany({
        where: {
          id: delivery.id,
          workspaceId: delivery.workspaceId,
          connectionId: delivery.connectionId,
          status: "processed",
        },
        data: {
          providerConversionsObservedAt: null,
        },
      });
      const queued = await this.queue.enqueueDelivery({
        deliveryId: delivery.id,
        connectionId: delivery.connectionId,
        workspaceId: delivery.workspaceId,
        forceProviderConversions: true,
      });

      return {
        deliveryId: delivery.id,
        status: queued.status,
      };
    } catch {
      throw new ServiceUnavailableException(
        "A fila nao aceitou o reprocessamento",
      );
    }
  }

  async reprocessParser(
    deliveryId: string,
    actor: InboundWebhookPayloadActor,
  ): Promise<{
    deliveryId: string;
    status: "queued" | "existing";
  }> {
    const now = new Date();
    const delivery = await this.prisma.inboundWebhookDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        workspaceId: true,
        connectionId: true,
        provider: true,
        parserVersion: true,
        purpose: true,
        status: true,
        classification: true,
        normalizedSummary: true,
        payloadExpiresAt: true,
        encryptedPayload: true,
        payloadIv: true,
        payloadTag: true,
        encryptionKeyVersion: true,
        queuedAt: true,
        processedAt: true,
        providerConversionsObservedAt: true,
        updatedAt: true,
        connection: {
          select: {
            provider: true,
            status: true,
            removedAt: true,
            parserRelease: {
              select: {
                provider: true,
                version: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: {
            events: true,
          },
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException("Entrega nao encontrada");
    }

    if (delivery.purpose !== "message_observation") {
      throw new ConflictException(
        "Esta entrega nao pertence ao fluxo de mensagens",
      );
    }

    if (!this.payloadAvailable(delivery, now)) {
      throw new ConflictException(
        "O payload desta entrega nao esta mais disponivel",
      );
    }

    if (
      delivery.connection.provider !== delivery.provider ||
      delivery.connection.removedAt !== null ||
      !["observation", "production"].includes(delivery.connection.status) ||
      delivery.connection.parserRelease.provider !== delivery.provider ||
      delivery.connection.parserRelease.version !== delivery.parserVersion
    ) {
      throw new ConflictException(
        "A conexao ou o parser desta entrega nao esta disponivel",
      );
    }

    try {
      this.parserRegistry.resolve({
        provider: delivery.provider,
        parserVersion: delivery.parserVersion,
        parserReleaseStatus: delivery.connection.parserRelease.status,
      });
    } catch (error) {
      if (error instanceof InboundWebhookParserResolutionError) {
        throw new ConflictException(
          "O parser desta entrega nao esta disponivel para reprocessamento",
        );
      }

      throw error;
    }

    if (
      ["pending", "queued", "processing"].includes(delivery.status) &&
      delivery.classification === null &&
      delivery.normalizedSummary === null &&
      delivery.processedAt === null &&
      delivery._count.events === 0
    ) {
      return {
        deliveryId: delivery.id,
        status: "existing",
      };
    }

    if (
      delivery.status !== "processed" ||
      delivery.classification !== "unsupported_event"
    ) {
      throw new ConflictException(
        "Somente uma entrega processada e ainda nao suportada pode reler o parser",
      );
    }

    if (delivery._count.events !== 0) {
      throw new ConflictException(
        "Esta entrega ja possui eventos canonicos e nao pode reler o parser",
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.inboundWebhookDelivery.updateMany({
        where: {
          id: delivery.id,
          workspaceId: delivery.workspaceId,
          connectionId: delivery.connectionId,
          updatedAt: delivery.updatedAt,
          purpose: "message_observation",
          status: "processed",
          classification: "unsupported_event",
          payloadExpiresAt: { gt: now },
          encryptedPayload: { not: null },
          payloadIv: { not: null },
          payloadTag: { not: null },
          encryptionKeyVersion: { not: null },
          events: { none: {} },
          connection: {
            provider: delivery.provider,
            status: { in: ["observation", "production"] },
            removedAt: null,
            parserRelease: {
              provider: delivery.provider,
              version: delivery.parserVersion,
              status: delivery.connection.parserRelease.status,
            },
          },
        },
        data: {
          status: "pending",
          classification: null,
          normalizedSummary: Prisma.DbNull,
          parseErrorCode: null,
          routingErrorCode: null,
          queuedAt: null,
          processedAt: null,
          providerConversionsObservedAt: null,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          "O estado da entrega mudou; atualize a auditoria",
        );
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: delivery.workspaceId,
          actorUserId: actor.id,
          actorType: actor.actorType,
          action: parserRecoveryAction,
          targetType: payloadTargetType,
          targetId: delivery.id,
          reason: "Explicit parser recovery for one retained delivery",
          sourceIp: this.sourceIp(actor.sourceIp),
          resultStatus: "requested",
          beforeSummary: {
            status: delivery.status,
            classification: delivery.classification,
            eventCount: delivery._count.events,
            parserVersion: delivery.parserVersion,
          },
          afterSummary: {
            status: "pending",
            classification: null,
            parserVersion: delivery.parserVersion,
            parserReleaseStatus: delivery.connection.parserRelease.status,
          },
        },
      });
    });

    try {
      const queued = await this.queue.enqueueDelivery({
        deliveryId: delivery.id,
        connectionId: delivery.connectionId,
        workspaceId: delivery.workspaceId,
      });
      const queuedAt = new Date();
      await this.prisma.inboundWebhookDelivery.updateMany({
        where: {
          id: delivery.id,
          workspaceId: delivery.workspaceId,
          connectionId: delivery.connectionId,
          status: "pending",
          classification: null,
        },
        data: {
          status: "queued",
          queuedAt,
        },
      });

      return {
        deliveryId: delivery.id,
        status: queued.status,
      };
    } catch {
      throw new ServiceUnavailableException(
        "A fila nao aceitou o reprocessamento do parser",
      );
    }
  }

  async getOperationsScope(): Promise<BackofficeInboundWebhookOperationsScopeDto> {
    const workspaces = await this.prisma.workspace.findMany({
      where: {
        OR: [
          {
            inboundWebhookConnections: {
              some: { removedAt: null },
            },
          },
          {
            whatsappInstances: {
              some: {
                provider: "uazapi",
                whatsappSeats: {
                  some: {
                    status: {
                      in: ["reserved", "active", "suspended"],
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        inboundWebhookConnections: {
          where: { removedAt: null },
          select: {
            id: true,
            displayName: true,
            provider: true,
            status: true,
            lastDeliveryAt: true,
            channels: {
              select: {
                id: true,
                channelName: true,
                connectedPhone: true,
                status: true,
                conversionEngineMode: true,
                lastSeenAt: true,
              },
              orderBy: [{ channelName: "asc" }, { connectedPhone: "asc" }],
            },
          },
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
        },
        whatsappInstances: {
          where: {
            provider: "uazapi",
            whatsappSeats: {
              some: {
                status: {
                  in: ["reserved", "active", "suspended"],
                },
              },
            },
          },
          select: {
            id: true,
            name: true,
            status: true,
            updatedAt: true,
            whatsappSeats: {
              where: {
                status: {
                  in: ["reserved", "active", "suspended"],
                },
              },
              select: {
                normalizedPhone: true,
                status: true,
              },
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return {
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        connections: workspace.inboundWebhookConnections.map((connection) => ({
          id: connection.id,
          displayName: connection.displayName,
          provider: connection.provider,
          status: connection.status,
          lastDeliveryAt: connection.lastDeliveryAt?.toISOString() ?? null,
          channels: connection.channels.map((channel) => ({
            id: channel.id,
            displayName: this.channelDisplayName(channel),
            connectedPhone: channel.connectedPhone,
            status: channel.status,
            conversionEngineMode: channel.conversionEngineMode,
            lastSeenAt: channel.lastSeenAt.toISOString(),
          })),
        })),
        directInstances: workspace.whatsappInstances.map((instance) => {
          const seat = instance.whatsappSeats[0] ?? null;

          return {
            id: instance.id,
            displayName: instance.name,
            provider: "uazapi" as const,
            status: instance.status,
            connectedPhone: seat?.normalizedPhone ?? null,
            seatStatus: seat?.status ?? null,
            lastSeenAt: instance.updatedAt.toISOString(),
          };
        }),
      })),
    };
  }

  async getProviderConversionRollout(
    channelId: string,
    query: BackofficeProviderConversionRolloutQueryDto,
  ): Promise<BackofficeProviderConversionRolloutDto> {
    const channel = await this.prisma.inboundWebhookChannel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        workspaceId: true,
        channelName: true,
        connectedPhone: true,
        conversionEngineMode: true,
      },
    });
    if (!channel) {
      throw new NotFoundException("Canal nao encontrado");
    }

    const comparisonScope = {
      workspaceId: channel.workspaceId,
      channelId: channel.id,
    };
    const comparisonResult = query.onlyMismatches
      ? "mismatches"
      : query.comparisonResult;
    const createdAt =
      query.createdFrom || query.createdUntil
        ? dateTimeRangeInTimezone(
            query.createdFrom,
            query.createdUntil,
            backofficeTimezone,
          )
        : null;
    const filteredComparisonScope: Prisma.ProviderConversionShadowComparisonWhereInput =
      {
        ...comparisonScope,
        ...(comparisonResult === "matches"
          ? { matches: true }
          : comparisonResult === "mismatches"
            ? { matches: false }
            : {}),
        ...(query.decisionPresence === "with_decision"
          ? {
              OR: [
                { legacyDecisionCode: { not: null } },
                { canonicalDecisionCode: { not: null } },
              ],
            }
          : query.decisionPresence === "without_decision"
            ? {
                legacyDecisionCode: null,
                canonicalDecisionCode: null,
              }
            : {}),
        ...(query.decisionCode
          ? {
              AND: [
                {
                  OR: [
                    { legacyDecisionCode: query.decisionCode },
                    { canonicalDecisionCode: query.decisionCode },
                  ],
                },
              ],
            }
          : {}),
        ...(query.eventName
          ? {
              providerRule: {
                conversionRule: {
                  eventName: query.eventName,
                },
              },
            }
          : {}),
        ...(createdAt ? { createdAt } : {}),
      };
    const [
      comparisonCount,
      matchCount,
      mismatchCount,
      mismatchGroups,
      latest,
      filteredComparisonCount,
      filteredMatchCount,
      filteredMismatchCount,
      comparisons,
    ] = await Promise.all([
      this.prisma.providerConversionShadowComparison.count({
        where: comparisonScope,
      }),
      this.prisma.providerConversionShadowComparison.count({
        where: { ...comparisonScope, matches: true },
      }),
      this.prisma.providerConversionShadowComparison.count({
        where: { ...comparisonScope, matches: false },
      }),
      this.prisma.providerConversionShadowComparison.groupBy({
        by: ["mismatchCode"],
        where: { ...comparisonScope, matches: false },
        _count: { _all: true },
        orderBy: { _count: { mismatchCode: "desc" } },
      }),
      this.prisma.providerConversionShadowComparison.findFirst({
        where: comparisonScope,
        select: { createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.providerConversionShadowComparison.count({
        where: filteredComparisonScope,
      }),
      this.prisma.providerConversionShadowComparison.count({
        where: { AND: [filteredComparisonScope, { matches: true }] },
      }),
      this.prisma.providerConversionShadowComparison.count({
        where: { AND: [filteredComparisonScope, { matches: false }] },
      }),
      this.prisma.providerConversionShadowComparison.findMany({
        where: filteredComparisonScope,
        select: {
          id: true,
          occurrenceKey: true,
          authoritativeEngine: true,
          matches: true,
          mismatchCode: true,
          legacyEngineVersion: true,
          legacyDecisionCode: true,
          legacyReasonCode: true,
          canonicalEngineVersion: true,
          canonicalDecisionCode: true,
          canonicalReasonCode: true,
          sourceDeliveryId: true,
          createdAt: true,
          providerRule: {
            select: {
              conversionRule: {
                select: {
                  eventName: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit,
        skip: query.offset,
      }),
    ]);
    const canonicalBlocker =
      channel.conversionEngineMode === "canonical"
        ? null
        : channel.conversionEngineMode !== "shadow"
          ? "Ative o modo shadow antes de promover este canal."
          : comparisonCount === 0
            ? "Aguarde comparacoes reais antes de promover este canal."
            : null;

    return backofficeProviderConversionRolloutSchema.parse({
      channel: {
        id: channel.id,
        displayName: this.channelDisplayName(channel),
        connectedPhone: channel.connectedPhone,
        mode: channel.conversionEngineMode,
      },
      counts: {
        comparisons: comparisonCount,
        matches: matchCount,
        mismatches: mismatchCount,
      },
      filteredCounts: {
        comparisons: filteredComparisonCount,
        matches: filteredMatchCount,
        mismatches: filteredMismatchCount,
      },
      pagination: {
        offset: query.offset,
        limit: query.limit,
        total: filteredComparisonCount,
        hasPrevious: query.offset > 0,
        hasNext: query.offset + comparisons.length < filteredComparisonCount,
      },
      mismatchReasons: mismatchGroups
        .filter(
          (
            group,
          ): group is typeof group & {
            mismatchCode: string;
          } => Boolean(group.mismatchCode),
        )
        .map((group) => ({
          code: group.mismatchCode,
          count: group._count._all,
        })),
      latestComparisonAt: latest?.createdAt.toISOString() ?? null,
      canActivateCanonical: canonicalBlocker === null,
      canonicalBlocker,
      comparisons: comparisons.map((comparison) => ({
        id: comparison.id,
        occurrenceKey: comparison.occurrenceKey,
        eventName: comparison.providerRule.conversionRule.eventName,
        authoritativeEngine: comparison.authoritativeEngine,
        matches: comparison.matches,
        mismatchCode: comparison.mismatchCode,
        legacy: {
          engineVersion: comparison.legacyEngineVersion,
          decisionCode: comparison.legacyDecisionCode,
          reasonCode: comparison.legacyReasonCode,
        },
        canonical: {
          engineVersion: comparison.canonicalEngineVersion,
          decisionCode: comparison.canonicalDecisionCode,
          reasonCode: comparison.canonicalReasonCode,
        },
        sourceDeliveryId: comparison.sourceDeliveryId,
        createdAt: comparison.createdAt.toISOString(),
      })),
    });
  }

  async updateProviderConversionEngineMode(
    channelId: string,
    input: BackofficeProviderConversionRolloutModeInputDto,
    actor: InboundWebhookPayloadActor,
  ): Promise<BackofficeProviderConversionRolloutDto> {
    const channel = await this.prisma.inboundWebhookChannel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        workspaceId: true,
        channelName: true,
        connectedPhone: true,
        conversionEngineMode: true,
      },
    });
    if (!channel) {
      throw new NotFoundException("Canal nao encontrado");
    }

    const displayName = this.channelDisplayName(channel);
    if (input.confirmation !== displayName) {
      throw new ConflictException(
        "A confirmacao deve repetir exatamente o nome do canal",
      );
    }
    if (input.mode === channel.conversionEngineMode) {
      return this.getProviderConversionRollout(channel.id, {
        onlyMismatches: false,
        comparisonResult: "all",
        decisionPresence: "all",
        limit: 30,
        offset: 0,
      });
    }

    const comparisonScope = {
      workspaceId: channel.workspaceId,
      channelId: channel.id,
    };
    const [comparisonCount, mismatchCount] = await Promise.all([
      this.prisma.providerConversionShadowComparison.count({
        where: comparisonScope,
      }),
      this.prisma.providerConversionShadowComparison.count({
        where: { ...comparisonScope, matches: false },
      }),
    ]);
    if (input.mode === "canonical") {
      if (channel.conversionEngineMode !== "shadow") {
        throw new ConflictException(
          "Ative o modo shadow antes de promover este canal",
        );
      }
      if (comparisonCount === 0) {
        throw new ConflictException(
          "O canal ainda nao possui comparacoes shadow",
        );
      }
      if (
        input.acknowledgedComparisonCount !== comparisonCount ||
        input.acknowledgedMismatchCount !== mismatchCount
      ) {
        throw new ConflictException(
          "Os contadores mudaram; atualize a auditoria antes de promover",
        );
      }
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.inboundWebhookChannel.update({
        where: { id: channel.id },
        data: { conversionEngineMode: input.mode },
      });
      await transaction.auditLog.create({
        data: {
          workspaceId: channel.workspaceId,
          actorUserId: actor.id,
          actorType: actor.actorType,
          action: conversionEngineModeAction,
          targetType: "inbound_webhook_channel",
          targetId: channel.id,
          reason: "Explicit provider conversion engine rollout change",
          sourceIp: this.sourceIp(actor.sourceIp),
          resultStatus: "completed",
          beforeSummary: {
            mode: channel.conversionEngineMode,
            comparisonCount,
            mismatchCount,
          },
          afterSummary: {
            mode: input.mode,
            comparisonCount,
            mismatchCount,
          },
        },
      });
    });

    return this.getProviderConversionRollout(channel.id, {
      onlyMismatches: false,
      comparisonResult: "all",
      decisionPresence: "all",
      limit: 30,
      offset: 0,
    });
  }

  async listDeliveries(
    query: BackofficeInboundWebhookDeliveryQueryDto,
  ): Promise<BackofficeInboundWebhookDeliveryDto[]> {
    const deliveryScope =
      query.classification === "unsupported_event"
        ? this.awaitingParserDeliveryScope(query)
        : this.deliveryScope(query);
    const deliveries = await this.prisma.inboundWebhookDelivery.findMany({
      where: {
        ...deliveryScope,
        ...(query.status ? { status: query.status } : {}),
        ...(query.classification
          ? {
              OR: [
                { classification: query.classification },
                {
                  events: {
                    some: {
                      classification: query.classification,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: deliveryListSelect,
      orderBy: [{ lastReceivedAt: "desc" }, { id: "desc" }],
      take: query.limit,
      skip: query.offset,
    });
    const now = new Date();

    return deliveries.map((delivery) =>
      this.toDeliveryDto(delivery, this.listPayloadAvailable(delivery, now)),
    );
  }

  async summarizeDeliveries(
    query: BackofficeInboundWebhookDeliverySummaryQueryDto,
  ): Promise<BackofficeInboundWebhookDeliverySummaryDto> {
    const deliveryScope = this.deliveryScope(query);
    const awaitingParserDeliveryScope =
      this.awaitingParserDeliveryScope(query);
    const eventScope = this.eventScope(query);
    const [
      all,
      ctwaPending,
      ctwaRouted,
      failed,
      noCtwa,
      automationCallbacks,
      awaitingParser,
    ] = await this.prisma.$transaction([
      this.prisma.inboundWebhookEvent.count({ where: eventScope }),
      this.prisma.inboundWebhookEvent.count({
        where: {
          ...eventScope,
          classification: "eligible_route_unresolved",
        },
      }),
      this.prisma.inboundWebhookEvent.count({
        where: {
          ...eventScope,
          classification: "eligible_route_resolved",
        },
      }),
      this.prisma.inboundWebhookDelivery.count({
        where: {
          ...deliveryScope,
          status: "failed",
        },
      }),
      this.prisma.inboundWebhookEvent.count({
        where: {
          ...eventScope,
          classification: "ignored_no_ctwa",
        },
      }),
      this.prisma.inboundWebhookDelivery.count({
        where: this.automationDeliveryScope(query),
      }),
      this.prisma.inboundWebhookDelivery.count({
        where: {
          ...awaitingParserDeliveryScope,
          classification: "unsupported_event",
        },
      }),
    ]);

    return {
      all,
      ctwaPending,
      ctwaRouted,
      failed,
      noCtwa,
      automationCallbacks,
      awaitingParser,
    };
  }

  async getPayload(
    deliveryId: string,
    actor: InboundWebhookPayloadActor,
  ): Promise<BackofficeInboundWebhookPayloadDto> {
    const delivery = await this.prisma.inboundWebhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        workspace: {
          select: {
            name: true,
          },
        },
        connection: {
          select: {
            displayName: true,
            parserRelease: {
              select: {
                status: true,
              },
            },
          },
        },
        events: {
          include: {
            channel: {
              select: {
                id: true,
                channelName: true,
                connectedPhone: true,
              },
            },
          },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        },
        _count: {
          select: {
            events: true,
          },
        },
      },
    });

    if (!delivery) {
      await this.recordAudit({
        workspaceId: null,
        deliveryId,
        actor,
        resultStatus: "failed",
        reason: "delivery_not_found",
        afterSummary: null,
      });
      throw new NotFoundException("Entrega nao encontrada");
    }

    const now = new Date();
    const deliveryDto = this.toDeliveryDto(
      delivery,
      this.payloadAvailable(delivery, now),
    );
    const events = delivery.events.map((event) => this.toObservationDto(event));

    if (!deliveryDto.payloadAvailable) {
      await this.recordAudit({
        workspaceId: delivery.workspaceId,
        deliveryId,
        actor,
        resultStatus: "unavailable",
        reason:
          delivery.payloadExpiresAt.getTime() <= now.getTime()
            ? "payload_expired"
            : "payload_cleared",
        afterSummary: this.accessSummary(deliveryDto),
      });

      return {
        delivery: deliveryDto,
        payload: null,
        events,
      };
    }

    let payload: Record<string, unknown>;

    try {
      const decrypted = this.payloadEncryption.decrypt(
        {
          encryptedPayload: delivery.encryptedPayload!,
          payloadIv: delivery.payloadIv!,
          payloadTag: delivery.payloadTag!,
          encryptionKeyVersion: delivery.encryptionKeyVersion!,
        },
        {
          workspaceId: delivery.workspaceId,
          connectionId: delivery.connectionId,
          deliveryId: delivery.id,
        },
      );
      payload = this.parsePayload(decrypted);
    } catch {
      await this.recordAudit({
        workspaceId: delivery.workspaceId,
        deliveryId,
        actor,
        resultStatus: "failed",
        reason: "payload_decryption_failed",
        afterSummary: this.accessSummary(deliveryDto),
      });
      throw new InternalServerErrorException(genericPayloadError);
    }

    await this.recordAudit({
      workspaceId: delivery.workspaceId,
      deliveryId,
      actor,
      resultStatus: "success",
      reason: null,
      afterSummary: this.accessSummary(deliveryDto),
    });

    return {
      delivery: deliveryDto,
      payload,
      events,
    };
  }

  async recordDeniedPayloadAccess(input: {
    deliveryId: string;
    actorUserId: string;
    actorType: string;
    sourceIp: string | null;
  }): Promise<void> {
    const delivery = await this.prisma.inboundWebhookDelivery.findUnique({
      where: { id: input.deliveryId },
      select: { workspaceId: true },
    });

    await this.recordAudit({
      workspaceId: delivery?.workspaceId ?? null,
      deliveryId: input.deliveryId,
      actor: {
        id: input.actorUserId,
        actorType: input.actorType,
        sourceIp: input.sourceIp,
      },
      resultStatus: "denied",
      reason: "platform_owner_required",
      afterSummary: null,
    });
  }

  private toDeliveryDto(
    delivery: DeliveryListRecord,
    payloadAvailable: boolean,
  ): BackofficeInboundWebhookDeliveryDto {
    return {
      id: delivery.id,
      workspaceId: delivery.workspaceId,
      workspaceName: delivery.workspace.name,
      connectionId: delivery.connectionId,
      connectionName: delivery.connection.displayName,
      provider: delivery.provider,
      providerEventType: delivery.providerEventType,
      parserVersion: delivery.parserVersion,
      parserReleaseStatus: delivery.connection.parserRelease.status,
      purpose: delivery.purpose,
      status: delivery.status,
      classification: delivery.classification,
      firstReceivedAt: delivery.firstReceivedAt.toISOString(),
      lastReceivedAt: delivery.lastReceivedAt.toISOString(),
      attemptCount: delivery.attemptCount,
      payloadAvailable,
      payloadExpiresAt: delivery.payloadExpiresAt.toISOString(),
      providerConversionsObservedAt:
        delivery.providerConversionsObservedAt?.toISOString() ?? null,
      parseErrorCode: delivery.parseErrorCode,
      routingErrorCode: delivery.routingErrorCode,
      normalizedSummary: this.recordValue(delivery.normalizedSummary),
      eventCount: delivery._count.events,
      channels: Array.from(
        new Map(
          delivery.events.map(({ channel }) => [
            channel.id,
            {
              id: channel.id,
              displayName: this.channelDisplayName(channel),
              connectedPhone: channel.connectedPhone,
            },
          ]),
        ).values(),
      ),
    };
  }

  private deliveryScope(
    query: BackofficeInboundWebhookDeliverySummaryQueryDto,
  ): Prisma.InboundWebhookDeliveryWhereInput {
    const receivedAt = this.receivedAtRange(query);

    return {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.channelId
        ? { events: { some: { channelId: query.channelId } } }
        : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(receivedAt ? { lastReceivedAt: receivedAt } : {}),
    };
  }

  private awaitingParserDeliveryScope(
    query: BackofficeInboundWebhookDeliverySummaryQueryDto,
  ): Prisma.InboundWebhookDeliveryWhereInput {
    const receivedAt = this.receivedAtRange(query);

    return {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.channelId
        ? {
            connection: {
              channels: {
                some: {
                  id: query.channelId,
                },
              },
            },
          }
        : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(receivedAt ? { lastReceivedAt: receivedAt } : {}),
    };
  }

  private automationDeliveryScope(
    query: BackofficeInboundWebhookDeliverySummaryQueryDto,
  ): Prisma.InboundWebhookDeliveryWhereInput {
    const receivedAt = this.receivedAtRange(query);

    return {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.channelId
        ? { events: { some: { channelId: query.channelId } } }
        : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      purpose: "conversion_automation",
      ...(receivedAt ? { lastReceivedAt: receivedAt } : {}),
      ...(query.purpose === "message_observation"
        ? { id: "__purpose_excluded__" }
        : {}),
    };
  }

  private eventScope(
    query: BackofficeInboundWebhookDeliverySummaryQueryDto,
  ): Prisma.InboundWebhookEventWhereInput {
    const receivedAt = this.receivedAtRange(query);
    const delivery = {
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(receivedAt ? { lastReceivedAt: receivedAt } : {}),
    };

    return {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(Object.keys(delivery).length > 0 ? { delivery } : {}),
    };
  }

  private receivedAtRange(
    query: BackofficeInboundWebhookDeliverySummaryQueryDto,
  ): Prisma.DateTimeFilter | null {
    if (!query.receivedFrom && !query.receivedUntil) {
      return null;
    }

    return dateTimeRangeInTimezone(
      query.receivedFrom,
      query.receivedUntil,
      backofficeTimezone,
    );
  }

  private toObservationDto(
    event: InboundWebhookEvent,
  ): InboundWebhookNormalizedObservationDto {
    const summary = this.recordValue(event.normalizedSummary);
    const providerEventType = this.boundedString(
      summary?.providerEventType,
      120,
    );
    const connectedPhoneSuffix = this.phoneSuffix(
      summary?.connectedPhoneSuffix,
    );

    return {
      id: event.id,
      connectionId: event.connectionId,
      deliveryId: event.deliveryId,
      channelId: event.channelId,
      provider: event.provider,
      providerEventType,
      externalMessageId: event.externalMessageId,
      occurredAt: event.occurredAt.toISOString(),
      connectedPhoneSuffix,
      contactIdentityHash: event.contactIdentityHash,
      adId: event.adId,
      hasCtwa: event.hasCtwa,
      classification: event.classification,
      classificationReason: event.classificationReason,
      resolvedBusinessConnectionId: event.resolvedBusinessConnectionId,
      resolvedReportingAccountId: event.resolvedReportingAccountId,
      resolvedConversionDestinationId: event.resolvedConversionDestinationId,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private channelDisplayName(channel: {
    channelName: string | null;
    connectedPhone: string;
  }): string {
    return channel.channelName?.trim() || channel.connectedPhone;
  }

  private payloadAvailable(
    delivery: Pick<
      InboundWebhookDelivery,
      | "payloadExpiresAt"
      | "encryptedPayload"
      | "payloadIv"
      | "payloadTag"
      | "encryptionKeyVersion"
    >,
    now: Date,
  ): boolean {
    return Boolean(
      delivery.payloadExpiresAt.getTime() > now.getTime() &&
      delivery.encryptedPayload &&
      delivery.payloadIv &&
      delivery.payloadTag &&
      delivery.encryptionKeyVersion,
    );
  }

  private listPayloadAvailable(
    delivery: DeliveryListRecord,
    now: Date,
  ): boolean {
    return Boolean(
      delivery.payloadExpiresAt.getTime() > now.getTime() &&
      delivery.encryptionKeyVersion,
    );
  }

  private parsePayload(payload: Buffer): Record<string, unknown> {
    const parsed: unknown = JSON.parse(payload.toString("utf8"));

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(genericPayloadError);
    }

    return parsed as Record<string, unknown>;
  }

  private accessSummary(
    delivery: BackofficeInboundWebhookDeliveryDto,
  ): Prisma.InputJsonObject {
    return {
      provider: delivery.provider,
      parserVersion: delivery.parserVersion,
      parserReleaseStatus: delivery.parserReleaseStatus,
      purpose: delivery.purpose,
      classification: delivery.classification,
      payloadAvailable: delivery.payloadAvailable,
      eventCount: delivery.eventCount,
    };
  }

  private async recordAudit(input: {
    workspaceId: string | null;
    deliveryId: string;
    actor: InboundWebhookPayloadActor;
    resultStatus: string;
    reason: string | null;
    afterSummary: Prisma.InputJsonObject | null;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actor.id,
        actorType: input.actor.actorType,
        action: payloadReadAction,
        targetType: payloadTargetType,
        targetId: input.deliveryId,
        reason: input.reason,
        sourceIp: this.sourceIp(input.actor.sourceIp),
        resultStatus: input.resultStatus,
        beforeSummary: undefined,
        afterSummary: input.afterSummary ?? undefined,
      },
    });
  }

  private recordValue(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private boundedString(value: unknown, maxLength: number): string | null {
    return typeof value === "string" &&
      value.length > 0 &&
      value.length <= maxLength
      ? value
      : null;
  }

  private phoneSuffix(value: unknown): string | null {
    return typeof value === "string" && /^\d{2,8}$/u.test(value) ? value : null;
  }

  private sourceIp(value: string | null): string | null {
    const normalized = value?.trim();

    return normalized &&
      normalized.length <= 128 &&
      !/[\u0000-\u001f\u007f]/u.test(normalized)
      ? normalized
      : null;
  }
}
