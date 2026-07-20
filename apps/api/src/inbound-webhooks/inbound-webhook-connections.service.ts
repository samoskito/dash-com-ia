import { createHash, randomBytes } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  InboundWebhookConnectionCreateInputDto,
  InboundWebhookConnectionCreateResultDto,
  InboundWebhookConnectionDto,
  InboundWebhookConnectionOverviewDto,
  InboundWebhookConnectionRotateSecretResultDto,
  InboundWebhookConnectionStatusUpdateInputDto,
  InboundWebhookCapabilitiesDto,
} from "@wpptrack/shared";
import { inboundWebhookProviders } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";

const parserVersion = "v1";
const connectionNotFoundMessage = "Conexao de webhook nao encontrada";
const productionCertificationMessage =
  "A ativacao em producao depende da certificacao do parser e ainda nao esta disponivel";
const concurrentMutationMessage =
  "A conexao foi alterada por outra operacao; tente novamente";

type PersistedInboundWebhookConnection =
  Prisma.InboundWebhookConnectionGetPayload<{
    include: { parserRelease: true };
  }>;

@Injectable()
export class InboundWebhookConnectionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
  ) {}

  async getCapabilities(): Promise<InboundWebhookCapabilitiesDto> {
    const config = parseInboundWebhooksConfig(this.env);
    const releases = await this.prisma.inboundWebhookParserRelease.findMany({
      where: {
        provider: {
          in: [...inboundWebhookProviders],
        },
        version: parserVersion,
      },
      select: {
        provider: true,
        status: true,
      },
    });
    const releaseByProvider = new Map(
      releases.map((release) => [release.provider, release]),
    );

    return {
      enabled: config.enabled,
      providers: inboundWebhookProviders.map((provider) => {
        const release = releaseByProvider.get(provider);

        return {
          provider,
          parserVersion,
          parserReleaseStatus: release?.status ?? null,
          creationEnabled:
            config.enabled === true &&
            release !== undefined &&
            release.status !== "retired",
        };
      }),
    };
  }

  async listConnections(
    workspaceId: string,
  ): Promise<InboundWebhookConnectionDto[]> {
    const connections = await this.prisma.inboundWebhookConnection.findMany({
      where: {
        workspaceId,
        removedAt: null,
      },
      include: {
        parserRelease: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return connections.map((connection) => this.toDto(connection));
  }

  async getOverview(
    workspaceId: string,
    connectionId: string,
  ): Promise<InboundWebhookConnectionOverviewDto> {
    const connection = await this.requireConnection(
      this.prisma,
      workspaceId,
      connectionId,
    );
    const [eventCounts, deliveries] = await Promise.all([
      this.prisma.inboundWebhookEvent.groupBy({
        by: ["classification"],
        where: {
          workspaceId,
          connectionId,
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.inboundWebhookDelivery.findMany({
        where: {
          workspaceId,
          connectionId,
        },
        select: {
          attemptCount: true,
          classification: true,
        },
      }),
    ]);
    const countsByClassification = new Map(
      eventCounts.map((row) => [row.classification, row._count._all]),
    );

    return {
      connection: this.toDto(connection),
      counters: {
        eligibleRouted:
          countsByClassification.get("eligible_route_resolved") ?? 0,
        eligibleUnresolved:
          countsByClassification.get("eligible_route_unresolved") ?? 0,
        ignoredNoCtwa: countsByClassification.get("ignored_no_ctwa") ?? 0,
        duplicate: deliveries.reduce(
          (total, delivery) => total + Math.max(0, delivery.attemptCount - 1),
          0,
        ),
        invalid: deliveries.filter(
          (delivery) => delivery.classification === "invalid_payload",
        ).length,
      },
    };
  }

  async getConnection(
    workspaceId: string,
    connectionId: string,
  ): Promise<InboundWebhookConnectionDto> {
    return this.toDto(
      await this.requireConnection(this.prisma, workspaceId, connectionId),
    );
  }

  async createConnection(
    workspaceId: string,
    input: InboundWebhookConnectionCreateInputDto,
    actorUserId: string,
  ): Promise<InboundWebhookConnectionCreateResultDto> {
    const config = this.requireEnabledConfig();
    const secret = this.generateSecret();
    const secretHash = this.hashSecret(secret);

    const connection = await this.prisma.$transaction(async (transaction) => {
      const release = await transaction.inboundWebhookParserRelease.findFirst({
        where: {
          provider: input.provider,
          version: parserVersion,
          status: {
            not: "retired",
          },
        },
      });

      if (!release) {
        throw new ConflictException(
          "Versao de observacao do provedor indisponivel",
        );
      }

      const created = await transaction.inboundWebhookConnection.create({
        data: {
          workspaceId,
          provider: input.provider,
          displayName: input.displayName,
          parserReleaseId: release.id,
          secretHash,
          status: "observation",
          createdByUserId: actorUserId,
        },
        include: {
          parserRelease: true,
        },
      });

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "inbound_webhook.connection_created",
        targetId: created.id,
        resultStatus: created.status,
        beforeSummary: undefined,
        afterSummary: this.auditSummary(created),
      });

      return created;
    });

    return {
      connection: this.toDto(connection),
      secret,
      webhookUrl: this.buildWebhookUrl(
        config.apiPublicUrl,
        connection.id,
        secret,
      ),
    };
  }

  async rotateSecret(
    workspaceId: string,
    connectionId: string,
    actorUserId: string,
  ): Promise<InboundWebhookConnectionRotateSecretResultDto> {
    const config = this.requireEnabledConfig();
    const secret = this.generateSecret();
    const secretHash = this.hashSecret(secret);

    const connection = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireConnection(
        transaction,
        workspaceId,
        connectionId,
      );
      const updatedAt = this.nextMutationTime(current.updatedAt);
      const claimed = await transaction.inboundWebhookConnection.updateMany({
        where: this.activeMutationWhere(current),
        data: {
          secretHash,
          updatedAt,
        },
      });

      this.assertMutationClaimed(claimed.count);
      const updated = await this.requireConnection(
        transaction,
        workspaceId,
        connectionId,
      );

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "inbound_webhook.secret_rotated",
        targetId: updated.id,
        resultStatus: updated.status,
        beforeSummary: this.auditSummary(current),
        afterSummary: {
          ...this.auditSummary(updated),
          secretRotated: true,
        },
      });

      return updated;
    });

    return {
      connectionId: connection.id,
      provider: connection.provider,
      secret,
      webhookUrl: this.buildWebhookUrl(
        config.apiPublicUrl,
        connection.id,
        secret,
      ),
      rotatedAt: connection.updatedAt.toISOString(),
    };
  }

  async updateStatus(
    workspaceId: string,
    connectionId: string,
    input: InboundWebhookConnectionStatusUpdateInputDto,
    actorUserId: string,
  ): Promise<InboundWebhookConnectionDto> {
    if ((input.status as string) === "production") {
      throw new ConflictException(productionCertificationMessage);
    }

    if (input.status === "observation") {
      this.requireEnabledConfig();
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireConnection(
        transaction,
        workspaceId,
        connectionId,
      );
      const updatedAt = this.nextMutationTime(current.updatedAt);
      const claimed = await transaction.inboundWebhookConnection.updateMany({
        where: this.activeMutationWhere(current),
        data: {
          status: input.status,
          updatedAt,
        },
      });

      this.assertMutationClaimed(claimed.count);
      const connection = await this.requireConnection(
        transaction,
        workspaceId,
        connectionId,
      );

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action:
          input.status === "paused"
            ? "inbound_webhook.connection_paused"
            : "inbound_webhook.connection_resumed",
        targetId: connection.id,
        resultStatus: connection.status,
        beforeSummary: this.auditSummary(current),
        afterSummary: this.auditSummary(connection),
      });

      return connection;
    });

    return this.toDto(updated);
  }

  async removeConnection(
    workspaceId: string,
    connectionId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireConnection(
        transaction,
        workspaceId,
        connectionId,
      );
      const removedAt = this.nextMutationTime(current.updatedAt);
      const claimed = await transaction.inboundWebhookConnection.updateMany({
        where: this.activeMutationWhere(current),
        data: {
          status: "paused",
          secretHash: null,
          removedAt,
          updatedAt: removedAt,
        },
      });

      this.assertMutationClaimed(claimed.count);
      const removed: PersistedInboundWebhookConnection = {
        ...current,
        status: "paused",
        secretHash: null,
        removedAt,
        updatedAt: removedAt,
      };

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "inbound_webhook.connection_removed",
        targetId: removed.id,
        resultStatus: "removed",
        beforeSummary: this.auditSummary(current),
        afterSummary: {
          ...this.auditSummary(removed),
          removed: true,
        },
      });
    });
  }

  private activeMutationWhere(
    connection: PersistedInboundWebhookConnection,
  ): Prisma.InboundWebhookConnectionWhereInput {
    return {
      id: connection.id,
      workspaceId: connection.workspaceId,
      removedAt: null,
      updatedAt: connection.updatedAt,
    };
  }

  private assertMutationClaimed(count: number): void {
    if (count !== 1) {
      throw new ConflictException(concurrentMutationMessage);
    }
  }

  private nextMutationTime(previous: Date): Date {
    return new Date(Math.max(Date.now(), previous.getTime() + 1));
  }

  private async requireConnection(
    client: Pick<PrismaService, "inboundWebhookConnection">,
    workspaceId: string,
    connectionId: string,
  ): Promise<PersistedInboundWebhookConnection> {
    const connection = await client.inboundWebhookConnection.findFirst({
      where: {
        id: connectionId,
        workspaceId,
        removedAt: null,
      },
      include: {
        parserRelease: true,
      },
    });

    if (!connection) {
      throw new NotFoundException(connectionNotFoundMessage);
    }

    return connection;
  }

  private requireEnabledConfig() {
    const config = parseInboundWebhooksConfig(this.env);

    if (!config.enabled) {
      throw new ServiceUnavailableException(
        "Conexoes de webhook de entrada ainda nao estao habilitadas",
      );
    }

    return config;
  }

  private generateSecret(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret, "utf8").digest("hex");
  }

  private buildWebhookUrl(
    apiPublicUrl: string,
    connectionId: string,
    secret: string,
  ): string {
    const url = new URL(
      `/webhooks/inbound/${encodeURIComponent(connectionId)}`,
      apiPublicUrl,
    );
    url.searchParams.set("token", secret);

    return url.toString();
  }

  private toDto(
    connection: PersistedInboundWebhookConnection,
  ): InboundWebhookConnectionDto {
    return {
      id: connection.id,
      workspaceId: connection.workspaceId,
      provider: connection.provider,
      displayName: connection.displayName,
      parserVersion: connection.parserRelease.version,
      parserReleaseStatus: connection.parserRelease.status,
      status: connection.status,
      lastDeliveryAt: connection.lastDeliveryAt?.toISOString() ?? null,
      lastSuccessfulParseAt:
        connection.lastSuccessfulParseAt?.toISOString() ?? null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }

  private auditSummary(
    connection: PersistedInboundWebhookConnection,
  ): Prisma.InputJsonObject {
    return {
      connectionId: connection.id,
      provider: connection.provider,
      parserVersion: connection.parserRelease.version,
      status: connection.status,
    };
  }

  private async createAudit(
    transaction: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      actorUserId: string;
      action: string;
      targetId: string;
      resultStatus: string;
      beforeSummary: Prisma.InputJsonObject | undefined;
      afterSummary: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        actorType: "user",
        action: input.action,
        targetType: "InboundWebhookConnection",
        targetId: input.targetId,
        reason: null,
        sourceIp: null,
        resultStatus: input.resultStatus,
        beforeSummary: input.beforeSummary,
        afterSummary: input.afterSummary,
      },
    });
  }
}

export { productionCertificationMessage };
