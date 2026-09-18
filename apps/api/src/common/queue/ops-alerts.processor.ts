import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { OpsAlertService } from "../../ops-alerts/ops-alerts.service";
import { OPS_ALERTS_QUEUE } from "./queue.constants";

@Processor(OPS_ALERTS_QUEUE)
export class OpsAlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(OpsAlertsProcessor.name);
  constructor(@Inject(OpsAlertService) private readonly opsAlerts: OpsAlertService) { super(); }

  async process(_job: Job): Promise<void> {
    try {
      await this.opsAlerts.runScan();
    } catch (error) {
      // This worker must never turn an alerting outage into a retry storm.
      this.logger.error("ops_alert_scan_failed", error instanceof Error ? error.stack : undefined);
    }
  }
}
