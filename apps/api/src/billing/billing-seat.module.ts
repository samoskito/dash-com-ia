import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { WhatsappSeatService } from "./whatsapp-seat.service";

@Module({
  imports: [PrismaModule, RuntimeModule],
  providers: [PackageBillingConfiguration, WhatsappSeatService],
  exports: [PackageBillingConfiguration, WhatsappSeatService]
})
export class BillingSeatModule {}
