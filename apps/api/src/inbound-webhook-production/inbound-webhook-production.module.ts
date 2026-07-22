import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { INBOUND_WEBHOOK_PRODUCTION_QUEUE } from "../common/queue/queue.constants";
import { QueueModule } from "../common/queue/queue.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { ConversionEventsModule } from "../conversion-events/conversion-events.module";
import { ConversionRulesModule } from "../conversion-rules/conversion-rules.module";
import { InboundWebhooksModule } from "../inbound-webhooks/inbound-webhooks.module";
import { LeadsModule } from "../leads/leads.module";
import { InboundWebhookProductionProcessor } from "./inbound-webhook-production.processor";
import { InboundWebhookProductionService } from "./inbound-webhook-production.service";
import { ProviderConversionProductionService } from "./provider-conversion-production.service";

@Module({
  imports: [
    PrismaModule,
    RuntimeModule,
    QueueModule,
    LeadsModule,
    ConversionEventsModule,
    ConversionRulesModule,
    InboundWebhooksModule,
    BullModule.registerQueue({
      name: INBOUND_WEBHOOK_PRODUCTION_QUEUE,
    }),
  ],
  providers: [
    InboundWebhookProductionProcessor,
    InboundWebhookProductionService,
    ProviderConversionProductionService,
  ],
})
export class InboundWebhookProductionModule {}
