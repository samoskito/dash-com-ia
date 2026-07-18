import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { LeadsService } from "../src/leads/leads.service";

function createHarness() {
  const db = {
    leads: [
      {
        id: "lead_1",
        workspaceId: "workspace_1",
        name: "Mariana Alves",
        phoneDisplay: "+55 11 *****-1020",
        phoneHash: "phone_hash_1",
        status: "active",
        source: "uazapi",
        labels: ["Venda fechada", "VIP"],
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        ctwaClid: "ctwa_click_1",
        ctwaSourceUrl: "https://www.instagram.com/p/creative/",
        ctwaThumbnailUrl: "https://cdn.example.test/creative.jpg",
        firstMessageAt: new Date("2026-07-02T03:00:00.000Z"),
        lastMessageAt: new Date("2026-07-02T03:10:00.000Z"),
        createdAt: new Date("2026-07-02T03:00:00.000Z"),
        updatedAt: new Date("2026-07-02T03:10:00.000Z"),
      },
    ],
    conversionLogs: [
      {
        id: "conversion_1",
        leadId: "lead_1",
        phoneHash: "phone_hash_1",
        sourceTrigger: "keyword",
        eventName: "QualifiedLead",
        status: "sent",
        pixelId: "pixel_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        errorCode: null,
        errorMessage: null,
        eventOccurredAt: new Date("2026-07-02T03:11:00.000Z"),
        sentAt: new Date("2026-07-02T03:13:00.000Z"),
        createdAt: new Date("2026-07-02T03:12:00.000Z"),
      },
    ],
    webhookLogs: [
      {
        id: "webhook_1",
        source: "uazapi",
        eventType: "message",
        status: "processed",
        leadId: "lead_1",
        phoneHash: "phone_hash_1",
        errorCode: null,
        errorMessage: null,
        receivedAt: new Date("2026-07-02T03:01:00.000Z"),
        processedAt: new Date("2026-07-02T03:01:01.000Z"),
      },
    ],
    campaigns: [
      {
        campaignId: "cmp_1",
        name: "Black Friday WhatsApp",
      },
    ],
    adSets: [
      {
        adSetId: "adset_1",
        name: "Publico quente",
      },
    ],
    ads: [
      {
        adId: "ad_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        name: "Criativo WhatsApp",
      },
    ],
  };
  const prisma = {
    lead: {
      findMany: vi.fn(async () => db.leads),
      count: vi.fn(async () => db.leads.length),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; workspaceId: string } }) =>
          db.leads.find(
            (lead) =>
              lead.id === where.id && lead.workspaceId === where.workspaceId,
          ) ?? null,
      ),
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => ({
          id: "lead_2",
          createdAt: new Date("2026-07-02T04:00:00.000Z"),
          updatedAt: new Date("2026-07-02T04:00:00.000Z"),
          ...create,
          ...update,
        }),
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    conversionEventLog: {
      findMany: vi.fn(async () => db.conversionLogs),
    },
    webhookLog: {
      findMany: vi.fn(async () => db.webhookLogs),
    },
    metaCampaign: {
      findMany: vi.fn(async () => db.campaigns),
    },
    metaAdSet: {
      findMany: vi.fn(async () => db.adSets),
    },
    metaAd: {
      findMany: vi.fn(async () => db.ads),
    },
  };

  return {
    db,
    prisma,
    service: new LeadsService(prisma as never),
  };
}

describe("leads service", () => {
  it("lists leads for a workspace with campaign names and latest conversion event", async () => {
    const { prisma, service } = createHarness();

    const leads = await service.listLeads("workspace_1", {
      search: "Mariana",
      status: "active",
      label: "Venda fechada",
      limit: 25,
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          status: "active",
          labels: { has: "Venda fechada" },
        }),
        skip: 0,
        take: 25,
      }),
    );
    expect(prisma.lead.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "workspace_1" }),
      }),
    );
    expect(leads).toEqual([
      expect.objectContaining({
        id: "lead_1",
        campaignName: "Black Friday WhatsApp",
        lastEventName: "QualifiedLead",
        labels: ["Venda fechada", "VIP"],
      }),
    ]);
  });

  it("filters leads by attribution and Sao Paulo conversation period", async () => {
    const { prisma, service } = createHarness();

    await service.listLeads("workspace_1", {
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      since: "2026-07-01",
      until: "2026-07-02",
      limit: 50,
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          campaignId: "cmp_1",
          adSetId: "adset_1",
          adId: "ad_1",
          AND: [
            {
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
            },
          ],
        }),
      }),
    );
  });

  it("resolves stale campaign parents through the Meta ad hierarchy", async () => {
    const { db, prisma, service } = createHarness();
    db.leads[0] = {
      ...db.leads[0],
      campaignId: "stale_campaign",
      adSetId: "stale_adset",
    };

    const leads = await service.listLeads("workspace_1", { limit: 25 });

    expect(leads[0]).toMatchObject({
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      campaignName: "Black Friday WhatsApp",
    });
    expect(prisma.metaAd.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        adId: { in: ["ad_1"] },
      },
      select: {
        adId: true,
        campaignId: true,
        adSetId: true,
      },
    });
  });

  it("infers LeadSubmitted for an imported conversation without an event log", async () => {
    const { db, service } = createHarness();
    db.conversionLogs = [];

    const leads = await service.listLeads("workspace_1", { limit: 25 });

    expect(leads[0]).toMatchObject({
      id: "lead_1",
      status: "active",
      lastEventName: "LeadSubmitted",
    });
  });

  it("does not display LeadSubmitted after the lead reached qualification", async () => {
    const { db, service } = createHarness();
    db.leads[0] = {
      ...db.leads[0],
      status: "qualified",
    };
    db.conversionLogs = [
      {
        ...db.conversionLogs[0],
        eventName: "LeadSubmitted",
        eventOccurredAt: new Date("2026-07-02T03:20:00.000Z"),
      },
    ];

    const leads = await service.listLeads("workspace_1", { limit: 25 });

    expect(leads[0]).toMatchObject({
      status: "qualified",
      lastEventName: "QualifiedLead",
    });
  });

  it("includes imported conversations in the LeadSubmitted event filter", async () => {
    const { prisma, service } = createHarness();

    await service.listLeads("workspace_1", {
      eventName: "LeadSubmitted",
      limit: 25,
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        firstMessageAt: { not: null },
      },
      select: { id: true },
    });
  });

  it("finds a lead by its complete normalized phone hash", async () => {
    const { prisma, service } = createHarness();
    const phone = "5511999991020";
    const phoneHash = createHash("sha256").update(phone).digest("hex");

    await service.listLeads("workspace_1", {
      search: phone,
      limit: 25,
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          AND: [
            expect.objectContaining({
              OR: expect.arrayContaining([{ phoneHash }]),
            }),
          ],
        }),
      }),
    );
  });

  it("filters conversations without campaign, ad or ctwa attribution", async () => {
    const { prisma, service } = createHarness();

    await service.listLeads("workspace_1", {
      attribution: "organic",
      limit: 25,
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          AND: [
            {
              campaignId: null,
              adSetId: null,
              adId: null,
              ctwaClid: null,
            },
          ],
        }),
      }),
    );
  });

  it("upserts a lead from Uazapi webhook attribution data", async () => {
    const { prisma, service } = createHarness();

    const result = await service.upsertFromWhatsappWebhook({
      workspaceId: "workspace_1",
      name: "Rafael Costa",
      phone: "+55 (31) 97710-4300",
      source: "uazapi",
      labels: ["Venda fechada"],
      campaignId: "cmp_2",
      adSetId: "adset_2",
      adId: "ad_2",
      occurredAt: new Date("2026-07-02T04:00:00.000Z"),
    });

    expect(result?.id).toBe("lead_2");
    expect(prisma.lead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_phoneHash: {
            workspaceId: "workspace_1",
            phoneHash: expect.any(String),
          },
        },
        create: expect.objectContaining({
          workspaceId: "workspace_1",
          name: "Rafael Costa",
          phoneDisplay: "+55 31 97710-4300",
          labels: ["Venda fechada"],
          campaignId: "cmp_2",
          adId: "ad_2",
        }),
        update: expect.objectContaining({
          name: "Rafael Costa",
          labels: ["Venda fechada"],
          lastMessageAt: new Date("2026-07-02T04:00:00.000Z"),
        }),
      }),
    );
  });

  it("preserves the earliest first message when replaying retained events", async () => {
    const { prisma, service } = createHarness();
    const replayedAt = new Date("2026-07-01T04:00:00.000Z");

    await service.upsertFromWhatsappWebhook({
      workspaceId: "workspace_1",
      name: "Rafael Costa",
      phone: "+55 (31) 97710-4300",
      source: "umbler",
      adId: "ad_2",
      occurredAt: replayedAt,
      firstMessageAt: replayedAt,
      preserveExistingSource: true,
      preserveEarliestFirstMessageAt: true,
    });

    expect(prisma.lead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          firstMessageAt: undefined,
          lastMessageAt: replayedAt,
        }),
      }),
    );
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: {
        id: "lead_2",
        workspaceId: "workspace_1",
        OR: [
          { firstMessageAt: null },
          { firstMessageAt: { gt: replayedAt } },
        ],
      },
      data: {
        firstMessageAt: replayedAt,
      },
    });
  });

  it("does not create a lead from an invalid short numeric identifier", async () => {
    const { prisma, service } = createHarness();

    const result = await service.upsertFromWhatsappWebhook({
      workspaceId: "workspace_1",
      phone: "20260712",
      source: "external_mysql",
    });

    expect(result).toBeNull();
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
  });

  it("stores CTWA fields on create and preserves them when later webhooks omit CTWA", async () => {
    const { prisma, service } = createHarness();

    await service.upsertFromWhatsappWebhook({
      workspaceId: "workspace_1",
      name: "Rafael Costa",
      phone: "+55 (31) 97710-4300",
      source: "uazapi",
      labels: ["Venda fechada"],
      campaignId: "cmp_2",
      adSetId: "adset_2",
      adId: "ad_2",
      ctwaClid: "ctwa_click_1",
      ctwaSourceUrl: "https://fb.com/ad/ctwa",
      ctwaThumbnailUrl: "https://cdn.example.test/creative.jpg",
      occurredAt: new Date("2026-07-02T04:00:00.000Z"),
    });
    await service.upsertFromWhatsappWebhook({
      workspaceId: "workspace_1",
      name: "Rafael Costa",
      phone: "+55 (31) 97710-4300",
      source: "uazapi",
      labels: ["Venda fechada"],
      campaignId: "cmp_2",
      adSetId: "adset_2",
      adId: "ad_2",
      occurredAt: new Date("2026-07-02T04:05:00.000Z"),
    });

    expect(prisma.lead.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          ctwaClid: "ctwa_click_1",
          ctwaSourceUrl: "https://fb.com/ad/ctwa",
          ctwaThumbnailUrl: "https://cdn.example.test/creative.jpg",
        }),
        update: expect.objectContaining({
          ctwaClid: "ctwa_click_1",
          ctwaSourceUrl: "https://fb.com/ad/ctwa",
          ctwaThumbnailUrl: "https://cdn.example.test/creative.jpg",
        }),
      }),
    );
    expect(prisma.lead.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        update: expect.objectContaining({
          ctwaClid: undefined,
          ctwaSourceUrl: undefined,
          ctwaThumbnailUrl: undefined,
        }),
      }),
    );
    const secondUpdate = prisma.lead.upsert.mock.calls[1]?.[0].update;

    expect(Object.hasOwn(secondUpdate, "ctwaClid")).toBe(true);
    expect(Object.hasOwn(secondUpdate, "ctwaSourceUrl")).toBe(true);
    expect(Object.hasOwn(secondUpdate, "ctwaThumbnailUrl")).toBe(true);
    expect(secondUpdate.ctwaClid).toBeUndefined();
    expect(secondUpdate.ctwaSourceUrl).toBeUndefined();
    expect(secondUpdate.ctwaThumbnailUrl).toBeUndefined();
  });

  it("returns lead detail with attribution, conversions and webhook timeline", async () => {
    const { prisma, service } = createHarness();

    const detail = await service.getLeadDetail("workspace_1", "lead_1");

    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: {
        id: "lead_1",
        workspaceId: "workspace_1",
      },
    });
    expect(detail).toMatchObject({
      lead: {
        id: "lead_1",
        campaignName: "Black Friday WhatsApp",
        lastEventName: "QualifiedLead",
        labels: ["Venda fechada", "VIP"],
      },
      attribution: {
        campaignName: "Black Friday WhatsApp",
        adSetName: "Publico quente",
        adName: "Criativo WhatsApp",
        creative: {
          thumbnailUrl: "https://cdn.example.test/creative.jpg",
          destinationUrl: "https://www.instagram.com/p/creative/",
        },
      },
      conversionEvents: [
        {
          id: "conversion_1",
          eventName: "QualifiedLead",
          status: "sent",
          occurredAt: "2026-07-02T03:11:00.000Z",
          sentAt: "2026-07-02T03:13:00.000Z",
        },
      ],
      webhookEvents: [
        {
          id: "webhook_1",
          source: "uazapi",
          status: "processed",
        },
      ],
    });
  });

  it("does not expose non-http creative URLs in lead detail", async () => {
    const { db, service } = createHarness();
    db.leads[0]!.ctwaSourceUrl = "javascript:alert(1)";
    db.leads[0]!.ctwaThumbnailUrl = "data:image/png;base64,unsafe";

    const detail = await service.getLeadDetail("workspace_1", "lead_1");

    expect(detail.attribution.creative).toEqual({
      thumbnailUrl: null,
      destinationUrl: null,
    });
  });
});
