import { describe, expect, it, vi } from "vitest";
import { MetaReportSyncQueueService } from "../src/reporting/meta-report-sync-queue.service";

describe("meta report sync queue service", () => {
  it("enqueues Meta report sync jobs with a stable workspace/date job id", async () => {
    const queue = {
      add: vi.fn(async () => ({
        id: "meta-report-sync:workspace_1:2026-07-01:2026-07-02"
      }))
    };
    const service = new MetaReportSyncQueueService(queue as never);

    await expect(
      service.enqueueSync({
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      jobId: "meta-report-sync:workspace_1:2026-07-01:2026-07-02",
      status: "queued"
    });

    expect(queue.add).toHaveBeenCalledWith(
      "sync-meta-reporting",
      {
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02"
      },
      expect.objectContaining({
        jobId: "meta-report-sync:workspace_1:2026-07-01:2026-07-02",
        attempts: 3
      })
    );
  });
});
