import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy
} from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ExternalSyncQueueService } from "./external-sync-queue.service";

export type ExternalAutoSyncResult = {
  enabled: boolean;
  connectorsFound: number;
  enqueued: number;
  failed: number;
};

@Injectable()
export class ExternalAutoSyncService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ExternalAutoSyncService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExternalSyncQueueService)
    private readonly queueService: ExternalSyncQueueService
  ) {}

  onApplicationBootstrap(): void {
    const config = this.config();

    if (!this.shouldStart(config.enabled)) {
      return;
    }

    const run = () => {
      void this.enqueueDueConnectors()
        .then((result) => {
          this.logger.log(
            `External sync checked ${result.connectorsFound} connectors; enqueued=${result.enqueued}; failed=${result.failed}`
          );
        })
        .catch((error) => {
          this.logger.warn(`External auto sync failed: ${this.errorMessage(error)}`);
        });
    };

    this.initialTimer = setTimeout(run, config.initialDelayMs);
    this.timer = setInterval(run, config.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async enqueueDueConnectors(): Promise<ExternalAutoSyncResult> {
    const config = this.config();

    if (!config.enabled) {
      return { enabled: false, connectorsFound: 0, enqueued: 0, failed: 0 };
    }

    if (this.running) {
      return { enabled: true, connectorsFound: 0, enqueued: 0, failed: 0 };
    }

    this.running = true;

    try {
      const connectors = await this.prisma.externalDataConnector.findMany({
        where: {
          status: "active",
          syncEnabled: true,
          workspace: { operationalStatus: "active" }
        },
        select: { id: true },
        take: config.connectorLimit,
        orderBy: [{ lastSyncCompletedAt: "asc" }, { updatedAt: "asc" }]
      });
      let enqueued = 0;
      let failed = 0;

      for (const connector of connectors) {
        try {
          await this.queueService.enqueueSync({
            connectorId: connector.id,
            streams: ["leads", "events"]
          });
          enqueued += 1;
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `Could not enqueue connector ${connector.id}: ${this.errorMessage(error)}`
          );
        }
      }

      return {
        enabled: true,
        connectorsFound: connectors.length,
        enqueued,
        failed
      };
    } finally {
      this.running = false;
    }
  }

  private shouldStart(enabled: boolean): boolean {
    if (!enabled) {
      return false;
    }

    if (
      process.env.NODE_ENV === "test" &&
      process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED === undefined
    ) {
      return false;
    }

    return true;
  }

  private config() {
    return {
      enabled: this.booleanEnv("WPPTRACK_EXTERNAL_SYNC_ENABLED", true),
      intervalMs:
        this.positiveIntegerEnv("WPPTRACK_EXTERNAL_SYNC_INTERVAL_MINUTES", 1) * 60_000,
      initialDelayMs:
        this.positiveIntegerEnv(
          "WPPTRACK_EXTERNAL_SYNC_INITIAL_DELAY_SECONDS",
          60
        ) * 1_000,
      connectorLimit: this.positiveIntegerEnv(
        "WPPTRACK_EXTERNAL_SYNC_CONNECTOR_LIMIT",
        50
      )
    };
  }

  private booleanEnv(name: string, fallback: boolean): boolean {
    const value = process.env[name]?.trim().toLowerCase();
    return value ? ["1", "true", "yes", "sim", "on"].includes(value) : fallback;
  }

  private positiveIntegerEnv(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "erro desconhecido";
  }
}
