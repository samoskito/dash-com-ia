import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { DiagnosticsModule } from "../diagnostics/diagnostics.module";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [DiagnosticsModule, BillingModule],
  controllers: [WebhooksController]
})
export class WebhooksModule {}
