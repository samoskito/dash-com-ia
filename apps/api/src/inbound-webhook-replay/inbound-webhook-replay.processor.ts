import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  INBOUND_WEBHOOK_REPLAY_QUEUE,
  type InboundWebhookReplayJobPayload,
} from "../common/queue/queue.constants";
import { InboundWebhookReplayService } from "./inbound-webhook-replay.service";

@Processor(INBOUND_WEBHOOK_REPLAY_QUEUE)
export class InboundWebhookReplayProcessor extends WorkerHost {
  constructor(
    @Inject(InboundWebhookReplayService)
    private readonly replay: InboundWebhookReplayService,
  ) {
    super();
  }

  process(job: Job<InboundWebhookReplayJobPayload>) {
    return this.replay.processBatch(job.data);
  }
}
