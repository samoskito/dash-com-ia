import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { INBOUND_WEBHOOK_PRODUCTION_QUEUE } from "../common/queue/queue.constants";
import { QueueModule } from "../common/queue/queue.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { ConversionEventsModule } from "../conversion-events/conversion-events.module";
import { InboundWebhooksModule } from "../inbound-webhooks/inbound-webhooks.module";
import { LeadsModule } from "../leads/leads.module";
import { InboundWebhookProductionProcessor } from "./inbound-webhook-production.processor";
import { InboundWebhookProductionService } from "./inbound-webhook-production.service";

@Module({
  imports: [
    PrismaModule,
    RuntimeModule,
    QueueModule,
    LeadsModule,
    ConversionEventsModule,
    InboundWebhooksModule,
    BullModule.registerQueue({
      name: INBOUND_WEBHOOK_PRODUCTION_QUEUE,
    }),
  ],
  providers: [
    InboundWebhookProductionProcessor,
    InboundWebhookProductionService,
  ],
})
export class InboundWebhookProductionModule {}
