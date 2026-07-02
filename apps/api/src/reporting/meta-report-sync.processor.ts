import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  META_REPORT_SYNC_QUEUE,
  type MetaReportSyncJobPayload
} from "../common/queue/queue.constants";
import { MetaReportingService } from "./meta-reporting.service";

@Processor(META_REPORT_SYNC_QUEUE)
export class MetaReportSyncProcessor extends WorkerHost {
  constructor(
    @Inject(MetaReportingService)
    private readonly metaReportingService: MetaReportingService
  ) {
    super();
  }

  async process(job: Job<MetaReportSyncJobPayload>) {
    return this.metaReportingService.syncWorkspaceMetaStructure(job.data);
  }
}
