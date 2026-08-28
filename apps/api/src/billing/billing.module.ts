import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { UazapiConversionBridgeModule } from "../inbound-webhooks/uazapi-conversion-bridge.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AsaasAdapter } from "./asaas.adapter";
import { AdditiveWhatsappBillingService } from "./additive-whatsapp-billing.service";
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
import { WorkspaceBillingAccessGuard } from "./workspace-billing-access.guard";
import { WorkspacePackageAccessService } from "./workspace-package-access.service";

@Module({
  imports: [
    AuthModule,
    WorkspacesModule,
    PrismaModule,
    IntegrationsModule,
    BillingSeatModule,
    UazapiConversionBridgeModule,
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
    AdditiveWhatsappBillingService,
    PackageAsaasAdapter,
    PackageBillingReconciliationService,
    PackageBillingWebhookService,
    PackageCheckoutService,
    PackagePlanService,
    PackageContractService,
    WorkspacePackageAccessService,
    {
      provide: APP_GUARD,
      useClass: WorkspaceBillingAccessGuard,
    },
    PackageFiscalService,
    LegacyBillingBackfillService,
    PackageSubscriptionLifecycleService,
    PackageUazapiProvisioningService,
    SplitService,
  ],
  exports: [
    BillingService,
    AdditiveWhatsappBillingService,
    BillingSeatModule,
    PackageAsaasAdapter,
    PackageBillingReconciliationService,
    PackageBillingWebhookService,
    PackageCheckoutService,
    PackageContractService,
    WorkspacePackageAccessService,
    PackageFiscalService,
    LegacyBillingBackfillService,
    PackagePlanService,
    PackageSubscriptionLifecycleService,
    PackageUazapiProvisioningService,
    SplitService,
  ],
})
export class BillingModule {}
