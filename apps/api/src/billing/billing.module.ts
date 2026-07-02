import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { SplitController } from "./split.controller";
import { SplitService } from "./split.service";

@Module({
  imports: [AuthModule, WorkspacesModule, PrismaModule],
  controllers: [BillingController, SplitController],
  providers: [BillingService, SplitService],
  exports: [BillingService, SplitService]
})
export class BillingModule {}
