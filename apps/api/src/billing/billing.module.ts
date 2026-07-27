import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AsaasAdapter } from "./asaas.adapter";
import { BackofficePackageBillingController } from "./backoffice-package-billing.controller";
import { BackofficeBillingController } from "./backoffice-billing.controller";
import { BillingSeatModule } from "./billing-seat.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { PackageBillingController } from "./package-billing.controller";
import { PackageBillingReconciliationService } from "./package-billing-reconciliation.service";
import { PackageBillingWebhookService } from "./package-billing-webhook.service";
import { PackageCheckoutService } from "./package-checkout.service";
import { PackageContractService } from "./package-contract.service";
import { PackageFiscalService } from "./package-fiscal.service";
import { PackagePlanService } from "./package-plan.service";
import { PackageAsaasAdapter } from "./package-asaas.adapter";
import { PackageSubscriptionLifecycleService } from "./package-subscription-lifecycle.service";
import { PackageUazapiProvisioningService } from "./package-uazapi-provisioning.service";
import { LegacyBillingBackfillService } from "./legacy-billing-backfill.service";
import { SplitController } from "./split.controller";
import { SplitService } from "./split.service";
import { WhatsappSeatService } from "./whatsapp-seat.service";

@Module({
  imports: [
    AuthModule,
    WorkspacesModule,
    PrismaModule,
    IntegrationsModule,
    BillingSeatModule,
  ],
  controllers: [
    BillingController,
    PackageBillingController,
    SplitController,
    BackofficeBillingController,
    BackofficePackageBillingController,
  ],
  providers: [
    {
      provide: AsaasAdapter,
      useFactory: () => new AsaasAdapter(),
    },
    BillingService,
    PackageAsaasAdapter,
    PackageBillingReconciliationService,
    PackageBillingWebhookService,
    PackageCheckoutService,
    PackagePlanService,
    PackageContractService,
    PackageFiscalService,
    LegacyBillingBackfillService,
    PackageSubscriptionLifecycleService,
    PackageUazapiProvisioningService,
    SplitService,
  ],
  exports: [
    BillingService,
    BillingSeatModule,
    PackageAsaasAdapter,
    PackageBillingReconciliationService,
    PackageBillingWebhookService,
    PackageCheckoutService,
    PackageContractService,
    PackageFiscalService,
    LegacyBillingBackfillService,
    PackagePlanService,
    PackageSubscriptionLifecycleService,
    PackageUazapiProvisioningService,
    SplitService,
  ],
})
export class BillingModule {}
