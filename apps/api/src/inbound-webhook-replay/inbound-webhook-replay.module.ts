import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { INBOUND_WEBHOOK_REPLAY_QUEUE } from "../common/queue/queue.constants";
import { QueueModule } from "../common/queue/queue.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { ConversionEventsModule } from "../conversion-events/conversion-events.module";
import { InboundWebhooksModule } from "../inbound-webhooks/inbound-webhooks.module";
import { LeadsModule } from "../leads/leads.module";
import { InboundWebhookReplayController } from "./inbound-webhook-replay.controller";
import { InboundWebhookReplayQueueService } from "./inbound-webhook-replay-queue.service";
import { InboundWebhookReplayProcessor } from "./inbound-webhook-replay.processor";
import { InboundWebhookReplayService } from "./inbound-webhook-replay.service";

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    RuntimeModule,
    QueueModule,
    LeadsModule,
    ConversionEventsModule,
    InboundWebhooksModule,
    BullModule.registerQueue({
      name: INBOUND_WEBHOOK_REPLAY_QUEUE,
    }),
  ],
  controllers: [InboundWebhookReplayController],
  providers: [
    InboundWebhookReplayProcessor,
    InboundWebhookReplayQueueService,
    InboundWebhookReplayService,
  ],
})
export class InboundWebhookReplayModule {}
