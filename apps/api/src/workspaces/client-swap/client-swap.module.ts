import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { IdempotencyGuard } from "../../common/guards/idempotency.guard";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WorkspaceOwnerGuard } from "../guards/workspace-owner.guard";
import { ClientSwapRateLimitService } from "./client-swap-rate-limit.service";
import { ClientSwapController } from "./client-swap.controller";
import { ClientSwapService } from "./client-swap.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ClientSwapController],
  providers: [
    ClientSwapService,
    ClientSwapRateLimitService,
    WorkspaceOwnerGuard,
    IdempotencyGuard,
  ],
  exports: [ClientSwapService, ClientSwapRateLimitService],
})
export class ClientSwapModule {}
