import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { QueueModule } from "./common/queue/queue.module";
import { RuntimeModule } from "./common/runtime/runtime.module";
import { ConversionRulesModule } from "./conversion-rules/conversion-rules.module";
import { DiagnosticsModule } from "./diagnostics/diagnostics.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { IntegrationsModule } from "./integrations/integrations.module";
import { LeadsModule } from "./leads/leads.module";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";
import { ReportingModule } from "./reporting/reporting.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    RuntimeModule,
    QueueModule,
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    DiagnosticsModule,
    IntegrationsModule,
    BillingModule,
    ConversionRulesModule,
    LeadsModule,
    ReportingModule,
    WebhooksModule
  ],
  controllers: [HealthController, MockController],
  providers: [HealthService, MockService]
})
export class AppModule {}
