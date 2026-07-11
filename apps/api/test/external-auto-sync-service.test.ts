import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalAutoSyncService } from "../src/external-data/external-auto-sync.service";

const originalEnabled = process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED;

afterEach(() => {
  if (originalEnabled === undefined) {
    delete process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED;
  } else {
    process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED = originalEnabled;
  }
});

describe("ExternalAutoSyncService", () => {
  it("enqueues both streams only for the connectors selected by the active query", async () => {
    process.env.WPPTRACK_EXTERNAL_SYNC_ENABLED = "true";
    const prisma = {
      externalDataConnector: {
        findMany: vi.fn(async () => [{ id: "connector_1" }, { id: "connector_2" }])
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
      streams: ["leads", "events"]
    });
  });
});
