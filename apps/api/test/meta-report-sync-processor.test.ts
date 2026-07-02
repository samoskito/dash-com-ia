import { describe, expect, it, vi } from "vitest";
import { MetaReportSyncProcessor } from "../src/reporting/meta-report-sync.processor";

describe("meta report sync processor", () => {
  it("runs Meta reporting sync for queued workspace/date payloads", async () => {
    const metaReportingService = {
      syncWorkspaceMetaStructure: vi.fn(async () => ({
        workspaceId: "workspace_1",
        adAccountId: "act_123",
        campaignsSynced: 1,
        adSetsSynced: 1,
        adsSynced: 1
      }))
    };
    const processor = new MetaReportSyncProcessor(metaReportingService as never);

    await expect(
      processor.process({
        data: {
          workspaceId: "workspace_1",
          since: "2026-07-01",
          until: "2026-07-02"
        }
      } as never)
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1
    });

    expect(metaReportingService.syncWorkspaceMetaStructure).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });
  });
});
