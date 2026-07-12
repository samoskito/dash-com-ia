import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Job } from "bullmq";
import {
  EXTERNAL_DATA_SYNC_QUEUE,
  type ExternalDataSyncJobPayload
} from "../common/queue/queue.constants";
import { PrismaService } from "../common/prisma/prisma.service";
import { ExternalSyncService } from "./external-sync.service";

@Processor(EXTERNAL_DATA_SYNC_QUEUE)
export class ExternalSyncProcessor extends WorkerHost {
  constructor(
    @Inject(ExternalSyncService)
    private readonly syncService: ExternalSyncService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {
    super();
  }

  async process(job: Job<ExternalDataSyncJobPayload>) {
    const startedAt = new Date();

    try {
      const result = await this.syncService.syncConnector(
        job.data.connectorId,
        job.data.streams,
        { projectionRefresh: job.data.projectionRefresh === true }
      );
      await this.recordAttempt(job, "completed", startedAt, {
        connectorId: result.connectorId,
        streams: result.streams,
        counts: result.counts,
        durationMs: result.durationMs
      });
      return result;
    } catch (error) {
      await this.recordAttempt(
        job,
        "failed",
        startedAt,
        {
          connectorId: job.data.connectorId,
          streams: job.data.streams,
          projectionRefresh: job.data.projectionRefresh === true
        },
        error
      );
      throw error;
    }
  }

  private async recordAttempt(
    job: Job<ExternalDataSyncJobPayload>,
    status: string,
    startedAt: Date,
    summary: Record<string, unknown>,
    error?: unknown
  ): Promise<void> {
    try {
      const connector = await this.prisma.externalDataConnector.findUnique({
        where: { id: job.data.connectorId },
        select: { workspaceId: true }
      });

      await this.prisma.jobAttempt.create({
        data: {
          workspaceId: connector?.workspaceId ?? null,
          queueName: EXTERNAL_DATA_SYNC_QUEUE,
          jobId: String(job.id ?? job.data.connectorId),
          jobName: job.name || "sync-external-data",
          attemptNumber: (job.attemptsMade ?? 0) + 1,
          status,
          scheduledAt:
            typeof job.timestamp === "number" ? new Date(job.timestamp) : null,
          startedAt,
          finishedAt: new Date(),
          source: "external_mysql",
          relatedEntityType: "ExternalDataConnector",
          relatedEntityId: job.data.connectorId,
          errorCode: error ? this.errorCode(error) : null,
          errorMessage: error ? "A sincronizacao externa falhou" : null,
          summaryPayload: JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonValue
        }
      });
    } catch {
      // Falha de observabilidade nao deve duplicar a leitura externa.
    }
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error) {
      return String((error as { code?: unknown }).code ?? "ExternalDataSyncFailed").slice(
        0,
        100
      );
    }

    return error instanceof Error && /^[A-Za-z][A-Za-z0-9_]+$/.test(error.message)
      ? error.message.slice(0, 100)
      : "ExternalDataSyncFailed";
  }
}
