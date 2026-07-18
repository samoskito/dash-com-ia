import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  INBOUND_WEBHOOK_REPLAY_QUEUE,
  type InboundWebhookReplayJobPayload,
} from "../common/queue/queue.constants";
import { createBullJobId } from "../common/queue/job-id";

@Injectable()
export class InboundWebhookReplayQueueService {
  constructor(
    @InjectQueue(INBOUND_WEBHOOK_REPLAY_QUEUE)
    private readonly queue: Queue<InboundWebhookReplayJobPayload>,
  ) {}

  async enqueueBatch(
    input: InboundWebhookReplayJobPayload,
  ): Promise<{ jobId: string; status: "queued" | "existing" }> {
    const payload = {
      batchId: input.batchId.trim(),
      workspaceId: input.workspaceId.trim(),
    };

    if (!payload.batchId || !payload.workspaceId) {
      throw new Error("InboundWebhookReplayContextRequired");
    }

    const jobId = createBullJobId("inbound-webhook-replay", payload.batchId);
    const existing = await this.queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();

      if (!["completed", "failed"].includes(state)) {
        return { jobId, status: "existing" };
      }

      await existing.remove();
    }

    await this.queue.add("process-inbound-webhook-replay", payload, {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 30_000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    return { jobId, status: "queued" };
  }
}
