import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConversionEventsModule } from "../../conversion-events/conversion-events.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ConversionEventProcessor } from "./conversion-event.processor";
import { ConversionEventsQueueService } from "./conversion-events-queue.service";
import { DiagnosticProcessor } from "./diagnostic.processor";
import { DiagnosticsQueueService } from "./diagnostics-queue.service";
import { CONVERSION_EVENTS_QUEUE, DIAGNOSTIC_QUEUE } from "./queue.constants";

@Module({
  imports: [
    ConversionEventsModule,
    PrismaModule,
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
    ConversionEventsQueueService,
    DiagnosticsQueueService
  ],
  exports: [BullModule, ConversionEventsQueueService, DiagnosticsQueueService]
})
export class QueueModule {}
