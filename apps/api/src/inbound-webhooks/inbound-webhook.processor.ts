import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  INBOUND_WEBHOOK_QUEUE,
  type InboundWebhookJobPayload,
} from "../common/queue/queue.constants";
import { InboundWebhookObservationService } from "./inbound-webhook-observation.service";

@Processor(INBOUND_WEBHOOK_QUEUE)
export class InboundWebhookProcessor extends WorkerHost {
  constructor(
    @Inject(InboundWebhookObservationService)
    private readonly observation: InboundWebhookObservationService,
  ) {
    super();
  }

  process(job: Job<InboundWebhookJobPayload>) {
    return this.observation.processDelivery({
      deliveryId: job.data.deliveryId,
      connectionId: job.data.connectionId,
      workspaceId: job.data.workspaceId,
    });
  }
}
