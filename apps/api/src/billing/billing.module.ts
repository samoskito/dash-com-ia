import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AsaasAdapter } from "./asaas.adapter";
import { BackofficeBillingController } from "./backoffice-billing.controller";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { SplitController } from "./split.controller";
import { SplitService } from "./split.service";

@Module({
  imports: [AuthModule, WorkspacesModule, PrismaModule, IntegrationsModule],
  controllers: [BillingController, SplitController, BackofficeBillingController],
  providers: [
    {
      provide: AsaasAdapter,
      useFactory: () => new AsaasAdapter()
    },
    BillingService,
    SplitService
  ],
  exports: [BillingService, SplitService]
})
export class BillingModule {}
