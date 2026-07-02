import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { QueueModule } from "./common/queue/queue.module";
import { DiagnosticsModule } from "./diagnostics/diagnostics.module";
import { HealthController } from "./health/health.controller";
import { IntegrationsModule } from "./integrations/integrations.module";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    QueueModule,
    AuthModule,
    WorkspacesModule,
    DiagnosticsModule,
    IntegrationsModule,
    BillingModule
  ],
  controllers: [HealthController, MockController],
  providers: [MockService]
})
export class AppModule {}
