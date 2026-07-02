import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdReportOverviewDto,
  AdReportRowDto,
  AdSetReportOverviewDto,
  AdSetReportRowDto,
  CampaignReportRowDto,
  MetaStructureReportDto,
  ReportOverviewDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  MetaAdapter,
  type MetaAdAsset,
  type MetaAdSetAsset,
  type MetaCampaignAsset,
  type MetaCampaignInsight
} from "../integrations/meta/meta.adapter";
import { MetaTokenEncryptionService } from "../integrations/meta/meta-token-encryption.service";

export type MetaStructureSyncInput = {
  workspaceId: string;
  since: string;
  until: string;
};

export type MetaStructureSyncResult = {
  workspaceId: string;
  adAccountId: string;
  campaignsSynced: number;
  adSetsSynced: number;
  adsSynced: number;
};

type MetaIntegrationRecord = {
  workspaceId: string;
  encryptedAccessToken: string;
  tokenIv: string;
  tokenTag: string;
  selectedAdAccountId: string | null;
};

type MetaCampaignRecord = {
  campaignId: string;
  name: string;
  status: string | null;
  effectiveStatus?: string | null;
  objective?: string | null;
  spendCents: number;
  metaConversationsStarted: number;
};

type MetaAdSetRecord = {
  adSetId: string;
  campaignId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
};

type MetaAdRecord = {
  adId: string;
  adSetId: string;
  campaignId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
};

type ConversionEventRecord = {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  eventName: string;
  status: string;
};

type LeadRecord = {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
};

@Injectable()
export class MetaReportingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly encryption: MetaTokenEncryptionService,
    private readonly metaAdapter: MetaAdapter
  ) {}

  async syncWorkspaceMetaStructure(
    input: MetaStructureSyncInput
  ): Promise<MetaStructureSyncResult> {
    const connection = await this.getConnection(input.workspaceId);
    const accessToken = this.encryption.decrypt({
      encryptedAccessToken: connection.encryptedAccessToken,
      tokenIv: connection.tokenIv,
      tokenTag: connection.tokenTag
    });
    const adAccountId = connection.selectedAdAccountId;

    if (!adAccountId) {
      throw new NotFoundException("Conta de anuncio Meta nao selecionada");
    }

    const [campaigns, adSets, ads, insights] = await Promise.all([
      this.metaAdapter.listCampaigns({ accessToken, adAccountId }),
      this.metaAdapter.listAdSets({ accessToken, adAccountId }),
      this.metaAdapter.listAds({ accessToken, adAccountId }),
      this.metaAdapter.listCampaignInsights({
        accessToken,
        adAccountId,
        since: input.since,
        until: input.until
      })
    ]);
    const insightByCampaign = new Map(
      insights.map((item) => [item.campaignId, item])
    );
    const syncedAt = new Date();

    await Promise.all([
      ...campaigns.map((campaign) =>
        this.upsertCampaign({
          workspaceId: input.workspaceId,
          adAccountId,
          campaign,
          insight: insightByCampaign.get(campaign.id),
          syncedAt
        })
      ),
      ...adSets.map((adSet) =>
        this.upsertAdSet({
          workspaceId: input.workspaceId,
          adSet,
          syncedAt
        })
      ),
      ...ads.map((ad) =>
        this.upsertAd({
          workspaceId: input.workspaceId,
          ad,
          syncedAt
        })
      )
    ]);

    return {
      workspaceId: input.workspaceId,
      adAccountId,
      campaignsSynced: campaigns.length,
      adSetsSynced: adSets.length,
      adsSynced: ads.length
    };
  }

  async getCampaignReportOverview(input: {
    workspaceId: string;
    rangeLabel: string;
    since?: string;
    until?: string;
  }): Promise<ReportOverviewDto> {
    const campaigns = (await this.prisma.metaCampaign.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: { name: "asc" }
    })) as MetaCampaignRecord[];
    const conversionLogs = (await this.prisma.conversionEventLog.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: "sent",
        ...(input.since && input.until
          ? {
              createdAt: {
                gte: new Date(`${input.since}T00:00:00.000Z`),
                lte: new Date(`${input.until}T23:59:59.999Z`)
              }
            }
          : {})
      },
      select: {
        campaignId: true,
        adSetId: true,
        adId: true,
        eventName: true,
        status: true
      }
    })) as ConversionEventRecord[];
    const leads = (await this.prisma.lead.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.since && input.until
          ? {
              createdAt: {
                gte: new Date(`${input.since}T00:00:00.000Z`),
                lte: new Date(`${input.until}T23:59:59.999Z`)
              }
            }
          : {})
      },
      select: {
        campaignId: true,
        adSetId: true,
        adId: true
      }
    })) as LeadRecord[];

    return {
      workspaceId: input.workspaceId,
      rangeLabel: input.rangeLabel,
      campaigns: campaigns.map((campaign) =>
        this.toReportRow(campaign, conversionLogs, leads)
      )
    };
  }

  async getAdSetReportOverview(input: {
    workspaceId: string;
    rangeLabel: string;
    since?: string;
    until?: string;
  }): Promise<AdSetReportOverviewDto> {
    const [campaigns, adSets, conversionLogs, leads] = await Promise.all([
      this.prisma.metaCampaign.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { name: "asc" }
      }) as Promise<MetaCampaignRecord[]>,
      this.prisma.metaAdSet.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { name: "asc" }
      }) as Promise<MetaAdSetRecord[]>,
      this.getSentConversionEvents(input),
      this.getLeads(input)
    ]);
    const campaignNames = new Map(
      campaigns.map((campaign) => [campaign.campaignId, campaign.name])
    );

    return {
      workspaceId: input.workspaceId,
      rangeLabel: input.rangeLabel,
      adSets: adSets.map((adSet) =>
        this.toAdSetReportRow({
          adSet,
          campaignName:
            campaignNames.get(adSet.campaignId) ?? "Campanha nao resolvida",
          conversionLogs,
          leads
        })
      )
    };
  }

  async getAdReportOverview(input: {
    workspaceId: string;
    rangeLabel: string;
    since?: string;
    until?: string;
  }): Promise<AdReportOverviewDto> {
    const [campaigns, adSets, ads, conversionLogs, leads] = await Promise.all([
      this.prisma.metaCampaign.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { name: "asc" }
      }) as Promise<MetaCampaignRecord[]>,
      this.prisma.metaAdSet.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { name: "asc" }
      }) as Promise<MetaAdSetRecord[]>,
      this.prisma.metaAd.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { name: "asc" }
      }) as Promise<MetaAdRecord[]>,
      this.getSentConversionEvents(input),
      this.getLeads(input)
    ]);
    const campaignNames = new Map(
      campaigns.map((campaign) => [campaign.campaignId, campaign.name])
    );
    const adSetNames = new Map(adSets.map((adSet) => [adSet.adSetId, adSet.name]));

    return {
      workspaceId: input.workspaceId,
      rangeLabel: input.rangeLabel,
      ads: ads.map((ad) =>
        this.toAdReportRow({
          ad,
          campaignName:
            campaignNames.get(ad.campaignId) ?? "Campanha nao resolvida",
          adSetName: adSetNames.get(ad.adSetId) ?? "Conjunto nao resolvido",
          conversionLogs,
          leads
        })
      )
    };
  }

  async getMetaStructureReport(
    workspaceId: string
  ): Promise<MetaStructureReportDto> {
    const [campaigns, adSets, ads] = (await Promise.all([
      this.prisma.metaCampaign.findMany({
        where: { workspaceId },
        orderBy: { name: "asc" }
      }),
      this.prisma.metaAdSet.findMany({
        where: { workspaceId },
        orderBy: { name: "asc" }
      }),
      this.prisma.metaAd.findMany({
        where: { workspaceId },
        orderBy: { name: "asc" }
      })
    ])) as [MetaCampaignRecord[], MetaAdSetRecord[], MetaAdRecord[]];

    return {
      workspaceId,
      campaigns: campaigns.map((campaign) => ({
        id: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
        effectiveStatus: campaign.effectiveStatus ?? null,
        objective: campaign.objective ?? null,
        adSets: adSets
          .filter((adSet) => adSet.campaignId === campaign.campaignId)
          .map((adSet) => ({
            id: adSet.adSetId,
            name: adSet.name,
            status: adSet.status,
            effectiveStatus: adSet.effectiveStatus,
            ads: ads
              .filter((ad) => ad.adSetId === adSet.adSetId)
              .map((ad) => ({
                id: ad.adId,
                name: ad.name,
                status: ad.status,
                effectiveStatus: ad.effectiveStatus
              }))
          }))
      }))
    };
  }

  private async getConnection(
    workspaceId: string
  ): Promise<MetaIntegrationRecord> {
    const connection = (await this.prisma.metaIntegration.findUnique({
      where: { workspaceId }
    })) as MetaIntegrationRecord | null;

    if (!connection) {
      throw new NotFoundException("Meta nao conectada");
    }

    return connection;
  }

  private upsertCampaign(input: {
    workspaceId: string;
    adAccountId: string;
    campaign: MetaCampaignAsset;
    insight?: MetaCampaignInsight;
    syncedAt: Date;
  }) {
    const data = {
      adAccountId: input.adAccountId,
      name: input.campaign.name,
      status: input.campaign.status,
      effectiveStatus: input.campaign.effectiveStatus,
      objective: input.campaign.objective,
      spendCents: input.insight?.spendCents ?? 0,
      impressions: input.insight?.impressions ?? 0,
      clicks: input.insight?.clicks ?? 0,
      metaConversationsStarted: input.insight?.metaConversationsStarted ?? 0,
      lastSyncedAt: input.syncedAt
    };

    return this.prisma.metaCampaign.upsert({
      where: {
        workspaceId_campaignId: {
          workspaceId: input.workspaceId,
          campaignId: input.campaign.id
        }
      },
      create: {
        workspaceId: input.workspaceId,
        campaignId: input.campaign.id,
        ...data
      },
      update: data
    });
  }

  private upsertAdSet(input: {
    workspaceId: string;
    adSet: MetaAdSetAsset;
    syncedAt: Date;
  }) {
    const data = {
      campaignId: input.adSet.campaignId,
      name: input.adSet.name,
      status: input.adSet.status,
      effectiveStatus: input.adSet.effectiveStatus,
      lastSyncedAt: input.syncedAt
    };

    return this.prisma.metaAdSet.upsert({
      where: {
        workspaceId_adSetId: {
          workspaceId: input.workspaceId,
          adSetId: input.adSet.id
        }
      },
      create: {
        workspaceId: input.workspaceId,
        adSetId: input.adSet.id,
        ...data
      },
      update: data
    });
  }

  private upsertAd(input: {
    workspaceId: string;
    ad: MetaAdAsset;
    syncedAt: Date;
  }) {
    const data = {
      campaignId: input.ad.campaignId,
      adSetId: input.ad.adSetId,
      name: input.ad.name,
      status: input.ad.status,
      effectiveStatus: input.ad.effectiveStatus,
      lastSyncedAt: input.syncedAt
    };

    return this.prisma.metaAd.upsert({
      where: {
        workspaceId_adId: {
          workspaceId: input.workspaceId,
          adId: input.ad.id
        }
      },
      create: {
        workspaceId: input.workspaceId,
        adId: input.ad.id,
        ...data
      },
      update: data
    });
  }

  private toReportRow(
    campaign: MetaCampaignRecord,
    conversionLogs: ConversionEventRecord[],
    leads: LeadRecord[]
  ): CampaignReportRowDto {
    const campaignEvents = conversionLogs.filter(
      (item) => item.campaignId === campaign.campaignId
    );
    const realConversations = leads.filter(
      (item) => item.campaignId === campaign.campaignId
    ).length;
    const leadSubmitted = this.countEvents(campaignEvents, "LeadSubmitted");
    const qualifiedLead = this.countEvents(campaignEvents, "QualifiedLead");
    const purchase = this.countEvents(campaignEvents, "Purchase");

    return {
      id: campaign.campaignId,
      name: campaign.name,
      status: this.toReportStatus(campaign.status),
      spendCents: campaign.spendCents,
      metaConversationsStarted: campaign.metaConversationsStarted,
      costPerMetaConversationCents: this.costPer(
        campaign.spendCents,
        campaign.metaConversationsStarted
      ),
      realConversations,
      costPerRealConversationCents: this.costPer(
        campaign.spendCents,
        realConversations
      ),
      leadSubmitted,
      costPerLeadSubmittedCents: this.costPer(campaign.spendCents, leadSubmitted),
      qualifiedLead,
      costPerQualifiedLeadCents: this.costPer(
        campaign.spendCents,
        qualifiedLead
      ),
      purchase,
      costPerPurchaseCents: this.costPer(campaign.spendCents, purchase),
      roas: null
    };
  }

  private toAdSetReportRow(input: {
    adSet: MetaAdSetRecord;
    campaignName: string;
    conversionLogs: ConversionEventRecord[];
    leads: LeadRecord[];
  }): AdSetReportRowDto {
    const events = input.conversionLogs.filter(
      (item) => item.adSetId === input.adSet.adSetId
    );
    const realConversations = input.leads.filter(
      (item) => item.adSetId === input.adSet.adSetId
    ).length;
    const metrics = this.toZeroSpendMetrics(events, realConversations);

    return {
      id: input.adSet.adSetId,
      campaignId: input.adSet.campaignId,
      campaignName: input.campaignName,
      name: input.adSet.name,
      status: this.toReportStatus(input.adSet.status),
      ...metrics
    };
  }

  private toAdReportRow(input: {
    ad: MetaAdRecord;
    campaignName: string;
    adSetName: string;
    conversionLogs: ConversionEventRecord[];
    leads: LeadRecord[];
  }): AdReportRowDto {
    const events = input.conversionLogs.filter(
      (item) => item.adId === input.ad.adId
    );
    const realConversations = input.leads.filter(
      (item) => item.adId === input.ad.adId
    ).length;
    const metrics = this.toZeroSpendMetrics(events, realConversations);

    return {
      id: input.ad.adId,
      campaignId: input.ad.campaignId,
      campaignName: input.campaignName,
      adSetId: input.ad.adSetId,
      adSetName: input.adSetName,
      name: input.ad.name,
      status: this.toReportStatus(input.ad.status),
      ...metrics
    };
  }

  private toZeroSpendMetrics(
    events: ConversionEventRecord[],
    realConversations: number
  ): Omit<
    CampaignReportRowDto,
    "id" | "name" | "status" | "spendCents" | "metaConversationsStarted"
  > &
    Pick<CampaignReportRowDto, "spendCents" | "metaConversationsStarted"> {
    const spendCents = 0;
    const metaConversationsStarted = 0;
    const leadSubmitted = this.countEvents(events, "LeadSubmitted");
    const qualifiedLead = this.countEvents(events, "QualifiedLead");
    const purchase = this.countEvents(events, "Purchase");

    return {
      spendCents,
      metaConversationsStarted,
      costPerMetaConversationCents: null,
      realConversations,
      costPerRealConversationCents: null,
      leadSubmitted,
      costPerLeadSubmittedCents: null,
      qualifiedLead,
      costPerQualifiedLeadCents: null,
      purchase,
      costPerPurchaseCents: null,
      roas: null
    };
  }

  private getSentConversionEvents(input: {
    workspaceId: string;
    since?: string;
    until?: string;
  }): Promise<ConversionEventRecord[]> {
    return this.prisma.conversionEventLog.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: "sent",
        ...this.periodWhere(input)
      },
      select: {
        campaignId: true,
        adSetId: true,
        adId: true,
        eventName: true,
        status: true
      }
    }) as Promise<ConversionEventRecord[]>;
  }

  private getLeads(input: {
    workspaceId: string;
    since?: string;
    until?: string;
  }): Promise<LeadRecord[]> {
    return this.prisma.lead.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...this.periodWhere(input)
      },
      select: {
        campaignId: true,
        adSetId: true,
        adId: true
      }
    }) as Promise<LeadRecord[]>;
  }

  private periodWhere(input: { since?: string; until?: string }) {
    return input.since && input.until
      ? {
          createdAt: {
            gte: new Date(`${input.since}T00:00:00.000Z`),
            lte: new Date(`${input.until}T23:59:59.999Z`)
          }
        }
      : {};
  }

  private countEvents(
    events: ConversionEventRecord[],
    eventName: string
  ): number {
    return events.filter((item) => item.eventName === eventName).length;
  }

  private costPer(spendCents: number, count: number): number | null {
    return count > 0 ? Math.floor(spendCents / count) : null;
  }

  private toReportStatus(status: string | null): CampaignReportRowDto["status"] {
    if (status === "ACTIVE") {
      return "active";
    }

    if (status === "PAUSED") {
      return "paused";
    }

    if (status === "DELETED" || status === "ARCHIVED") {
      return "deleted";
    }

    return "unknown";
  }
}
