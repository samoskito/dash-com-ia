import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { RequestDurationInterceptor } from "./common/http/request-duration.interceptor";
import { QueueModule } from "./common/queue/queue.module";
import { RuntimeModule } from "./common/runtime/runtime.module";
import { ConversionRulesModule } from "./conversion-rules/conversion-rules.module";
import { DiagnosticsModule } from "./diagnostics/diagnostics.module";
import { EmailModule } from "./email/email.module";
import { ExternalDataModule } from "./external-data/external-data.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { InboundWebhooksModule } from "./inbound-webhooks/inbound-webhooks.module";
import { InboundWebhookReplayModule } from "./inbound-webhook-replay/inbound-webhook-replay.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { LeadsModule } from "./leads/leads.module";
import { ReportingModule } from "./reporting/reporting.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    RuntimeModule,
    QueueModule,
    EmailModule,
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    DiagnosticsModule,
    ExternalDataModule,
    IntegrationsModule,
    InboundWebhooksModule,
    InboundWebhookReplayModule,
    BillingModule,
    ConversionRulesModule,
    LeadsModule,
    ReportingModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestDurationInterceptor,
    },
  ],
})
export class AppModule {}
