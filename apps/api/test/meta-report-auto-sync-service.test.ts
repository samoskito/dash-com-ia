import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaReportAutoSyncService } from "../src/reporting/meta-report-auto-sync.service";

describe("meta report auto sync service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("enqueues connected active workspaces for the configured lookback window", async () => {
    vi.stubEnv("WPPTRACK_META_AUTO_SYNC_LOOKBACK_DAYS", "14");
    vi.stubEnv("WPPTRACK_META_AUTO_SYNC_BATCH_LIMIT", "50");
    const prisma = {
      workspace: {
        findMany: vi.fn(async () => [
          { id: "workspace_1" },
          { id: "workspace_2" },
        ]),
      },
    };
    const queueService = {
      enqueueWorkspaceSync: vi.fn(async (payload: unknown) => ({
        payload,
        status: "queued",
      })),
    };
    const service = new MetaReportAutoSyncService(
      prisma as never,
      queueService as never,
      {
        now: () => new Date("2026-07-09T15:30:00.000Z"),
      },
    );

    await expect(service.syncDueWorkspaces()).resolves.toEqual({
      enabled: true,
      workspacesFound: 2,
      enqueued: 2,
      failed: 0,
      since: "2026-06-26",
      until: "2026-07-09",
    });

    expect(prisma.workspace.findMany).toHaveBeenCalledWith({
      where: {
        operationalStatus: "active",
        OR: [
          {
            metaIntegration: { is: { status: "connected" } },
            metaReportingAccounts: { some: { active: true } },
          },
          {
            metaBusinessConnections: {
              some: {
                status: "active",
                credential: { is: { status: "active" } },
                reportingAccounts: { some: { active: true } },
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
      take: 50,
    });
    expect(queueService.enqueueWorkspaceSync).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-06-26",
      until: "2026-07-09",
    });
    expect(queueService.enqueueWorkspaceSync).toHaveBeenCalledWith({
      workspaceId: "workspace_2",
      since: "2026-06-26",
      until: "2026-07-09",
    });
  });

  it("does not enqueue when automatic sync is disabled", async () => {
    vi.stubEnv("WPPTRACK_META_AUTO_SYNC_ENABLED", "false");
    const prisma = {
      workspace: {
        findMany: vi.fn(),
      },
    };
    const queueService = {
      enqueueWorkspaceSync: vi.fn(),
    };
    const service = new MetaReportAutoSyncService(
      prisma as never,
      queueService as never,
      {
        now: () => new Date("2026-07-09T15:30:00.000Z"),
      },
    );

    await expect(service.syncDueWorkspaces()).resolves.toEqual({
      enabled: false,
      workspacesFound: 0,
      enqueued: 0,
      failed: 0,
      since: null,
      until: null,
    });

    expect(prisma.workspace.findMany).not.toHaveBeenCalled();
    expect(queueService.enqueueWorkspaceSync).not.toHaveBeenCalled();
  });

  it("continues enqueueing other workspaces when one workspace fails", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const secret = "synthetic-secret-meta-token";
    const prisma = {
      workspace: {
        findMany: vi.fn(async () => [
          { id: "workspace_1" },
          { id: "workspace_2" },
        ]),
      },
    };
    const queueService = {
      enqueueWorkspaceSync: vi
        .fn()
        .mockRejectedValueOnce(new Error(`Redis unavailable: ${secret}`))
        .mockResolvedValueOnce({ status: "queued" }),
    };
    const service = new MetaReportAutoSyncService(
      prisma as never,
      queueService as never,
      {
        now: () => new Date("2026-07-09T15:30:00.000Z"),
      },
    );

    const result = await service.syncDueWorkspaces();

    expect(result).toMatchObject({
      enabled: true,
      workspacesFound: 2,
      enqueued: 1,
      failed: 1,
      since: "2026-07-03",
      until: "2026-07-09",
    });
    expect(result).not.toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith("META_REPORT_AUTO_SYNC_ENQUEUE_FAILED");
    expect(warn.mock.calls.flat().join(" ")).not.toContain(secret);
  });

  it("uses a safe diagnostic when bootstrap sync fails", async () => {
    vi.useFakeTimers();
    vi.stubEnv("WPPTRACK_META_AUTO_SYNC_ENABLED", "true");
    vi.stubEnv("WPPTRACK_META_AUTO_SYNC_INITIAL_DELAY_SECONDS", "1");
    vi.stubEnv("WPPTRACK_META_AUTO_SYNC_INTERVAL_MINUTES", "999");
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const secret = "synthetic-secret-bootstrap-token";
    const prisma = {
      workspace: {
        findMany: vi.fn(async () => {
          throw new Error(`connection failed: ${secret}`);
        }),
      },
    };
    const service = new MetaReportAutoSyncService(
      prisma as never,
      { enqueueWorkspaceSync: vi.fn() } as never,
    );

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1_000);
    service.onModuleDestroy();

    expect(warn).toHaveBeenCalledWith(
      "META_REPORT_AUTO_SYNC_BOOTSTRAP_FAILED",
    );
    expect(warn.mock.calls.flat().join(" ")).not.toContain(secret);
  });
});
