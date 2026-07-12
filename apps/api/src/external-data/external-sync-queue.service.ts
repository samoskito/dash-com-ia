import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import type {
  ExternalSyncQueuedResultDto,
  ExternalSyncStreamDto
} from "@wpptrack/shared";
import {
  EXTERNAL_DATA_SYNC_QUEUE,
  type ExternalDataSyncJobPayload
} from "../common/queue/queue.constants";
import { createBullJobId } from "../common/queue/job-id";

@Injectable()
export class ExternalSyncQueueService {
  constructor(
    @InjectQueue(EXTERNAL_DATA_SYNC_QUEUE)
    private readonly queue: Queue<ExternalDataSyncJobPayload>
  ) {}

  async enqueueSync(input: {
    connectorId: string;
    streams: ExternalSyncStreamDto[];
    projectionRefresh?: boolean;
    requestedByUserId?: string;
  }): Promise<ExternalSyncQueuedResultDto> {
    const streams = [...new Set(input.streams)].sort();
    const jobId = createBullJobId(
      "external-data-sync",
      input.connectorId,
      streams.join("-")
    );
    const existing = await this.queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();

      if (["active", "waiting", "delayed", "prioritized"].includes(state)) {
        return {
          connectorId: input.connectorId,
          streams,
          jobId,
          status: "queued"
        };
      }

      await existing.remove();
    }

    const job = await this.queue.add(
      "sync-external-data",
      {
        connectorId: input.connectorId,
        streams,
        projectionRefresh: input.projectionRefresh === true,
        requestedByUserId: input.requestedByUserId
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: { age: 86_400, count: 100 }
      }
    );

    return {
      connectorId: input.connectorId,
      streams,
      jobId: String(job.id ?? jobId),
      status: "queued"
    };
  }
}
