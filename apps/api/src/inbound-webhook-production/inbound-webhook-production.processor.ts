import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  INBOUND_WEBHOOK_PRODUCTION_QUEUE,
  type InboundWebhookProductionJobPayload,
} from "../common/queue/queue.constants";
import { InboundWebhookProductionService } from "./inbound-webhook-production.service";

@Processor(INBOUND_WEBHOOK_PRODUCTION_QUEUE)
export class InboundWebhookProductionProcessor extends WorkerHost {
  constructor(
    @Inject(InboundWebhookProductionService)
    private readonly production: InboundWebhookProductionService,
  ) {
    super();
  }

  process(job: Job<InboundWebhookProductionJobPayload>) {
    return this.production.processItem(job.data);
  }
}
