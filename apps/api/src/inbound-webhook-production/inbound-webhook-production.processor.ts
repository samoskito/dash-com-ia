import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import {
  INBOUND_WEBHOOK_PRODUCTION_QUEUE,
  type InboundWebhookProductionQueueJobPayload,
} from "../common/queue/queue.constants";
import { InboundWebhookProductionService } from "./inbound-webhook-production.service";
import {
  ProviderConversionProductionFailure,
  ProviderConversionProductionService,
} from "./provider-conversion-production.service";

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

  async process(job: Job<InboundWebhookProductionQueueJobPayload>) {
    if ("providerConversionExecutionId" in job.data) {
      try {
        return await this.providerConversions.processExecution(job.data);
      } catch (error) {
        if (
          error instanceof ProviderConversionProductionFailure &&
          !error.retryable
        ) {
          throw new UnrecoverableError(
            `Provider conversion production failed (${error.code})`,
          );
        }

        throw error;
      }
    }

    return this.production.processItem(job.data);
  }
}
