import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalAutoSyncService } from "../src/external-data/external-auto-sync.service";

const originalEnabled = process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED;
const originalInitialDelay =
  process.env.WPPTRACK_EXTERNAL_SYNC_INITIAL_DELAY_SECONDS;
const originalInterval = process.env.WPPTRACK_EXTERNAL_SYNC_INTERVAL_MINUTES;

afterEach(() => {
  vi.useRealTimers();

  if (originalEnabled === undefined) {
    delete process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED;
  } else {
    process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED = originalEnabled;
  }

  if (originalInitialDelay === undefined) {
    delete process.env.WPPTRACK_EXTERNAL_SYNC_INITIAL_DELAY_SECONDS;
  } else {
    process.env.WPPTRACK_EXTERNAL_SYNC_INITIAL_DELAY_SECONDS =
      originalInitialDelay;
  }

  if (originalInterval === undefined) {
    delete process.env.WPPTRACK_EXTERNAL_SYNC_INTERVAL_MINUTES;
  } else {
    process.env.WPPTRACK_EXTERNAL_SYNC_INTERVAL_MINUTES = originalInterval;
  }
});

describe("ExternalAutoSyncService", () => {
  it("runs once after the initial delay and starts the interval afterwards", async () => {
    vi.useFakeTimers();
    process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED = "true";
    process.env.WPPTRACK_EXTERNAL_SYNC_INITIAL_DELAY_SECONDS = "60";
    process.env.WPPTRACK_EXTERNAL_SYNC_INTERVAL_MINUTES = "1";
    const prisma = {
      externalDataConnector: { findMany: vi.fn(async () => []) }
    };
    const service = new ExternalAutoSyncService(
      prisma as never,
      { enqueueSync: vi.fn() } as never
    );

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(prisma.externalDataConnector.findMany).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(prisma.externalDataConnector.findMany).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });

  it("enqueues both streams only for the connectors selected by the active query", async () => {
    process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED = "true";
    const prisma = {
      externalDataConnector: {
        findMany: vi.fn(async () => [
          { id: "connector_1", workspaceId: "workspace_1" },
          { id: "connector_2", workspaceId: "workspace_2" }
        ])
      }
    };
    const queue = { enqueueSync: vi.fn(async () => ({ status: "queued" })) };
    const service = new ExternalAutoSyncService(prisma as never, queue as never);
    const result = await service.enqueueDueConnectors();

    expect(result).toEqual({
      enabled: true,
      connectorsFound: 2,
      enqueued: 2,
      failed: 0
    });
    expect(prisma.externalDataConnector.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "active",
          syncEnabled: true,
          workspace: { operationalStatus: "active" }
        }
      })
    );
    expect(queue.enqueueSync).toHaveBeenNthCalledWith(1, {
      connectorId: "connector_1",
      workspaceId: "workspace_1",
      streams: ["leads", "events"]
    });
  });
});
