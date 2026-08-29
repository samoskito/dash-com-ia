import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { createBullJobId } from "../common/queue/job-id";
import { GUIMO_WEBHOOK_QUEUE, type GuimoWebhookJobPayload } from "../common/queue/queue.constants";
@Injectable()
export class GuimoWebhookQueueService {
  constructor(@InjectQueue(GUIMO_WEBHOOK_QUEUE) private readonly queue: Queue<GuimoWebhookJobPayload>) {}
  async enqueue(eventId: string, workspaceId: string) {
    const jobId = createBullJobId("guimo", eventId);
    const job = await this.queue.add("process-stage-movement", { eventId, workspaceId }, { jobId, attempts: 3, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: true, removeOnFail: false });
    return String(job.id ?? jobId);
  }
}
