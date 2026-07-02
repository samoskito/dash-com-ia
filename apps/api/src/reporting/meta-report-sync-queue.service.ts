import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  META_REPORT_SYNC_QUEUE,
  type MetaReportSyncJobPayload
} from "../common/queue/queue.constants";

export type MetaReportSyncQueuedResult = MetaReportSyncJobPayload & {
  jobId: string;
  status: "queued";
};

@Injectable()
export class MetaReportSyncQueueService {
  constructor(
    @InjectQueue(META_REPORT_SYNC_QUEUE)
    private readonly queue: Queue<MetaReportSyncJobPayload>
  ) {}

  async enqueueSync(
    input: MetaReportSyncJobPayload
  ): Promise<MetaReportSyncQueuedResult> {
    const jobId = `meta-report-sync:${input.workspaceId}:${input.since}:${input.until}`;
    const job = await this.queue.add("sync-meta-reporting", input, {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 60_000
      },
      removeOnComplete: true,
      removeOnFail: false
    });

    return {
      ...input,
      jobId: String(job.id ?? jobId),
      status: "queued"
    };
  }
}
