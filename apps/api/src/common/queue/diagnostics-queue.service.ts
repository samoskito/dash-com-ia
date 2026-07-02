import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  DIAGNOSTIC_QUEUE,
  type DiagnosticJobPayload
} from "./queue.constants";

export type DiagnosticRetryQueuedResult = {
  diagnosticEventId: string;
  jobId: string | number | undefined;
  status: "queued";
};

@Injectable()
export class DiagnosticsQueueService {
  constructor(
    @InjectQueue(DIAGNOSTIC_QUEUE)
    private readonly queue: Queue<DiagnosticJobPayload>
  ) {}

  async enqueueRetry(
    payload: DiagnosticJobPayload
  ): Promise<DiagnosticRetryQueuedResult> {
    const job = await this.queue.add("retry-diagnostic-event", payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 100
    });

    return {
      diagnosticEventId: payload.diagnosticEventId,
      jobId: job.id,
      status: "queued"
    };
  }
}
