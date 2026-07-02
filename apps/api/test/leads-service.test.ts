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
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1",
        firstMessageAt: new Date("2026-07-02T03:00:00.000Z"),
        lastMessageAt: new Date("2026-07-02T03:10:00.000Z"),
        createdAt: new Date("2026-07-02T03:00:00.000Z"),
        updatedAt: new Date("2026-07-02T03:10:00.000Z")
      }
    ],
    conversionLogs: [
      {
        leadId: "lead_1",
        eventName: "QualifiedLead",
        createdAt: new Date("2026-07-02T03:12:00.000Z")
      }
    ],
    campaigns: [
      {
        campaignId: "cmp_1",
        name: "Black Friday WhatsApp"
      }
    ]
  };
  const prisma = {
    lead: {
      findMany: vi.fn(async () => db.leads),
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
        id: "lead_2",
        createdAt: new Date("2026-07-02T04:00:00.000Z"),
        updatedAt: new Date("2026-07-02T04:00:00.000Z"),
        ...create,
        ...update
      }))
    },
    conversionEventLog: {
      findMany: vi.fn(async () => db.conversionLogs)
    },
    metaCampaign: {
      findMany: vi.fn(async () => db.campaigns)
    }
  };

  return {
    db,
    prisma,
    service: new LeadsService(prisma as never)
  };
}

describe("leads service", () => {
  it("lists leads for a workspace with campaign names and latest conversion event", async () => {
    const { prisma, service } = createHarness();

    const leads = await service.listLeads("workspace_1", {
      search: "Mariana",
      status: "active",
      limit: 25
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          status: "active"
        }),
        take: 25
      })
    );
    expect(leads).toEqual([
      expect.objectContaining({
        id: "lead_1",
        campaignName: "Black Friday WhatsApp",
        lastEventName: "QualifiedLead",
        score: 86
      })
    ]);
  });

  it("upserts a lead from Uazapi webhook attribution data", async () => {
    const { prisma, service } = createHarness();

    const result = await service.upsertFromWhatsappWebhook({
      workspaceId: "workspace_1",
      name: "Rafael Costa",
      phone: "+55 (31) 97710-4300",
      source: "uazapi",
      campaignId: "cmp_2",
      adSetId: "adset_2",
      adId: "ad_2",
      occurredAt: new Date("2026-07-02T04:00:00.000Z")
    });

    expect(result?.id).toBe("lead_2");
    expect(prisma.lead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_phoneHash: {
            workspaceId: "workspace_1",
            phoneHash: expect.any(String)
          }
        },
        create: expect.objectContaining({
          workspaceId: "workspace_1",
          name: "Rafael Costa",
          phoneDisplay: "+55 31 *****-4300",
          campaignId: "cmp_2",
          adId: "ad_2"
        }),
        update: expect.objectContaining({
          name: "Rafael Costa",
          lastMessageAt: new Date("2026-07-02T04:00:00.000Z")
        })
      })
    );
  });
});
