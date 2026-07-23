import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  INBOUND_WEBHOOK_PRODUCTION_QUEUE,
  type InboundWebhookProductionJobPayload,
  type InboundWebhookProductionQueueJobPayload,
  type ProviderConversionProductionJobPayload,
} from "../common/queue/queue.constants";
import { createBullJobId } from "../common/queue/job-id";

interface ProviderConversionEnqueueOptions {
  attemptKey?: string;
}

@Injectable()
export class InboundWebhookProductionQueueService {
  constructor(
    @InjectQueue(INBOUND_WEBHOOK_PRODUCTION_QUEUE)
    private readonly queue: Queue<InboundWebhookProductionQueueJobPayload>,
  ) {}

  async enqueueItem(
    input: InboundWebhookProductionJobPayload,
  ): Promise<{ jobId: string; status: "queued" | "existing" }> {
    const payload = {
      productionItemId: input.productionItemId.trim(),
      workspaceId: input.workspaceId.trim(),
    };

    if (!payload.productionItemId || !payload.workspaceId) {
      throw new Error("InboundWebhookProductionContextRequired");
    }

    const jobId = createBullJobId(
      "inbound-webhook-production",
      payload.productionItemId,
    );
    const existing = await this.queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();

      if (!["completed", "failed"].includes(state)) {
        return { jobId, status: "existing" };
      }

      await existing.remove();
    }

    await this.queue.add("process-inbound-webhook-production", payload, {
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

  async enqueueProviderConversion(
    input: ProviderConversionProductionJobPayload,
    options: Readonly<ProviderConversionEnqueueOptions> = {},
  ): Promise<{ jobId: string; status: "queued" | "existing" }> {
    const payload = {
      providerConversionExecutionId: input.providerConversionExecutionId.trim(),
      workspaceId: input.workspaceId.trim(),
    };

    if (!payload.providerConversionExecutionId || !payload.workspaceId) {
      throw new Error("ProviderConversionProductionContextRequired");
    }

    const attemptKey = options.attemptKey?.trim() || null;
    if (attemptKey && !/^[a-z0-9_-]{1,100}$/iu.test(attemptKey)) {
      throw new Error("ProviderConversionProductionAttemptKeyInvalid");
    }

    const jobId = createBullJobId(
      "provider-conversion-production",
      payload.providerConversionExecutionId,
      attemptKey,
    );
    const existing = await this.queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();

      if (!["completed", "failed"].includes(state)) {
        return { jobId, status: "existing" };
      }

      await existing.remove();
    }

    await this.queue.add("process-provider-conversion-production", payload, {
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
