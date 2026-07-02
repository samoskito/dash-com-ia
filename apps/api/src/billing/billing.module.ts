import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [AuthModule, WorkspacesModule, PrismaModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService]
})
export class BillingModule {}
