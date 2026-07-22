import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type {
  InboundWebhookDelivery,
  InboundWebhookEvent,
  Prisma,
} from "@prisma/client";
import type {
  BackofficeInboundWebhookDeliveryDto,
  BackofficeInboundWebhookDeliveryQueryDto,
  BackofficeInboundWebhookDeliverySummaryDto,
  BackofficeInboundWebhookDeliverySummaryQueryDto,
  BackofficeInboundWebhookOperationsScopeDto,
  BackofficeInboundWebhookPayloadDto,
  InboundWebhookNormalizedObservationDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { InboundWebhookPayloadEncryptionService } from "./inbound-webhook-payload-encryption.service";

const payloadReadAction = "inbound_webhook.payload.read";
const payloadTargetType = "inbound_webhook_delivery";
const genericPayloadError = "Payload indisponivel";

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
  ) {}

  async getOperationsScope(): Promise<BackofficeInboundWebhookOperationsScopeDto> {
    const workspaces = await this.prisma.workspace.findMany({
      where: {
        inboundWebhookConnections: {
          some: { removedAt: null },
        },
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
                lastSeenAt: true,
              },
              orderBy: [{ channelName: "asc" }, { connectedPhone: "asc" }],
            },
          },
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
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
            lastSeenAt: channel.lastSeenAt.toISOString(),
          })),
        })),
      })),
    };
  }

  async listDeliveries(
    query: BackofficeInboundWebhookDeliveryQueryDto,
  ): Promise<BackofficeInboundWebhookDeliveryDto[]> {
    const deliveries = await this.prisma.inboundWebhookDelivery.findMany({
      where: {
        ...this.deliveryScope(query),
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
          ...deliveryScope,
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
    return {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.channelId
        ? { events: { some: { channelId: query.channelId } } }
        : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
    };
  }

  private automationDeliveryScope(
    query: BackofficeInboundWebhookDeliverySummaryQueryDto,
  ): Prisma.InboundWebhookDeliveryWhereInput {
    return {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.channelId
        ? { events: { some: { channelId: query.channelId } } }
        : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      purpose: "conversion_automation",
      ...(query.purpose === "message_observation"
        ? { id: "__purpose_excluded__" }
        : {}),
    };
  }

  private eventScope(
    query: BackofficeInboundWebhookDeliverySummaryQueryDto,
  ): Prisma.InboundWebhookEventWhereInput {
    return {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.purpose
        ? {
            delivery: {
              purpose: query.purpose,
            },
          }
        : {}),
    };
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
    delivery: InboundWebhookDelivery,
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
