import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { ExternalChannelBillingAccessService } from "./external-channel-billing-access.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { WhatsappSeatService } from "./whatsapp-seat.service";
import { WorkspacePackageAccessService } from "./workspace-package-access.service";

@Module({
  imports: [PrismaModule, RuntimeModule],
  providers: [
    ExternalChannelBillingAccessService,
    PackageBillingConfiguration,
    WhatsappSeatService,
    WorkspacePackageAccessService,
  ],
  exports: [
    ExternalChannelBillingAccessService,
    PackageBillingConfiguration,
    WhatsappSeatService,
    WorkspacePackageAccessService,
  ],
})
export class BillingSeatModule {}
