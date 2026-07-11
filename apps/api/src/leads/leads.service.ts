import { createHash } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  LeadDetailDto,
  LeadListItemDto,
  LeadListPageDto,
  LeadListQueryDto,
  LeadStatusDto,
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
  labels: string[];
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  ctwaClid: string | null;
  ctwaSourceUrl: string | null;
  firstMessageAt: Date | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ConversionLogRecord = {
  id?: string;
  leadId: string | null;
  phoneHash?: string | null;
  sourceTrigger?: string;
  eventName: string;
  status?: string;
  pixelId?: string | null;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
  createdAt: Date;
};

type CampaignRecord = {
  campaignId: string;
  name: string;
};

type AdSetRecord = {
  adSetId: string;
  name: string;
};

type AdRecord = {
  adId: string;
  name: string;
};

type WebhookLogRecord = {
  id: string;
  source: string;
  eventType: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  receivedAt: Date;
  processedAt: Date | null;
};

export type UpsertWhatsappLeadInput = {
  workspaceId: string;
  whatsappInstanceId?: string;
  name?: string;
  phone?: string;
  phoneHash?: string;
  source?: string;
  labels?: string[];
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  ctwaClid?: string;
  ctwaSourceUrl?: string;
  occurredAt?: Date;
  firstMessageAt?: Date;
  lastMessageAt?: Date;
  recordMessageTimestamps?: boolean;
  preserveExistingSource?: boolean;
};

@Injectable()
export class LeadsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listLeads(
    workspaceId: string,
    query: LeadListQueryDto,
  ): Promise<LeadListItemDto[]> {
    const page = await this.listLeadsPage(workspaceId, query);

    return page.items;
  }

  async listLeadsPage(
    workspaceId: string,
    query: LeadListQueryDto,
  ): Promise<LeadListPageDto> {
    const createdAtRange = this.createdAtRange(query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? query.limit ?? 50;
    const eventLeadIds = query.eventName
      ? await this.leadIdsForEvent(workspaceId, query.eventName)
      : null;

    if (eventLeadIds && eventLeadIds.length === 0) {
      return {
        items: [],
        pagination: { page, pageSize, totalItems: 0, totalPages: 0 },
      };
    }

    const where = {
      workspaceId,
      ...(eventLeadIds ? { id: { in: eventLeadIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.label ? { labels: { has: query.label } } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.adSetId ? { adSetId: query.adSetId } : {}),
      ...(query.adId ? { adId: query.adId } : {}),
      ...(createdAtRange ? { createdAt: createdAtRange } : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
              {
                phoneDisplay: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };
    const [leads, totalItems] = (await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ])) as [LeadRecord[], number];
    const leadIds = leads.map((lead) => lead.id);
    const campaignIds = Array.from(
      new Set(leads.map((lead) => lead.campaignId).filter(Boolean)),
    ) as string[];
    const [conversionLogs, campaigns] = await Promise.all([
      leadIds.length
        ? (this.prisma.conversionEventLog.findMany({
            where: {
              workspaceId,
              leadId: { in: leadIds },
            },
            orderBy: { createdAt: "desc" },
            select: {
              leadId: true,
              eventName: true,
              createdAt: true,
            },
          }) as Promise<ConversionLogRecord[]>)
        : Promise.resolve([]),
      campaignIds.length
        ? (this.prisma.metaCampaign.findMany({
            where: {
              workspaceId,
              campaignId: { in: campaignIds },
            },
            select: {
              campaignId: true,
              name: true,
            },
          }) as Promise<CampaignRecord[]>)
        : Promise.resolve([]),
    ]);
    const latestEventByLead = new Map<string, string>();
    const eventsByLead = new Map<string, Set<string>>();
    const campaignNameById = new Map(
      campaigns.map((campaign) => [campaign.campaignId, campaign.name]),
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

    return {
      items: leads.map((lead) =>
        this.toDto(
          lead,
          latestEventByLead.get(lead.id) ?? null,
          lead.campaignId
            ? (campaignNameById.get(lead.campaignId) ?? null)
            : null,
        ),
      ),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0,
      },
    };
  }

  private async leadIdsForEvent(
    workspaceId: string,
    eventName: string,
  ): Promise<string[]> {
    const events = (await this.prisma.conversionEventLog.findMany({
      where: {
        workspaceId,
        eventName,
        leadId: { not: null },
      },
      select: { leadId: true },
      distinct: ["leadId"],
    })) as Array<{ leadId: string | null }>;

    return events.flatMap((event) => (event.leadId ? [event.leadId] : []));
  }

  async getLeadDetail(
    workspaceId: string,
    leadId: string,
  ): Promise<LeadDetailDto> {
    const lead = (await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        workspaceId,
      },
    })) as LeadRecord | null;

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado");
    }

    const [conversionLogs, webhookLogs, campaigns, adSets, ads] =
      await Promise.all([
        this.prisma.conversionEventLog.findMany({
          where: {
            workspaceId,
            OR: [{ leadId: lead.id }, { phoneHash: lead.phoneHash }],
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            leadId: true,
            phoneHash: true,
            sourceTrigger: true,
            eventName: true,
            status: true,
            pixelId: true,
            campaignId: true,
            adSetId: true,
            adId: true,
            errorCode: true,
            errorMessage: true,
            sentAt: true,
            createdAt: true,
          },
        }) as Promise<ConversionLogRecord[]>,
        this.prisma.webhookLog.findMany({
          where: {
            workspaceId,
            OR: [{ leadId: lead.id }, { phoneHash: lead.phoneHash }],
          },
          orderBy: { receivedAt: "desc" },
          select: {
            id: true,
            source: true,
            eventType: true,
            status: true,
            errorCode: true,
            errorMessage: true,
            receivedAt: true,
            processedAt: true,
          },
        }) as Promise<WebhookLogRecord[]>,
        lead.campaignId
          ? (this.prisma.metaCampaign.findMany({
              where: {
                workspaceId,
                campaignId: { in: [lead.campaignId] },
              },
              select: {
                campaignId: true,
                name: true,
              },
            }) as Promise<CampaignRecord[]>)
          : Promise.resolve([]),
        lead.adSetId
          ? (this.prisma.metaAdSet.findMany({
              where: {
                workspaceId,
                adSetId: { in: [lead.adSetId] },
              },
              select: {
                adSetId: true,
                name: true,
              },
            }) as Promise<AdSetRecord[]>)
          : Promise.resolve([]),
        lead.adId
          ? (this.prisma.metaAd.findMany({
              where: {
                workspaceId,
                adId: { in: [lead.adId] },
              },
              select: {
                adId: true,
                name: true,
              },
            }) as Promise<AdRecord[]>)
          : Promise.resolve([]),
      ]);
    const campaignName = campaigns[0]?.name ?? null;
    const latestEventName = conversionLogs[0]?.eventName ?? null;

    return {
      lead: this.toDto(lead, latestEventName, campaignName),
      attribution: {
        campaignName,
        adSetName: adSets[0]?.name ?? null,
        adName: ads[0]?.name ?? null,
      },
      conversionEvents: conversionLogs.map((event) => ({
        id: event.id ?? "",
        eventName: event.eventName,
        status: event.status ?? "unknown",
        sourceTrigger: event.sourceTrigger ?? "unknown",
        pixelId: event.pixelId ?? null,
        campaignId: event.campaignId ?? null,
        adSetId: event.adSetId ?? null,
        adId: event.adId ?? null,
        errorCode: event.errorCode ?? null,
        errorMessage: event.errorMessage ?? null,
        sentAt: event.sentAt?.toISOString() ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
      webhookEvents: webhookLogs.map((event) => ({
        id: event.id,
        source: event.source,
        eventType: event.eventType,
        status: event.status,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
        receivedAt: event.receivedAt.toISOString(),
        processedAt: event.processedAt?.toISOString() ?? null,
      })),
    };
  }

  async upsertFromWhatsappWebhook(
    input: UpsertWhatsappLeadInput,
  ): Promise<{ id: string } | null> {
    const phoneHash = input.phoneHash ?? this.hashPhone(input.phone);

    if (!phoneHash) {
      return null;
    }

    const occurredAt = input.occurredAt ?? new Date();
    const recordMessageTimestamps = input.recordMessageTimestamps !== false;
    const firstMessageAt = input.firstMessageAt ?? occurredAt;
    const lastMessageAt = input.lastMessageAt ?? occurredAt;
    const labels = this.normalizeLabels(input.labels);
    const lead = await this.prisma.lead.upsert({
      where: {
        workspaceId_phoneHash: {
          workspaceId: input.workspaceId,
          phoneHash,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        whatsappInstanceId: input.whatsappInstanceId ?? null,
        name: input.name ?? null,
        phoneDisplay: this.maskPhone(input.phone) ?? null,
        phoneHash,
        status: "active",
        source: input.source ?? "uazapi",
        labels: labels ?? [],
        campaignId: input.campaignId ?? null,
        adSetId: input.adSetId ?? null,
        adId: input.adId ?? null,
        ctwaClid: input.ctwaClid ?? null,
        ctwaSourceUrl: input.ctwaSourceUrl ?? null,
        firstMessageAt: recordMessageTimestamps ? firstMessageAt : null,
        lastMessageAt: recordMessageTimestamps ? lastMessageAt : null,
      },
      update: {
        whatsappInstanceId: input.whatsappInstanceId ?? undefined,
        name: input.name ?? undefined,
        phoneDisplay: this.maskPhone(input.phone) ?? undefined,
        source: input.preserveExistingSource ? undefined : input.source ?? undefined,
        labels: labels ?? undefined,
        campaignId: input.campaignId ?? undefined,
        adSetId: input.adSetId ?? undefined,
        adId: input.adId ?? undefined,
        ctwaClid: input.ctwaClid ?? undefined,
        ctwaSourceUrl: input.ctwaSourceUrl ?? undefined,
        firstMessageAt:
          recordMessageTimestamps && input.firstMessageAt
            ? firstMessageAt
            : undefined,
        lastMessageAt: recordMessageTimestamps ? lastMessageAt : undefined,
      },
      select: {
        id: true,
      },
    });

    return lead;
  }

  private toDto(
    lead: LeadRecord,
    lastEventName: string | null,
    campaignName: string | null,
  ): LeadListItemDto {
    return {
      id: lead.id,
      workspaceId: lead.workspaceId,
      name: lead.name,
      phoneDisplay: lead.phoneDisplay,
      phoneHash: lead.phoneHash,
      status: this.statusFromEvent(lead.status, lastEventName),
      source: lead.source,
      labels: lead.labels,
      campaignId: lead.campaignId,
      campaignName,
      adSetId: lead.adSetId,
      adId: lead.adId,
      lastEventName,
      score: this.scoreLead(lead, lastEventName),
      firstMessageAt: lead.firstMessageAt?.toISOString() ?? null,
      lastMessageAt: lead.lastMessageAt?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    };
  }

  private createdAtRange(
    query: Pick<LeadListQueryDto, "since" | "until">,
  ): { gte?: Date; lte?: Date } | null {
    if (!query.since && !query.until) {
      return null;
    }

    return {
      ...(query.since ? { gte: new Date(`${query.since}T00:00:00.000Z`) } : {}),
      ...(query.until ? { lte: new Date(`${query.until}T23:59:59.999Z`) } : {}),
    };
  }

  private statusFromEvent(
    status: LeadStatusDto,
    eventName: string | null,
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

  private normalizeLabels(labels?: string[]): string[] | undefined {
    if (!labels) {
      return undefined;
    }

    const normalized = labels.map((label) => label.trim()).filter(Boolean);

    return Array.from(new Set(normalized));
  }
}
