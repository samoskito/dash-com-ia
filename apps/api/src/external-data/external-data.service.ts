import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  externalConnectorProviderSchema,
  externalConnectorSslModeSchema,
  externalConnectorStatusSchema,
  externalDataConnectorSchema,
  externalMysqlCredentialsInputSchema,
  type ExternalConnectionTestResultDto,
  type ExternalConnectorHealthDto,
  type ExternalDataConnectorCreateInputDto,
  type ExternalDataConnectorDto,
  type ExternalDataConnectorUpdateInputDto,
  type ExternalSyncInputDto,
  type ExternalSyncQueuedResultDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { ExternalCredentialEncryptionService } from "./external-credential-encryption.service";
import { ExternalMysqlAdapter } from "./external-mysql.adapter";
import { ExternalSyncQueueService } from "./external-sync-queue.service";

type ConnectorWithCursors = {
  id: string;
  workspaceId: string;
  name: string;
  provider: string;
  status: string;
  timezone: string;
  sslMode: string;
  credentialsEncrypted: string;
  credentialsIv: string;
  credentialsTag: string;
  syncEnabled: boolean;
  shadowMode: boolean;
  capiSendEnabled: boolean;
  purchaseAverageValueCents: number | null;
  defaultCurrency: string | null;
  lastConnectionTestAt: Date | null;
  lastConnectionStatus: string | null;
  lastSyncStartedAt: Date | null;
  lastSyncCompletedAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  cursors: Array<{
    stream: string;
    lastExternalId: string | null;
    lastUpdatedAt: Date | null;
    lastSyncedAt: Date | null;
  }>;
};

@Injectable()
export class ExternalDataService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExternalCredentialEncryptionService)
    private readonly credentialEncryption: ExternalCredentialEncryptionService,
    @Inject(ExternalMysqlAdapter)
    private readonly mysqlAdapter: ExternalMysqlAdapter,
    @Inject(ExternalSyncQueueService)
    private readonly syncQueue: ExternalSyncQueueService
  ) {}

  async listConnectors(workspaceId?: string): Promise<ExternalDataConnectorDto[]> {
    const connectors = (await this.prisma.externalDataConnector.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      include: { cursors: { orderBy: { stream: "asc" } } },
      orderBy: [{ workspaceId: "asc" }, { createdAt: "desc" }]
    })) as ConnectorWithCursors[];

    return connectors.map((connector) => this.toDto(connector));
  }

  async createConnector(
    input: ExternalDataConnectorCreateInputDto,
    actorUserId: string
  ): Promise<ExternalDataConnectorDto> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { id: true }
    });

    if (!workspace) {
      throw new NotFoundException("Workspace nao encontrado");
    }

    const encrypted = this.credentialEncryption.encrypt(input.credentials);
    const connector = (await this.prisma.externalDataConnector.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        provider: input.provider,
        timezone: input.timezone,
        sslMode: input.sslMode,
        ...encrypted,
        syncEnabled: input.syncEnabled,
        shadowMode: input.shadowMode,
        capiSendEnabled: input.capiSendEnabled,
        purchaseAverageValueCents: input.purchaseAverageValueCents ?? null,
        defaultCurrency: input.defaultCurrency
      },
      include: { cursors: true }
    })) as ConnectorWithCursors;
    const dto = this.toDto(connector);

    await this.createAudit({
      workspaceId: connector.workspaceId,
      actorUserId,
      action: "external_connector.created",
      targetId: connector.id,
      afterSummary: this.auditSummary(dto)
    });

    return dto;
  }

  async updateConnector(
    connectorId: string,
    input: ExternalDataConnectorUpdateInputDto,
    actorUserId: string
  ): Promise<ExternalDataConnectorDto> {
    const current = await this.getConnector(connectorId);
    const before = this.toDto(current);
    const data: Prisma.ExternalDataConnectorUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.sslMode !== undefined ? { sslMode: input.sslMode } : {}),
      ...(input.syncEnabled !== undefined ? { syncEnabled: input.syncEnabled } : {}),
      ...(input.shadowMode !== undefined ? { shadowMode: input.shadowMode } : {}),
      ...(input.capiSendEnabled !== undefined
        ? { capiSendEnabled: input.capiSendEnabled }
        : {}),
      ...(input.purchaseAverageValueCents !== undefined
        ? { purchaseAverageValueCents: input.purchaseAverageValueCents }
        : {}),
      ...(input.defaultCurrency !== undefined
        ? { defaultCurrency: input.defaultCurrency }
        : {})
    };

    if (input.credentials) {
      const existing = this.credentialEncryption.decrypt(current);
      const credentials = externalMysqlCredentialsInputSchema.parse({
        ...existing,
        ...input.credentials
      });
      Object.assign(data, this.credentialEncryption.encrypt(credentials));
    }

    if (input.status === "disabled") {
      data.syncEnabled = false;
      data.capiSendEnabled = false;
    }

    const updated = (await this.prisma.externalDataConnector.update({
      where: { id: connectorId },
      data,
      include: { cursors: { orderBy: { stream: "asc" } } }
    })) as ConnectorWithCursors;
    const dto = this.toDto(updated);

    await this.createAudit({
      workspaceId: updated.workspaceId,
      actorUserId,
      action: "external_connector.updated",
      targetId: updated.id,
      beforeSummary: this.auditSummary(before),
      afterSummary: this.auditSummary(dto)
    });

    return dto;
  }

  async testConnection(
    connectorId: string,
    actorUserId: string
  ): Promise<ExternalConnectionTestResultDto> {
    const connector = await this.getConnector(connectorId);
    const credentials = this.credentialEncryption.decrypt(connector);
    const sslMode = externalConnectorSslModeSchema.parse(connector.sslMode);
    const result = await this.mysqlAdapter.testConnection(credentials, sslMode);

    await this.prisma.externalDataConnector.update({
      where: { id: connector.id },
      data: {
        lastConnectionTestAt: new Date(),
        lastConnectionStatus: result.status,
        ...(result.ok ? { lastSyncErrorCode: null } : {})
      }
    });
    await this.createAudit({
      workspaceId: connector.workspaceId,
      actorUserId,
      action: "external_connector.connection_tested",
      targetId: connector.id,
      resultStatus: result.ok ? "success" : "failed",
      afterSummary: {
        status: result.status,
        latencyMs: result.latencyMs,
        leadsViewAvailable: result.leadsViewAvailable,
        eventsViewAvailable: result.eventsViewAvailable,
        errorCode: result.errorCode
      }
    });

    return result;
  }

  async enqueueSync(
    connectorId: string,
    input: ExternalSyncInputDto,
    actorUserId: string
  ): Promise<ExternalSyncQueuedResultDto> {
    const connector = await this.getConnector(connectorId);

    if (connector.status !== "active") {
      throw new BadRequestException("Ative o conector antes de sincronizar");
    }

    const result = await this.syncQueue.enqueueSync({
      connectorId,
      streams: input.streams,
      requestedByUserId: actorUserId
    });
    await this.createAudit({
      workspaceId: connector.workspaceId,
      actorUserId,
      action: "external_connector.sync_requested",
      targetId: connector.id,
      afterSummary: { streams: result.streams, jobId: result.jobId }
    });

    return result;
  }

  async getHealth(connectorId: string): Promise<ExternalConnectorHealthDto> {
    const connector = await this.getConnector(connectorId);
    const records = await this.prisma.externalIngestionRecord.findMany({
      where: { connectorId },
      select: { status: true, duplicateCount: true }
    });
    const totals = {
      imported: 0,
      duplicates: 0,
      rejected: 0,
      pending: 0
    };

    for (const record of records) {
      totals.duplicates += Math.max(0, record.duplicateCount);

      if (record.status === "imported") {
        totals.imported += 1;
      } else if (record.status === "duplicate") {
        totals.duplicates += 1;
      } else if (record.status === "rejected") {
        totals.rejected += 1;
      } else if (["pending", "pending_delivery"].includes(record.status)) {
        totals.pending += 1;
      }
    }

    return { connector: this.toDto(connector), totals };
  }

  private async getConnector(connectorId: string): Promise<ConnectorWithCursors> {
    const connector = (await this.prisma.externalDataConnector.findUnique({
      where: { id: connectorId },
      include: { cursors: { orderBy: { stream: "asc" } } }
    })) as ConnectorWithCursors | null;

    if (!connector) {
      throw new NotFoundException("Conector externo nao encontrado");
    }

    return connector;
  }

  private toDto(connector: ConnectorWithCursors): ExternalDataConnectorDto {
    return externalDataConnectorSchema.parse({
      id: connector.id,
      workspaceId: connector.workspaceId,
      name: connector.name,
      provider: externalConnectorProviderSchema.parse(connector.provider),
      status: externalConnectorStatusSchema.parse(connector.status),
      timezone: connector.timezone,
      sslMode: externalConnectorSslModeSchema.parse(connector.sslMode),
      syncEnabled: connector.syncEnabled,
      shadowMode: connector.shadowMode,
      capiSendEnabled: connector.capiSendEnabled,
      purchaseAverageValueCents: connector.purchaseAverageValueCents,
      defaultCurrency: connector.defaultCurrency,
      hasCredentials: true,
      lastConnectionTestAt: connector.lastConnectionTestAt?.toISOString() ?? null,
      lastConnectionStatus: connector.lastConnectionStatus,
      lastSyncStartedAt: connector.lastSyncStartedAt?.toISOString() ?? null,
      lastSyncCompletedAt: connector.lastSyncCompletedAt?.toISOString() ?? null,
      lastSyncStatus: connector.lastSyncStatus,
      lastSyncErrorCode: connector.lastSyncErrorCode,
      cursors: connector.cursors.map((cursor) => ({
        stream: cursor.stream,
        lastExternalId: cursor.lastExternalId,
        lastUpdatedAt: cursor.lastUpdatedAt?.toISOString() ?? null,
        lastSyncedAt: cursor.lastSyncedAt?.toISOString() ?? null
      })),
      createdAt: connector.createdAt.toISOString(),
      updatedAt: connector.updatedAt.toISOString()
    });
  }

  private auditSummary(connector: ExternalDataConnectorDto): Prisma.InputJsonValue {
    return {
      name: connector.name,
      provider: connector.provider,
      status: connector.status,
      timezone: connector.timezone,
      sslMode: connector.sslMode,
      syncEnabled: connector.syncEnabled,
      shadowMode: connector.shadowMode,
      capiSendEnabled: connector.capiSendEnabled,
      purchaseAverageValueCents: connector.purchaseAverageValueCents,
      defaultCurrency: connector.defaultCurrency,
      hasCredentials: true
    } as Prisma.InputJsonValue;
  }

  private async createAudit(input: {
    workspaceId: string;
    actorUserId: string;
    action: string;
    targetId: string;
    resultStatus?: string;
    beforeSummary?: Prisma.InputJsonValue;
    afterSummary?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        actorType: "platform_admin",
        action: input.action,
        targetType: "ExternalDataConnector",
        targetId: input.targetId,
        resultStatus: input.resultStatus ?? "success",
        beforeSummary: input.beforeSummary ?? Prisma.JsonNull,
        afterSummary: input.afterSummary ?? Prisma.JsonNull
      }
    });
  }
}
