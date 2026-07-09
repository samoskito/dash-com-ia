import { describe, expect, it, vi } from "vitest";
import { MetaAssetsService } from "../src/integrations/meta/meta-assets.service";

function createHarness() {
  const prisma = {
    metaConversionDestination: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create, update }) => ({
        id: "destination_1",
        createdAt: new Date("2026-07-09T12:00:00.000Z"),
        updatedAt: new Date("2026-07-09T12:00:00.000Z"),
        ...create,
        ...update
      }))
    },
    metaReportingAccount: {
      findMany: vi.fn(async (): Promise<unknown[]> => []),
      upsert: vi.fn(async ({ create, update }) => ({
        id: "reporting_1",
        createdAt: new Date("2026-07-09T12:00:00.000Z"),
        updatedAt: new Date("2026-07-09T12:00:00.000Z"),
        lastSyncedAt: null,
        ...create,
        ...update
      })),
      updateMany: vi.fn(async () => ({ count: 1 }))
    },
    auditLog: {
      create: vi.fn(async ({ data }) => ({
        id: "audit_1",
        createdAt: new Date("2026-07-09T12:00:00.000Z"),
        ...data
      }))
    }
  };

  return {
    prisma,
    service: new MetaAssetsService(prisma as never)
  };
}

describe("meta assets service", () => {
  it("returns needs_configuration when no conversion destination exists", async () => {
    const { prisma, service } = createHarness();

    await expect(
      service.getConversionDestination("workspace_1")
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      pixelId: null,
      pixelName: null,
      pageId: null,
      pageName: null,
      status: "needs_configuration",
      lastValidatedAt: null,
      validationError: null
    });
    expect(prisma.metaConversionDestination.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1" }
    });
  });

  it("saves one conversion destination per workspace and audits the change", async () => {
    const { prisma, service } = createHarness();

    await expect(
      service.saveConversionDestination(
        "workspace_1",
        {
          pixelId: "pixel_1",
          pixelName: "Pixel Principal",
          pageId: "page_1",
          pageName: "Pagina Principal"
        },
        "user_1"
      )
    ).resolves.toMatchObject({
      workspaceId: "workspace_1",
      pixelId: "pixel_1",
      pixelName: "Pixel Principal",
      pageId: "page_1",
      pageName: "Pagina Principal",
      status: "configured",
      validationError: null
    });

    expect(prisma.metaConversionDestination.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace_1" },
        create: expect.objectContaining({
          workspaceId: "workspace_1",
          pixelId: "pixel_1",
          pageId: "page_1",
          status: "configured",
          validationError: null
        }),
        update: expect.objectContaining({
          pixelId: "pixel_1",
          pageId: "page_1",
          status: "configured",
          validationError: null
        })
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "meta.destination.updated",
        targetType: "MetaIntegration",
        targetId: "workspace_1",
        resultStatus: "success"
      })
    });
  });

  it("adds or reactivates reporting accounts by workspace and ad account", async () => {
    const { prisma, service } = createHarness();

    await expect(
      service.saveReportingAccount(
        "workspace_1",
        {
          businessId: "business_1",
          businessName: "BM Principal",
          adAccountId: "act_123",
          adAccountName: "Conta WhatsApp",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo"
        },
        "user_1"
      )
    ).resolves.toMatchObject({
      id: "reporting_1",
      workspaceId: "workspace_1",
      businessId: "business_1",
      businessName: "BM Principal",
      adAccountId: "act_123",
      adAccountName: "Conta WhatsApp",
      active: true,
      syncStatus: "pending",
      syncError: null
    });

    expect(prisma.metaReportingAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_adAccountId: {
            workspaceId: "workspace_1",
            adAccountId: "act_123"
          }
        },
        create: expect.objectContaining({
          workspaceId: "workspace_1",
          adAccountId: "act_123",
          active: true,
          syncStatus: "pending",
          syncError: null
        }),
        update: expect.objectContaining({
          businessName: "BM Principal",
          adAccountName: "Conta WhatsApp",
          active: true,
          syncStatus: "pending",
          syncError: null
        })
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: "user",
        action: "meta.reporting_account.saved",
        resultStatus: "success"
      })
    });
  });

  it("setReportingAccountActive uses updateMany scoped by id and workspaceId", async () => {
    const { prisma, service } = createHarness();
    prisma.metaReportingAccount.findMany.mockResolvedValueOnce([
      {
        id: "reporting_1",
        workspaceId: "workspace_1",
        businessId: "business_1",
        businessName: "BM Principal",
        adAccountId: "act_123",
        adAccountName: "Conta WhatsApp",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
        active: false,
        syncStatus: "pending",
        lastSyncedAt: null,
        syncError: null
      }
    ]);

    await expect(
      service.setReportingAccountActive(
        "workspace_1",
        "reporting_1",
        false,
        "user_1"
      )
    ).resolves.toEqual([
      {
        id: "reporting_1",
        workspaceId: "workspace_1",
        businessId: "business_1",
        businessName: "BM Principal",
        adAccountId: "act_123",
        adAccountName: "Conta WhatsApp",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
        active: false,
        syncStatus: "pending",
        lastSyncedAt: null,
        syncError: null
      }
    ]);

    expect(prisma.metaReportingAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "reporting_1", workspaceId: "workspace_1" },
      data: { active: false }
    });
    expect(prisma.metaReportingAccount.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1" },
      orderBy: [{ active: "desc" }, { adAccountName: "asc" }]
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "meta.reporting_account.status_updated",
        targetId: "workspace_1",
        resultStatus: "success"
      })
    });
  });
});
