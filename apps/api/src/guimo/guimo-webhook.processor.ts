import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Prisma } from "@prisma/client";
import type { Job } from "bullmq";
import { GuimoService } from "./guimo.service";
import { GUIMO_WEBHOOK_QUEUE, type GuimoWebhookJobPayload } from "../common/queue/queue.constants";
import { PrismaService } from "../common/prisma/prisma.service";

@Processor(GUIMO_WEBHOOK_QUEUE)
export class GuimoWebhookProcessor extends WorkerHost {
  constructor(private readonly guimo: GuimoService, private readonly prisma: PrismaService) { super(); }
  async process(job: Job<GuimoWebhookJobPayload>) {
    try {
      const result = await this.guimo.process(job.data.eventId, job.data.workspaceId);
      await this.attempt(job, result.status, result);
      return result;
    } catch (error) {
      await this.attempt(job, "failed", { errorCode: error instanceof Error ? error.name : "unknown" });
      throw error;
    }
  }
  private async attempt(job: Job<GuimoWebhookJobPayload>, status: string, summary: Record<string, unknown>) {
    await this.prisma.jobAttempt.create({ data: { workspaceId: job.data.workspaceId, queueName: GUIMO_WEBHOOK_QUEUE, jobId: String(job.id), jobName: job.name, attemptNumber: job.attemptsMade + 1, status, startedAt: new Date(), finishedAt: new Date(), source: "guimo", relatedEntityType: "GuimoWebhookEvent", relatedEntityId: job.data.eventId, summaryPayload: summary as Prisma.InputJsonValue } });
  }
}
