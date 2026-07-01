import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { DiagnosticProcessor } from "./diagnostic.processor";
import { DIAGNOSTIC_QUEUE } from "./queue.constants";

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379"
      }
    }),
    BullModule.registerQueue({
      name: DIAGNOSTIC_QUEUE
    })
  ],
  providers: [DiagnosticProcessor],
  exports: [BullModule]
})
export class QueueModule {}
