import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import { ConversionEventsService } from "../../conversion-events/conversion-events.service";
import {
  CONVERSION_EVENTS_QUEUE,
  type ConversionEventJobPayload
} from "./queue.constants";

@Processor(CONVERSION_EVENTS_QUEUE)
export class ConversionEventProcessor extends WorkerHost {
  constructor(
    @Inject(ConversionEventsService)
    private readonly conversionEventsService: ConversionEventsService
  ) {
    super();
  }

  async process(job: Job<ConversionEventJobPayload>) {
    return this.conversionEventsService.sendReadyEvent(
      job.data.conversionEventLogId
    );
  }
}
