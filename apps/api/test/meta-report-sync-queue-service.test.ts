import { describe, expect, it, vi } from "vitest";
import { MetaReportSyncQueueService } from "../src/reporting/meta-report-sync-queue.service";

describe("meta report sync queue service", () => {
  it("enqueues each manual Meta report sync as a fresh retryable job", async () => {
    const queue = {
      add: vi.fn(
        async (_name: string, _data: unknown, options: { jobId: string }) => ({
          id: options.jobId
        })
      )
    };
    const service = new MetaReportSyncQueueService(queue as never);

    const first = await service.enqueueSync({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });
    const second = await service.enqueueSync({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    expect(first).toEqual({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      jobId: expect.stringMatching(
        /^meta-report-sync:workspace_1:2026-07-01:2026-07-02:[0-9a-f-]{36}$/
      ),
      status: "queued"
    });
    expect(second.jobId).toMatch(
      /^meta-report-sync:workspace_1:2026-07-01:2026-07-02:[0-9a-f-]{36}$/
    );
    expect(second.jobId).not.toBe(first.jobId);

    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      "sync-meta-reporting",
      {
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02"
      },
      expect.objectContaining({
        jobId: first.jobId,
        attempts: 3
      })
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      "sync-meta-reporting",
      {
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02"
      },
      expect.objectContaining({
        jobId: second.jobId,
        attempts: 3
      })
    );
  });
});
