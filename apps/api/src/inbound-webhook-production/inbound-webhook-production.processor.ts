import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  INBOUND_WEBHOOK_PRODUCTION_QUEUE,
  type InboundWebhookProductionQueueJobPayload,
} from "../common/queue/queue.constants";
import { InboundWebhookProductionService } from "./inbound-webhook-production.service";
import { ProviderConversionProductionService } from "./provider-conversion-production.service";

@Processor(INBOUND_WEBHOOK_PRODUCTION_QUEUE)
export class InboundWebhookProductionProcessor extends WorkerHost {
  constructor(
    @Inject(InboundWebhookProductionService)
    private readonly production: InboundWebhookProductionService,
    @Inject(ProviderConversionProductionService)
    private readonly providerConversions: ProviderConversionProductionService,
  ) {
    super();
  }

  process(job: Job<InboundWebhookProductionQueueJobPayload>) {
    if ("providerConversionExecutionId" in job.data) {
      return this.providerConversions.processExecution(job.data);
    }

    return this.production.processItem(job.data);
  }
}
