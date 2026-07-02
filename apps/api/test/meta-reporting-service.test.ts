import { describe, expect, it, vi } from "vitest";
import { MetaReportingService } from "../src/reporting/meta-reporting.service";

function createHarness() {
  const db = {
    metaIntegration: {
      workspaceId: "workspace_1",
      status: "connected",
      encryptedAccessToken: "encrypted",
      tokenIv: "iv",
      tokenTag: "tag",
      selectedAdAccountId: "act_123"
    },
    campaigns: [] as Array<Record<string, unknown>>,
    adSets: [] as Array<Record<string, unknown>>,
    ads: [] as Array<Record<string, unknown>>,
    leads: [
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        createdAt: new Date("2026-07-01T12:00:00.000Z")
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        createdAt: new Date("2026-07-02T12:00:00.000Z")
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_other",
        adSetId: "adset_other",
        adId: "ad_other",
        createdAt: new Date("2026-07-02T12:00:00.000Z")
      }
    ],
    conversionLogs: [
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        eventName: "LeadSubmitted",
        status: "sent"
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        eventName: "QualifiedLead",
        status: "sent"
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        eventName: "Purchase",
        status: "sent"
      }
    ]
  };
  const prisma = {
    metaIntegration: {
      findUnique: vi.fn(async () => db.metaIntegration)
    },
    metaCampaign: {
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const record = { ...create, ...update };
        db.campaigns.push(record);
        return record;
      }),
      findMany: vi.fn(async () => db.campaigns)
    },
    metaAdSet: {
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const record = { ...create, ...update };
        db.adSets.push(record);
        return record;
      }),
      findMany: vi.fn(async () => db.adSets)
    },
    metaAd: {
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const record = { ...create, ...update };
        db.ads.push(record);
        return record;
      }),
      findMany: vi.fn(async () => db.ads)
    },
    conversionEventLog: {
      findMany: vi.fn(async () => db.conversionLogs)
    },
    lead: {
      findMany: vi.fn(async () => db.leads)
    }
  };
  const encryption = {
    decrypt: vi.fn(() => "EAAB-secret-token")
  };
  const metaAdapter = {
    listCampaigns: vi.fn(async () => [
      {
        id: "cmp_1",
        name: "Black Friday WhatsApp",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        objective: "OUTCOME_SALES"
      }
    ]),
    listAdSets: vi.fn(async () => [
      {
        id: "adset_1",
        name: "Publico quente",
        campaignId: "cmp_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE"
      }
    ]),
    listAds: vi.fn(async () => [
      {
        id: "ad_1",
        name: "Criativo WhatsApp",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE"
      }
    ]),
    listCampaignInsights: vi.fn(async () => [
      {
        campaignId: "cmp_1",
        spendCents: 120000,
        impressions: 10000,
        clicks: 420,
        metaConversationsStarted: 176
      }
    ])
  };
  const service = new MetaReportingService(
    prisma as never,
    encryption as never,
    metaAdapter as never
  );

  return { db, encryption, metaAdapter, prisma, service };
}

describe("meta reporting service", () => {
  it("syncs selected Meta account campaigns, ad sets and ads into workspace snapshots", async () => {
    const { db, encryption, metaAdapter, prisma, service } = createHarness();

    await expect(
      service.syncWorkspaceMetaStructure({
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1
    });

    expect(encryption.decrypt).toHaveBeenCalled();
    expect(metaAdapter.listCampaigns).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123"
    });
    expect(metaAdapter.listCampaignInsights).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123",
      since: "2026-07-01",
      until: "2026-07-02"
    });
    expect(prisma.metaCampaign.upsert).toHaveBeenCalled();
    expect(db.campaigns[0]).toMatchObject({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      name: "Black Friday WhatsApp",
      spendCents: 120000,
      metaConversationsStarted: 176
    });
  });

  it("returns campaign report rows combining Meta spend with internal conversion events", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    await expect(
      service.getCampaignReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 2 dias"
      })
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 2 dias",
      campaigns: [
        {
          id: "cmp_1",
          name: "Black Friday WhatsApp",
          status: "active",
          spendCents: 120000,
          metaConversationsStarted: 176,
          costPerMetaConversationCents: 681,
          realConversations: 2,
          costPerRealConversationCents: 60000,
          leadSubmitted: 1,
          costPerLeadSubmittedCents: 120000,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: 120000,
          purchase: 1,
          costPerPurchaseCents: 120000,
          roas: null
        }
      ]
    });
  });

  it("filters internal conversion events by report period when provided", async () => {
    const { prisma, service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    expect(prisma.conversionEventLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lte: new Date("2026-07-02T23:59:59.999Z")
          }
        })
      })
    );
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lte: new Date("2026-07-02T23:59:59.999Z")
          }
        })
      })
    );
  });

  it("returns campaign, ad set and ad structure from persisted snapshots", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    await expect(
      service.getMetaStructureReport("workspace_1")
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      campaigns: [
        {
          id: "cmp_1",
          name: "Black Friday WhatsApp",
          status: "ACTIVE",
          effectiveStatus: "ACTIVE",
          objective: "OUTCOME_SALES",
          adSets: [
            {
              id: "adset_1",
              name: "Publico quente",
              status: "ACTIVE",
              effectiveStatus: "ACTIVE",
              ads: [
                {
                  id: "ad_1",
                  name: "Criativo WhatsApp",
                  status: "ACTIVE",
                  effectiveStatus: "ACTIVE"
                }
              ]
            }
          ]
        }
      ]
    });
  });

  it("returns ad set report rows combining structure with internal events", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    await expect(
      service.getAdSetReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 2 dias"
      })
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 2 dias",
      adSets: [
        {
          id: "adset_1",
          campaignId: "cmp_1",
          campaignName: "Black Friday WhatsApp",
          name: "Publico quente",
          status: "active",
          spendCents: 0,
          metaConversationsStarted: 0,
          costPerMetaConversationCents: null,
          realConversations: 2,
          costPerRealConversationCents: null,
          leadSubmitted: 1,
          costPerLeadSubmittedCents: null,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: null,
          purchase: 1,
          costPerPurchaseCents: null,
          roas: null
        }
      ]
    });
  });

  it("returns ad report rows combining structure with internal events", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    await expect(
      service.getAdReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 2 dias"
      })
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 2 dias",
      ads: [
        {
          id: "ad_1",
          campaignId: "cmp_1",
          campaignName: "Black Friday WhatsApp",
          adSetId: "adset_1",
          adSetName: "Publico quente",
          name: "Criativo WhatsApp",
          status: "active",
          spendCents: 0,
          metaConversationsStarted: 0,
          costPerMetaConversationCents: null,
          realConversations: 2,
          costPerRealConversationCents: null,
          leadSubmitted: 1,
          costPerLeadSubmittedCents: null,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: null,
          purchase: 1,
          costPerPurchaseCents: null,
          roas: null
        }
      ]
    });
  });
});
