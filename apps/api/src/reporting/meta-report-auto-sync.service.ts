import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional
} from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { MetaReportSyncQueueService } from "./meta-report-sync-queue.service";

type MetaReportAutoSyncClock = {
  now(): Date;
};

type MetaReportAutoSyncResult = {
  enabled: boolean;
  workspacesFound: number;
  enqueued: number;
  failed: number;
  since: string | null;
  until: string | null;
};

export const META_REPORT_AUTO_SYNC_CLOCK = Symbol(
  "META_REPORT_AUTO_SYNC_CLOCK"
);

@Injectable()
export class MetaReportAutoSyncService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MetaReportAutoSyncService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MetaReportSyncQueueService)
    private readonly queueService: MetaReportSyncQueueService,
    @Optional()
    @Inject(META_REPORT_AUTO_SYNC_CLOCK)
    private readonly clock: MetaReportAutoSyncClock = {
      now: () => new Date()
    }
  ) {}

  onApplicationBootstrap() {
    const config = this.config();

    if (!this.shouldStartTimer(config.enabled)) {
      return;
    }

    const run = () => {
      void this.syncDueWorkspaces()
        .then((result) => {
          this.logger.log(
            `Meta auto sync checked ${result.workspacesFound} workspaces; enqueued=${result.enqueued}; failed=${result.failed}; period=${result.since ?? "-"}..${result.until ?? "-"}`
          );
        })
        .catch((error) => {
          this.logger.warn(
            `Meta auto sync failed before enqueueing workspaces: ${this.errorMessage(error)}`
          );
        });
    };

    this.initialTimer = setTimeout(run, config.initialDelayMs);
    this.timer = setInterval(run, config.intervalMs);
  }

  onModuleDestroy() {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncDueWorkspaces(): Promise<MetaReportAutoSyncResult> {
    const config = this.config();

    if (!config.enabled) {
      return {
        enabled: false,
        workspacesFound: 0,
        enqueued: 0,
        failed: 0,
        since: null,
        until: null
      };
    }

    const period = this.period(config.lookbackDays);

    if (this.running) {
      return {
        enabled: true,
        workspacesFound: 0,
        enqueued: 0,
        failed: 0,
        since: period.since,
        until: period.until
      };
    }

    this.running = true;

    try {
      const workspaces = await this.prisma.workspace.findMany({
        where: {
          operationalStatus: "active",
          metaIntegration: {
            is: {
              status: "connected"
            }
          },
          metaReportingAccounts: {
            some: {
              active: true
            }
          }
        },
        select: {
          id: true
        },
        take: config.batchLimit
      });
      let enqueued = 0;
      let failed = 0;

      for (const workspace of workspaces) {
        try {
          await this.queueService.enqueueSync({
            workspaceId: workspace.id,
            since: period.since,
            until: period.until
          });
          enqueued += 1;
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `Could not enqueue automatic Meta sync for workspace ${workspace.id}: ${this.errorMessage(error)}`
          );
        }
      }

      return {
        enabled: true,
        workspacesFound: workspaces.length,
        enqueued,
        failed,
        since: period.since,
        until: period.until
      };
    } finally {
      this.running = false;
    }
  }

  private shouldStartTimer(enabled: boolean): boolean {
    if (!enabled) {
      return false;
    }

    if (
      process.env.NODE_ENV === "test" &&
      process.env.WPPTRACK_META_AUTO_SYNC_ENABLED === undefined
    ) {
      return false;
    }

    return true;
  }

  private config() {
    return {
      enabled: this.booleanEnv("WPPTRACK_META_AUTO_SYNC_ENABLED", true),
      intervalMs:
        this.positiveIntegerEnv("WPPTRACK_META_AUTO_SYNC_INTERVAL_MINUTES", 180) *
        60_000,
      initialDelayMs:
        this.positiveIntegerEnv(
          "WPPTRACK_META_AUTO_SYNC_INITIAL_DELAY_SECONDS",
          60
        ) * 1_000,
      lookbackDays: this.positiveIntegerEnv(
        "WPPTRACK_META_AUTO_SYNC_LOOKBACK_DAYS",
        7
      ),
      batchLimit: this.positiveIntegerEnv(
        "WPPTRACK_META_AUTO_SYNC_BATCH_LIMIT",
        100
      )
    };
  }

  private booleanEnv(name: string, fallback: boolean): boolean {
    const value = process.env[name]?.trim().toLowerCase();

    if (!value) {
      return fallback;
    }

    return ["1", "true", "yes", "sim", "on"].includes(value);
  }

  private positiveIntegerEnv(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] ?? "", 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private period(lookbackDays: number) {
    const until = this.clock.now();
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - lookbackDays);

    return {
      since: this.dateOnly(since),
      until: this.dateOnly(until)
    };
  }

  private dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "erro desconhecido";
  }
}
