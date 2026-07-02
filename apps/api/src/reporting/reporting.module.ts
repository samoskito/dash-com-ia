import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { MetaReportingService } from "./meta-reporting.service";
import { ReportingController } from "./reporting.controller";

@Module({
  imports: [AuthModule, WorkspacesModule, IntegrationsModule],
  controllers: [ReportingController],
  providers: [MetaReportingService, PrismaService],
  exports: [MetaReportingService]
})
export class ReportingModule {}
