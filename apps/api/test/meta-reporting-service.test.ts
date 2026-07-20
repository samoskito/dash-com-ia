import { describe, expect, it, vi } from "vitest";
import { MetaReportingService } from "../src/reporting/meta-reporting.service";
import { ReportingMetricsEngine } from "../src/reporting/reporting-metrics.engine";
import { WhatsappCampaignClassifierService } from "../src/reporting/whatsapp-campaign-classifier.service";

function matchesWhere(
  record: Record<string, unknown>,
  where?: Record<string, unknown>,
): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, value]) => {
    if (key === "OR" && Array.isArray(value)) {
      return value.some(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          matchesWhere(record, item as Record<string, unknown>),
      );
    }

    if (key === "NOT" && value && typeof value === "object") {
      return !matchesWhere(record, value as Record<string, unknown>);
    }

    if (value && typeof value === "object" && "in" in value) {
      return (value.in as unknown[]).includes(record[key]);
    }

    if (value && typeof value === "object" && "startsWith" in value) {
      return String(record[key] ?? "").startsWith(String(value.startsWith));
    }

    if (value && typeof value === "object" && "not" in value) {
      return record[key] !== value.not;
    }

    if (value && typeof value === "object" && "gt" in value) {
      return Number(record[key]) > Number(value.gt);
    }

    if (
      value &&
      typeof value === "object" &&
      ("gte" in value || "lte" in value)
    ) {
      const current = record[key];

      if (!(current instanceof Date) && typeof current !== "string") {
        return false;
      }

      const currentTime = new Date(current).getTime();

      if ("gte" in value) {
        const minimum = value.gte;

        if (
          (!(minimum instanceof Date) && typeof minimum !== "string") ||
          currentTime < new Date(minimum).getTime()
        ) {
          return false;
        }
      }

      if ("lte" in value) {
        const maximum = value.lte;

        if (
          (!(maximum instanceof Date) && typeof maximum !== "string") ||
          currentTime > new Date(maximum).getTime()
        ) {
          return false;
        }
      }

      return true;
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
      selectedAdAccountId: "act_123",
    },
    reportingAccounts: [
      {
        id: "reporting_1",
        workspaceId: "workspace_1",
        businessId: "business_1",
        businessName: "BM 1",
        adAccountId: "act_123",
        adAccountName: "Conta 1",
        businessConnectionId: null,
        active: true,
      },
    ] as Array<{
      id: string;
      workspaceId: string;
      businessId: string;
      businessName: string;
      adAccountId: string;
      adAccountName: string;
      businessConnectionId?: string | null;
      active: boolean;
    }>,
    campaigns: [] as Array<Record<string, unknown>>,
    dailyInsights: [] as Array<Record<string, unknown>>,
    adSetDailyInsights: [] as Array<Record<string, unknown>>,
    adDailyInsights: [] as Array<Record<string, unknown>>,
    adSets: [] as Array<Record<string, unknown>>,
    ads: [] as Array<Record<string, unknown>>,
    conversionDestinations: [] as Array<Record<string, unknown>>,
    accountDestinations: [] as Array<Record<string, unknown>>,
    adDestinationAssignments: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>,
    integrationLogs: [] as Array<Record<string, unknown>>,
    diagnosticEvents: [] as Array<Record<string, unknown>>,
    externalIngestionRecords: [] as Array<Record<string, unknown>>,
    conversionRules: [
      {
        workspaceId: "workspace_1",
        eventName: "QualifiedLead",
        active: true,
      },
      {
        workspaceId: "workspace_1",
        eventName: "Purchase",
        active: true,
      },
    ],
    leads: [
      {
        id: "lead_1",
        workspaceId: "workspace_1",
        name: "Mariana Alves",
        phoneDisplay: "+55 11 99999-1020",
        phoneHash: "phone_a",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        firstMessageAt: new Date("2026-07-01T12:00:00.000Z"),
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
      },
      {
        id: "lead_2",
        workspaceId: "workspace_1",
        name: "Rafael Costa",
        phoneDisplay: "+55 11 99999-2030",
        phoneHash: "phone_b",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        firstMessageAt: null,
        createdAt: new Date("2026-07-02T12:00:00.000Z"),
      },
      {
        id: "lead_other",
        workspaceId: "workspace_1",
        name: "Outro Lead",
        phoneDisplay: "+55 11 99999-3040",
        phoneHash: "phone_other",
        campaignId: "cmp_other",
        adSetId: "adset_other",
        adId: "ad_other",
        firstMessageAt: new Date("2026-07-02T12:00:00.000Z"),
        createdAt: new Date("2026-07-02T12:00:00.000Z"),
      },
    ] as Array<{
      id: string;
      workspaceId: string;
      name: string | null;
      phoneDisplay: string | null;
      phoneHash: string;
      campaignId: string | null;
      adSetId: string | null;
      adId: string | null;
      firstMessageAt: Date | null;
      createdAt: Date;
    }>,
    conversionLogs: [
      {
        id: "event_lead_submitted",
        workspaceId: "workspace_1",
        phoneHash: "phone_a",
        customerIdentityKey: "phone_a",
        businessSource: "paid",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        eventName: "LeadSubmitted",
        eventOccurredAt: new Date("2026-07-01T12:05:00.000Z"),
        status: "sent",
        valueCents: null,
        currency: null,
        purchaseKind: null,
      },
      {
        id: "event_qualified",
        workspaceId: "workspace_1",
        phoneHash: "phone_a",
        customerIdentityKey: "phone_a",
        businessSource: "paid",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        eventName: "QualifiedLead",
        eventOccurredAt: new Date("2026-07-01T12:10:00.000Z"),
        status: "error",
        valueCents: null,
        currency: null,
        purchaseKind: null,
      },
      {
        id: "event_purchase",
        workspaceId: "workspace_1",
        phoneHash: "phone_a",
        customerIdentityKey: "phone_a",
        businessSource: "paid",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        eventName: "Purchase",
        eventOccurredAt: new Date("2026-07-01T12:30:00.000Z"),
        status: "sent",
        valueCents: 100000,
        currency: "BRL",
        purchaseKind: "first_purchase",
      },
    ] as Array<Record<string, unknown>>,
  };
  const prisma = {
    metaIntegration: {
      findUnique: vi.fn(async () => db.metaIntegration),
    },
    metaReportingAccount: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.reportingAccounts.filter((account) =>
          matchesWhere(account, args?.where),
        ),
      ),
      findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const account = db.reportingAccounts.find((candidate) =>
          matchesWhere(candidate, args?.where),
        );

        if (!account) {
          return null;
        }

        return {
          ...account,
          conversionDestinationId:
            (account as Record<string, unknown>).conversionDestinationId ??
            null,
          businessConnection: null,
          allowedDestinations: db.accountDestinations
            .filter(
              (record) =>
                record.workspaceId === account.workspaceId &&
                record.reportingAccountId === account.id &&
                record.active === true,
            )
            .map((record) => ({
              destination: db.conversionDestinations.find(
                (destination) =>
                  destination.id === record.conversionDestinationId,
              ),
            }))
            .filter((record) => Boolean(record.destination)),
        };
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const account = db.reportingAccounts.find(
            (item) => item.id === where.id,
          );
          return { ...account, ...data };
        },
      ),
    },
    metaBusinessConnection: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    metaConversionDestination: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.conversionDestinations.filter((destination) =>
          matchesWhere(destination, args?.where),
        ),
      ),
    },
    metaAdDestinationAssignment: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.adDestinationAssignments.filter((assignment) =>
          matchesWhere(assignment, args?.where),
        ),
      ),
      deleteMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const retained = db.adDestinationAssignments.filter(
          (assignment) => !matchesWhere(assignment, args?.where),
        );
        const count = db.adDestinationAssignments.length - retained.length;
        db.adDestinationAssignments.splice(
          0,
          db.adDestinationAssignments.length,
          ...retained,
        );
        return { count };
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = where.workspaceId_adId;
        const existing = db.adDestinationAssignments.find(
          (assignment) =>
            assignment.workspaceId === key.workspaceId &&
            assignment.adId === key.adId,
        );

        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const record = {
          id: `assignment_${db.adDestinationAssignments.length + 1}`,
          ...create,
        };
        db.adDestinationAssignments.push(record);
        return record;
      }),
    },
    metaCampaign: {
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const record = { ...create, ...update };
          db.campaigns.push(record);
          return record;
        },
      ),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.campaigns.filter((campaign) => matchesWhere(campaign, args?.where)),
      ),
      findFirst: vi.fn(
        async (args?: { where?: Record<string, unknown> }) =>
          db.campaigns.find((campaign) =>
            matchesWhere(campaign, args?.where),
          ) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const records = db.campaigns.filter((campaign) =>
            matchesWhere(campaign, where),
          );
          records.forEach((record) => Object.assign(record, data));
          return { count: records.length };
        },
      ),
    },
    metaCampaignDailyInsight: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.dailyInsights.filter((insight) =>
          matchesWhere(insight, args?.where),
        ),
      ),
      deleteMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const retained = db.dailyInsights.filter(
          (insight) => !matchesWhere(insight, args?.where),
        );
        const count = db.dailyInsights.length - retained.length;
        db.dailyInsights.splice(0, db.dailyInsights.length, ...retained);
        return { count };
      }),
      createMany: vi.fn(
        async ({ data }: { data: Array<Record<string, unknown>> }) => {
          db.dailyInsights.push(...data);
          return { count: data.length };
        },
      ),
    },
    metaAdSetDailyInsight: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.adSetDailyInsights.filter((insight) =>
          matchesWhere(insight, args?.where),
        ),
      ),
      deleteMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const retained = db.adSetDailyInsights.filter(
          (insight) => !matchesWhere(insight, args?.where),
        );
        const count = db.adSetDailyInsights.length - retained.length;
        db.adSetDailyInsights.splice(
          0,
          db.adSetDailyInsights.length,
          ...retained,
        );
        return { count };
      }),
      createMany: vi.fn(
        async ({ data }: { data: Array<Record<string, unknown>> }) => {
          db.adSetDailyInsights.push(...data);
          return { count: data.length };
        },
      ),
    },
    metaAdDailyInsight: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.adDailyInsights.filter((insight) =>
          matchesWhere(insight, args?.where),
        ),
      ),
      deleteMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const retained = db.adDailyInsights.filter(
          (insight) => !matchesWhere(insight, args?.where),
        );
        const count = db.adDailyInsights.length - retained.length;
        db.adDailyInsights.splice(0, db.adDailyInsights.length, ...retained);
        return { count };
      }),
      createMany: vi.fn(
        async ({ data }: { data: Array<Record<string, unknown>> }) => {
          db.adDailyInsights.push(...data);
          return { count: data.length };
        },
      ),
    },
    metaAdSet: {
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const record = { ...create, ...update };
          db.adSets.push(record);
          return record;
        },
      ),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.adSets.filter((adSet) => matchesWhere(adSet, args?.where)),
      ),
      findFirst: vi.fn(
        async (args?: { where?: Record<string, unknown> }) =>
          db.adSets.find((adSet) => matchesWhere(adSet, args?.where)) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const records = db.adSets.filter((adSet) =>
            matchesWhere(adSet, where),
          );
          records.forEach((record) => Object.assign(record, data));
          return { count: records.length };
        },
      ),
    },
    metaAd: {
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const record = { ...create, ...update };
          db.ads.push(record);
          return record;
        },
      ),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.ads.filter((ad) => matchesWhere(ad, args?.where)),
      ),
      findFirst: vi.fn(
        async (args?: { where?: Record<string, unknown> }) =>
          db.ads.find((ad) => matchesWhere(ad, args?.where)) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const records = db.ads.filter((ad) => matchesWhere(ad, where));
          records.forEach((record) => Object.assign(record, data));
          return { count: records.length };
        },
      ),
    },
    conversionRule: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.conversionRules.filter((rule) => matchesWhere(rule, args?.where)),
      ),
    },
    conversionEventLog: {
      findFirst: vi.fn(
        async (args?: { where?: Record<string, unknown> }) =>
          db.conversionLogs.find((log) => matchesWhere(log, args?.where)) ??
          null,
      ),
      findMany: vi.fn(
        async (args?: {
          where?: Record<string, unknown>;
          skip?: number;
          take?: number;
        }) => {
          const records = db.conversionLogs.filter((log) =>
            matchesWhere(log, args?.where),
          );
          const start = args?.skip ?? 0;
          return records.slice(
            start,
            args?.take ? start + args.take : undefined,
          );
        },
      ),
      groupBy: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const counts = new Map<string, number>();
        db.conversionLogs
          .filter((log) => matchesWhere(log, args?.where))
          .forEach((log) => {
            const status = String(log.status);
            counts.set(status, (counts.get(status) ?? 0) + 1);
          });
        return [...counts].map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const records = db.conversionLogs.filter((log) =>
            matchesWhere(log, where),
          );
          records.forEach((record) => Object.assign(record, data));
          return { count: records.length };
        },
      ),
    },
    externalIngestionRecord: {
      findFirst: vi.fn(
        async (args?: { where?: Record<string, unknown> }) =>
          db.externalIngestionRecords.find((record) =>
            matchesWhere(record, args?.where),
          ) ?? null,
      ),
    },
    lead: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        db.leads.filter((lead) => matchesWhere(lead, args?.where)),
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const records = db.leads.filter((lead) => matchesWhere(lead, where));
          records.forEach((record) => Object.assign(record, data));
          return { count: records.length };
        },
      ),
    },
    integrationLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `integration_${db.integrationLogs.length + 1}`,
          ...data,
        };
        db.integrationLogs.push(log);
        return log;
      }),
    },
    diagnosticEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const event = {
          id: `diagnostic_${db.diagnosticEvents.length + 1}`,
          ...data,
        };
        db.diagnosticEvents.push(event);
        return event;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `audit_${db.auditLogs.length + 1}`,
          ...data,
        };
        db.auditLogs.push(log);
        return log;
      }),
    },
  };
  const encryption = {
    decrypt: vi.fn(() => "EAAB-secret-token"),
    fingerprint: vi.fn((accessToken: string) => `fingerprint:${accessToken}`),
  };
  const metaAdapter = {
    listCampaigns: vi.fn(async (_input?: { adAccountId?: string }) => [
      {
        id: "cmp_1",
        name: "Black Friday WhatsApp",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        objective: "OUTCOME_SALES",
        dailyBudgetCents: 49500,
        lifetimeBudgetCents: null,
      },
    ]),
    listAdSets: vi.fn(async () => [
      {
        id: "adset_1",
        name: "Publico quente",
        campaignId: "cmp_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        destinationType: "WHATSAPP" as string | null,
        dailyBudgetCents: null,
        lifetimeBudgetCents: null,
      },
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
        thumbnailUrl: "https://example.com/ad-1.jpg" as string | null,
        previewUrl: "https://example.com/ad-1-high.jpg" as string | null,
        callToActionType: "WHATSAPP_MESSAGE" as string | null,
        detectedPixelIds: [] as string[],
        detectedPageIds: [] as string[],
      },
    ]),
    listCampaignInsights: vi.fn(
      async (_input: {
        accessToken?: string;
        adAccountId?: string;
        since?: string;
        until?: string;
        readMode?: "legacy" | "manual";
      }) => [
        {
          campaignId: "cmp_1",
          spendCents: 120000,
          impressions: 10000,
          clicks: 420,
          metaConversationsStarted: 176,
        },
      ],
    ),
    listCampaignDailyInsights: vi.fn(async () => [
      {
        campaignId: "cmp_1",
        date: "2026-07-01",
        spendCents: 70000,
        impressions: 6000,
        clicks: 250,
        metaConversationsStarted: 100,
      },
      {
        campaignId: "cmp_1",
        date: "2026-07-02",
        spendCents: 50000,
        impressions: 4000,
        clicks: 170,
        metaConversationsStarted: 76,
      },
    ]),
    listAdSetInsights: vi.fn(
      async (_input: {
        accessToken?: string;
        adAccountId?: string;
        since?: string;
        until?: string;
        readMode?: "legacy" | "manual";
      }) => [
        {
          adSetId: "adset_1",
          campaignId: "cmp_1",
          spendCents: 60000,
          impressions: 5000,
          clicks: 210,
          metaConversationsStarted: 80,
        },
      ],
    ),
    listAdSetDailyInsights: vi.fn(async () => [
      {
        adSetId: "adset_1",
        campaignId: "cmp_1",
        date: "2026-07-01",
        spendCents: 35000,
        impressions: 3000,
        clicks: 125,
        metaConversationsStarted: 45,
      },
      {
        adSetId: "adset_1",
        campaignId: "cmp_1",
        date: "2026-07-02",
        spendCents: 25000,
        impressions: 2000,
        clicks: 85,
        metaConversationsStarted: 35,
      },
    ]),
    listAdInsights: vi.fn(
      async (_input: {
        accessToken?: string;
        adAccountId?: string;
        since?: string;
        until?: string;
        readMode?: "legacy" | "manual";
      }) => [
        {
          adId: "ad_1",
          adSetId: "adset_1",
          campaignId: "cmp_1",
          spendCents: 30000,
          impressions: 2500,
          clicks: 105,
          metaConversationsStarted: 40,
        },
      ],
    ),
    listAdDailyInsights: vi.fn(async () => [
      {
        adId: "ad_1",
        adSetId: "adset_1",
        campaignId: "cmp_1",
        date: "2026-07-01",
        spendCents: 17500,
        impressions: 1500,
        clicks: 65,
        metaConversationsStarted: 22,
      },
      {
        adId: "ad_1",
        adSetId: "adset_1",
        campaignId: "cmp_1",
        date: "2026-07-02",
        spendCents: 12500,
        impressions: 1000,
        clicks: 40,
        metaConversationsStarted: 18,
      },
    ]),
    updateEntityStatus: vi.fn(async () => undefined),
    updateEntityBudget: vi.fn(async () => undefined),
  };
  const connectionResolver = {
    resolveReportingRoute: vi.fn(async () => ({
      source: "manual" as const,
      workspaceId: "workspace_1",
      accessToken: "EAAB-manual-exact-token",
      reportingAccountId: "reporting_1",
      adAccountId: "act_123",
      businessConnectionId: "connection_1",
      credentialId: "credential_1",
    })),
    getLegacyCompatibilityProjection: vi.fn(async () => ({
      source: "legacy_oauth" as const,
      workspaceId: "workspace_1",
      businessId: "business_1",
      adAccountId: "act_123",
      pixelId: "pixel_1",
      destinationPixelId: "pixel_1",
      destinationPageId: "page_1",
      credentialFingerprint: "fingerprint:EAAB-secret-token",
    })),
  };
  const service = new MetaReportingService(
    prisma as never,
    encryption as never,
    metaAdapter as never,
    new WhatsappCampaignClassifierService(),
    new ReportingMetricsEngine(),
    {
      getConfiguration: vi.fn(async () => ({
        stages: [
          {
            eventName: "LeadSubmitted",
            label: "Conversas reais iniciadas",
            position: 1,
            visible: true,
          },
          {
            eventName: "QualifiedLead",
            label: "Lead qualificado",
            position: 2,
            visible: true,
          },
          {
            eventName: "Purchase",
            label: "Compras",
            position: 3,
            visible: true,
          },
        ],
      })),
    } as never,
    connectionResolver as never,
  );

  return {
    db,
    encryption,
    metaAdapter,
    prisma,
    service,
    connectionResolver,
  };
}

describe("meta reporting service", () => {
  it("updates a Meta entity status only when the local snapshot still matches", async () => {
    const { db, metaAdapter, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignId: "cmp_1",
      status: "ACTIVE",
    });

    await expect(
      service.updateMetaEntityStatus({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "campaign",
        id: "cmp_1",
        expectedStatus: "ACTIVE",
        targetStatus: "PAUSED",
      }),
    ).resolves.toEqual({ ok: true, level: "campaign", id: "cmp_1" });

    expect(metaAdapter.updateEntityStatus).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      id: "cmp_1",
      status: "PAUSED",
    });
    expect(db.campaigns[0]?.status).toBe("PAUSED");
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        action: "meta.entity.status_updated",
        resultStatus: "success",
        targetId: "cmp_1",
      }),
    );

    await expect(
      service.updateMetaEntityStatus({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "campaign",
        id: "cmp_1",
        expectedStatus: "ACTIVE",
        targetStatus: "PAUSED",
      }),
    ).rejects.toThrow("O status mudou");
    expect(metaAdapter.updateEntityStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps the local snapshot unchanged when Meta rejects a status update", async () => {
    const { db, metaAdapter, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignId: "cmp_1",
      status: "ACTIVE",
    });
    metaAdapter.updateEntityStatus.mockRejectedValueOnce(
      new Error("Graph permission denied"),
    );

    await expect(
      service.updateMetaEntityStatus({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "campaign",
        id: "cmp_1",
        expectedStatus: "ACTIVE",
        targetStatus: "PAUSED",
      }),
    ).rejects.toThrow("A Meta nao confirmou");

    expect(db.campaigns[0]?.status).toBe("ACTIVE");
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        action: "meta.entity.status_updated",
        resultStatus: "failed",
        targetId: "cmp_1",
      }),
    );
  });

  it("does not report a false mutation failure when only audit persistence fails", async () => {
    const { db, prisma, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignId: "cmp_1",
      status: "ACTIVE",
    });
    prisma.auditLog.create.mockRejectedValueOnce(
      new Error("Audit storage unavailable"),
    );

    await expect(
      service.updateMetaEntityStatus({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "campaign",
        id: "cmp_1",
        expectedStatus: "ACTIVE",
        targetStatus: "PAUSED",
      }),
    ).resolves.toEqual({ ok: true, level: "campaign", id: "cmp_1" });

    expect(db.campaigns[0]?.status).toBe("PAUSED");
  });

  it("updates ABO ad set budgets and blocks ad set writes for CBO campaigns", async () => {
    const { db, metaAdapter, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignId: "cmp_1",
      dailyBudgetCents: null,
      lifetimeBudgetCents: null,
    });
    db.adSets.push({
      workspaceId: "workspace_1",
      adAccountId: "act_123",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      dailyBudgetCents: 50000,
      lifetimeBudgetCents: null,
    });

    await expect(
      service.updateMetaEntityBudget({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "adset",
        id: "adset_1",
        budgetType: "daily",
        expectedBudgetCents: 50000,
        budgetCents: 65000,
      }),
    ).resolves.toEqual({ ok: true, level: "adset", id: "adset_1" });
    expect(metaAdapter.updateEntityBudget).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      id: "adset_1",
      budgetType: "daily",
      budgetCents: 65000,
    });
    expect(db.adSets[0]?.dailyBudgetCents).toBe(65000);

    db.campaigns[0]!.dailyBudgetCents = 100000;

    await expect(
      service.updateMetaEntityBudget({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "adset",
        id: "adset_1",
        budgetType: "daily",
        expectedBudgetCents: 65000,
        budgetCents: 70000,
      }),
    ).rejects.toThrow("controlado pela campanha");
    expect(metaAdapter.updateEntityBudget).toHaveBeenCalledTimes(1);
  });

  it("saves a manual include override for campaign snapshots and records audit log", async () => {
    const { db, prisma, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      whatsappClassification: "not_whatsapp",
      classificationOverride: null,
      classificationSource: "children:no_signal",
    });

    await expect(
      service.saveWhatsappClassificationOverride({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        level: "campaign",
        id: "cmp_1",
        override: "manual_include",
      }),
    ).resolves.toEqual({
      ok: true,
      whatsappClassification: "manual_include",
    });

    expect(prisma.metaCampaign.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", campaignId: "cmp_1" },
      data: {
        classificationOverride: "manual_include",
        whatsappClassification: "manual_include",
        classificationSource: "manual",
      },
    });
    expect(db.campaigns[0]).toMatchObject({
      classificationOverride: "manual_include",
      whatsappClassification: "manual_include",
      classificationSource: "manual",
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
        afterSummary: { override: "manual_include" },
      }),
    );
  });

  it("returns latest conversion event audit rows for the report period", async () => {
    const { db, prisma, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      name: "Campanha WhatsApp",
    });
    db.adSets.push({
      workspaceId: "workspace_1",
      adSetId: "adset_1",
      name: "Conjunto aberto",
    });
    db.ads.push({
      workspaceId: "workspace_1",
      adId: "ad_1",
      name: "Anuncio 1",
    });
    db.conversionLogs = [
      {
        id: "conversion_1",
        workspaceId: "workspace_1",
        eventName: "LeadSubmitted",
        eventOccurredAt: new Date("2026-07-02T12:00:00.000Z"),
        sentAt: new Date("2026-07-02T12:01:00.000Z"),
        status: "sent",
        sourceTrigger: "external_mysql:kinbox_mysql",
        leadId: "lead_1",
        phoneHash: "phone_a",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        pixelId: "pixel_1",
        pageId: "page_1",
        providerResponseSummary: "events_received: 1",
        errorCode: null,
        errorMessage: null,
        valueSource: null,
      },
      {
        id: "conversion_2",
        workspaceId: "workspace_1",
        eventName: "CustomEvent",
        eventOccurredAt: new Date("2026-07-01T12:00:00.000Z"),
        sentAt: null,
        status: "pending_value",
        sourceTrigger: "keyword",
        leadId: null,
        phoneHash: null,
        campaignId: null,
        adSetId: null,
        adId: null,
        pixelId: null,
        pageId: null,
        providerResponseSummary: null,
        errorCode: "EventValueMissing",
        errorMessage: "Conversion event value is required",
        valueSource: null,
      },
    ];

    const result = await service.getConversionEventAudit({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      rangeLabel: "2026-07-01 a 2026-07-02",
      page: 1,
      pageSize: 25,
    });

    expect(result).toEqual({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      summary: {
        total: 2,
        sent: 1,
        queued: 0,
        blocked: 1,
        failed: 0,
        notEligible: 0,
        shadowObserved: 0,
        historical: 0,
        discarded: 0,
      },
      pagination: {
        page: 1,
        pageSize: 25,
        totalItems: 2,
        totalPages: 1,
      },
      events: [
        {
          id: "conversion_1",
          eventName: "LeadSubmitted",
          eventLabel: "Conversas reais iniciadas",
          deliveryState: "sent",
          statusLabel: "Enviado",
          statusDetail: "Recebido pela Meta",
          source: "external_integration",
          sourceLabel: "Integracao externa",
          leadId: "lead_1",
          leadName: "Mariana Alves",
          phoneDisplay: "+55 11 99999-1020",
          campaignId: "cmp_1",
          campaignName: "Campanha WhatsApp",
          adSetId: "adset_1",
          adSetName: "Conjunto aberto",
          adId: "ad_1",
          adName: "Anuncio 1",
          pixelId: "pixel_1",
          pageId: "page_1",
          occurredAt: "2026-07-02T12:00:00.000Z",
          sentAt: "2026-07-02T12:01:00.000Z",
          status: "sent",
          canRetry: false,
          providerResponseSummary: "Meta confirmou o recebimento",
          errorCode: null,
          errorMessage: null,
          valueSource: null,
        },
        {
          id: "conversion_2",
          eventName: "CustomEvent",
          eventLabel: "CustomEvent",
          deliveryState: "blocked",
          statusLabel: "Bloqueado",
          statusDetail: "Aguardando valor do evento",
          source: "whatsapp_automation",
          sourceLabel: "Automacao do WhatsApp",
          leadId: null,
          leadName: null,
          phoneDisplay: null,
          campaignId: null,
          campaignName: null,
          adSetId: null,
          adSetName: null,
          adId: null,
          adName: null,
          pixelId: null,
          pageId: null,
          occurredAt: "2026-07-01T12:00:00.000Z",
          sentAt: null,
          status: "pending_value",
          canRetry: false,
          providerResponseSummary: null,
          errorCode: "EventValueMissing",
          errorMessage: "Valor do evento nao configurado",
          valueSource: null,
        },
      ],
    });

    expect(prisma.conversionEventLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace_1",
          eventOccurredAt: {
            gte: new Date("2026-07-01T03:00:00.000Z"),
            lte: new Date("2026-07-03T02:59:59.999Z"),
          },
        },
        skip: 0,
        take: 25,
      }),
    );
  });

  it("reports external events without click context as not eligible", async () => {
    const { db, service } = createHarness();
    db.conversionLogs = [
      {
        id: "conversion_without_click",
        workspaceId: "workspace_1",
        eventName: "QualifiedLead",
        eventOccurredAt: new Date("2026-07-02T12:00:00.000Z"),
        sentAt: null,
        status: "not_eligible",
        sourceTrigger: "external_mysql:kinbox_mysql",
        leadId: null,
        phoneHash: "phone_without_click",
        campaignId: null,
        adSetId: null,
        adId: null,
        pixelId: null,
        pageId: null,
        providerResponseSummary: null,
        errorCode: null,
        errorMessage: null,
        valueSource: null,
      },
    ];

    const result = await service.getConversionEventAudit({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      rangeLabel: "2026-07-01 a 2026-07-02",
      deliveryState: "not_eligible",
      page: 1,
      pageSize: 25,
    });

    expect(result.summary).toEqual({
      total: 1,
      sent: 0,
      queued: 0,
      blocked: 0,
      failed: 0,
      notEligible: 1,
      shadowObserved: 0,
      historical: 0,
      discarded: 0,
    });
    expect(result.events[0]).toMatchObject({
      id: "conversion_without_click",
      deliveryState: "not_eligible",
      statusLabel: "Nao elegivel",
      statusDetail:
        "Campos obrigatorios ausentes: anuncio de origem, identificador de clique",
      errorCode: "MissingAdId",
      errorMessage: "Anuncio de origem nao identificado",
    });
  });

  it("returns stored source, request, and Meta response for one workspace event", async () => {
    const { db, prisma, service } = createHarness();
    db.conversionLogs = [
      {
        id: "conversion_detail_1",
        workspaceId: "workspace_1",
        eventName: "QualifiedLead",
        eventOccurredAt: new Date("2026-07-02T12:00:00.000Z"),
        sentAt: new Date("2026-07-02T12:01:00.000Z"),
        status: "sent",
        sourceTrigger: "external_mysql:kinbox_mysql",
        sourceEventId: "external_101",
        eventId: "qualified_ctwa_1",
        dedupeKey: "qualified_ctwa_1",
        leadId: "lead_1",
        phoneHash: "phone_a",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        ctwaClid: "ctwa_1",
        pixelId: "pixel_1",
        pageId: "page_1",
        valueCents: null,
        valueSource: null,
        currency: null,
        contentName: null,
        customData: null,
        sourcePayload: {
          schema: "external_event_row_v1",
          externalRowId: "101",
          phone: "***1020",
        },
        providerRequestPayload: {
          data: [{ event_name: "QualifiedLead" }],
          access_token: "must-not-leak",
        },
        providerResponseSummary: {
          events_received: 1,
          access_token: "must-not-leak",
        },
        errorCode: null,
        errorMessage: null,
      },
    ];

    const result = await service.getConversionEventAuditDetail({
      workspaceId: "workspace_1",
      eventId: "conversion_detail_1",
    });

    expect(result).toMatchObject({
      id: "conversion_detail_1",
      reason: null,
      missingFields: [],
      sourceSnapshot: {
        mode: "stored_normalized",
        payload: {
          externalRowId: "101",
          phone: "***1020",
        },
      },
      metaRequest: {
        mode: "stored",
        payload: {
          access_token: "[redacted]",
        },
      },
      metaResponse: {
        mode: "stored",
        payload: {
          events_received: 1,
          access_token: "[redacted]",
        },
      },
    });
    expect(prisma.conversionEventLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "conversion_detail_1",
          workspaceId: "workspace_1",
        },
      }),
    );
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("labels historical summaries and reconstructed Meta requests honestly", async () => {
    const { db, service } = createHarness();
    db.conversionLogs = [
      {
        id: "conversion_historical_1",
        workspaceId: "workspace_1",
        eventName: "LeadSubmitted",
        eventOccurredAt: new Date("2026-07-02T12:00:00.000Z"),
        sentAt: new Date("2026-07-02T12:01:00.000Z"),
        status: "sent",
        sourceTrigger: "external_mysql:kinbox_mysql",
        sourceEventId: "external_100",
        eventId: "lead_wamid_1",
        dedupeKey: "lead_wamid_1",
        leadId: "lead_1",
        phoneHash: "phone_a",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        ctwaClid: "ctwa_1",
        pixelId: "pixel_1",
        pageId: "page_1",
        valueCents: null,
        valueSource: null,
        currency: null,
        contentName: null,
        customData: null,
        sourcePayload: null,
        providerRequestPayload: null,
        providerResponseSummary: { events_received: 1 },
        errorCode: null,
        errorMessage: null,
      },
    ];
    db.externalIngestionRecords = [
      {
        workspaceId: "workspace_1",
        conversionEventLogId: "conversion_historical_1",
        summaryPayload: {
          sourceEventName: "LeadSubmitted",
          externalLeadId: "lead_external_1",
        },
        errorCode: null,
        errorMessage: null,
      },
    ];

    const result = await service.getConversionEventAuditDetail({
      workspaceId: "workspace_1",
      eventId: "conversion_historical_1",
    });

    expect(result.sourceSnapshot).toMatchObject({
      mode: "historical_summary",
      payload: {
        sourceEventName: "LeadSubmitted",
        externalLeadId: "lead_external_1",
      },
    });
    expect(result.metaRequest).toMatchObject({
      mode: "reconstructed",
      payload: {
        data: [
          expect.objectContaining({
            event_name: "LeadSubmitted",
            event_id: "lead_wamid_1",
          }),
        ],
      },
    });
  });

  it("separates pre-cutover shadow evidence from the delivery queue", async () => {
    const { db, service } = createHarness();
    db.conversionLogs = [
      {
        id: "conversion_shadow_1",
        workspaceId: "workspace_1",
        eventName: "LeadSubmitted",
        eventOccurredAt: new Date("2026-07-02T12:00:00.000Z"),
        sentAt: null,
        status: "shadow_observed",
        sourceTrigger: "external_mysql:kinbox_mysql",
        leadId: null,
        phoneHash: null,
        campaignId: null,
        adSetId: null,
        adId: null,
        pixelId: null,
        pageId: null,
        providerResponseSummary: null,
        errorCode: null,
        errorMessage: null,
        valueSource: null,
      },
    ];

    const result = await service.getConversionEventAudit({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
      rangeLabel: "2026-07-01 a 2026-07-02",
      deliveryState: "shadow",
      page: 1,
      pageSize: 25,
    });

    expect(result.summary).toMatchObject({
      total: 1,
      queued: 0,
      shadowObserved: 1,
    });
    expect(result.events[0]).toMatchObject({
      deliveryState: "shadow",
      statusLabel: "Observado em sombra",
      statusDetail: "Coletado antes do corte, sem envio pelo WppTrack",
    });
  });

  it("filters the conversion audit without exposing raw provider errors", async () => {
    const { db, prisma, service } = createHarness();
    db.conversionLogs = [
      {
        id: "conversion_external_error",
        workspaceId: "workspace_1",
        eventName: "Purchase",
        eventOccurredAt: new Date("2026-07-02T12:00:00.000Z"),
        sentAt: null,
        status: "error",
        sourceTrigger: "external_mysql:kinbox_mysql",
        leadId: null,
        phoneHash: null,
        campaignId: null,
        adSetId: null,
        adId: null,
        pixelId: null,
        pageId: null,
        providerResponseSummary: { access_token: "must-not-leak" },
        errorCode: "MetaCapiRejected",
        errorMessage: "raw provider payload must-not-leak",
        valueSource: null,
      },
      {
        id: "conversion_system_sent",
        workspaceId: "workspace_1",
        eventName: "Purchase",
        eventOccurredAt: new Date("2026-07-02T13:00:00.000Z"),
        sentAt: new Date("2026-07-02T13:01:00.000Z"),
        status: "sent",
        sourceTrigger: "auto_lead",
        leadId: null,
        phoneHash: null,
        campaignId: null,
        adSetId: null,
        adId: null,
        pixelId: null,
        pageId: null,
        providerResponseSummary: null,
        errorCode: null,
        errorMessage: null,
        valueSource: null,
      },
    ];

    const result = await service.getConversionEventAudit({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      since: "2026-07-01",
      until: "2026-07-02",
      eventName: "Purchase",
      deliveryState: "failed",
      source: "external_integration",
      page: 1,
      pageSize: 25,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: "conversion_external_error",
      deliveryState: "failed",
      errorMessage: "A Meta recusou o evento",
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(prisma.conversionEventLog.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: expect.objectContaining({
        eventName: "Purchase",
        status: { in: ["error"] },
        sourceTrigger: { startsWith: "external_mysql:" },
      }),
      _count: { _all: true },
    });
  });

  it("marks only Meta network failures as eligible for manual retry", async () => {
    const { db, service } = createHarness();
    db.conversionLogs = [
      {
        id: "conversion_network_error",
        workspaceId: "workspace_1",
        eventName: "LeadSubmitted",
        eventOccurredAt: new Date("2026-07-02T12:00:00.000Z"),
        sentAt: null,
        status: "error",
        sourceTrigger: "external_mysql:kinbox_mysql",
        leadId: null,
        phoneHash: "phone_hash_1",
        campaignId: null,
        adSetId: null,
        adId: "ad_1",
        pixelId: "pixel_1",
        pageId: "page_1",
        providerResponseSummary: null,
        errorCode: "MetaCapiNetworkError",
        errorMessage: "fetch failed",
        valueSource: null,
      },
    ];

    const result = await service.getConversionEventAudit({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      since: "2026-07-01",
      until: "2026-07-02",
      page: 1,
      pageSize: 25,
    });

    expect(result.events[0]).toMatchObject({
      id: "conversion_network_error",
      canRetry: true,
      errorCode: "MetaCapiNetworkError",
      errorMessage: "Falha de comunicacao com a Meta",
    });
  });

  it("saves manual excludes for ad set and ad snapshots", async () => {
    const { db, prisma, service } = createHarness();
    db.adSets.push({
      workspaceId: "workspace_1",
      adSetId: "adset_1",
      whatsappClassification: "auto_whatsapp",
    });
    db.ads.push({
      workspaceId: "workspace_1",
      adId: "ad_1",
      whatsappClassification: "creative_whatsapp",
    });

    const adSetResult = await service.saveWhatsappClassificationOverride({
      workspaceId: "workspace_1",
      actorUserId: null,
      level: "adset",
      id: "adset_1",
      override: "manual_exclude",
    });
    const adResult = await service.saveWhatsappClassificationOverride({
      workspaceId: "workspace_1",
      actorUserId: null,
      level: "ad",
      id: "ad_1",
      override: "manual_exclude",
    });

    expect(adSetResult).toEqual({
      ok: true,
      whatsappClassification: "manual_exclude",
    });
    expect(adResult).toEqual({
      ok: true,
      whatsappClassification: "manual_exclude",
    });

    expect(prisma.metaAdSet.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", adSetId: "adset_1" },
      data: {
        classificationOverride: "manual_exclude",
        whatsappClassification: "manual_exclude",
        classificationSource: "manual",
      },
    });
    expect(prisma.metaAd.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", adId: "ad_1" },
      data: {
        classificationOverride: "manual_exclude",
        whatsappClassification: "manual_exclude",
        classificationSource: "manual",
      },
    });
    expect(db.adSets[0]).toMatchObject({
      classificationOverride: "manual_exclude",
      whatsappClassification: "manual_exclude",
    });
    expect(db.ads[0]).toMatchObject({
      classificationOverride: "manual_exclude",
      whatsappClassification: "manual_exclude",
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
      classificationSource: "manual",
    });

    const result = await service.saveWhatsappClassificationOverride({
      workspaceId: "workspace_1",
      actorUserId: "user_1",
      level: "ad",
      id: "ad_1",
      override: null,
    });

    expect(result).toEqual({
      ok: true,
      whatsappClassification: "creative_whatsapp",
    });

    expect(prisma.metaAd.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", adId: "ad_1" },
      data: {
        classificationOverride: null,
        whatsappClassification: "creative_whatsapp",
        classificationSource: "auto_reset:call_to_action:WHATSAPP_MESSAGE",
      },
    });
    expect(db.ads[0]).toMatchObject({
      classificationOverride: null,
      whatsappClassification: "creative_whatsapp",
      classificationSource: "auto_reset:call_to_action:WHATSAPP_MESSAGE",
    });
    expect(db.auditLogs[0]).toMatchObject({
      afterSummary: { override: null },
    });
  });

  it("resets campaign manual overrides from child snapshot classifications", async () => {
    const { db, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      whatsappClassification: "manual_exclude",
      classificationOverride: "manual_exclude",
      classificationSource: "manual",
    });
    db.adSets.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      whatsappClassification: "auto_whatsapp",
    });

    await service.saveWhatsappClassificationOverride({
      workspaceId: "workspace_1",
      actorUserId: "user_1",
      level: "campaign",
      id: "cmp_1",
      override: null,
    });

    expect(db.campaigns[0]).toMatchObject({
      classificationOverride: null,
      whatsappClassification: "auto_whatsapp",
      classificationSource: "auto_reset:children",
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
        override: "manual_include",
      }),
    ).rejects.toThrow("Classificacao Meta nao encontrada");

    expect(prisma.metaCampaign.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", campaignId: "cmp_missing" },
      data: {
        classificationOverride: "manual_include",
        whatsappClassification: "manual_include",
        classificationSource: "manual",
      },
    });
    expect(db.auditLogs).toHaveLength(0);
  });

  it("syncs active Meta reporting account campaigns, ad sets and ads into workspace snapshots", async () => {
    const { db, encryption, metaAdapter, prisma, service } = createHarness();
    db.leads[0]!.campaignId = null;
    db.leads[0]!.adSetId = null;
    Object.assign(db.conversionLogs[0]!, {
      campaignId: null,
      adSetId: null,
    });

    await expect(
      service.syncWorkspaceMetaStructure({
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      accountsSynced: 1,
      accountsFailed: 0,
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1,
    });

    expect(encryption.decrypt).toHaveBeenCalled();
    expect(prisma.metaReportingAccount.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", active: true },
    });
    expect(prisma.metaReportingAccount.update).toHaveBeenCalledWith({
      where: { id: "reporting_1" },
      data: expect.objectContaining({
        syncStatus: "synced",
        lastSyncSince: "2026-07-01",
        lastSyncUntil: "2026-07-02",
      }),
    });
    expect(metaAdapter.listCampaigns).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123",
    });
    expect(metaAdapter.listCampaignInsights).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123",
      since: "2026-07-01",
      until: "2026-07-02",
      readMode: "legacy",
    });
    expect(metaAdapter.listAdSetInsights).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123",
      since: "2026-07-01",
      until: "2026-07-02",
      readMode: "legacy",
    });
    expect(metaAdapter.listAdInsights).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      adAccountId: "act_123",
      since: "2026-07-01",
      until: "2026-07-02",
      readMode: "legacy",
    });
    expect(prisma.metaCampaign.upsert).toHaveBeenCalled();
    expect(db.campaigns[0]).toMatchObject({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      name: "Black Friday WhatsApp",
      spendCents: 120000,
      metaConversationsStarted: 176,
      businessId: "business_1",
      dailyBudgetCents: 49500,
      lifetimeBudgetCents: null,
      whatsappClassification: "auto_whatsapp",
    });
    expect(db.adSets[0]).toMatchObject({
      adSetId: "adset_1",
      spendCents: 60000,
      metaConversationsStarted: 80,
      businessId: "business_1",
      adAccountId: "act_123",
      destinationType: "WHATSAPP",
      dailyBudgetCents: null,
      lifetimeBudgetCents: null,
      whatsappClassification: "auto_whatsapp",
    });
    expect(db.ads[0]).toMatchObject({
      adId: "ad_1",
      spendCents: 30000,
      metaConversationsStarted: 40,
      businessId: "business_1",
      adAccountId: "act_123",
      creativeId: "creative_1",
      thumbnailUrl: "https://example.com/ad-1.jpg",
      previewUrl: "https://example.com/ad-1-high.jpg",
      callToActionType: "WHATSAPP_MESSAGE",
      whatsappClassification: "auto_whatsapp",
    });
    expect(db.leads[0]).toMatchObject({
      adId: "ad_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
    });
    expect(db.conversionLogs[0]).toMatchObject({
      adId: "ad_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
    });
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        adId: { in: ["ad_1"] },
        OR: [
          { campaignId: null },
          { adSetId: null },
          { campaignId: { not: "cmp_1" } },
          { adSetId: { not: "adset_1" } },
        ],
      },
      data: {
        campaignId: "cmp_1",
        adSetId: "adset_1",
      },
    });
    expect(prisma.conversionEventLog.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        adId: { in: ["ad_1"] },
        OR: [
          { campaignId: null },
          { adSetId: null },
          { campaignId: { not: "cmp_1" } },
          { adSetId: { not: "adset_1" } },
        ],
      },
      data: {
        campaignId: "cmp_1",
        adSetId: "adset_1",
      },
    });
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        operation: "meta.reporting.sync",
        status: "success",
        providerRequestId: null,
      }),
    );
    expect(db.integrationLogs[0].requestSummary).toMatchObject({
      since: "2026-07-01",
      until: "2026-07-02",
      legacyShadowParity: {
        comparisonStatus: "matched",
        credentialFingerprintMatch: true,
        adAccountMatch: true,
        pixelMatch: null,
        pageMatch: null,
        parity: true,
      },
    });
    expect(db.integrationLogs[0].responseSummary).toMatchObject({
      accountsSynced: 1,
      accountsFailed: 0,
      campaignsSynced: 1,
      adSetsSynced: 1,
      adsSynced: 1,
    });
    expect(db.diagnosticEvents).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        eventType: "meta.reporting.sync",
        severity: "info",
        status: "success",
        integrationLogId: "integration_1",
      }),
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain(
      "EAAB-secret-token",
    );
    expect(JSON.stringify(db.diagnosticEvents)).not.toContain(
      "EAAB-secret-token",
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain(
      "fingerprint:EAAB-secret-token",
    );
  });

  it("assigns one exact ad destination automatically and never overwrites a manual choice", async () => {
    const { db, metaAdapter, service } = createHarness();
    db.conversionDestinations.push(
      {
        id: "destination_1",
        workspaceId: "workspace_1",
        pixelId: "pixel_1",
        pageId: "page_1",
        status: "configured",
      },
      {
        id: "destination_2",
        workspaceId: "workspace_1",
        pixelId: "pixel_2",
        pageId: "page_2",
        status: "configured",
      },
    );
    db.accountDestinations.push(
      {
        workspaceId: "workspace_1",
        reportingAccountId: "reporting_1",
        conversionDestinationId: "destination_1",
        active: true,
      },
      {
        workspaceId: "workspace_1",
        reportingAccountId: "reporting_1",
        conversionDestinationId: "destination_2",
        active: true,
      },
    );
    metaAdapter.listAds.mockResolvedValue([
      {
        id: "ad_1",
        name: "Criativo WhatsApp",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        creativeId: "creative_1",
        thumbnailUrl: null,
        previewUrl: null,
        callToActionType: "WHATSAPP_MESSAGE",
        detectedPixelIds: ["pixel_2"],
        detectedPageIds: ["page_2"],
      },
    ]);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(db.adDestinationAssignments).toEqual([
      expect.objectContaining({
        adId: "ad_1",
        reportingAccountId: "reporting_1",
        conversionDestinationId: "destination_2",
        source: "automatic",
      }),
    ]);

    Object.assign(db.adDestinationAssignments[0]!, {
      conversionDestinationId: "destination_1",
      source: "manual",
      createdByUserId: "user_1",
    });
    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(db.adDestinationAssignments[0]).toMatchObject({
      conversionDestinationId: "destination_1",
      source: "manual",
      createdByUserId: "user_1",
    });
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
        active: true,
      },
      {
        id: "reporting_2",
        workspaceId: "workspace_1",
        businessId: "business_2",
        businessName: "BM 2",
        adAccountId: "act_2",
        adAccountName: "Conta 2",
        active: true,
      },
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
          objective: "OUTCOME_LEADS",
          dailyBudgetCents: 49500,
          lifetimeBudgetCents: null,
        },
      ];
    });

    const result = await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-09",
    });

    expect(result.accountsSynced).toBe(1);
    expect(result.accountsFailed).toBe(1);
    expect(prisma.metaReportingAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reporting_2" },
        data: expect.objectContaining({ syncStatus: "error" }),
      }),
    );
  });

  it("syncs a manual job with the exact reporting account and connection token", async () => {
    const { connectionResolver, encryption, metaAdapter, prisma, service } =
      createHarness();
    const account = {
      id: "reporting_1",
      workspaceId: "workspace_1",
      businessId: "business_1",
      businessName: "BM 1",
      adAccountId: "act_123",
      adAccountName: "Conta 1",
      businessConnectionId: "connection_1",
      conversionDestinationId: null,
      businessConnection: null,
      allowedDestinations: [],
      active: true,
    };
    prisma.metaReportingAccount.findFirst.mockResolvedValue(account);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      businessConnectionId: "connection_1",
      reportingAccountId: "reporting_1",
      since: "2026-07-01",
      until: "2026-07-09",
    });

    expect(connectionResolver.resolveReportingRoute).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      businessConnectionId: "connection_1",
      reportingAccountId: "reporting_1",
    });
    expect(encryption.decrypt).not.toHaveBeenCalled();
    expect(metaAdapter.listCampaigns).toHaveBeenCalledWith({
      accessToken: "EAAB-manual-exact-token",
      adAccountId: "act_123",
    });
    expect(metaAdapter.listCampaignInsights).toHaveBeenCalledWith({
      accessToken: "EAAB-manual-exact-token",
      adAccountId: "act_123",
      since: "2026-07-01",
      until: "2026-07-09",
      readMode: "manual",
    });
    expect(prisma.metaBusinessConnection.updateMany).toHaveBeenCalledWith({
      where: { id: "connection_1", workspaceId: "workspace_1" },
      data: {
        lastSyncedAt: expect.any(Date),
        validationError: null,
      },
    });
  });

  it("recovers missing manual daily insights one date at a time", async () => {
    const { db, metaAdapter, prisma, service } = createHarness();
    prisma.metaReportingAccount.findFirst.mockResolvedValue({
      id: "reporting_1",
      workspaceId: "workspace_1",
      businessId: "business_1",
      businessName: "BM 1",
      adAccountId: "act_123",
      adAccountName: "Conta 1",
      businessConnectionId: "connection_1",
      conversionDestinationId: null,
      businessConnection: null,
      allowedDestinations: [],
      active: true,
    });
    metaAdapter.listCampaignDailyInsights.mockResolvedValue([]);
    metaAdapter.listCampaignInsights.mockImplementation(async (input) => {
      if (input.since === "2026-07-01" && input.until === "2026-07-01") {
        return [
          {
            campaignId: "cmp_1",
            spendCents: 70000,
            impressions: 6000,
            clicks: 250,
            metaConversationsStarted: 100,
          },
        ];
      }

      if (input.since === "2026-07-02" && input.until === "2026-07-02") {
        return [
          {
            campaignId: "cmp_1",
            spendCents: 50000,
            impressions: 4000,
            clicks: 170,
            metaConversationsStarted: 76,
          },
        ];
      }

      return [
        {
          campaignId: "cmp_1",
          spendCents: 120000,
          impressions: 10000,
          clicks: 420,
          metaConversationsStarted: 176,
        },
      ];
    });

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      businessConnectionId: "connection_1",
      reportingAccountId: "reporting_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(metaAdapter.listCampaignInsights).toHaveBeenCalledTimes(3);
    expect(db.dailyInsights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignId: "cmp_1",
          localDate: "2026-07-01",
          spendCents: 70000,
          metaConversationsStarted: 100,
        }),
        expect.objectContaining({
          campaignId: "cmp_1",
          localDate: "2026-07-02",
          spendCents: 50000,
          metaConversationsStarted: 76,
        }),
      ]),
    );
  });

  it("recovers missing manual ad set and ad daily insights one date at a time", async () => {
    const { db, metaAdapter, prisma, service } = createHarness();
    prisma.metaReportingAccount.findFirst.mockResolvedValue({
      id: "reporting_1",
      workspaceId: "workspace_1",
      businessId: "business_1",
      businessName: "BM 1",
      adAccountId: "act_123",
      adAccountName: "Conta 1",
      businessConnectionId: "connection_1",
      conversionDestinationId: null,
      businessConnection: null,
      allowedDestinations: [],
      active: true,
    });
    metaAdapter.listAdSetDailyInsights.mockResolvedValue([]);
    metaAdapter.listAdDailyInsights.mockResolvedValue([]);
    metaAdapter.listAdSetInsights.mockImplementation(async (input) => {
      const spendCents =
        input.since === "2026-07-01" && input.until === "2026-07-01"
          ? 35000
          : input.since === "2026-07-02" && input.until === "2026-07-02"
            ? 25000
            : 60000;

      return [
        {
          adSetId: "adset_1",
          campaignId: "cmp_1",
          spendCents,
          impressions: spendCents > 30000 ? 3000 : 2000,
          clicks: spendCents > 30000 ? 125 : 85,
          metaConversationsStarted: spendCents > 30000 ? 45 : 35,
        },
      ];
    });
    metaAdapter.listAdInsights.mockImplementation(async (input) => {
      const spendCents =
        input.since === "2026-07-01" && input.until === "2026-07-01"
          ? 17500
          : input.since === "2026-07-02" && input.until === "2026-07-02"
            ? 12500
            : 30000;

      return [
        {
          adId: "ad_1",
          adSetId: "adset_1",
          campaignId: "cmp_1",
          spendCents,
          impressions: spendCents > 15000 ? 1500 : 1000,
          clicks: spendCents > 15000 ? 65 : 40,
          metaConversationsStarted: spendCents > 15000 ? 22 : 18,
        },
      ];
    });

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      businessConnectionId: "connection_1",
      reportingAccountId: "reporting_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(metaAdapter.listAdSetInsights).toHaveBeenCalledTimes(3);
    expect(metaAdapter.listAdInsights).toHaveBeenCalledTimes(3);
    expect(db.adSetDailyInsights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adSetId: "adset_1",
          localDate: "2026-07-01",
          spendCents: 35000,
          impressions: 3000,
        }),
        expect.objectContaining({
          adSetId: "adset_1",
          localDate: "2026-07-02",
          spendCents: 25000,
          impressions: 2000,
        }),
      ]),
    );
    expect(db.adDailyInsights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adId: "ad_1",
          localDate: "2026-07-01",
          spendCents: 17500,
          impressions: 1500,
        }),
        expect.objectContaining({
          adId: "ad_1",
          localDate: "2026-07-02",
          spendCents: 12500,
          impressions: 1000,
        }),
      ]),
    );
  });

  it("rejects a manual sync when daily recovery still disagrees", async () => {
    const { db, metaAdapter, prisma, service } = createHarness();
    prisma.metaReportingAccount.findFirst.mockResolvedValue({
      id: "reporting_1",
      workspaceId: "workspace_1",
      businessId: "business_1",
      businessName: "BM 1",
      adAccountId: "act_123",
      adAccountName: "Conta 1",
      businessConnectionId: "connection_1",
      conversionDestinationId: null,
      businessConnection: null,
      allowedDestinations: [],
      active: true,
    });
    metaAdapter.listCampaignDailyInsights.mockResolvedValue([]);
    metaAdapter.listCampaignInsights.mockImplementation(async (input) =>
      input.since === input.until
        ? []
        : [
            {
              campaignId: "cmp_1",
              spendCents: 120000,
              impressions: 10000,
              clicks: 420,
              metaConversationsStarted: 176,
            },
          ],
    );

    await expect(
      service.syncWorkspaceMetaStructure({
        workspaceId: "workspace_1",
        businessConnectionId: "connection_1",
        reportingAccountId: "reporting_1",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).rejects.toThrow("Todas as contas Meta falharam na sincronizacao");

    expect(db.dailyInsights).toHaveLength(0);
    expect(prisma.metaReportingAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reporting_1" },
        data: expect.objectContaining({
          syncStatus: "error",
          syncError: expect.stringContaining("totais diarios inconsistentes"),
        }),
      }),
    );
  });

  it("does not record a successful connection sync timestamp when a manual sync fails", async () => {
    const { connectionResolver, metaAdapter, prisma, service } =
      createHarness();
    prisma.metaReportingAccount.findFirst.mockResolvedValue({
      id: "reporting_1",
      workspaceId: "workspace_1",
      businessId: "business_1",
      businessName: "BM 1",
      adAccountId: "act_123",
      adAccountName: "Conta 1",
      businessConnectionId: "connection_1",
      conversionDestinationId: null,
      businessConnection: null,
      allowedDestinations: [],
      active: true,
    });
    metaAdapter.listCampaigns.mockRejectedValueOnce(
      new Error("Meta account unavailable"),
    );

    await expect(
      service.syncWorkspaceMetaStructure({
        workspaceId: "workspace_1",
        businessConnectionId: "connection_1",
        reportingAccountId: "reporting_1",
        since: "2026-07-01",
        until: "2026-07-09",
      }),
    ).rejects.toThrow("Todas as contas Meta falharam na sincronizacao");

    expect(connectionResolver.resolveReportingRoute).toHaveBeenCalled();
    expect(prisma.metaBusinessConnection.updateMany).not.toHaveBeenCalled();
  });

  it("throws and records error diagnostics when every Meta reporting account sync fails", async () => {
    const { db, metaAdapter, prisma, service } = createHarness();
    metaAdapter.listCampaigns.mockRejectedValueOnce(
      new Error("Meta API unavailable"),
    );

    await expect(
      service.syncWorkspaceMetaStructure({
        workspaceId: "workspace_1",
        since: "2026-07-01",
        until: "2026-07-02",
      }),
    ).rejects.toThrow("Todas as contas Meta falharam na sincronizacao");

    expect(prisma.metaReportingAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reporting_1" },
        data: expect.objectContaining({
          syncStatus: "error",
          syncError: "Meta API unavailable",
        }),
      }),
    );

    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        operation: "meta.reporting.sync",
        status: "error",
        providerRequestId: null,
        providerErrorMessage: "Todas as contas Meta falharam na sincronizacao",
      }),
    );
    expect(db.integrationLogs[0].responseSummary).toMatchObject({
      accountsSynced: 0,
      accountsFailed: 1,
      campaignsSynced: 0,
      adSetsSynced: 0,
      adsSynced: 0,
    });
    expect(db.diagnosticEvents).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        eventType: "meta.reporting.sync",
        severity: "error",
        status: "error",
        integrationLogId: "integration_1",
        errorCode: "MetaReportingSyncError",
      }),
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain(
      "EAAB-secret-token",
    );
    expect(JSON.stringify(db.diagnosticEvents)).not.toContain(
      "EAAB-secret-token",
    );
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
        thumbnailUrl: null as string | null,
        previewUrl: null as string | null,
        callToActionType: null,
        detectedPixelIds: [],
        detectedPageIds: [],
      },
    ]);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(db.ads[0]).toMatchObject({
      adId: "ad_1",
      destinationType: "WHATSAPP",
      callToActionType: null,
      whatsappClassification: "auto_whatsapp",
      classificationSource: "destination_type:WHATSAPP",
    });
  });

  it("preserves manual classification overrides during Meta structure sync", async () => {
    const { prisma, service } = createHarness();
    prisma.metaAdSet.findMany.mockResolvedValueOnce([
      {
        adSetId: "adset_1",
        classificationOverride: "manual_exclude",
        whatsappClassification: "manual_exclude",
      },
    ]);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(prisma.metaAdSet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          whatsappClassification: "manual_exclude",
          classificationSource: "manual",
        }),
      }),
    );
    expect(prisma.metaAdSet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          classificationOverride: null,
        }),
      }),
    );
  });

  it("classifies synced snapshots from real WhatsApp lead evidence when Meta signals are missing", async () => {
    const { db, metaAdapter, service } = createHarness();
    db.leads = [
      {
        id: "lead_signal",
        workspaceId: "workspace_1",
        name: null,
        phoneDisplay: null,
        phoneHash: "phone_signal",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        firstMessageAt: new Date("2026-07-02T12:00:00.000Z"),
        createdAt: new Date("2026-07-02T12:00:00.000Z"),
      },
    ];
    metaAdapter.listAdSets.mockResolvedValueOnce([
      {
        id: "adset_1",
        name: "Publico sem destino",
        campaignId: "cmp_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        destinationType: null as string | null,
        dailyBudgetCents: null,
        lifetimeBudgetCents: null,
      },
    ]);
    metaAdapter.listAds.mockResolvedValueOnce([
      {
        id: "ad_1",
        name: "Criativo sem CTA",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        creativeId: "creative_1",
        thumbnailUrl: null as string | null,
        previewUrl: null as string | null,
        callToActionType: null as string | null,
        detectedPixelIds: [],
        detectedPageIds: [],
      },
    ]);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(db.adSets[0]).toMatchObject({
      adSetId: "adset_1",
      whatsappClassification: "detected_by_leads",
      classificationSource: "lead_evidence",
    });
    expect(db.ads[0]).toMatchObject({
      adId: "ad_1",
      whatsappClassification: "detected_by_leads",
      classificationSource: "lead_evidence",
    });
    expect(db.campaigns[0]).toMatchObject({
      campaignId: "cmp_1",
      whatsappClassification: "detected_by_leads",
      classificationSource: "children",
    });
  });

  it("detects lead evidence during sync even when the lead has only ad identifiers", async () => {
    const { db, metaAdapter, service } = createHarness();
    db.leads = [
      {
        id: "lead_ad_only",
        workspaceId: "workspace_1",
        name: null,
        phoneDisplay: null,
        phoneHash: "phone_ad_only",
        campaignId: null as string | null,
        adSetId: null as string | null,
        adId: "ad_1",
        firstMessageAt: new Date("2026-07-02T12:00:00.000Z"),
        createdAt: new Date("2026-07-02T12:00:00.000Z"),
      },
    ];
    metaAdapter.listAdSets.mockResolvedValueOnce([
      {
        id: "adset_1",
        name: "Publico sem destino",
        campaignId: "cmp_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        destinationType: null as string | null,
        dailyBudgetCents: null,
        lifetimeBudgetCents: null,
      },
    ]);
    metaAdapter.listAds.mockResolvedValueOnce([
      {
        id: "ad_1",
        name: "Criativo sem CTA",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        creativeId: "creative_1",
        thumbnailUrl: null as string | null,
        previewUrl: null as string | null,
        callToActionType: null as string | null,
        detectedPixelIds: [],
        detectedPageIds: [],
      },
    ]);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(db.ads[0]).toMatchObject({
      adId: "ad_1",
      whatsappClassification: "detected_by_leads",
      classificationSource: "lead_evidence",
    });
    expect(db.campaigns[0]).toMatchObject({
      campaignId: "cmp_1",
      whatsappClassification: "detected_by_leads",
    });
  });

  it("returns campaign report rows combining Meta spend with internal conversion events", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 2 dias",
      includeSummary: true,
    });

    expect(report).toMatchObject({
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
          spendCents: 60000,
          metaConversationsStarted: 80,
          costPerMetaConversationCents: 750,
          realConversations: 2,
          costPerRealConversationCents: 30000,
          organicLeads: 0,
          totalReceived: 2,
          trackingRate: 1,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: 60000,
          purchases: 1,
          firstPurchases: 1,
          repurchases: 0,
          costPerPurchaseCents: 60000,
          trafficRevenueCents: 100000,
          organicRevenueCents: 0,
          totalRevenueCents: 100000,
          firstPurchaseRevenueCents: 100000,
          repurchaseRevenueCents: 0,
          estimatedRevenueCents: 0,
          hasEstimatedRevenue: false,
          roasAcquisition: 100000 / 60000,
          roasWithRepurchase: 100000 / 60000,
          funnelSteps: [
            {
              key: "real_conversations",
              label: "Conversas reais iniciadas",
              value: 2,
              costCents: 30000,
            },
            {
              key: "qualified_lead",
              label: "Lead qualificado",
              value: 1,
              costCents: 60000,
            },
            {
              key: "purchase",
              label: "Compras",
              value: 1,
              costCents: 60000,
            },
            {
              key: "first_purchase",
              label: "Primeira compra",
              value: 1,
              costCents: 60000,
            },
          ],
        },
      ],
    });
    expect(report.summary).toMatchObject({
      id: "workspace_summary",
      realConversations: 3,
      qualifiedLead: 1,
      purchases: 1,
    });
  });

  it("returns workspace conversation totals before Meta campaigns are synchronized", async () => {
    const { service } = createHarness();

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      includeSummary: true,
    });

    expect(report.campaigns).toEqual([]);
    expect(report.summary).toMatchObject({
      id: "workspace_summary",
      spendCents: 0,
      metaConversationsStarted: 0,
      realConversations: 3,
      totalReceived: 3,
    });
  });

  it("keeps configured funnel events visible when the period has zero matching events", async () => {
    const { db, service } = createHarness();
    db.conversionLogs = [];

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Sem eventos",
    });

    expect(report.campaigns[0]?.qualifiedLead).toBe(0);
    expect(report.campaigns[0]?.purchases).toBe(0);
    expect(report.campaigns[0]?.funnelSteps).toEqual([
      {
        key: "real_conversations",
        label: "Conversas reais iniciadas",
        value: 2,
        costCents: 30000,
      },
      {
        key: "qualified_lead",
        label: "Lead qualificado",
        value: 0,
        costCents: null,
      },
      {
        key: "purchase",
        label: "Compras",
        value: 0,
        costCents: null,
      },
    ]);
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
        metaConversationsStarted: 2,
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
        metaConversationsStarted: 0,
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
        metaConversationsStarted: 0,
      },
    );

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
    });

    expect(report.campaigns.map((campaign) => campaign.id)).toEqual([
      "cmp_whatsapp",
    ]);
    expect(report.campaigns[0]).toMatchObject({
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "manual_include",
    });
  });

  it("returns full-filter totals while paginating report entities", async () => {
    const { db, prisma, service } = createHarness();

    db.campaigns.push(
      ...["A", "B", "C"].map((name, index) => ({
        workspaceId: "workspace_1",
        campaignId: `cmp_${index + 1}`,
        name: `Campanha ${name}`,
        status: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "manual_include",
        spendCents: 10000,
        metaConversationsStarted: 2,
      })),
    );

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      page: 2,
      pageSize: 1,
    });

    expect(report.campaigns.map((campaign) => campaign.id)).toEqual(["cmp_2"]);
    expect(report.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 3,
      totalPages: 3,
    });
    expect(report.totals).toMatchObject({
      spendCents: 30000,
      metaConversationsStarted: 6,
    });
    expect(prisma.conversionEventLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campaignId: { in: ["cmp_1", "cmp_2", "cmp_3"] },
        }),
      }),
    );
  });

  it("intersects selected entities with delivery in the requested period at every level", async () => {
    const { db, service } = createHarness();
    const sharedSnapshot = {
      workspaceId: "workspace_1",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "manual_include",
      spendCents: 10000,
      metaConversationsStarted: 2,
    };

    db.campaigns.push(
      {
        ...sharedSnapshot,
        campaignId: "cmp_delivered",
        name: "Campanha com entrega",
      },
      {
        ...sharedSnapshot,
        campaignId: "cmp_without_delivery",
        name: "Campanha sem entrega",
      },
    );
    db.adSets.push(
      {
        ...sharedSnapshot,
        campaignId: "cmp_delivered",
        adSetId: "adset_delivered",
        name: "Conjunto com entrega",
      },
      {
        ...sharedSnapshot,
        campaignId: "cmp_without_delivery",
        adSetId: "adset_without_delivery",
        name: "Conjunto sem entrega",
      },
    );
    db.ads.push(
      {
        ...sharedSnapshot,
        campaignId: "cmp_delivered",
        adSetId: "adset_delivered",
        adId: "ad_delivered",
        name: "Anuncio com entrega",
      },
      {
        ...sharedSnapshot,
        campaignId: "cmp_without_delivery",
        adSetId: "adset_without_delivery",
        adId: "ad_without_delivery",
        name: "Anuncio sem entrega",
      },
    );
    db.dailyInsights.push(
      {
        ...sharedSnapshot,
        campaignId: "cmp_delivered",
        localDate: "2026-07-01",
        impressions: 20,
      },
      {
        ...sharedSnapshot,
        campaignId: "cmp_without_delivery",
        localDate: "2026-07-01",
        impressions: 0,
      },
    );
    db.adSetDailyInsights.push(
      {
        ...sharedSnapshot,
        campaignId: "cmp_delivered",
        adSetId: "adset_delivered",
        localDate: "2026-07-01",
        impressions: 20,
      },
      {
        ...sharedSnapshot,
        campaignId: "cmp_without_delivery",
        adSetId: "adset_without_delivery",
        localDate: "2026-07-01",
        impressions: 0,
      },
    );
    db.adDailyInsights.push(
      {
        ...sharedSnapshot,
        campaignId: "cmp_delivered",
        adSetId: "adset_delivered",
        adId: "ad_delivered",
        localDate: "2026-07-01",
        impressions: 20,
      },
      {
        ...sharedSnapshot,
        campaignId: "cmp_without_delivery",
        adSetId: "adset_without_delivery",
        adId: "ad_without_delivery",
        localDate: "2026-07-01",
        impressions: 0,
      },
    );

    const baseInput = {
      workspaceId: "workspace_1",
      rangeLabel: "01/07/2026",
      since: "2026-07-01",
      until: "2026-07-01",
      delivery: "had_delivery" as const,
    };
    const [campaignReport, adSetReport, adReport] = await Promise.all([
      service.getCampaignReportOverview({
        ...baseInput,
        selectedEntityIds: ["cmp_delivered", "cmp_without_delivery"],
      }),
      service.getAdSetReportOverview({
        ...baseInput,
        selectedEntityIds: ["adset_delivered", "adset_without_delivery"],
      }),
      service.getAdReportOverview({
        ...baseInput,
        selectedEntityIds: ["ad_delivered", "ad_without_delivery"],
      }),
    ]);

    expect(campaignReport.campaigns.map((row) => row.id)).toEqual([
      "cmp_delivered",
    ]);
    expect(adSetReport.adSets.map((row) => row.id)).toEqual([
      "adset_delivered",
    ]);
    expect(adReport.ads.map((row) => row.id)).toEqual(["ad_delivered"]);
  });

  it("exports campaign metrics from the requested daily period", async () => {
    const { db, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      name: "Campanha do periodo",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "manual_include",
      spendCents: 99999,
      metaConversationsStarted: 9,
    });
    db.dailyInsights.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_1",
      localDate: "2026-07-01",
      spendCents: 12345,
      impressions: 20,
      clicks: 4,
      metaConversationsStarted: 3,
    });

    const csv = await service.getCampaignReportCsv({
      workspaceId: "workspace_1",
      rangeLabel: "01/07/2026",
      since: "2026-07-01",
      until: "2026-07-01",
    });

    expect(csv.content).toContain("Campanha do periodo,active,123.45,3");
    expect(csv.content).not.toContain("Campanha do periodo,active,999.99,9");
  });

  it("excludes inactive Meta reporting account snapshots from default campaign reports", async () => {
    const { db, service } = createHarness();
    db.reportingAccounts.push({
      id: "reporting_inactive",
      workspaceId: "workspace_1",
      businessId: "business_2",
      businessName: "BM Inativo",
      adAccountId: "act_inactive",
      adAccountName: "Conta Inativa",
      active: false,
    });
    db.campaigns.push(
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_active",
        name: "Campanha ativa",
        status: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "manual_include",
        spendCents: 10000,
        metaConversationsStarted: 1,
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_inactive",
        name: "Campanha de conta desativada",
        status: "ACTIVE",
        businessId: "business_2",
        adAccountId: "act_inactive",
        whatsappClassification: "manual_include",
        spendCents: 90000,
        metaConversationsStarted: 9,
      },
    );

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
    });

    expect(report.campaigns.map((campaign) => campaign.id)).toEqual([
      "cmp_active",
    ]);
  });

  it("uses WhatsApp child ad set metrics for mixed-destination campaign rows", async () => {
    const { db, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_mixed",
      name: "Campanha mista",
      status: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "auto_whatsapp",
      spendCents: 100000,
      metaConversationsStarted: 50,
    });
    db.adSets.push(
      {
        workspaceId: "workspace_1",
        adSetId: "adset_whatsapp",
        campaignId: "cmp_mixed",
        name: "Conjunto WhatsApp",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 30000,
        metaConversationsStarted: 15,
      },
      {
        workspaceId: "workspace_1",
        adSetId: "adset_site",
        campaignId: "cmp_mixed",
        name: "Conjunto Site",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "not_whatsapp",
        spendCents: 70000,
        metaConversationsStarted: 35,
      },
    );

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
    });

    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]).toMatchObject({
      id: "cmp_mixed",
      spendCents: 30000,
      metaConversationsStarted: 15,
    });
  });

  it("uses WhatsApp child ad metrics when only ads are classified as WhatsApp", async () => {
    const { db, service } = createHarness();
    db.campaigns.push({
      workspaceId: "workspace_1",
      campaignId: "cmp_ad_mixed",
      name: "Campanha mista por anuncio",
      status: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "creative_whatsapp",
      spendCents: 100000,
      metaConversationsStarted: 50,
    });
    db.adSets.push({
      workspaceId: "workspace_1",
      adSetId: "adset_parent",
      campaignId: "cmp_ad_mixed",
      name: "Conjunto misto",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "not_whatsapp",
      spendCents: 100000,
      metaConversationsStarted: 50,
    });
    db.ads.push(
      {
        workspaceId: "workspace_1",
        adId: "ad_whatsapp_only",
        adSetId: "adset_parent",
        campaignId: "cmp_ad_mixed",
        name: "Anuncio WhatsApp",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "creative_whatsapp",
        spendCents: 25000,
        metaConversationsStarted: 10,
      },
      {
        workspaceId: "workspace_1",
        adId: "ad_site_only",
        adSetId: "adset_parent",
        campaignId: "cmp_ad_mixed",
        name: "Anuncio Site",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "not_whatsapp",
        spendCents: 75000,
        metaConversationsStarted: 40,
      },
    );

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
    });

    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]).toMatchObject({
      id: "cmp_ad_mixed",
      spendCents: 25000,
      metaConversationsStarted: 10,
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
      metaConversationsStarted: 0,
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
        metaConversationsStarted: 3,
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
        metaConversationsStarted: 0,
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
        metaConversationsStarted: 0,
      },
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
        metaConversationsStarted: 4,
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
        metaConversationsStarted: 0,
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
        metaConversationsStarted: 0,
      },
    );

    const [adSets, ads] = await Promise.all([
      service.getAdSetReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias",
      }),
      service.getAdReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias",
      }),
    ]);

    expect(adSets.adSets.map((adSet) => adSet.id)).toEqual(["adset_whatsapp"]);
    expect(adSets.adSets[0]).toMatchObject({
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "creative_whatsapp",
    });
    expect(ads.ads.map((ad) => ad.id)).toEqual(["ad_whatsapp"]);
    expect(ads.ads[0]).toMatchObject({
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "detected_by_leads",
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
      metaConversationsStarted: 0,
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
      metaConversationsStarted: 3,
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
      metaConversationsStarted: 2,
    });

    const [adSets, ads] = await Promise.all([
      service.getAdSetReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias",
      }),
      service.getAdReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 7 dias",
      }),
    ]);

    expect(adSets.adSets).toHaveLength(1);
    expect(adSets.adSets[0]).toMatchObject({
      id: "adset_child",
      campaignName: "Campanha em Revisao",
    });
    expect(ads.ads).toHaveLength(1);
    expect(ads.ads[0]).toMatchObject({
      id: "ad_child",
      campaignName: "Campanha em Revisao",
      adSetName: "Conjunto WhatsApp",
    });
  });

  it("limits ad sets and ads to the selected report hierarchy", async () => {
    const { db, service } = createHarness();
    const base = {
      workspaceId: "workspace_1",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "auto_whatsapp",
      spendCents: 1000,
      metaConversationsStarted: 1,
    };

    db.campaigns.push(
      { ...base, campaignId: "cmp_1", name: "Campanha 1" },
      { ...base, campaignId: "cmp_2", name: "Campanha 2" },
    );
    db.adSets.push(
      {
        ...base,
        campaignId: "cmp_1",
        adSetId: "adset_1",
        name: "Conjunto 1",
      },
      {
        ...base,
        campaignId: "cmp_2",
        adSetId: "adset_2",
        name: "Conjunto 2",
      },
    );
    db.ads.push(
      {
        ...base,
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        name: "Anuncio 1",
      },
      {
        ...base,
        campaignId: "cmp_2",
        adSetId: "adset_2",
        adId: "ad_2",
        name: "Anuncio 2",
      },
    );

    const adSets = await service.getAdSetReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      campaignId: "cmp_1",
    });
    const ads = await service.getAdReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      campaignId: "cmp_1",
      adSetId: "adset_1",
    });

    expect(adSets.adSets.map((item) => item.id)).toEqual(["adset_1"]);
    expect(ads.ads.map((item) => item.id)).toEqual(["ad_1"]);
  });

  it("filters campaign reports by child name scope and status", async () => {
    const { db, service } = createHarness();

    db.campaigns.push(
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_bpc",
        name: "Campanha Pesquisa",
        status: "PAUSED",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 40000,
        metaConversationsStarted: 8,
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_acidente",
        name: "Campanha Acidente",
        status: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 50000,
        metaConversationsStarted: 10,
      },
    );
    db.adSets.push(
      {
        workspaceId: "workspace_1",
        adSetId: "adset_bpc",
        campaignId: "cmp_bpc",
        name: "Publico BPC regional",
        status: "PAUSED",
        effectiveStatus: "PAUSED",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 40000,
        metaConversationsStarted: 8,
      },
      {
        workspaceId: "workspace_1",
        adSetId: "adset_acidente",
        campaignId: "cmp_acidente",
        name: "Publico Acidente",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 50000,
        metaConversationsStarted: 10,
      },
    );

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      nameScope: "adset",
      nameContains: "bpc",
      status: "paused",
    });

    expect(report.campaigns.map((campaign) => campaign.id)).toEqual([
      "cmp_bpc",
    ]);
  });

  it("filters ad set reports by campaign name scope and status", async () => {
    const { db, service } = createHarness();

    db.campaigns.push(
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_bpc",
        name: "BPC principal",
        status: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 0,
        metaConversationsStarted: 0,
      },
      {
        workspaceId: "workspace_1",
        campaignId: "cmp_acidente",
        name: "Acidente principal",
        status: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 0,
        metaConversationsStarted: 0,
      },
    );
    db.adSets.push(
      {
        workspaceId: "workspace_1",
        adSetId: "adset_bpc",
        campaignId: "cmp_bpc",
        name: "Publico aberto",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 10000,
        metaConversationsStarted: 2,
      },
      {
        workspaceId: "workspace_1",
        adSetId: "adset_acidente",
        campaignId: "cmp_acidente",
        name: "Publico aberto",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 20000,
        metaConversationsStarted: 4,
      },
    );

    const report = await service.getAdSetReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      nameScope: "campaign",
      nameContains: "bpc",
      status: "active",
    });

    expect(report.adSets.map((adSet) => adSet.id)).toEqual(["adset_bpc"]);
  });

  it("filters ad reports by ad name scope and status", async () => {
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
      metaConversationsStarted: 0,
    });
    db.adSets.push({
      workspaceId: "workspace_1",
      adSetId: "adset_1",
      campaignId: "cmp_1",
      name: "Conjunto principal",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "auto_whatsapp",
      spendCents: 0,
      metaConversationsStarted: 0,
    });
    db.ads.push(
      {
        workspaceId: "workspace_1",
        adId: "ad_bpc",
        adSetId: "adset_1",
        campaignId: "cmp_1",
        name: "Criativo BPC video",
        status: "PAUSED",
        effectiveStatus: "PAUSED",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 10000,
        metaConversationsStarted: 2,
      },
      {
        workspaceId: "workspace_1",
        adId: "ad_acidente",
        adSetId: "adset_1",
        campaignId: "cmp_1",
        name: "Criativo acidente",
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        businessId: "business_1",
        adAccountId: "act_123",
        whatsappClassification: "auto_whatsapp",
        spendCents: 20000,
        metaConversationsStarted: 4,
      },
    );

    const report = await service.getAdReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 7 dias",
      nameScope: "ad",
      nameContains: "bpc",
      status: "paused",
    });

    expect(report.ads.map((ad) => ad.id)).toEqual(["ad_bpc"]);
  });

  it("applies Meta account and classification filters to campaign reports", async () => {
    const { prisma, service } = createHarness();

    await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "Todas",
      businessId: "business_1",
      adAccountId: "act_123",
      whatsappClassification: "all",
    });

    expect(prisma.metaCampaign.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        businessId: "business_1",
        adAccountId: "act_123",
      },
      orderBy: { name: "asc" },
    });
  });

  it("filters internal conversion events by report period when provided", async () => {
    const { prisma, service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(prisma.conversionEventLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: "skipped" },
          eventOccurredAt: {
            gte: new Date("2026-07-01T03:00:00.000Z"),
            lte: new Date("2026-07-03T02:59:59.999Z"),
          },
        }),
      }),
    );
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              firstMessageAt: {
                gte: new Date("2026-07-01T03:00:00.000Z"),
                lte: new Date("2026-07-03T02:59:59.999Z"),
              },
            },
            {
              firstMessageAt: null,
              createdAt: {
                gte: new Date("2026-07-01T03:00:00.000Z"),
                lte: new Date("2026-07-03T02:59:59.999Z"),
              },
            },
          ],
        }),
      }),
    );
  });

  it("returns campaign, ad set and ad structure from persisted snapshots", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    await expect(
      service.getMetaStructureReport("workspace_1"),
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
                  effectiveStatus: "ACTIVE",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("returns ad set report rows combining structure with internal events", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    await expect(
      service.getAdSetReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 2 dias",
      }),
    ).resolves.toMatchObject({
      workspaceId: "workspace_1",
      rangeLabel: "Ultimos 2 dias",
      adSets: [
        {
          id: "adset_1",
          campaignId: "cmp_1",
          campaignName: "Black Friday WhatsApp",
          name: "Publico quente",
          status: "active",
          configuredStatus: "ACTIVE",
          effectiveStatus: "ACTIVE",
          budget: {
            owner: "campaign",
            type: "daily",
            amountCents: 49500,
            editable: false,
          },
          businessId: "business_1",
          adAccountId: "act_123",
          whatsappClassification: "auto_whatsapp",
          spendCents: 60000,
          metaConversationsStarted: 80,
          costPerMetaConversationCents: 750,
          realConversations: 2,
          costPerRealConversationCents: 30000,
          organicLeads: 0,
          totalReceived: 2,
          trackingRate: 1,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: 60000,
          purchases: 1,
          firstPurchases: 1,
          repurchases: 0,
          costPerPurchaseCents: 60000,
          trafficRevenueCents: 100000,
          organicRevenueCents: 0,
          totalRevenueCents: 100000,
          firstPurchaseRevenueCents: 100000,
          repurchaseRevenueCents: 0,
          estimatedRevenueCents: 0,
          hasEstimatedRevenue: false,
          roasAcquisition: 100000 / 60000,
          roasWithRepurchase: 100000 / 60000,
          funnelSteps: [
            {
              key: "real_conversations",
              label: "Conversas reais iniciadas",
              value: 2,
              costCents: 30000,
            },
            {
              key: "qualified_lead",
              label: "Lead qualificado",
              value: 1,
              costCents: 60000,
            },
            {
              key: "purchase",
              label: "Compras",
              value: 1,
              costCents: 60000,
            },
            {
              key: "first_purchase",
              label: "Primeira compra",
              value: 1,
              costCents: 60000,
            },
          ],
        },
      ],
    });
  });

  it("returns ad report rows combining structure with internal events", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    await expect(
      service.getAdReportOverview({
        workspaceId: "workspace_1",
        rangeLabel: "Ultimos 2 dias",
      }),
    ).resolves.toMatchObject({
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
          configuredStatus: "ACTIVE",
          effectiveStatus: "ACTIVE",
          thumbnailUrl: "https://example.com/ad-1.jpg",
          previewUrl: "https://example.com/ad-1-high.jpg",
          businessId: "business_1",
          adAccountId: "act_123",
          whatsappClassification: "auto_whatsapp",
          spendCents: 30000,
          metaConversationsStarted: 40,
          costPerMetaConversationCents: 750,
          realConversations: 2,
          costPerRealConversationCents: 15000,
          organicLeads: 0,
          totalReceived: 2,
          trackingRate: 1,
          qualifiedLead: 1,
          costPerQualifiedLeadCents: 30000,
          purchases: 1,
          firstPurchases: 1,
          repurchases: 0,
          costPerPurchaseCents: 30000,
          trafficRevenueCents: 100000,
          organicRevenueCents: 0,
          totalRevenueCents: 100000,
          firstPurchaseRevenueCents: 100000,
          repurchaseRevenueCents: 0,
          estimatedRevenueCents: 0,
          hasEstimatedRevenue: false,
          roasAcquisition: 100000 / 30000,
          roasWithRepurchase: 100000 / 30000,
          funnelSteps: [
            {
              key: "real_conversations",
              label: "Conversas reais iniciadas",
              value: 2,
              costCents: 15000,
            },
            {
              key: "qualified_lead",
              label: "Lead qualificado",
              value: 1,
              costCents: 30000,
            },
            {
              key: "purchase",
              label: "Compras",
              value: 1,
              costCents: 30000,
            },
            {
              key: "first_purchase",
              label: "Primeira compra",
              value: 1,
              costCents: 30000,
            },
          ],
        },
      ],
    });
  });

  it("returns a daily Meta versus real conversation series scoped by business", async () => {
    const { service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      since: "2026-07-01",
      until: "2026-07-02",
      businessId: "business_1",
      includeSummary: true,
      includeDaily: true,
    });

    expect(report.dailyComparisonAvailable).toBe(true);
    expect(report.dailyComparison).toEqual([
      {
        date: "2026-07-01",
        metaConversationsStarted: 100,
        realConversations: 1,
      },
      {
        date: "2026-07-02",
        metaConversationsStarted: 76,
        realConversations: 1,
      },
    ]);
    expect(report.summary?.realConversations).toBe(2);
    expect(report.summary?.metaConversationsStarted).toBe(176);
  });

  it("keeps late-night Sao Paulo conversations in the selected local day", async () => {
    const { db, service } = createHarness();
    db.leads.push({
      id: "lead_late_local_day",
      workspaceId: "workspace_1",
      name: "Conversa noturna",
      phoneDisplay: "+55 11 99999-4050",
      phoneHash: "phone_late",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      firstMessageAt: new Date("2026-07-03T02:59:59.999Z"),
      createdAt: new Date("2026-07-03T02:59:59.999Z"),
    });

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      since: "2026-07-01",
      until: "2026-07-02",
      businessId: "business_1",
      includeDaily: true,
    });

    expect(report.dailyComparison?.[1]).toEqual({
      date: "2026-07-02",
      metaConversationsStarted: 76,
      realConversations: 2,
    });
  });

  it("persists confirmed zero days when Meta omits an inactive date", async () => {
    const { db, metaAdapter, service } = createHarness();
    metaAdapter.listCampaignDailyInsights.mockResolvedValue([
      {
        campaignId: "cmp_1",
        date: "2026-07-01",
        spendCents: 70000,
        impressions: 6000,
        clicks: 250,
        metaConversationsStarted: 100,
      },
    ]);

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(db.dailyInsights).toContainEqual(
      expect.objectContaining({
        campaignId: "cmp_1",
        localDate: "2026-07-02",
        spendCents: 0,
        metaConversationsStarted: 0,
      }),
    );
    expect(metaAdapter.listCampaignInsights).toHaveBeenCalledTimes(1);
  });

  it("does not expose a partially stored daily period as complete", async () => {
    const { db, service } = createHarness();

    await service.syncWorkspaceMetaStructure({
      workspaceId: "workspace_1",
      since: "2026-07-01",
      until: "2026-07-02",
    });
    db.dailyInsights.pop();

    const report = await service.getCampaignReportOverview({
      workspaceId: "workspace_1",
      rangeLabel: "2026-07-01 a 2026-07-02",
      since: "2026-07-01",
      until: "2026-07-02",
      businessId: "business_1",
      includeDaily: true,
    });

    expect(report.dailyComparisonAvailable).toBe(false);
  });
});
