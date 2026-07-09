import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Job } from "bullmq";
import {
  META_REPORT_SYNC_QUEUE,
  type MetaReportSyncJobPayload
} from "../common/queue/queue.constants";
import { PrismaService } from "../common/prisma/prisma.service";
import { MetaReportingService } from "./meta-reporting.service";

@Processor(META_REPORT_SYNC_QUEUE)
export class MetaReportSyncProcessor extends WorkerHost {
  constructor(
    @Inject(MetaReportingService)
    private readonly metaReportingService: MetaReportingService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {
    super();
  }

  async process(job: Job<MetaReportSyncJobPayload>) {
    try {
      const result = await this.metaReportingService.syncWorkspaceMetaStructure(
        job.data
      );

      await this.recordAttempt(job, "completed", {
        workspaceId: result.workspaceId,
        accountsSynced: result.accountsSynced,
        accountsFailed: result.accountsFailed,
        campaignsSynced: result.campaignsSynced,
        adSetsSynced: result.adSetsSynced,
        adsSynced: result.adsSynced,
        resultStatus: "completed"
      });

      return result;
    } catch (error) {
      await this.recordAttempt(
        job,
        "failed",
        {
          workspaceId: job.data.workspaceId,
          since: job.data.since,
          until: job.data.until
        },
        error
      );

      throw error;
    }
  }

  private async recordAttempt(
    job: Job<MetaReportSyncJobPayload>,
    status: string,
    summaryPayload: Record<string, unknown>,
    error?: unknown
  ) {
    const now = new Date();

    try {
      await this.prisma.jobAttempt.create({
        data: {
          workspaceId: job.data.workspaceId,
          queueName: META_REPORT_SYNC_QUEUE,
          jobId: String(job.id ?? `meta-report-sync:${job.data.workspaceId}`),
          jobName: job.name || "sync-meta-reporting",
          attemptNumber: (job.attemptsMade ?? 0) + 1,
          status,
          scheduledAt:
            typeof job.timestamp === "number" ? new Date(job.timestamp) : null,
          startedAt: now,
          finishedAt: now,
          nextRetryAt: null,
          source: "meta",
          relatedEntityType: "Workspace",
          relatedEntityId: job.data.workspaceId,
          errorCode: null,
          errorMessage: error instanceof Error ? error.message : null,
          summaryPayload: this.toJsonSummary(summaryPayload)
        }
      });
    } catch {
      // Observability failure must not abort a completed Meta sync.
    }
  }

  private toJsonSummary(
    summaryPayload: Record<string, unknown>
  ): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(summaryPayload)) as Prisma.InputJsonValue;
  }
}
