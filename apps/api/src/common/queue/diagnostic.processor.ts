import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import { ConversionEventsService } from "../../conversion-events/conversion-events.service";
import {
  DIAGNOSTIC_QUEUE,
  type DiagnosticJobPayload
} from "./queue.constants";

@Processor(DIAGNOSTIC_QUEUE)
export class DiagnosticProcessor extends WorkerHost {
  constructor(
    @Inject(ConversionEventsService)
    private readonly conversionEventsService: ConversionEventsService
  ) {
    super();
  }

  async process(job: Job<DiagnosticJobPayload>) {
    const { conversionEventLogId, diagnosticEventId } = job.data;

    if (conversionEventLogId) {
      const result = await this.conversionEventsService.sendReadyEvent(
        conversionEventLogId
      );

      return {
        diagnosticEventId,
        action: "conversion_event_retry",
        result
      };
    }

    return {
      diagnosticEventId,
      action: "skipped",
      reason: "unsupported_diagnostic_event"
    };
  }
}
