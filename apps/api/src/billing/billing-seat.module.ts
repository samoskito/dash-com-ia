import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { ExternalChannelBillingAccessService } from "./external-channel-billing-access.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { WhatsappSeatService } from "./whatsapp-seat.service";

@Module({
  imports: [PrismaModule, RuntimeModule],
  providers: [
    ExternalChannelBillingAccessService,
    PackageBillingConfiguration,
    WhatsappSeatService,
  ],
  exports: [
    ExternalChannelBillingAccessService,
    PackageBillingConfiguration,
    WhatsappSeatService,
  ],
})
export class BillingSeatModule {}
