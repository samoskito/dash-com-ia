import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { META_REPORT_SYNC_QUEUE } from "../common/queue/queue.constants";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { MetaReportSyncProcessor } from "./meta-report-sync.processor";
import { MetaReportSyncQueueService } from "./meta-report-sync-queue.service";
import { MetaReportingService } from "./meta-reporting.service";
import { ReportingController } from "./reporting.controller";

@Module({
  imports: [
    AuthModule,
    WorkspacesModule,
    IntegrationsModule,
    BullModule.registerQueue({
      name: META_REPORT_SYNC_QUEUE
    })
  ],
  controllers: [ReportingController],
  providers: [
    MetaReportingService,
    MetaReportSyncQueueService,
    MetaReportSyncProcessor,
    PrismaService
  ],
  exports: [MetaReportingService, MetaReportSyncQueueService]
})
export class ReportingModule {}
