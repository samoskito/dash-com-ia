import { Module } from "@nestjs/common";
import { DiagnosticsModule } from "../diagnostics/diagnostics.module";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [DiagnosticsModule],
  controllers: [WebhooksController]
})
export class WebhooksModule {}
