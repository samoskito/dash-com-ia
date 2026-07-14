import { describe, expect, it, vi } from "vitest";
import { ExternalSyncProcessor } from "../src/external-data/external-sync.processor";

function createPrismaHarness() {
  return {
    externalDataConnector: {
      findUnique: vi.fn(async () => ({ workspaceId: "workspace_1" }))
    },
    jobAttempt: {
      create: vi.fn(async ({ data }) => ({ id: "job_attempt_1", ...data }))
    }
  };
}

describe("ExternalSyncProcessor", () => {
  it("forwards the job workspace so a cross-tenant connector is rejected", async () => {
    const syncService = {
      syncConnector: vi.fn(
        async (
          _connectorId: string,
          _streams: string[],
          options: { workspaceId: string }
        ) => {
          if (options.workspaceId !== "workspace_2") {
            throw new Error("Conector externo nao encontrado");
          }
        }
      )
    };
    const prisma = createPrismaHarness();
    const processor = new ExternalSyncProcessor(
      syncService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "external_sync_cross_tenant",
        name: "sync-external-data",
        attemptsMade: 0,
        data: {
          connectorId: "connector_workspace_2",
          workspaceId: "workspace_1",
          streams: ["events"]
        }
      } as never)
    ).rejects.toThrow("Conector externo nao encontrado");

    expect(syncService.syncConnector).toHaveBeenCalledWith(
      "connector_workspace_2",
      ["events"],
      {
        projectionRefresh: false,
        workspaceId: "workspace_1"
      }
    );
    expect(prisma.externalDataConnector.findUnique).not.toHaveBeenCalled();
    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        status: "failed",
        relatedEntityId: "connector_workspace_2"
      })
    });
  });

  it("scopes a legacy connector job before starting the sync", async () => {
    const result = {
      connectorId: "connector_1",
      workspaceId: "workspace_1",
      streams: ["leads"],
      counts: {
        read: 0,
        imported: 0,
        duplicates: 0,
        filtered: 0,
        rejected: 0,
        queued: 0,
        removed: 0
      },
      startedAt: "2026-07-14T12:00:00.000Z",
      completedAt: "2026-07-14T12:00:00.000Z",
      durationMs: 0
    };
    const syncService = {
      syncConnector: vi.fn(async () => result)
    };
    const prisma = createPrismaHarness();
    const updateData = vi.fn(async () => undefined);
    const processor = new ExternalSyncProcessor(
      syncService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "external_sync_legacy",
        name: "sync-external-data",
        attemptsMade: 0,
        updateData,
        data: {
          connectorId: "connector_1",
          streams: ["leads"]
        }
      } as never)
    ).resolves.toEqual(result);

    expect(prisma.externalDataConnector.findUnique).toHaveBeenCalledWith({
      where: { id: "connector_1" },
      select: { workspaceId: true }
    });
    expect(updateData).toHaveBeenCalledWith({
      connectorId: "connector_1",
      streams: ["leads"],
      workspaceId: "workspace_1"
    });
    expect(syncService.syncConnector).toHaveBeenCalledWith(
      "connector_1",
      ["leads"],
      {
        projectionRefresh: false,
        workspaceId: "workspace_1"
      }
    );
  });
});
