import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  CONVERSION_EVENTS_QUEUE,
  type ConversionEventJobPayload
} from "./queue.constants";
import { createBullJobId } from "./job-id";

export type ConversionEventQueuedResult = {
  conversionEventLogId: string;
  jobId: string;
  status: "queued";
};

@Injectable()
export class ConversionEventsQueueService {
  constructor(
    @InjectQueue(CONVERSION_EVENTS_QUEUE)
    private readonly queue: Queue<ConversionEventJobPayload>
  ) {}

  async enqueueSend(
    conversionEventLogId: string,
    workspaceId: string
  ): Promise<ConversionEventQueuedResult> {
    const scopedWorkspaceId = workspaceId.trim();
    if (!scopedWorkspaceId) {
      throw new Error("ConversionEventWorkspaceRequired");
    }

    const jobId = createBullJobId("conversion-send", conversionEventLogId);
    const job = await this.queue.add(
      "send-ready-event",
      {
        conversionEventLogId,
        workspaceId: scopedWorkspaceId
      },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30_000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    return {
      conversionEventLogId,
      jobId: String(job.id ?? jobId),
      status: "queued"
    };
  }

  async retrySend(
    conversionEventLogId: string,
    workspaceId: string
  ): Promise<ConversionEventQueuedResult> {
    const scopedWorkspaceId = workspaceId.trim();
    if (!scopedWorkspaceId) {
      throw new Error("ConversionEventWorkspaceRequired");
    }

    const jobId = createBullJobId("conversion-send", conversionEventLogId);
    const existing = await this.queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();

      if (state === "delayed") {
        await existing.promote();

        return {
          conversionEventLogId,
          jobId,
          status: "queued"
        };
      }

      if (["active", "waiting", "prioritized"].includes(state)) {
        return {
          conversionEventLogId,
          jobId,
          status: "queued"
        };
      }

      await existing.remove();
    }

    return this.enqueueSend(conversionEventLogId, scopedWorkspaceId);
  }
}
