import { describe, expect, it, vi } from "vitest";
import { MetaReportingService } from "../src/reporting/meta-reporting.service";
import { WhatsappCampaignClassifierService } from "../src/reporting/whatsapp-campaign-classifier.service";

function matchesWhere(
  record: Record<string, unknown>,
  where?: Record<string, unknown>
) {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value) {
      return (value.in as unknown[]).includes(record[key]);
    }

    return record[key] === value;
  });
}

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
    reportingAccounts: [
      {
        id: "reporting_1",
        workspaceId: "workspace_1",
        businessId: "business_1",
        businessName: "BM 1",
        adAccountId: "act_123",
        adAccountName: "Conta 1",
        active: true
      }
    ],
    campaigns: [] as Array<Record<string, unknown>>,
    adSets: [] as Array<Record<string, unknown>>,
    ads: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>,
    integrationLogs: [] as Array<Record<string, unknown>>,
    diagnosticEvents: [] as Array<Record<string, unknown>>,
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
    metaReportingAccount: {
      findMany: vi.fn(async () => db.reportingAccounts),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const account = db.reportingAccounts.find((item) => item.id === where.id);
        return { ...account, ...data };
      })
    },
    metaCampaign: {
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const record = { ...create, ...update };
        db.campaigns.push(record);
        return record;
      }),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.campaigns.filter((campaign) => matchesWhere(campaign, args?.where))
      ),
      findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.campaigns.find((campaign) => matchesWhere(campaign, args?.where)) ??
        null
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const records = db.campaigns.filter((campaign) =>
          matchesWhere(campaign, where)
        );
        records.forEach((record) => Object.assign(record, data));
        return { count: records.length };
      })
    },
    metaAdSet: {
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const record = { ...create, ...update };
        db.adSets.push(record);
        return record;
      }),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.adSets.filter((adSet) => matchesWhere(adSet, args?.where))
      ),
      findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.adSets.find((adSet) => matchesWhere(adSet, args?.where)) ?? null
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const records = db.adSets.filter((adSet) => matchesWhere(adSet, where));
        records.forEach((record) => Object.assign(record, data));
        return { count: records.length };
      })
    },
    metaAd: {
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const record = { ...create, ...update };
        db.ads.push(record);
        return record;
      }),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.ads.filter((ad) => matchesWhere(ad, args?.where))
      ),
      findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.ads.find((ad) => matchesWhere(ad, args?.where)) ?? null
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const records = db.ads.filter((ad) => matchesWhere(ad, where));
        records.forEach((record) => Object.assign(record, data));
        return { count: records.length };
      })
    },
    conversionEventLog: {
      findMany: vi.fn(async () => db.conversionLogs)
    },
    lead: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.leads.filter((lead) => matchesWhere(lead, args?.where))
      )
    },
    integrationLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `integration_${db.integrationLogs.length + 1}`,
          ...data
        };
        db.integrationLogs.push(log);
        return log;
      })
    },
    diagnosticEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const event = {
          id: `diagnostic_${db.diagnosticEvents.length + 1}`,
          ...data
        };
        db.diagnosticEvents.push(event);
        return event;
      })
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `audit_${db.auditLogs.length + 1}`,
          ...data
        };
        db.auditLogs.push(log);
        return log;
      })
    }
  };
  const encryption = {
    decrypt: vi.fn(() => "EAAB-secret-token")
  };
  const metaAdapter = {
    listCampaigns: vi.fn(async (_input?: { adAccountId?: string }) => [
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
        effectiveStatus: "ACTIVE",
        destinationType: "WHATSAPP"
      }
    ]),
    listAds: vi.fn(async () => [
      {
        id: "ad_1",
        name: "Criativo WhatsApp",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        creativeId: "creative_1",
        callToActionType: "WHATSAPP_MESSAGE" as string | null
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
    ]),
    listAdSetInsights: vi.fn(async () => [
      {
        adSetId: "adset_1",
        campaignId: "cmp_1",
        spendCents: 60000,
        impressions: 5000,
        clicks: 210,
        metaConversationsStarted: 80
      }
    ]),
    listAdInsights: vi.fn(async () => [
      {
        adId: "ad_1",
        adSetId: "adset_1",
        campaignId: "cmp_1",
        spendCents: 30000,
        impressions: 2500,
        clicks: 105,
        metaConversationsStarted: 40
      }
    ])
  };
  const service = new MetaReportingService(
    prisma as never,
    encryption as never,
    metaAdapter as never,
    new WhatsappCampaignClassifierService()
  );

  return { db, encryption, metaAdapter, prisma, service };
}

describe("meta reporting service", () => {
  it("saves a manual include override for campaign snapshots and records audit log", async () => {
    const { db, prisma, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      whatsappClassification: "not_whatsapp",
      classificationOverride: null,
      classificationSource: "children:no_signal"
    });

    await expect(
      service.saveWhatsappClassificationOverride({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "campaign",
        id: "cmp_1",
        override: "manual_include"
      })
    ).resolves.toEqual({ ok: true });

    expect(prisma.metaCampaign.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", campaignId: "cmp_1" },
      data: {
        classificationOverride: "manual_include",
        whatsappClassification: "manual_include",
        classificationSource: "manual"
      }
    });
    expect(db.campaigns[0]).toMatchObject({
      classificationOverride: "manual_include",
      whatsappClassification: "manual_include",
      classificationSource: "manual"
    });
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "meta.whatsapp_classification.override_updated",
        targetType: "campaign",
        targetId: "cmp_1",
        resultStatus: "success",
        afterSummary: { override: "manual_include" }
      })
    );
  });

  it("saves manual excludes for ad set and ad snapshots", async () => {
    const { db, prisma, service } = createHarness();
    db.adSets.push({
      workspaceId: "workspace_1",
      adSetId: "adset_1",
      whatsappClassification: "auto_whatsapp"
    });
    db.ads.push({
      workspaceId: "workspace_1",
      adId: "ad_1",
      whatsappClassification: "creative_whatsapp"
    });

    await service.saveWhatsappClassificationOverride({
      workspaceId: "workspace_1",
      actorUserId: null,
      level: "adset",
      id: "adset_1",
      override: "manual_exclude"
    });
    await service.saveWhatsappClassificationOverride({
      workspaceId: "workspace_1",
      actorUserId: null,
      level: "ad",
      id: "ad_1",
      override: "manual_exclude"
    });

    expect(prisma.metaAdSet.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", adSetId: "adset_1" },
      data: {
        classificationOverride: "manual_exclude",
        whatsappClassification: "manual_exclude",
        classificationSource: "manual"
      }
    });
    expect(prisma.metaAd.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", adId: "ad_1" },
      data: {
        classificationOverride: "manual_exclude",
        whatsappClassification: "manual_exclude",
        classificationSource: "manual"
      }
    });
    expect(db.adSets[0]).toMatchObject({
      classificationOverride: "manual_exclude",
      whatsappClassification: "manual_exclude"
    });
    expect(db.ads[0]).toMatchObject({
      classificationOverride: "manual_exclude",
      whatsappClassification: "manual_exclude"
    });
    expect(db.auditLogs).toHaveLength(2);
  });

  it("resets ad manual overrides by recomputing stored WhatsApp signals", async () => {
    const { db, prisma, service } = createHarness();
    db.ads.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      destinationType: null,
      callToActionType: "WHATSAPP_MESSAGE",
      whatsappClassification: "manual_include",
      classificationOverride: "manual_include",
      classificationSource: "manual"
    });

    await service.saveWhatsappClassificationOverride({
      workspaceId: "workspace_1",
      actorUserId: "user_1",
      level: "ad",
      id: "ad_1",
      override: null
    });

    expect(prisma.metaAd.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", adId: "ad_1" },
      data: {
        classificationOverride: null,
        whatsappClassification: "creative_whatsapp",
        classificationSource: "auto_reset:call_to_action:WHATSAPP_MESSAGE"
      }
    });
    expect(db.ads[0]).toMatchObject({
      classificationOverride: null,
      whatsappClassification: "creative_whatsapp",
      classificationSource: "auto_reset:call_to_action:WHATSAPP_MESSAGE"
    });
    expect(db.auditLogs[0]).toMatchObject({
      afterSummary: { override: null }
    });
  });

  it("resets campaign manual overrides from child snapshot classifications", async () => {
    const { db, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      whatsappClassification: "manual_exclude",
      classificationOverride: "manual_exclude",
      classificationSource: "manual"
    });
    db.adSets.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      whatsappClassification: "auto_whatsapp"
    });

    await service.saveWhatsappClassificationOverride({
      workspaceId: "workspace_1",
      actorUserId: "user_1",
      level: "campaign",
      id: "cmp_1",
      override: null
    });

    expect(db.campaigns[0]).toMatchObject({
      classificationOverride: null,
      whatsappClassification: "auto_whatsapp",
      classificationSource: "auto_reset:children"
    });
  });

  it("does not audit success when override target does not exist in workspace", async () => {
    const { db, prisma, service } = createHarness();

    await expect(
      service.saveWhatsappClassificationOverride({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "campaign",
        id: "cmp_missing",
        override: "manual_include"
      })
    ).rejects.toThrow("Classificacao Meta nao encontrada");

    expect(prisma.metaCampaign.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", campaignId: "cmp_missing" },
      data: {
        classificationOverride: "manual_include",
        whatsappClassification: "manual_include",
        classificationSource: "manual"
      }
    });
    expect(db.auditLogs).toHaveLength(0);
  });

  it("syncs active Meta reporting account campaigns, ad sets and ads into workspace snapshots", async () => {
    const { db, encryption, metaAdapter, prisma, service } = createHarness();

    await expect(
      service.syncWorkspaceMetaStructure({
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      accountsSynced: 1,
      accountsFailed: 0,
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1
    });

    expect(encryption.decrypt).toHaveBeenCalled();
    expect(prisma.metaReportingAccount.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", active: true }
    });
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
    expect(metaAdapter.listAdSetInsights).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123",
      since: "2026-07-01",
      until: "2026-07-02"
    });
    expect(metaAdapter.listAdInsights).toHaveBeenCalledWith({
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
      metaConversationsStarted: 176,
      businessId: "business_1",
      whatsappClassification: "auto_whatsapp"
    });
    expect(db.adSets[0]).toMatchObject({
      adSetId: "adset_1",
      spendCents: 60000,
      metaConversationsStarted: 80,
      businessId: "business_1",
      adAccountId: "act_123",
      destinationType: "WHATSAPP",
      whatsappClassification: "auto_whatsapp"
    });
    expect(db.ads[0]).toMatchObject({
      adId: "ad_1",
      spendCents: 30000,
      metaConversationsStarted: 40,
      businessId: "business_1",
      adAccountId: "act_123",
      creativeId: "creative_1",
      callToActionType: "WHATSAPP_MESSAGE",
      whatsappClassification: "auto_whatsapp"
    });
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        operation: "meta.reporting.sync",
        status: "success",
        providerRequestId: null
      })
    );
    expect(db.integrationLogs[0].requestSummary).toMatchObject({
      since: "2026-07-01",
      until: "2026-07-02"
    });
    expect(db.integrationLogs[0].responseSummary).toMatchObject({
      accountsSynced: 1,
      accountsFailed: 0,
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1
    });
    expect(db.diagnosticEvents).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        eventType: "meta.reporting.sync",
        severity: "info",
        status: "success",
        integrationLogId: "integration_1"
      })
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain("EAAB-secret-token");
    expect(JSON.stringify(db.diagnosticEvents)).not.toContain("EAAB-secret-token");
  });

  it("syncs every active Meta reporting account and isolates failed accounts", async () => {
    const { service, prisma, metaAdapter } = createHarness();
    prisma.metaReportingAccount.findMany.mockResolvedValue([
      {
        id: "reporting_1",
        workspaceId: "workspace_1",
        businessId: "business_1",
        businessName: "BM 1",
        adAccountId: "act_1",
        adAccountName: "Conta 1",
        active: true
      },
      {
        id: "reporting_2",
        workspaceId: "workspace_1",
        businessId: "business_2",
        businessName: "BM 2",
        adAccountId: "act_2",
        adAccountName: "Conta 2",
        active: true
      }
    ]);
    metaAdapter.listCampaigns.mockImplementation(async (input) => {
      if (input?.adAccountId === "act_2") {
        throw new Error("Meta account unavailable");
      }
      return [
        {
          id: "cmp_1",
          name: "Campanha",
          status: "ACTIVE",
          effectiveStatus: "ACTIVE",
          objective: "OUTCOME_LEADS"
        }
      ];
    });

    const result = await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-09"
    });

    expect(result.accountsSynced).toBe(1);
    expect(result.accountsFailed).toBe(1);
    expect(prisma.metaReportingAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reporting_2" },
        data: expect.objectContaining({ syncStatus: "error" })
      })
    );
  });

  it("throws and records error diagnostics when every Meta reporting account sync fails", async () => {
    const { db, metaAdapter, prisma, service } = createHarness();
    metaAdapter.listCampaigns.mockRejectedValueOnce(
      new Error("Meta API unavailable")
    );

    await expect(
      service.syncWorkspaceMetaStructure({
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02"
      })
    ).rejects.toThrow("Todas as contas Meta falharam na sincronizacao");

    expect(prisma.metaReportingAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reporting_1" },
        data: expect.objectContaining({
          syncStatus: "error",
          syncError: "Meta API unavailable"
        })
      })
    );

    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        operation: "meta.reporting.sync",
        status: "error",
        providerRequestId: null,
        providerErrorMessage: "Todas as contas Meta falharam na sincronizacao"
      })
    );
    expect(db.integrationLogs[0].responseSummary).toMatchObject({
      accountsSynced: 0,
      accountsFailed: 1,
      campaignsSynced: 0,
      adSetsSynced: 0,
      adsSynced: 0
    });
    expect(db.diagnosticEvents).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        eventType: "meta.reporting.sync",
        severity: "error",
        status: "error",
        integrationLogId: "integration_1",
        errorCode: "MetaReportingSyncError"
      })
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain("EAAB-secret-token");
    expect(JSON.stringify(db.diagnosticEvents)).not.toContain("EAAB-secret-token");
  });

  it("classifies ads by inherited WhatsApp destination type when CTA is absent", async () => {
    const { db, metaAdapter, service } = createHarness();
    metaAdapter.listAds.mockResolvedValueOnce([
      {
        id: "ad_1",
        name: "Criativo sem CTA",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        creativeId: "creative_1",
        callToActionType: null
      }
    ]);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    expect(db.ads[0]).toMatchObject({
      adId: "ad_1",
      destinationType: "WHATSAPP",
      callToActionType: null,
      whatsappClassification: "auto_whatsapp",
      classificationSource: "destination_type:WHATSAPP"
    });
  });

  it("preserves manual classification overrides during Meta structure sync", async () => {
    const { prisma, service } = createHarness();
    prisma.metaAdSet.findMany.mockResolvedValueOnce([
      {
        adSetId: "adset_1",
        classificationOverride: "manual_exclude",
        whatsappClassification: "manual_exclude"
      }
    ]);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02"
    });

    expect(prisma.metaAdSet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          whatsappClassification: "manual_exclude",
          classificationSource: "manual"
        })
      })
    );
    expect(prisma.metaAdSet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          classificationOverride: null
        })
      })
    );
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
          businessId: "business_1",
          adAccountId: "act_123",
          whatsappClassification: "auto_whatsapp",
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

  it("defaults campaign reports to WhatsApp-classified snapshots", async () => {
    const { db, service } = createHarness();

    db.campaigns.push(
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_whatsapp",
        name: "Campanha WhatsApp",
        status: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "manual_include",
        spendCents: 10000,
        metaConversationsStarted: 2
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_not_whatsapp",
        name: "Campanha Trafego",
        status: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "not_whatsapp",
        spendCents: 20000,
        metaConversationsStarted: 0
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_manual_exclude",
        name: "Campanha Excluida",
        status: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "manual_exclude",
        spendCents: 30000,
        metaConversationsStarted: 0
      }
    );

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias"
    });

    expect(report.campaigns.map((campaign) => campaign.id)).toEqual([
      "cmp_whatsapp"
    ]);
    expect(report.campaigns[0]).toMatchObject({
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "manual_include"
    });
  });

  it("defaults ad set and ad reports to WhatsApp-classified snapshots", async () => {
    const { db, service } = createHarness();

    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      name: "Campanha WhatsApp",
      status: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "auto_whatsapp",
      spendCents: 0,
      metaConversationsStarted: 0
    });
    db.adSets.push(
      {
        workspaceId: "workspace_1",
        adSetId: "adset_whatsapp",
        campaignId: "cmp_1",
        name: "Conjunto WhatsApp",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "creative_whatsapp",
        spendCents: 10000,
        metaConversationsStarted: 3
      },
      {
        workspaceId: "workspace_1",
        adSetId: "adset_not_whatsapp",
        campaignId: "cmp_1",
        name: "Conjunto Trafego",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "not_whatsapp",
        spendCents: 20000,
        metaConversationsStarted: 0
      },
      {
        workspaceId: "workspace_1",
        adSetId: "adset_manual_exclude",
        campaignId: "cmp_1",
        name: "Conjunto Excluido",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "manual_exclude",
        spendCents: 30000,
        metaConversationsStarted: 0
      }
    );
    db.ads.push(
      {
        workspaceId: "workspace_1",
        adId: "ad_whatsapp",
        adSetId: "adset_whatsapp",
        campaignId: "cmp_1",
        name: "Anuncio WhatsApp",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "detected_by_leads",
        spendCents: 10000,
        metaConversationsStarted: 4
      },
      {
        workspaceId: "workspace_1",
        adId: "ad_not_whatsapp",
        adSetId: "adset_not_whatsapp",
        campaignId: "cmp_1",
        name: "Anuncio Trafego",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "not_whatsapp",
        spendCents: 20000,
        metaConversationsStarted: 0
      },
      {
        workspaceId: "workspace_1",
        adId: "ad_manual_exclude",
        adSetId: "adset_manual_exclude",
        campaignId: "cmp_1",
        name: "Anuncio Excluido",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "manual_exclude",
        spendCents: 30000,
        metaConversationsStarted: 0
      }
    );

    const [adSets, ads] = await Promise.all([
      service.getAdSetReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias"
      }),
      service.getAdReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias"
      })
    ]);

    expect(adSets.adSets.map((adSet) => adSet.id)).toEqual(["adset_whatsapp"]);
    expect(adSets.adSets[0]).toMatchObject({
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "creative_whatsapp"
    });
    expect(ads.ads.map((ad) => ad.id)).toEqual(["ad_whatsapp"]);
    expect(ads.ads[0]).toMatchObject({
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "detected_by_leads"
    });
  });

  it("keeps hierarchy names when parent classification differs from reported child", async () => {
    const { db, service } = createHarness();

    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_parent",
      name: "Campanha em Revisao",
      status: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "needs_review",
      spendCents: 0,
      metaConversationsStarted: 0
    });
    db.adSets.push({
      workspaceId: "workspace_1",
      adSetId: "adset_child",
      campaignId: "cmp_parent",
      name: "Conjunto WhatsApp",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "creative_whatsapp",
      spendCents: 10000,
      metaConversationsStarted: 3
    });
    db.ads.push({
      workspaceId: "workspace_1",
      adId: "ad_child",
      adSetId: "adset_child",
      campaignId: "cmp_parent",
      name: "Anuncio WhatsApp",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "auto_whatsapp",
      spendCents: 5000,
      metaConversationsStarted: 2
    });

    const [adSets, ads] = await Promise.all([
      service.getAdSetReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias"
      }),
      service.getAdReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias"
      })
    ]);

    expect(adSets.adSets).toHaveLength(1);
    expect(adSets.adSets[0]).toMatchObject({
      id: "adset_child",
      campaignName: "Campanha em Revisao"
    });
    expect(ads.ads).toHaveLength(1);
    expect(ads.ads[0]).toMatchObject({
      id: "ad_child",
      campaignName: "Campanha em Revisao",
      adSetName: "Conjunto WhatsApp"
    });
  });

  it("applies Meta account and classification filters to campaign reports", async () => {
    const { prisma, service } = createHarness();

    await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Todas",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "all"
    });

    expect(prisma.metaCampaign.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        businessId: "business_1",
        adAccountId: "act_123"
      },
      orderBy: { name: "asc" }
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
          businessId: "business_1",
          adAccountId: "act_123",
          whatsappClassification: "auto_whatsapp",
          spendCents: 60000,
          metaConversationsStarted: 80,
          costPerMetaConversationCents: 750,
          realConversations: 2,
          costPerRealConversationCents: 30000,
          leadSubmitted: 1,
          costPerLeadSubmittedCents: 60000,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: 60000,
          purchase: 1,
          costPerPurchaseCents: 60000,
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
          businessId: "business_1",
          adAccountId: "act_123",
          whatsappClassification: "auto_whatsapp",
          spendCents: 30000,
          metaConversationsStarted: 40,
          costPerMetaConversationCents: 750,
          realConversations: 2,
          costPerRealConversationCents: 15000,
          leadSubmitted: 1,
          costPerLeadSubmittedCents: 30000,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: 30000,
          purchase: 1,
          costPerPurchaseCents: 30000,
          roas: null
        }
      ]
    });
  });
});
