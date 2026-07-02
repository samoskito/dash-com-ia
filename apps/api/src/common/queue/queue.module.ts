import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConversionEventsModule } from "../../conversion-events/conversion-events.module";
import { ConversionEventProcessor } from "./conversion-event.processor";
import { ConversionEventsQueueService } from "./conversion-events-queue.service";
import { DiagnosticProcessor } from "./diagnostic.processor";
import { CONVERSION_EVENTS_QUEUE, DIAGNOSTIC_QUEUE } from "./queue.constants";

@Module({
  imports: [
    ConversionEventsModule,
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379"
      }
    }),
    BullModule.registerQueue({
      name: DIAGNOSTIC_QUEUE
    }),
    BullModule.registerQueue({
      name: CONVERSION_EVENTS_QUEUE
    })
  ],
  providers: [
    DiagnosticProcessor,
    ConversionEventProcessor,
    ConversionEventsQueueService
  ],
  exports: [BullModule, ConversionEventsQueueService]
})
export class QueueModule {}
