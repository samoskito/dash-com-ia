import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  externalConnectorProviderSchema,
  externalConnectorSslModeSchema,
  externalSyncStreamSchema,
  type ExternalSyncStreamDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { LeadsService } from "../leads/leads.service";
import { ExternalCredentialEncryptionService } from "./external-credential-encryption.service";
import {
  ExternalEventIngestionService,
  type ExternalEventConnectorContext
} from "./external-event-ingestion.service";
import {
  ExternalMysqlAdapter,
  type ExternalLeadRow,
  type ExternalSyncCursorValue
} from "./external-mysql.adapter";

export type ExternalSyncCounts = {
  read: number;
  imported: number;
  duplicates: number;
  rejected: number;
  queued: number;
};

export type ExternalConnectorSyncResult = {
  connectorId: string;
  workspaceId: string;
  streams: ExternalSyncStreamDto[];
  counts: ExternalSyncCounts;
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

type ConnectorRecord = {
  id: string;
  workspaceId: string;
  provider: string;
  status: string;
  timezone: string;
  sslMode: string;
  credentialsEncrypted: string;
  credentialsIv: string;
  credentialsTag: string;
  shadowMode: boolean;
  capiSendEnabled: boolean;
  purchaseAverageValueCents: number | null;
  defaultCurrency: string | null;
};

@Injectable()
export class ExternalSyncService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LeadsService) private readonly leadsService: LeadsService,
    @Inject(ExternalCredentialEncryptionService)
    private readonly credentialEncryption: ExternalCredentialEncryptionService,
    @Inject(ExternalMysqlAdapter)
    private readonly mysqlAdapter: ExternalMysqlAdapter,
    @Inject(ExternalEventIngestionService)
    private readonly eventIngestion: ExternalEventIngestionService
  ) {}

  async syncConnector(
    connectorId: string,
    requestedStreams: ExternalSyncStreamDto[]
  ): Promise<ExternalConnectorSyncResult> {
    const connector = (await this.prisma.externalDataConnector.findUnique({
      where: { id: connectorId }
    })) as ConnectorRecord | null;

    if (!connector) {
      throw new NotFoundException("Conector externo nao encontrado");
    }

    if (connector.status !== "active") {
      throw new Error("ExternalConnectorNotActive");
    }

    const streams = this.normalizeStreams(requestedStreams);
    const credentials = this.credentialEncryption.decrypt(connector);
    const sslMode = externalConnectorSslModeSchema.parse(connector.sslMode);
    const context = this.connectorContext(connector);
    const startedAt = new Date();
    const counts = this.emptyCounts();

    await this.prisma.externalDataConnector.update({
      where: { id: connector.id },
      data: {
        lastSyncStartedAt: startedAt,
        lastSyncStatus: "running",
        lastSyncErrorCode: null
      }
    });

    const integrationLog = await this.prisma.integrationLog.create({
      data: {
        workspaceId: connector.workspaceId,
        source: "external_mysql",
        operation: "incremental_sync",
        status: "running",
        startedAt,
        requestSummary: {
          connectorId: connector.id,
          provider: connector.provider,
          streams
        } as Prisma.InputJsonValue
      },
      select: { id: true }
    });

    try {
      for (const stream of streams) {
        const streamCounts =
          stream === "leads"
            ? await this.syncLeads(connector, credentials, sslMode)
            : await this.syncEvents(context, credentials, sslMode);
        this.addCounts(counts, streamCounts);
      }

      const completedAt = new Date();
      const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());

      await this.prisma.$transaction([
        this.prisma.externalDataConnector.update({
          where: { id: connector.id },
          data: {
            lastSyncCompletedAt: completedAt,
            lastSyncStatus: "completed",
            lastSyncErrorCode: null
          }
        }),
        this.prisma.integrationLog.update({
          where: { id: integrationLog.id },
          data: {
            status: "completed",
            finishedAt: completedAt,
            durationMs,
            responseSummary: counts as Prisma.InputJsonValue
          }
        })
      ]);

      return {
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        streams,
        counts,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs
      };
    } catch (error) {
      const completedAt = new Date();
      const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
      const errorCode = this.errorCode(error);

      await this.prisma.$transaction([
        this.prisma.externalDataConnector.update({
          where: { id: connector.id },
          data: {
            lastSyncCompletedAt: completedAt,
            lastSyncStatus: "failed",
            lastSyncErrorCode: errorCode
          }
        }),
        this.prisma.integrationLog.update({
          where: { id: integrationLog.id },
          data: {
            status: "failed",
            finishedAt: completedAt,
            durationMs,
            providerErrorCode: errorCode,
            providerErrorMessage: this.safeErrorMessage(error),
            responseSummary: counts as Prisma.InputJsonValue
          }
        })
      ]);

      throw error;
    }
  }

  private async syncLeads(
    connector: ConnectorRecord,
    credentials: ReturnType<ExternalCredentialEncryptionService["decrypt"]>,
    sslMode: ReturnType<typeof externalConnectorSslModeSchema.parse>
  ): Promise<ExternalSyncCounts> {
    const counts = this.emptyCounts();
    const batchSize = this.rowBatchSize();
    let cursor = await this.getCursor(connector.id, "leads");

    while (true) {
      const rows = await this.mysqlAdapter.readLeadsPage(
        credentials,
        sslMode,
        cursor,
        batchSize
      );
      counts.read += rows.length;

      for (const row of rows) {
        const status = await this.ingestLead(connector, row);
        counts[status] += 1;
      }

      if (rows.length > 0) {
        cursor = await this.advanceCursor(connector.id, "leads", rows.at(-1)!);
      } else {
        await this.touchCursor(connector.id, "leads", cursor);
      }

      if (rows.length < batchSize) {
        return counts;
      }
    }
  }

  private async syncEvents(
    connector: ExternalEventConnectorContext,
    credentials: ReturnType<ExternalCredentialEncryptionService["decrypt"]>,
    sslMode: ReturnType<typeof externalConnectorSslModeSchema.parse>
  ): Promise<ExternalSyncCounts> {
    const counts = this.emptyCounts();
    const batchSize = this.rowBatchSize();
    let cursor = await this.getCursor(connector.id, "events");

    while (true) {
      const rows = await this.mysqlAdapter.readEventsPage(
        credentials,
        sslMode,
        cursor,
        batchSize
      );
      counts.read += rows.length;

      for (const row of rows) {
        const result = await this.eventIngestion.ingest(connector, row);
        if (result.status === "duplicate") {
          counts.duplicates += 1;
        } else {
          counts[result.status] += 1;
        }
        counts.queued += result.queued ? 1 : 0;
      }

      if (rows.length > 0) {
        cursor = await this.advanceCursor(connector.id, "events", rows.at(-1)!);
      } else {
        await this.touchCursor(connector.id, "events", cursor);
      }

      if (rows.length < batchSize) {
        return counts;
      }
    }
  }

  private async ingestLead(
    connector: ConnectorRecord,
    row: ExternalLeadRow
  ): Promise<"imported" | "duplicates" | "rejected"> {
    const sourceRowKey = `external-row:${connector.id}:leads:${row.externalRowId}`;

    try {
      const firstMessageAt = this.parseExternalDate(row.firstMessageAt);
      const lastMessageAt = row.lastMessageAt
        ? this.parseExternalDate(row.lastMessageAt)
        : firstMessageAt;
      const lead = await this.leadsService.upsertFromWhatsappWebhook({
        workspaceId: connector.workspaceId,
        phone: row.phone,
        name: row.name ?? undefined,
        source: "external_mysql",
        preserveExistingSource: true,
        adId: row.adId ?? undefined,
        ctwaClid: row.ctwaClid ?? undefined,
        ctwaSourceUrl: row.sourceUrl ?? undefined,
        occurredAt: lastMessageAt,
        firstMessageAt,
        lastMessageAt,
        recordMessageTimestamps: true
      });

      if (!lead) {
        throw new Error("ExternalLeadPhoneMissing");
      }

      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { status: this.leadStatus(row) }
      });
      const existing = await this.prisma.externalIngestionRecord.findUnique({
        where: { dedupeKey: sourceRowKey },
        select: { id: true, duplicateCount: true }
      });

      await this.prisma.externalIngestionRecord.upsert({
        where: { dedupeKey: sourceRowKey },
        create: {
          workspaceId: connector.workspaceId,
          connectorId: connector.id,
          stream: "leads",
          externalRowId: row.externalRowId,
          dedupeKey: sourceRowKey,
          status: "imported",
          occurredAt: firstMessageAt,
          leadId: lead.id,
          summaryPayload: {
            externalLeadId: row.externalLeadId,
            sourceStatus: row.status
          } as Prisma.InputJsonValue
        },
        update: {
          status: "imported",
          occurredAt: firstMessageAt,
          leadId: lead.id,
          lastReceivedAt: new Date(),
          duplicateCount: { increment: 1 },
          errorCode: null,
          errorMessage: null,
          summaryPayload: {
            externalLeadId: row.externalLeadId,
            sourceStatus: row.status
          } as Prisma.InputJsonValue
        }
      });

      return existing ? "duplicates" : "imported";
    } catch (error) {
      await this.prisma.externalIngestionRecord.upsert({
        where: { dedupeKey: sourceRowKey },
        create: {
          workspaceId: connector.workspaceId,
          connectorId: connector.id,
          stream: "leads",
          externalRowId: row.externalRowId,
          dedupeKey: sourceRowKey,
          status: "rejected",
          errorCode: this.errorCode(error),
          errorMessage: this.safeErrorMessage(error),
          summaryPayload: {
            externalLeadId: row.externalLeadId
          } as Prisma.InputJsonValue
        },
        update: {
          status: "rejected",
          lastReceivedAt: new Date(),
          errorCode: this.errorCode(error),
          errorMessage: this.safeErrorMessage(error)
        }
      });

      return "rejected";
    }
  }

  private async getCursor(
    connectorId: string,
    stream: ExternalSyncStreamDto
  ): Promise<ExternalSyncCursorValue> {
    const cursor = await this.prisma.externalSyncCursor.findUnique({
      where: { connectorId_stream: { connectorId, stream } },
      select: { lastExternalId: true, lastUpdatedAt: true }
    });

    return cursor ?? { lastExternalId: null, lastUpdatedAt: null };
  }

  private async advanceCursor(
    connectorId: string,
    stream: ExternalSyncStreamDto,
    row: { externalRowId: string; updatedAt: string }
  ): Promise<ExternalSyncCursorValue> {
    const lastUpdatedAt = this.parseExternalDate(row.updatedAt);
    const now = new Date();

    await this.prisma.externalSyncCursor.upsert({
      where: { connectorId_stream: { connectorId, stream } },
      create: {
        connectorId,
        stream,
        lastExternalId: row.externalRowId,
        lastUpdatedAt,
        lastSyncedAt: now
      },
      update: {
        lastExternalId: row.externalRowId,
        lastUpdatedAt,
        lastSyncedAt: now
      }
    });

    return { lastExternalId: row.externalRowId, lastUpdatedAt };
  }

  private async touchCursor(
    connectorId: string,
    stream: ExternalSyncStreamDto,
    cursor: ExternalSyncCursorValue
  ): Promise<void> {
    await this.prisma.externalSyncCursor.upsert({
      where: { connectorId_stream: { connectorId, stream } },
      create: {
        connectorId,
        stream,
        lastExternalId: cursor.lastExternalId,
        lastUpdatedAt: cursor.lastUpdatedAt,
        lastSyncedAt: new Date()
      },
      update: { lastSyncedAt: new Date() }
    });
  }

  private connectorContext(connector: ConnectorRecord): ExternalEventConnectorContext {
    return {
      id: connector.id,
      workspaceId: connector.workspaceId,
      provider: externalConnectorProviderSchema.parse(connector.provider),
      timezone: connector.timezone,
      shadowMode: connector.shadowMode,
      capiSendEnabled: connector.capiSendEnabled,
      purchaseAverageValueCents: connector.purchaseAverageValueCents,
      defaultCurrency: connector.defaultCurrency
    };
  }

  private normalizeStreams(streams: ExternalSyncStreamDto[]): ExternalSyncStreamDto[] {
    return [...new Set(streams.map((stream) => externalSyncStreamSchema.parse(stream)))];
  }

  private leadStatus(row: ExternalLeadRow): "active" | "qualified" | "converted" {
    const status = row.status?.trim().toLowerCase();

    if (row.purchasedAt || ["comprou", "purchase", "converted"].includes(status ?? "")) {
      return "converted";
    }

    if (
      row.qualifiedAt ||
      ["qualificado", "qualified", "qualified_lead"].includes(status ?? "")
    ) {
      return "qualified";
    }

    return "active";
  }

  private parseExternalDate(value: string): Date {
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
    const parsed = new Date(normalized);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error("ExternalRowTimestampInvalid");
    }

    return parsed;
  }

  private rowBatchSize(): number {
    const parsed = Number.parseInt(
      process.env.WPPTRACK_EXTERNAL_SYNC_ROW_BATCH_SIZE ?? "",
      10
    );
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1_000) : 200;
  }

  private emptyCounts(): ExternalSyncCounts {
    return { read: 0, imported: 0, duplicates: 0, rejected: 0, queued: 0 };
  }

  private addCounts(target: ExternalSyncCounts, source: ExternalSyncCounts): void {
    target.read += source.read;
    target.imported += source.imported;
    target.duplicates += source.duplicates;
    target.rejected += source.rejected;
    target.queued += source.queued;
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error) {
      const code = String((error as { code?: unknown }).code ?? "").trim();
      if (code) {
        return code.slice(0, 100);
      }
    }

    if (error instanceof Error && /^[A-Za-z][A-Za-z0-9_]+$/.test(error.message)) {
      return error.message.slice(0, 100);
    }

    return "ExternalDataSyncFailed";
  }

  private safeErrorMessage(error: unknown): string {
    switch (this.errorCode(error)) {
      case "ExternalConnectorNotActive":
        return "O conector externo nao esta ativo";
      case "ExternalRowTimestampInvalid":
        return "A origem retornou uma data invalida";
      case "ER_ACCESS_DENIED_ERROR":
        return "O MySQL recusou as credenciais do conector";
      case "ETIMEDOUT":
      case "PROTOCOL_SEQUENCE_TIMEOUT":
        return "A consulta ao MySQL excedeu o tempo limite";
      default:
        return "A sincronizacao externa nao foi concluida";
    }
  }
}
