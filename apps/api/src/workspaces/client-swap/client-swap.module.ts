import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { ClientSwapService } from "./client-swap.service";
import { ClientSwapController } from "./client-swap.controller";
import { ClientSwapRateLimitService } from "./client-swap-rate-limit.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ClientSwapController],
  providers: [ClientSwapService, ClientSwapRateLimitService],
  exports: [ClientSwapService, ClientSwapRateLimitService],
})
export class ClientSwapModule {}
