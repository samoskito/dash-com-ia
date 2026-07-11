import { describe, expect, it, vi } from "vitest";
import { ExternalSyncQueueService } from "../src/external-data/external-sync-queue.service";

describe("ExternalSyncQueueService", () => {
  it("does not enqueue a second job while the connector sync is active", async () => {
    const add = vi.fn();
    const queue = {
      getJob: vi.fn(async () => ({
        getState: vi.fn(async () => "active"),
        remove: vi.fn()
      })),
      add
    };
    const service = new ExternalSyncQueueService(queue as never);
    const result = await service.enqueueSync({
      connectorId: "connector_1",
      streams: ["events", "leads", "events"]
    });

    expect(result).toMatchObject({
      connectorId: "connector_1",
      streams: ["events", "leads"],
      status: "queued"
    });
    expect(add).not.toHaveBeenCalled();
  });

  it("replaces a completed job and queues a new incremental read", async () => {
    const remove = vi.fn(async () => undefined);
    const add = vi.fn(async (_name, _payload, options) => ({ id: options.jobId }));
    const queue = {
      getJob: vi.fn(async () => ({
        getState: vi.fn(async () => "completed"),
        remove
      })),
      add
    };
    const service = new ExternalSyncQueueService(queue as never);

    await service.enqueueSync({
      connectorId: "connector_1",
      streams: ["leads", "events"]
    });

    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });
});
