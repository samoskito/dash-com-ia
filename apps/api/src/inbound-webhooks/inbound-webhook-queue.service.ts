import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  INBOUND_WEBHOOK_QUEUE,
  type InboundWebhookJobPayload,
} from "../common/queue/queue.constants";
import { createBullJobId } from "../common/queue/job-id";

@Injectable()
export class InboundWebhookQueueService {
  constructor(
    @InjectQueue(INBOUND_WEBHOOK_QUEUE)
    private readonly queue: Queue<InboundWebhookJobPayload>,
  ) {}

  async enqueueDelivery(
    input: InboundWebhookJobPayload,
  ): Promise<{ jobId: string; status: "queued" | "existing" }> {
    const payload: InboundWebhookJobPayload = {
      deliveryId: input.deliveryId,
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
      ...(input.forceProviderConversions
        ? { forceProviderConversions: true }
        : {}),
    };
    const jobId = createBullJobId(
      payload.forceProviderConversions
        ? "inbound-webhook-provider-conversion-recovery"
        : "inbound-webhook",
      payload.deliveryId,
    );
    const existing = await this.queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();

      if (state !== "failed") {
        return { jobId, status: "existing" };
      }

      await existing.remove();
    }

    await this.queue.add("process-inbound-webhook", payload, {
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
