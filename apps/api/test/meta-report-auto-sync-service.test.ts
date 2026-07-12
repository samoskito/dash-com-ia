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
        findMany: vi.fn(async () => [{ id: "workspace_1" }, { id: "workspace_2" }])
      }
    };
    const queueService = {
      enqueueSync: vi.fn(async (payload: unknown) => ({
        payload,
        status: "queued"
      }))
    };
    const service = new MetaReportAutoSyncService(
      prisma as never,
      queueService as never,
      {
        now: () => new Date("2026-07-09T15:30:00.000Z")
      }
    );

    await expect(service.syncDueWorkspaces()).resolves.toEqual({
      enabled: true,
      workspacesFound: 2,
      enqueued: 2,
      failed: 0,
      since: "2026-06-26",
      until: "2026-07-09"
    });

    expect(prisma.workspace.findMany).toHaveBeenCalledWith({
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
      take: 50
    });
    expect(queueService.enqueueSync).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-06-26",
      until: "2026-07-09"
    });
    expect(queueService.enqueueSync).toHaveBeenCalledWith({
      workspaceId: "workspace_2",
      since: "2026-06-26",
      until: "2026-07-09"
    });
  });

  it("does not enqueue when automatic sync is disabled", async () => {
    vi.stubEnv("WPPTRACK_META_AUTO_SYNC_ENABLED", "false");
    const prisma = {
      workspace: {
        findMany: vi.fn()
      }
    };
    const queueService = {
      enqueueSync: vi.fn()
    };
    const service = new MetaReportAutoSyncService(
      prisma as never,
      queueService as never,
      {
        now: () => new Date("2026-07-09T15:30:00.000Z")
      }
    );

    await expect(service.syncDueWorkspaces()).resolves.toEqual({
      enabled: false,
      workspacesFound: 0,
      enqueued: 0,
      failed: 0,
      since: null,
      until: null
    });

    expect(prisma.workspace.findMany).not.toHaveBeenCalled();
    expect(queueService.enqueueSync).not.toHaveBeenCalled();
  });

  it("continues enqueueing other workspaces when one workspace fails", async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const prisma = {
      workspace: {
        findMany: vi.fn(async () => [{ id: "workspace_1" }, { id: "workspace_2" }])
      }
    };
    const queueService = {
      enqueueSync: vi
        .fn()
        .mockRejectedValueOnce(new Error("Redis indisponivel"))
        .mockResolvedValueOnce({ status: "queued" })
    };
    const service = new MetaReportAutoSyncService(
      prisma as never,
      queueService as never,
      {
        now: () => new Date("2026-07-09T15:30:00.000Z")
      }
    );

    await expect(service.syncDueWorkspaces()).resolves.toMatchObject({
      enabled: true,
      workspacesFound: 2,
      enqueued: 1,
      failed: 1,
      since: "2026-07-03",
      until: "2026-07-09"
    });
  });
});
