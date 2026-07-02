import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { QueueModule } from "../common/queue/queue.module";
import { ConversionEventsModule } from "../conversion-events/conversion-events.module";
import { ConversionRulesModule } from "../conversion-rules/conversion-rules.module";
import { DiagnosticsModule } from "../diagnostics/diagnostics.module";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [
    DiagnosticsModule,
    BillingModule,
    ConversionRulesModule,
    ConversionEventsModule,
    QueueModule
  ],
  controllers: [WebhooksController]
})
export class WebhooksModule {}
