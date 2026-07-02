import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type {
  LeadListItemDto,
  LeadListQueryDto,
  LeadStatusDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

type LeadRecord = {
  id: string;
  workspaceId: string;
  name: string | null;
  phoneDisplay: string | null;
  phoneHash: string;
  status: LeadStatusDto;
  source: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  firstMessageAt: Date | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ConversionLogRecord = {
  leadId: string | null;
  eventName: string;
  createdAt: Date;
};

type CampaignRecord = {
  campaignId: string;
  name: string;
};

export type UpsertWhatsappLeadInput = {
  workspaceId: string;
  whatsappInstanceId?: string;
  name?: string;
  phone?: string;
  phoneHash?: string;
  source?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  occurredAt?: Date;
};

@Injectable()
export class LeadsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listLeads(
    workspaceId: string,
    query: LeadListQueryDto
  ): Promise<LeadListItemDto[]> {
    const leads = (await this.prisma.lead.findMany({
      where: {
        workspaceId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  name: {
                    contains: query.search,
                    mode: "insensitive"
                  }
                },
                {
                  phoneDisplay: {
                    contains: query.search,
                    mode: "insensitive"
                  }
                }
              ]
            }
          : {})
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: query.limit
    })) as LeadRecord[];
    const leadIds = leads.map((lead) => lead.id);
    const campaignIds = Array.from(
      new Set(leads.map((lead) => lead.campaignId).filter(Boolean))
    ) as string[];
    const [conversionLogs, campaigns] = await Promise.all([
      leadIds.length
        ? (this.prisma.conversionEventLog.findMany({
            where: {
              workspaceId,
              leadId: { in: leadIds }
            },
            orderBy: { createdAt: "desc" },
            select: {
              leadId: true,
              eventName: true,
              createdAt: true
            }
          }) as Promise<ConversionLogRecord[]>)
        : Promise.resolve([]),
      campaignIds.length
        ? (this.prisma.metaCampaign.findMany({
            where: {
              workspaceId,
              campaignId: { in: campaignIds }
            },
            select: {
              campaignId: true,
              name: true
            }
          }) as Promise<CampaignRecord[]>)
        : Promise.resolve([])
    ]);
    const latestEventByLead = new Map<string, string>();
    const eventsByLead = new Map<string, Set<string>>();
    const campaignNameById = new Map(
      campaigns.map((campaign) => [campaign.campaignId, campaign.name])
    );

    for (const log of conversionLogs) {
      if (log.leadId) {
        const events = eventsByLead.get(log.leadId) ?? new Set<string>();
        events.add(log.eventName);
        eventsByLead.set(log.leadId, events);
      }

      if (log.leadId && !latestEventByLead.has(log.leadId)) {
        latestEventByLead.set(log.leadId, log.eventName);
      }
    }

    return leads
      .filter((lead) =>
        query.eventName
          ? eventsByLead.get(lead.id)?.has(query.eventName) === true
          : true
      )
      .map((lead) =>
        this.toDto(
          lead,
          latestEventByLead.get(lead.id) ?? null,
          lead.campaignId ? campaignNameById.get(lead.campaignId) ?? null : null
        )
      );
  }

  async upsertFromWhatsappWebhook(
    input: UpsertWhatsappLeadInput
  ): Promise<{ id: string } | null> {
    const phoneHash = input.phoneHash ?? this.hashPhone(input.phone);

    if (!phoneHash) {
      return null;
    }

    const occurredAt = input.occurredAt ?? new Date();
    const lead = await this.prisma.lead.upsert({
      where: {
        workspaceId_phoneHash: {
          workspaceId: input.workspaceId,
          phoneHash
        }
      },
      create: {
        workspaceId: input.workspaceId,
        whatsappInstanceId: input.whatsappInstanceId ?? null,
        name: input.name ?? null,
        phoneDisplay: this.maskPhone(input.phone) ?? null,
        phoneHash,
        status: "active",
        source: input.source ?? "uazapi",
        campaignId: input.campaignId ?? null,
        adSetId: input.adSetId ?? null,
        adId: input.adId ?? null,
        firstMessageAt: occurredAt,
        lastMessageAt: occurredAt
      },
      update: {
        whatsappInstanceId: input.whatsappInstanceId ?? undefined,
        name: input.name ?? undefined,
        phoneDisplay: this.maskPhone(input.phone) ?? undefined,
        source: input.source ?? undefined,
        campaignId: input.campaignId ?? undefined,
        adSetId: input.adSetId ?? undefined,
        adId: input.adId ?? undefined,
        lastMessageAt: occurredAt
      },
      select: {
        id: true
      }
    });

    return lead;
  }

  private toDto(
    lead: LeadRecord,
    lastEventName: string | null,
    campaignName: string | null
  ): LeadListItemDto {
    return {
      id: lead.id,
      workspaceId: lead.workspaceId,
      name: lead.name,
      phoneDisplay: lead.phoneDisplay,
      phoneHash: lead.phoneHash,
      status: this.statusFromEvent(lead.status, lastEventName),
      source: lead.source,
      campaignId: lead.campaignId,
      campaignName,
      adSetId: lead.adSetId,
      adId: lead.adId,
      lastEventName,
      score: this.scoreLead(lead, lastEventName),
      firstMessageAt: lead.firstMessageAt?.toISOString() ?? null,
      lastMessageAt: lead.lastMessageAt?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString()
    };
  }

  private statusFromEvent(
    status: LeadStatusDto,
    eventName: string | null
  ): LeadStatusDto {
    if (eventName === "Purchase") {
      return "converted";
    }

    if (eventName === "QualifiedLead") {
      return "qualified";
    }

    return status;
  }

  private scoreLead(lead: LeadRecord, eventName: string | null): number {
    if (eventName === "Purchase") {
      return 94;
    }

    if (eventName === "QualifiedLead") {
      return 86;
    }

    if (eventName === "LeadSubmitted") {
      return 71;
    }

    if (lead.adId) {
      return 64;
    }

    if (lead.campaignId) {
      return 58;
    }

    return 42;
  }

  private hashPhone(phone?: string): string | undefined {
    const normalized = this.normalizePhone(phone);

    return normalized
      ? createHash("sha256").update(normalized).digest("hex")
      : undefined;
  }

  private maskPhone(phone?: string): string | undefined {
    const normalized = this.normalizePhone(phone);

    if (!normalized) {
      return undefined;
    }

    const country = normalized.startsWith("55") ? "+55" : "+";
    const withoutCountry = normalized.startsWith("55")
      ? normalized.slice(2)
      : normalized;
    const area = withoutCountry.slice(0, 2);
    const last = withoutCountry.slice(-4);

    return `${country} ${area} *****-${last}`;
  }

  private normalizePhone(phone?: string): string | undefined {
    const digits = phone?.replace(/\D/g, "");

    return digits || undefined;
  }
}
