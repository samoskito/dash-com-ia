import { describe, expect, it, vi } from "vitest";
import { MetaReportSyncQueueService } from "../src/reporting/meta-report-sync-queue.service";

describe("meta report sync queue service", () => {
  it("expands a manual workspace into account-scoped jobs", async () => {
    const queue = {
      add: vi.fn(
        async (_name: string, _data: unknown, options: { jobId: string }) => ({
          id: options.jobId,
        }),
      ),
    };
    const resolver = {
      listReportingSyncTargets: vi.fn(async () => [
        {
          workspaceId: "workspace_1",
          businessConnectionId: "connection_1",
          reportingAccountId: "reporting_1",
        },
        {
          workspaceId: "workspace_1",
          businessConnectionId: "connection_2",
          reportingAccountId: "reporting_2",
        },
      ]),
    };
    const service = new MetaReportSyncQueueService(
      queue as never,
      resolver as never,
    );

    const result = await service.enqueueWorkspaceSync({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(result).toMatchObject({
      workspaceId: "workspace_1",
      status: "queued",
      jobs: [
        {
          businessConnectionId: "connection_1",
          reportingAccountId: "reporting_1",
        },
        {
          businessConnectionId: "connection_2",
          reportingAccountId: "reporting_2",
        },
      ],
    });
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it("enqueues each manual Meta report sync as a fresh retryable job", async () => {
    const queue = {
      add: vi.fn(
        async (_name: string, _data: unknown, options: { jobId: string }) => ({
          id: options.jobId,
        }),
      ),
    };
    const service = new MetaReportSyncQueueService(queue as never);

    const first = await service.enqueueSync({
      workspaceId: "workspace_1",
      businessConnectionId: null,
      reportingAccountId: null,
      since: "2026-07-01",
      until: "2026-07-02",
    });
    const second = await service.enqueueSync({
      workspaceId: "workspace_1",
      businessConnectionId: null,
      reportingAccountId: null,
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(first).toEqual({
      workspaceId: "workspace_1",
      businessConnectionId: null,
      reportingAccountId: null,
      since: "2026-07-01",
      until: "2026-07-02",
      jobId: expect.stringMatching(
        /^meta-report-sync_workspace_1_legacy_workspace_2026-07-01_2026-07-02_[0-9a-f-]{36}$/,
      ),
      status: "queued",
    });
    expect(second.jobId).toMatch(
      /^meta-report-sync_workspace_1_legacy_workspace_2026-07-01_2026-07-02_[0-9a-f-]{36}$/,
    );
    expect(first.jobId).not.toContain(":");
    expect(second.jobId).not.toContain(":");
    expect(second.jobId).not.toBe(first.jobId);

    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      "sync-meta-reporting",
      {
        workspaceId: "workspace_1",
        businessConnectionId: null,
        reportingAccountId: null,
        since: "2026-07-01",
        until: "2026-07-02",
      },
      expect.objectContaining({
        jobId: first.jobId,
        attempts: 3,
      }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      "sync-meta-reporting",
      {
        workspaceId: "workspace_1",
        businessConnectionId: null,
        reportingAccountId: null,
        since: "2026-07-01",
        until: "2026-07-02",
      },
      expect.objectContaining({
        jobId: second.jobId,
        attempts: 3,
      }),
    );
  });
});
