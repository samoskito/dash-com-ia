import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  BackofficeInboundWebhookProductionRecoveryPreviewDto,
  BackofficeInboundWebhookProductionRecoveryResultDto,
  InboundWebhookReplaySelectionDto,
} from "@wpptrack/shared";
import type { PlatformAdminUser } from "../auth/platform-admin.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";
import { InboundWebhookChannelRoutesService } from "./inbound-webhook-channel-routes.service";
import { InboundWebhookProductionQueueService } from "./inbound-webhook-production-queue.service";

const RECOVERY_LIMIT = 500;
const selectionLimits: Record<InboundWebhookReplaySelectionDto, number> = {
  canary_1: 1,
  canary_5: 5,
  canary_10: 10,
  remaining: RECOVERY_LIMIT,
};

const recoveryConnectionSelect = {
  id: true,
  workspaceId: true,
  provider: true,
  displayName: true,
  status: true,
  productionActivatedAt: true,
  lastDeliveryAt: true,
  lastSuccessfulParseAt: true,
  createdAt: true,
  updatedAt: true,
  workspace: {
    select: {
      id: true,
      name: true,
    },
  },
  parserRelease: {
    select: {
      version: true,
      status: true,
    },
  },
  channels: {
    select: {
      id: true,
      channelName: true,
      connectedPhone: true,
      status: true,
      productionActivatedAt: true,
    },
    orderBy: [{ channelName: "asc" }, { connectedPhone: "asc" }],
  },
} satisfies Prisma.InboundWebhookConnectionSelect;

type RecoveryConnection = Prisma.InboundWebhookConnectionGetPayload<{
  select: typeof recoveryConnectionSelect;
}>;

@Injectable()
export class BackofficeInboundWebhookRecoveryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InboundWebhookChannelRoutesService)
    private readonly channelRoutes: InboundWebhookChannelRoutesService,
    @Inject(InboundWebhookProductionQueueService)
    private readonly queue: InboundWebhookProductionQueueService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv = process.env,
  ) {}

  async getPreview(
    connectionId: string,
  ): Promise<BackofficeInboundWebhookProductionRecoveryPreviewDto> {
    const connection = await this.requireConnection(connectionId);
    const channels = await Promise.all(
      connection.channels.map((channel) =>
        this.channelPreview(connection, channel, new Date()),
      ),
    );

    return {
      workspace: connection.workspace,
      connection: this.connectionDto(connection),
      productionEnabled: this.productionEnabled(),
      counts: channels.reduce(
        (total, channel) => ({
          totalCtwa: total.totalCtwa + channel.totalCtwa,
          historical: total.historical + channel.historical,
          routeUnresolved: total.routeUnresolved + channel.routeUnresolved,
          unavailable: total.unavailable + channel.unavailable,
          alreadyQueued: total.alreadyQueued + channel.alreadyQueued,
          eligible: total.eligible + channel.eligible,
        }),
        {
          totalCtwa: 0,
          historical: 0,
          routeUnresolved: 0,
          unavailable: 0,
          alreadyQueued: 0,
          eligible: 0,
        },
      ),
      channels,
    };
  }

  async authorizeRecovery(input: {
    connectionId: string;
    channelId: string;
    confirmation: string;
    selection: InboundWebhookReplaySelectionDto;
    actor: PlatformAdminUser;
    sourceIp: string | null;
  }): Promise<BackofficeInboundWebhookProductionRecoveryResultDto> {
    if (!this.productionEnabled()) {
      throw new ConflictException("Recuperacao de producao desativada");
    }

    let connection = await this.requireConnection(input.connectionId);

    if (input.confirmation.trim() !== connection.displayName) {
      throw new BadRequestException("Digite o nome exato da conexao");
    }

    const channel = connection.channels.find(
      (candidate) => candidate.id === input.channelId,
    );

    if (!channel) {
      throw new NotFoundException("Canal nao encontrado nesta conexao");
    }

    this.assertProductionContext(connection, channel);
    await this.channelRoutes.reevaluateOpenEvents(
      connection.workspaceId,
      channel.id,
    );
    connection = await this.requireConnection(input.connectionId);
    const refreshedChannel = connection.channels.find(
      (candidate) => candidate.id === input.channelId,
    );

    if (!refreshedChannel) {
      throw new NotFoundException("Canal nao encontrado nesta conexao");
    }

    this.assertProductionContext(connection, refreshedChannel);
    const boundary = this.activationBoundary(connection, refreshedChannel);
    const requestedLimit = selectionLimits[input.selection];
    const candidates = await this.prisma.inboundWebhookEvent.findMany({
      where: this.eligibleWhere(
        connection.workspaceId,
        connection.id,
        refreshedChannel.id,
        boundary,
        new Date(),
      ),
      select: {
        id: true,
        workspaceId: true,
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: requestedLimit,
    });

    if (candidates.length === 0) {
      throw new BadRequestException(
        "Nenhum evento pos-ativacao esta pronto para recuperacao",
      );
    }

    const queuedAt = new Date();
    const persisted = await this.prisma.inboundWebhookProductionItem.createMany(
      {
        data: candidates.map((event) => ({
          workspaceId: event.workspaceId,
          eventId: event.id,
          status: "queued" as const,
          queuedAt,
        })),
        skipDuplicates: true,
      },
    );
    const items = await this.prisma.inboundWebhookProductionItem.findMany({
      where: {
        workspaceId: connection.workspaceId,
        eventId: { in: candidates.map((event) => event.id) },
        status: "queued",
      },
      select: {
        id: true,
        workspaceId: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (items.length === 0) {
      throw new ConflictException(
        "Os eventos selecionados ja entraram em outra operacao",
      );
    }

    await this.prisma.auditLog.create({
      data: {
        workspaceId: connection.workspaceId,
        actorUserId: input.actor.id,
        actorType: input.actor.role,
        action: "inbound_webhook.production_recovery.authorize",
        targetType: "inbound_webhook_connection",
        targetId: connection.id,
        sourceIp: this.sourceIp(input.sourceIp),
        resultStatus: "queued",
        afterSummary: {
          connectionId: connection.id,
          channelId: refreshedChannel.id,
          selection: input.selection,
          requestedLimit,
          selected: candidates.length,
          persisted: persisted.count,
        },
      },
    });

    let queued = 0;
    let existing = 0;
    let queueFailures = 0;

    for (const item of items) {
      try {
        const result = await this.queue.enqueueItem({
          productionItemId: item.id,
          workspaceId: item.workspaceId,
        });

        if (result.status === "existing") {
          existing += 1;
        } else {
          queued += 1;
        }
      } catch {
        queueFailures += 1;
      }
    }

    return {
      connectionId: connection.id,
      channelId: refreshedChannel.id,
      selection: input.selection,
      selected: candidates.length,
      persisted: persisted.count,
      queued,
      existing,
      queueFailures,
    };
  }

  private async channelPreview(
    connection: RecoveryConnection,
    channel: RecoveryConnection["channels"][number],
    now: Date,
  ) {
    const totalCtwa = await this.prisma.inboundWebhookEvent.count({
      where: {
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        channelId: channel.id,
        hasCtwa: true,
      },
    });
    const readyContext = this.productionContextReady(connection, channel);

    if (!readyContext) {
      return {
        id: channel.id,
        displayName: this.channelDisplayName(channel),
        connectedPhone: channel.connectedPhone,
        status: channel.status,
        productionActivatedAt:
          channel.productionActivatedAt?.toISOString() ?? null,
        totalCtwa,
        historical: totalCtwa,
        routeUnresolved: 0,
        unavailable: 0,
        alreadyQueued: 0,
        eligible: 0,
      };
    }

    const boundary = this.activationBoundary(connection, channel);
    const postActivation = this.postActivationWhere(
      connection.workspaceId,
      connection.id,
      channel.id,
      boundary,
    );
    const [postActivationCount, routeUnresolved, alreadyQueued, eligible] =
      await Promise.all([
        this.prisma.inboundWebhookEvent.count({ where: postActivation }),
        this.prisma.inboundWebhookEvent.count({
          where: {
            ...postActivation,
            classification: "eligible_route_unresolved",
            replayItem: null,
            productionItem: null,
          },
        }),
        this.prisma.inboundWebhookEvent.count({
          where: {
            ...postActivation,
            productionItem: { isNot: null },
          },
        }),
        this.prisma.inboundWebhookEvent.count({
          where: this.eligibleWhere(
            connection.workspaceId,
            connection.id,
            channel.id,
            boundary,
            now,
          ),
        }),
      ]);

    return {
      id: channel.id,
      displayName: this.channelDisplayName(channel),
      connectedPhone: channel.connectedPhone,
      status: channel.status,
      productionActivatedAt:
        channel.productionActivatedAt?.toISOString() ?? null,
      totalCtwa,
      historical: Math.max(0, totalCtwa - postActivationCount),
      routeUnresolved,
      unavailable: Math.max(
        0,
        postActivationCount - routeUnresolved - alreadyQueued - eligible,
      ),
      alreadyQueued,
      eligible,
    };
  }

  private postActivationWhere(
    workspaceId: string,
    connectionId: string,
    channelId: string,
    boundary: Date,
  ): Prisma.InboundWebhookEventWhereInput {
    return {
      workspaceId,
      connectionId,
      channelId,
      provider: "umbler",
      hasCtwa: true,
      delivery: {
        firstReceivedAt: { gte: boundary },
      },
    };
  }

  private eligibleWhere(
    workspaceId: string,
    connectionId: string,
    channelId: string,
    boundary: Date,
    now: Date,
  ): Prisma.InboundWebhookEventWhereInput {
    return {
      ...this.postActivationWhere(
        workspaceId,
        connectionId,
        channelId,
        boundary,
      ),
      classification: "eligible_route_resolved",
      adId: { not: null },
      resolvedBusinessConnectionId: { not: null },
      resolvedReportingAccountId: { not: null },
      resolvedConversionDestinationId: { not: null },
      replayItem: null,
      productionItem: null,
      delivery: {
        firstReceivedAt: { gte: boundary },
        payloadExpiresAt: { gt: now },
        encryptedPayload: { not: null },
        payloadIv: { not: null },
        payloadTag: { not: null },
        encryptionKeyVersion: { not: null },
      },
    };
  }

  private assertProductionContext(
    connection: RecoveryConnection,
    channel: RecoveryConnection["channels"][number],
  ): void {
    if (!this.productionContextReady(connection, channel)) {
      throw new ConflictException(
        "A conexao, o parser e o canal precisam estar ativos em producao",
      );
    }
  }

  private productionContextReady(
    connection: RecoveryConnection,
    channel: RecoveryConnection["channels"][number],
  ): boolean {
    return Boolean(
      connection.status === "production" &&
      connection.productionActivatedAt &&
      connection.parserRelease.status === "certified" &&
      channel.status === "active" &&
      channel.productionActivatedAt,
    );
  }

  private activationBoundary(
    connection: RecoveryConnection,
    channel: RecoveryConnection["channels"][number],
  ): Date {
    const connectionActivatedAt = connection.productionActivatedAt;
    const channelActivatedAt = channel.productionActivatedAt;

    if (!connectionActivatedAt || !channelActivatedAt) {
      throw new ConflictException("Ativacao de producao incompleta");
    }

    return connectionActivatedAt > channelActivatedAt
      ? connectionActivatedAt
      : channelActivatedAt;
  }

  private connectionDto(connection: RecoveryConnection) {
    return {
      id: connection.id,
      workspaceId: connection.workspaceId,
      provider: connection.provider,
      displayName: connection.displayName,
      parserVersion: connection.parserRelease.version,
      parserReleaseStatus: connection.parserRelease.status,
      status: connection.status,
      productionActivatedAt:
        connection.productionActivatedAt?.toISOString() ?? null,
      lastDeliveryAt: connection.lastDeliveryAt?.toISOString() ?? null,
      lastSuccessfulParseAt:
        connection.lastSuccessfulParseAt?.toISOString() ?? null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }

  private async requireConnection(connectionId: string) {
    const connection = await this.findConnection(connectionId);

    if (!connection) {
      throw new NotFoundException("Conexao nao encontrada");
    }

    return connection;
  }

  private findConnection(connectionId: string) {
    return this.prisma.inboundWebhookConnection.findFirst({
      where: {
        id: connectionId,
        removedAt: null,
      },
      select: recoveryConnectionSelect,
    });
  }

  private channelDisplayName(channel: {
    channelName: string | null;
    connectedPhone: string;
  }): string {
    return channel.channelName?.trim() || channel.connectedPhone;
  }

  private productionEnabled(): boolean {
    const config = parseInboundWebhooksConfig(this.env);
    return config.enabled && config.productionEnabled;
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
