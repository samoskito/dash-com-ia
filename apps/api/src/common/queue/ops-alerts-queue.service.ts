import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { OPS_ALERTS_QUEUE } from "./queue.constants";

@Injectable()
export class OpsAlertsQueueService implements OnModuleInit {
  constructor(@InjectQueue(OPS_ALERTS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const configured = Number(process.env.OPS_ALERT_SCAN_INTERVAL_MS ?? 15 * 60_000);
    const every = Number.isFinite(configured) && configured >= 60_000 ? configured : 15 * 60_000;
    await this.queue.add("scan-ops-alerts", {}, {
      jobId: "ops-alerts-scan",
      repeat: { every },
      removeOnComplete: 20,
      removeOnFail: 20,
    });
  }
}
