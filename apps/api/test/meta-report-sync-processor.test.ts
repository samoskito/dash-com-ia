import { describe, expect, it, vi } from "vitest";
import { MetaReportSyncProcessor } from "../src/reporting/meta-report-sync.processor";

function createPrismaHarness() {
  return {
    jobAttempt: {
      create: vi.fn(async ({ data }) => ({ id: "job_attempt_1", ...data })),
    },
  };
}

describe("meta report sync processor", () => {
  it("runs Meta reporting sync and records the worker attempt", async () => {
    const metaReportingService = {
      syncWorkspaceMetaStructure: vi.fn(async () => ({
        workspaceId: "workspace_1",
        accountsSynced: 1,
        accountsFailed: 0,
        campaignsSynced: 1,
        adSetsSynced: 1,
        adsSynced: 1,
      })),
    };
    const prisma = createPrismaHarness();
    const processor = new MetaReportSyncProcessor(
      metaReportingService as never,
      prisma as never,
    );

    await expect(
      processor.process({
        id: "bull_job_1",
        name: "sync-meta-reporting",
        attemptsMade: 0,
        data: {
          workspaceId: "workspace_1",
          businessConnectionId: null,
          reportingAccountId: null,
          since: "2026-07-01",
          until: "2026-07-02",
        },
      } as never),
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      accountsSynced: 1,
      accountsFailed: 0,
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1,
    });

    expect(
      metaReportingService.syncWorkspaceMetaStructure,
    ).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      businessConnectionId: null,
      reportingAccountId: null,
      since: "2026-07-01",
      until: "2026-07-02",
    });
    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        queueName: "meta-report-sync",
        jobId: "bull_job_1",
        jobName: "sync-meta-reporting",
        attemptNumber: 1,
        status: "completed",
        source: "meta",
        relatedEntityType: "Workspace",
        relatedEntityId: "workspace_1",
        errorCode: null,
        errorMessage: null,
        summaryPayload: expect.objectContaining({
          workspaceId: "workspace_1",
          accountsSynced: 1,
          accountsFailed: 0,
          campaignsSynced: 1,
          adSetsSynced: 1,
          adsSynced: 1,
          resultStatus: "completed",
        }),
      }),
    });
  });

  it("does not fail a completed Meta sync when attempt logging fails", async () => {
    const metaReportingService = {
      syncWorkspaceMetaStructure: vi.fn(async () => ({
        workspaceId: "workspace_1",
        accountsSynced: 1,
        accountsFailed: 0,
        campaignsSynced: 1,
        adSetsSynced: 1,
        adsSynced: 1,
      })),
    };
    const prisma = {
      jobAttempt: {
        create: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      },
    };
    const processor = new MetaReportSyncProcessor(
      metaReportingService as never,
      prisma as never,
    );

    await expect(
      processor.process({
        id: "bull_job_1",
        name: "sync-meta-reporting",
        attemptsMade: 0,
        data: {
          workspaceId: "workspace_1",
          businessConnectionId: null,
          reportingAccountId: null,
          since: "2026-07-01",
          until: "2026-07-02",
        },
      } as never),
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      accountsSynced: 1,
      accountsFailed: 0,
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1,
    });

    expect(
      metaReportingService.syncWorkspaceMetaStructure,
    ).toHaveBeenCalledTimes(1);
    expect(prisma.jobAttempt.create).toHaveBeenCalledTimes(1);
  });

  it("records failed Meta sync attempts and rethrows the error", async () => {
    const metaReportingService = {
      syncWorkspaceMetaStructure: vi.fn(async () => {
        throw new Error("Meta insights timeout");
      }),
    };
    const prisma = createPrismaHarness();
    const processor = new MetaReportSyncProcessor(
      metaReportingService as never,
      prisma as never,
    );

    await expect(
      processor.process({
        id: "bull_job_2",
        name: "sync-meta-reporting",
        attemptsMade: 1,
        data: {
          workspaceId: "workspace_1",
          businessConnectionId: null,
          reportingAccountId: null,
          since: "2026-07-01",
          until: "2026-07-02",
        },
      } as never),
    ).rejects.toThrow("Meta insights timeout");

    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        queueName: "meta-report-sync",
        jobId: "bull_job_2",
        jobName: "sync-meta-reporting",
        attemptNumber: 2,
        status: "failed",
        source: "meta",
        relatedEntityType: "Workspace",
        relatedEntityId: "workspace_1",
        errorCode: null,
        errorMessage: "Meta insights timeout",
        summaryPayload: expect.objectContaining({
          workspaceId: "workspace_1",
          since: "2026-07-01",
          until: "2026-07-02",
        }),
      }),
    });
  });

  it("forwards the exact manual connection and account IDs to reporting", async () => {
    const metaReportingService = {
      syncWorkspaceMetaStructure: vi.fn(async () => ({
        workspaceId: "workspace_1",
        accountsSynced: 1,
        accountsFailed: 0,
        campaignsSynced: 1,
        adSetsSynced: 1,
        adsSynced: 1,
      })),
    };
    const prisma = createPrismaHarness();
    const processor = new MetaReportSyncProcessor(
      metaReportingService as never,
      prisma as never,
    );

    await processor.process({
      id: "bull_job_manual_1",
      name: "sync-meta-reporting",
      attemptsMade: 0,
      data: {
        workspaceId: "workspace_1",
        businessConnectionId: "connection_1",
        reportingAccountId: "reporting_1",
        since: "2026-07-01",
        until: "2026-07-02",
      },
    } as never);

    expect(
      metaReportingService.syncWorkspaceMetaStructure,
    ).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      businessConnectionId: "connection_1",
      reportingAccountId: "reporting_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });
    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        summaryPayload: expect.objectContaining({
          businessConnectionId: "connection_1",
          reportingAccountId: "reporting_1",
        }),
      }),
    });
  });
});
