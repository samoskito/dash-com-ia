import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
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
  type MetaAdInsight,
  type MetaAdSetAsset,
  type MetaAdSetInsight,
  type MetaCampaignAsset,
  type MetaCampaignInsight
} from "../integrations/meta/meta.adapter";
import { MetaTokenEncryptionService } from "../integrations/meta/meta-token-encryption.service";
import {
  WhatsappCampaignClassifierService,
  type WhatsappClassification
} from "./whatsapp-campaign-classifier.service";

export type MetaStructureSyncInput = {
  workspaceId: string;
  since: string;
  until: string;
};

export type MetaStructureSyncResult = {
  workspaceId: string;
  accountsSynced: number;
  accountsFailed: number;
  campaignsSynced: number;
  adSetsSynced: number;
  adsSynced: number;
};

export type ReportCsvResult = {
  filename: string;
  content: string;
};

type WhatsappClassificationFilter =
  | "whatsapp"
  | "needs_review"
  | "excluded"
  | "all";

type ReportFilterInput = {
  businessId?: string;
  adAccountId?: string;
  whatsappClassification?: WhatsappClassificationFilter;
};

type StringFilter = string | { in: string[] };

type MetaSnapshotWhere = {
  workspaceId: string;
  businessId?: StringFilter;
  adAccountId?: StringFilter;
  whatsappClassification?:
    | WhatsappClassification
    | { in: WhatsappClassification[] };
};

type MetaIntegrationRecord = {
  workspaceId: string;
  encryptedAccessToken: string;
  tokenIv: string;
  tokenTag: string;
};

type MetaReportingAccountRecord = {
  id: string;
  workspaceId: string;
  businessId: string;
  businessName: string;
  adAccountId: string;
  adAccountName: string;
  active: boolean;
};

type ExistingClassificationRecord = {
  classificationOverride?: WhatsappClassification | null;
  whatsappClassification?: WhatsappClassification | null;
};

type MetaCampaignRecord = {
  campaignId: string;
  name: string;
  status: string | null;
  effectiveStatus?: string | null;
  objective?: string | null;
  businessId?: string | null;
  adAccountId?: string | null;
  whatsappClassification?: WhatsappClassification;
  spendCents: number;
  metaConversationsStarted: number;
};

type MetaAdSetRecord = {
  adSetId: string;
  campaignId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  destinationType?: string | null;
  businessId?: string | null;
  adAccountId?: string | null;
  whatsappClassification?: WhatsappClassification;
  spendCents: number;
  metaConversationsStarted: number;
};

type MetaAdRecord = {
  adId: string;
  adSetId: string;
  campaignId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  destinationType?: string | null;
  callToActionType?: string | null;
  businessId?: string | null;
  adAccountId?: string | null;
  whatsappClassification?: WhatsappClassification;
  spendCents: number;
  metaConversationsStarted: number;
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

type LeadEvidenceMaps = {
  campaigns: Set<string>;
  adSets: Set<string>;
  ads: Set<string>;
};

type CampaignMetricOverride = {
  spendCents: number;
  metaConversationsStarted: number;
  adSetIds: Set<string>;
};

type WhatsappOverrideLevel = "campaign" | "adset" | "ad";
type WhatsappManualOverride = "manual_include" | "manual_exclude";
type WhatsappOverrideUpdateData = {
  classificationOverride: WhatsappManualOverride | null;
  whatsappClassification: WhatsappClassification;
  classificationSource: string;
};

@Injectable()
export class MetaReportingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly encryption: MetaTokenEncryptionService,
    private readonly metaAdapter: MetaAdapter,
    private readonly whatsappClassifier: WhatsappCampaignClassifierService
  ) {}

  async syncWorkspaceMetaStructure(
    input: MetaStructureSyncInput
  ): Promise<MetaStructureSyncResult> {
    const startedAt = new Date();
    const connection = await this.getConnection(input.workspaceId);
    const accessToken = this.encryption.decrypt({
      encryptedAccessToken: connection.encryptedAccessToken,
      tokenIv: connection.tokenIv,
      tokenTag: connection.tokenTag
    });

    const accounts = (await this.prisma.metaReportingAccount.findMany({
      where: { workspaceId: input.workspaceId, active: true }
    })) as MetaReportingAccountRecord[];

    if (accounts.length === 0) {
      throw new NotFoundException("Nenhuma conta Meta ativa para relatorios");
    }

    const result: MetaStructureSyncResult = {
      workspaceId: input.workspaceId,
      accountsSynced: 0,
      accountsFailed: 0,
      campaignsSynced: 0,
      adSetsSynced: 0,
      adsSynced: 0
    };

    for (const account of accounts) {
      try {
        await this.prisma.metaReportingAccount.update({
          where: { id: account.id },
          data: {
            syncStatus: "syncing",
            syncError: null
          }
        });

        const accountResult = await this.syncReportingAccount({
          workspaceId: input.workspaceId,
          accessToken,
          account,
          since: input.since,
          until: input.until
        });

        await this.prisma.metaReportingAccount.update({
          where: { id: account.id },
          data: {
            syncStatus: "synced",
            lastSyncedAt: new Date(),
            syncError: null
          }
        });

        result.accountsSynced += 1;
        result.campaignsSynced += accountResult.campaignsSynced;
        result.adSetsSynced += accountResult.adSetsSynced;
        result.adsSynced += accountResult.adsSynced;
      } catch (error) {
        result.accountsFailed += 1;
        await this.prisma.metaReportingAccount.update({
          where: { id: account.id },
          data: {
            syncStatus: "error",
            syncError: this.errorMessage(error)
          }
        });
      }
    }

    if (result.accountsSynced === 0 && result.accountsFailed > 0) {
      const error = new Error("Todas as contas Meta falharam na sincronizacao");
      await this.recordMetaReportingSyncDiagnostics({
        input,
        startedAt,
        result,
        error
      });
      throw error;
    }

    await this.recordMetaReportingSyncDiagnostics({
      input,
      startedAt,
      result
    });

    return result;
  }

  private async syncReportingAccount(input: {
    workspaceId: string;
    accessToken: string;
    account: MetaReportingAccountRecord;
    since: string;
    until: string;
  }): Promise<{
    campaignsSynced: number;
    adSetsSynced: number;
    adsSynced: number;
  }> {
    const adAccountId = input.account.adAccountId;
    const [campaigns, adSets, ads, campaignInsights, adSetInsights, adInsights] =
      await Promise.all([
        this.metaAdapter.listCampaigns({
          accessToken: input.accessToken,
          adAccountId
        }),
        this.metaAdapter.listAdSets({
          accessToken: input.accessToken,
          adAccountId
        }),
        this.metaAdapter.listAds({ accessToken: input.accessToken, adAccountId }),
        this.metaAdapter.listCampaignInsights({
          accessToken: input.accessToken,
          adAccountId,
          since: input.since,
          until: input.until
        }),
        this.metaAdapter.listAdSetInsights({
          accessToken: input.accessToken,
          adAccountId,
          since: input.since,
          until: input.until
        }),
        this.metaAdapter.listAdInsights({
          accessToken: input.accessToken,
          adAccountId,
          since: input.since,
          until: input.until
        })
      ]);
    const insightByCampaign = new Map(
      campaignInsights.map((item) => [item.campaignId, item])
    );
    const insightByAdSet = new Map(
      adSetInsights.map((item) => [item.adSetId, item])
    );
    const insightByAd = new Map(adInsights.map((item) => [item.adId, item]));
    const adSetById = new Map(adSets.map((adSet) => [adSet.id, adSet]));
    const [
      existingCampaigns,
      existingAdSets,
      existingAds
    ] = await Promise.all([
      this.prisma.metaCampaign.findMany({
        where: {
          workspaceId: input.workspaceId,
          campaignId: { in: campaigns.map((campaign) => campaign.id) }
        },
        select: {
          campaignId: true,
          classificationOverride: true,
          whatsappClassification: true
        }
      }) as Promise<Array<ExistingClassificationRecord & { campaignId: string }>>,
      this.prisma.metaAdSet.findMany({
        where: {
          workspaceId: input.workspaceId,
          adSetId: { in: adSets.map((adSet) => adSet.id) }
        },
        select: {
          adSetId: true,
          classificationOverride: true,
          whatsappClassification: true
        }
      }) as Promise<Array<ExistingClassificationRecord & { adSetId: string }>>,
      this.prisma.metaAd.findMany({
        where: {
          workspaceId: input.workspaceId,
          adId: { in: ads.map((ad) => ad.id) }
        },
        select: {
          adId: true,
          classificationOverride: true,
          whatsappClassification: true
        }
      }) as Promise<Array<ExistingClassificationRecord & { adId: string }>>
    ]);
    const existingCampaignById = new Map(
      existingCampaigns.map((campaign) => [campaign.campaignId, campaign])
    );
    const existingAdSetById = new Map(
      existingAdSets.map((adSet) => [adSet.adSetId, adSet])
    );
    const existingAdById = new Map(existingAds.map((ad) => [ad.adId, ad]));
    const leadEvidence = await this.loadLeadEvidence({
      workspaceId: input.workspaceId,
      campaignIds: campaigns.map((campaign) => campaign.id),
      adSetIds: adSets.map((adSet) => adSet.id),
      adIds: ads.map((ad) => ad.id)
    });
    const adSetClassificationById = new Map(
      adSets.map((adSet) => [
        adSet.id,
        this.whatsappClassifier.classify({
          destinationType: adSet.destinationType,
          callToActionType: null,
          hasLeadEvidence: leadEvidence.adSets.has(adSet.id),
          override: this.manualOverride(existingAdSetById.get(adSet.id))
        })
      ])
    );
    const adClassificationById = new Map(
      ads.map((ad) => [
        ad.id,
        this.whatsappClassifier.classify({
          destinationType: adSetById.get(ad.adSetId)?.destinationType ?? null,
          callToActionType: ad.callToActionType,
          hasLeadEvidence: leadEvidence.ads.has(ad.id),
          override: this.manualOverride(existingAdById.get(ad.id))
        })
      ])
    );
    const campaignClassificationById = new Map(
      campaigns.map((campaign) => {
        const override = this.manualOverride(
          existingCampaignById.get(campaign.id)
        );
        if (override) {
          return [
            campaign.id,
            {
              classification: override,
              source: "manual"
            }
          ];
        }

        const classification = this.campaignClassificationFromChildren([
          ...(leadEvidence.campaigns.has(campaign.id)
            ? [{ whatsappClassification: "detected_by_leads" }]
            : []),
          ...adSets
            .filter((adSet) => adSet.campaignId === campaign.id)
            .map((adSet) => ({
              whatsappClassification:
                adSetClassificationById.get(adSet.id)?.classification ??
                "not_whatsapp"
            })),
          ...ads
            .filter((ad) => ad.campaignId === campaign.id)
            .map((ad) => ({
              whatsappClassification:
                adClassificationById.get(ad.id)?.classification ?? "not_whatsapp"
            }))
        ]);

        return [
          campaign.id,
          {
            classification,
            source:
              classification === "not_whatsapp" ? "children:no_signal" : "children"
          }
        ];
      })
    );
    const syncedAt = new Date();

    await Promise.all([
      ...campaigns.map((campaign) =>
        this.upsertCampaign({
          workspaceId: input.workspaceId,
          account: input.account,
          campaign,
          insight: insightByCampaign.get(campaign.id),
          classification:
            campaignClassificationById.get(campaign.id)?.classification ??
            "not_whatsapp",
          classificationSource:
            campaignClassificationById.get(campaign.id)?.source ?? "children:no_signal",
          syncedAt
        })
      ),
      ...adSets.map((adSet) =>
        this.upsertAdSet({
          workspaceId: input.workspaceId,
          account: input.account,
          adSet,
          insight: insightByAdSet.get(adSet.id),
          classification:
            adSetClassificationById.get(adSet.id)?.classification ??
            "not_whatsapp",
          classificationSource:
            adSetClassificationById.get(adSet.id)?.source ?? "no_signal",
          syncedAt
        })
      ),
      ...ads.map((ad) =>
        this.upsertAd({
          workspaceId: input.workspaceId,
          account: input.account,
          ad,
          destinationType: adSetById.get(ad.adSetId)?.destinationType ?? null,
          insight: insightByAd.get(ad.id),
          classification:
            adClassificationById.get(ad.id)?.classification ?? "not_whatsapp",
          classificationSource:
            adClassificationById.get(ad.id)?.source ?? "no_signal",
          syncedAt
        })
      )
    ]);

    return {
      campaignsSynced: campaigns.length,
      adSetsSynced: adSets.length,
      adsSynced: ads.length
    };
  }

  private async recordMetaReportingSyncDiagnostics(input: {
    input: MetaStructureSyncInput;
    startedAt: Date;
    result?: MetaStructureSyncResult;
    error?: unknown;
  }): Promise<void> {
    const finishedAt = new Date();
    const errorMessage =
      input.error instanceof Error
        ? input.error.message
        : input.error
          ? "Erro desconhecido ao sincronizar relatorios Meta"
          : null;
    const status = input.error ? "error" : "success";

    try {
      const integrationLog = await this.prisma.integrationLog.create({
        data: {
          workspaceId: input.input.workspaceId,
          source: "meta",
          operation: "meta.reporting.sync",
          status,
          startedAt: input.startedAt,
          finishedAt,
          durationMs: Math.max(
            0,
            finishedAt.getTime() - input.startedAt.getTime()
          ),
          providerRequestId: null,
          providerErrorCode: input.error ? "MetaReportingSyncError" : null,
          providerErrorMessage: errorMessage,
          requestSummary: {
            since: input.input.since,
            until: input.input.until
          } as Prisma.InputJsonValue,
          responseSummary: input.result
            ? ({
                accountsSynced: input.result.accountsSynced,
                accountsFailed: input.result.accountsFailed,
                campaignsSynced: input.result.campaignsSynced,
                adSetsSynced: input.result.adSetsSynced,
                adsSynced: input.result.adsSynced
              } as Prisma.InputJsonValue)
            : ({
                errorMessage
              } as Prisma.InputJsonValue)
        }
      });
      await this.prisma.diagnosticEvent.create({
        data: {
          workspaceId: input.input.workspaceId,
          source: "meta",
          eventType: "meta.reporting.sync",
          severity: input.error ? "error" : "info",
          status,
          occurredAt: finishedAt,
          title: input.error
            ? "Falha na sincronizacao de relatorios Meta"
            : "Sincronizacao de relatorios Meta concluida",
          message: input.error
            ? errorMessage ?? "A sincronizacao Meta falhou."
            : "Campanhas, conjuntos e anuncios Meta foram sincronizados.",
          jobId: null,
          errorCode: input.error ? "MetaReportingSyncError" : null,
          integrationLogId: integrationLog.id,
          summaryPayload: {
            since: input.input.since,
            until: input.input.until,
            status,
            ...(input.result
              ? {
                  accountsSynced: input.result.accountsSynced,
                  accountsFailed: input.result.accountsFailed,
                  campaignsSynced: input.result.campaignsSynced,
                  adSetsSynced: input.result.adSetsSynced,
                  adsSynced: input.result.adsSynced
                }
              : {
                  errorMessage
                })
          } as Prisma.InputJsonValue
        }
      });
    } catch {
      return;
    }
  }

  async getCampaignReportOverview(input: {
    workspaceId: string;
    rangeLabel: string;
    since?: string;
    until?: string;
  } & ReportFilterInput): Promise<ReportOverviewDto> {
    const campaignWhere = await this.metaSnapshotWhere(input);
    const usesWhatsappDefault =
      (input.whatsappClassification ?? "whatsapp") === "whatsapp";
    const whatsappAdSetWhere = usesWhatsappDefault
      ? await this.metaSnapshotWhere({
          ...input,
          whatsappClassification: "whatsapp"
        })
      : null;
    const [campaigns, whatsappAdSets] = (await Promise.all([
      this.prisma.metaCampaign.findMany({
        where: campaignWhere,
        orderBy: { name: "asc" }
      }),
      whatsappAdSetWhere
        ? this.prisma.metaAdSet.findMany({
            where: whatsappAdSetWhere,
            orderBy: { name: "asc" }
          })
        : Promise.resolve([])
    ])) as [MetaCampaignRecord[], MetaAdSetRecord[]];
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
    const childMetricByCampaign = this.campaignMetricOverrides(whatsappAdSets);

    return {
      workspaceId: input.workspaceId,
      rangeLabel: input.rangeLabel,
      campaigns: campaigns.map((campaign) =>
        this.toReportRow(
          campaign,
          conversionLogs,
          leads,
          childMetricByCampaign.get(campaign.campaignId)
        )
      )
    };
  }

  async saveWhatsappClassificationOverride(input: {
    workspaceId: string;
    actorUserId: string | null;
    level: WhatsappOverrideLevel;
    id: string;
    override: WhatsappManualOverride | null;
  }): Promise<{ ok: true }> {
    const data = input.override
      ? {
          classificationOverride: input.override,
          whatsappClassification: input.override,
          classificationSource: "manual"
        }
      : await this.resetWhatsappClassificationData(input);
    let result: { count: number };

    if (input.level === "campaign") {
      result = await this.prisma.metaCampaign.updateMany({
        where: { workspaceId: input.workspaceId, campaignId: input.id },
        data
      });
    } else if (input.level === "adset") {
      result = await this.prisma.metaAdSet.updateMany({
        where: { workspaceId: input.workspaceId, adSetId: input.id },
        data
      });
    } else {
      result = await this.prisma.metaAd.updateMany({
        where: { workspaceId: input.workspaceId, adId: input.id },
        data
      });
    }

    if (result.count === 0) {
      throw new NotFoundException("Classificacao Meta nao encontrada");
    }

    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        actorType: input.actorUserId ? "user" : "system",
        action: "meta.whatsapp_classification.override_updated",
        targetType: input.level,
        targetId: input.id,
        reason: null,
        sourceIp: null,
        resultStatus: "success",
        beforeSummary: undefined,
        afterSummary: {
          override: input.override
        } as Prisma.InputJsonValue
      }
    });

    return { ok: true };
  }

  private async resetWhatsappClassificationData(input: {
    workspaceId: string;
    level: WhatsappOverrideLevel;
    id: string;
  }): Promise<WhatsappOverrideUpdateData> {
    if (input.level === "campaign") {
      return this.resetCampaignWhatsappClassification(input.workspaceId, input.id);
    }

    if (input.level === "adset") {
      return this.resetAdSetWhatsappClassification(input.workspaceId, input.id);
    }

    return this.resetAdWhatsappClassification(input.workspaceId, input.id);
  }

  private async resetCampaignWhatsappClassification(
    workspaceId: string,
    campaignId: string
  ): Promise<WhatsappOverrideUpdateData> {
    const campaign = await this.prisma.metaCampaign.findFirst({
      where: { workspaceId, campaignId },
      select: { campaignId: true }
    });

    if (!campaign) {
      throw new NotFoundException("Classificacao Meta nao encontrada");
    }

    const [adSets, ads] = (await Promise.all([
      this.prisma.metaAdSet.findMany({
        where: { workspaceId, campaignId },
        select: { whatsappClassification: true }
      }),
      this.prisma.metaAd.findMany({
        where: { workspaceId, campaignId },
        select: { whatsappClassification: true }
      })
    ])) as [
      Array<{ whatsappClassification: WhatsappClassification }>,
      Array<{ whatsappClassification: WhatsappClassification }>
    ];
    const whatsappClassification = this.campaignClassificationFromChildren([
      ...adSets,
      ...ads
    ]);
    const source =
      whatsappClassification === "not_whatsapp" ? "children:no_signal" : "children";

    return {
      classificationOverride: null,
      whatsappClassification,
      classificationSource: `auto_reset:${source}`
    };
  }

  private async resetAdSetWhatsappClassification(
    workspaceId: string,
    adSetId: string
  ): Promise<WhatsappOverrideUpdateData> {
    const adSet = (await this.prisma.metaAdSet.findFirst({
      where: { workspaceId, adSetId },
      select: { destinationType: true }
    })) as Pick<MetaAdSetRecord, "destinationType"> | null;

    if (!adSet) {
      throw new NotFoundException("Classificacao Meta nao encontrada");
    }

    const result = this.whatsappClassifier.classify({
      destinationType: adSet.destinationType ?? null,
      callToActionType: null,
      hasLeadEvidence: await this.hasLeadEvidence({ workspaceId, adSetId }),
      override: null
    });

    return {
      classificationOverride: null,
      whatsappClassification: result.classification,
      classificationSource: `auto_reset:${result.source}`
    };
  }

  private async resetAdWhatsappClassification(
    workspaceId: string,
    adId: string
  ): Promise<WhatsappOverrideUpdateData> {
    const ad = (await this.prisma.metaAd.findFirst({
      where: { workspaceId, adId },
      select: {
        adSetId: true,
        destinationType: true,
        callToActionType: true
      }
    })) as Pick<
      MetaAdRecord,
      "adSetId" | "destinationType" | "callToActionType"
    > | null;

    if (!ad) {
      throw new NotFoundException("Classificacao Meta nao encontrada");
    }

    const parentAdSet = ad.destinationType
      ? null
      : ((await this.prisma.metaAdSet.findFirst({
          where: { workspaceId, adSetId: ad.adSetId },
          select: { destinationType: true }
        })) as Pick<MetaAdSetRecord, "destinationType"> | null);
    const result = this.whatsappClassifier.classify({
      destinationType:
        ad.destinationType ?? parentAdSet?.destinationType ?? null,
      callToActionType: ad.callToActionType ?? null,
      hasLeadEvidence: await this.hasLeadEvidence({ workspaceId, adId }),
      override: null
    });

    return {
      classificationOverride: null,
      whatsappClassification: result.classification,
      classificationSource: `auto_reset:${result.source}`
    };
  }

  async getCampaignReportCsv(input: {
    workspaceId: string;
    rangeLabel: string;
    since?: string;
    until?: string;
  } & ReportFilterInput): Promise<ReportCsvResult> {
    const report = await this.getCampaignReportOverview(input);
    const rows = [
      [
        "Campanha",
        "Status",
        "Investimento",
        "Conversas Meta",
        "Conversas reais",
        "LeadSubmitted",
        "QualifiedLead",
        "Purchase",
        "ROAS"
      ],
      ...report.campaigns.map((campaign) => [
        campaign.name,
        campaign.status,
        this.centsToDecimal(campaign.spendCents),
        String(campaign.metaConversationsStarted),
        String(campaign.realConversations),
        String(campaign.leadSubmitted),
        String(campaign.qualifiedLead),
        String(campaign.purchase),
        campaign.roas === null ? "" : String(campaign.roas)
      ])
    ];

    return {
      filename: this.csvFilename(input),
      content: `${rows.map((row) => row.map(this.csvCell).join(",")).join("\n")}\n`
    };
  }

  async getAdSetReportOverview(input: {
    workspaceId: string;
    rangeLabel: string;
    since?: string;
    until?: string;
  } & ReportFilterInput): Promise<AdSetReportOverviewDto> {
    const hierarchyWhere = await this.metaHierarchyWhere(input);
    const snapshotWhere = await this.metaSnapshotWhere(input);
    const [campaigns, adSets, conversionLogs, leads] = await Promise.all([
      this.prisma.metaCampaign.findMany({
        where: hierarchyWhere,
        orderBy: { name: "asc" }
      }) as Promise<MetaCampaignRecord[]>,
      this.prisma.metaAdSet.findMany({
        where: snapshotWhere,
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
  } & ReportFilterInput): Promise<AdReportOverviewDto> {
    const hierarchyWhere = await this.metaHierarchyWhere(input);
    const snapshotWhere = await this.metaSnapshotWhere(input);
    const [campaigns, adSets, ads, conversionLogs, leads] = await Promise.all([
      this.prisma.metaCampaign.findMany({
        where: hierarchyWhere,
        orderBy: { name: "asc" }
      }) as Promise<MetaCampaignRecord[]>,
      this.prisma.metaAdSet.findMany({
        where: hierarchyWhere,
        orderBy: { name: "asc" }
      }) as Promise<MetaAdSetRecord[]>,
      this.prisma.metaAd.findMany({
        where: snapshotWhere,
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
    const where = await this.metaHierarchyWhere({ workspaceId });
    const [campaigns, adSets, ads] = (await Promise.all([
      this.prisma.metaCampaign.findMany({
        where,
        orderBy: { name: "asc" }
      }),
      this.prisma.metaAdSet.findMany({
        where,
        orderBy: { name: "asc" }
      }),
      this.prisma.metaAd.findMany({
        where,
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
    account: MetaReportingAccountRecord;
    campaign: MetaCampaignAsset;
    insight?: MetaCampaignInsight;
    classification: WhatsappClassification;
    classificationSource: string;
    syncedAt: Date;
  }) {
    const data = {
      businessId: input.account.businessId,
      adAccountId: input.account.adAccountId,
      name: input.campaign.name,
      status: input.campaign.status,
      effectiveStatus: input.campaign.effectiveStatus,
      objective: input.campaign.objective,
      whatsappClassification: input.classification,
      classificationSource: input.classificationSource,
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
    account: MetaReportingAccountRecord;
    adSet: MetaAdSetAsset;
    insight?: MetaAdSetInsight;
    classification: WhatsappClassification;
    classificationSource: string;
    syncedAt: Date;
  }) {
    const data = {
      businessId: input.account.businessId,
      adAccountId: input.account.adAccountId,
      campaignId: input.adSet.campaignId,
      name: input.adSet.name,
      status: input.adSet.status,
      effectiveStatus: input.adSet.effectiveStatus,
      destinationType: input.adSet.destinationType,
      whatsappClassification: input.classification,
      classificationSource: input.classificationSource,
      spendCents: input.insight?.spendCents ?? 0,
      impressions: input.insight?.impressions ?? 0,
      clicks: input.insight?.clicks ?? 0,
      metaConversationsStarted: input.insight?.metaConversationsStarted ?? 0,
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
    account: MetaReportingAccountRecord;
    ad: MetaAdAsset;
    destinationType: string | null;
    insight?: MetaAdInsight;
    classification: WhatsappClassification;
    classificationSource: string;
    syncedAt: Date;
  }) {
    const data = {
      businessId: input.account.businessId,
      adAccountId: input.account.adAccountId,
      campaignId: input.ad.campaignId,
      adSetId: input.ad.adSetId,
      name: input.ad.name,
      status: input.ad.status,
      effectiveStatus: input.ad.effectiveStatus,
      destinationType: input.destinationType,
      creativeId: input.ad.creativeId,
      callToActionType: input.ad.callToActionType,
      whatsappClassification: input.classification,
      classificationSource: input.classificationSource,
      spendCents: input.insight?.spendCents ?? 0,
      impressions: input.insight?.impressions ?? 0,
      clicks: input.insight?.clicks ?? 0,
      metaConversationsStarted: input.insight?.metaConversationsStarted ?? 0,
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

  private manualOverride(
    record?: ExistingClassificationRecord
  ): WhatsappClassification | null {
    const override =
      record?.classificationOverride ?? record?.whatsappClassification ?? null;

    return override === "manual_include" || override === "manual_exclude"
      ? override
      : null;
  }

  private campaignClassificationFromChildren(
    children: Array<{ whatsappClassification: string }>
  ): WhatsappClassification {
    const order: WhatsappClassification[] = [
      "manual_include",
      "auto_whatsapp",
      "creative_whatsapp",
      "detected_by_leads",
      "needs_review",
      "not_whatsapp",
      "manual_exclude"
    ];

    return (
      order.find((value) =>
        children.some((child) => child.whatsappClassification === value)
      ) ?? "not_whatsapp"
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : "Erro desconhecido ao sincronizar relatorios Meta";
  }

  private toReportRow(
    campaign: MetaCampaignRecord,
    conversionLogs: ConversionEventRecord[],
    leads: LeadRecord[],
    metricOverride?: CampaignMetricOverride
  ): CampaignReportRowDto {
    const restrictToAdSets = metricOverride?.adSetIds.size
      ? metricOverride.adSetIds
      : null;
    const campaignEvents = conversionLogs.filter(
      (item) =>
        item.campaignId === campaign.campaignId &&
        (!restrictToAdSets || !item.adSetId || restrictToAdSets.has(item.adSetId))
    );
    const realConversations = leads.filter(
      (item) =>
        item.campaignId === campaign.campaignId &&
        (!restrictToAdSets || !item.adSetId || restrictToAdSets.has(item.adSetId))
    ).length;
    const metrics = this.toMetrics({
      spendCents: metricOverride?.spendCents ?? campaign.spendCents,
      metaConversationsStarted:
        metricOverride?.metaConversationsStarted ??
        campaign.metaConversationsStarted,
      events: campaignEvents,
      realConversations
    });

    return {
      id: campaign.campaignId,
      name: campaign.name,
      status: this.toReportStatus(campaign.status),
      businessId: campaign.businessId,
      adAccountId: campaign.adAccountId,
      whatsappClassification: campaign.whatsappClassification,
      ...metrics
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
    const metrics = this.toMetrics({
      spendCents: input.adSet.spendCents,
      metaConversationsStarted: input.adSet.metaConversationsStarted,
      events,
      realConversations
    });

    return {
      id: input.adSet.adSetId,
      campaignId: input.adSet.campaignId,
      campaignName: input.campaignName,
      name: input.adSet.name,
      status: this.toReportStatus(input.adSet.status),
      businessId: input.adSet.businessId,
      adAccountId: input.adSet.adAccountId,
      whatsappClassification: input.adSet.whatsappClassification,
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
    const metrics = this.toMetrics({
      spendCents: input.ad.spendCents,
      metaConversationsStarted: input.ad.metaConversationsStarted,
      events,
      realConversations
    });

    return {
      id: input.ad.adId,
      campaignId: input.ad.campaignId,
      campaignName: input.campaignName,
      adSetId: input.ad.adSetId,
      adSetName: input.adSetName,
      name: input.ad.name,
      status: this.toReportStatus(input.ad.status),
      businessId: input.ad.businessId,
      adAccountId: input.ad.adAccountId,
      whatsappClassification: input.ad.whatsappClassification,
      ...metrics
    };
  }

  private toMetrics(input: {
    spendCents: number;
    metaConversationsStarted: number;
    events: ConversionEventRecord[];
    realConversations: number;
  }): Omit<
    CampaignReportRowDto,
    "id" | "name" | "status" | "spendCents" | "metaConversationsStarted"
  > &
    Pick<CampaignReportRowDto, "spendCents" | "metaConversationsStarted"> {
    const leadSubmitted = this.countEvents(input.events, "LeadSubmitted");
    const qualifiedLead = this.countEvents(input.events, "QualifiedLead");
    const purchase = this.countEvents(input.events, "Purchase");

    return {
      spendCents: input.spendCents,
      metaConversationsStarted: input.metaConversationsStarted,
      costPerMetaConversationCents: this.costPer(
        input.spendCents,
        input.metaConversationsStarted
      ),
      realConversations: input.realConversations,
      costPerRealConversationCents: this.costPer(
        input.spendCents,
        input.realConversations
      ),
      leadSubmitted,
      costPerLeadSubmittedCents: this.costPer(input.spendCents, leadSubmitted),
      qualifiedLead,
      costPerQualifiedLeadCents: this.costPer(
        input.spendCents,
        qualifiedLead
      ),
      purchase,
      costPerPurchaseCents: this.costPer(input.spendCents, purchase),
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

  private async hasLeadEvidence(input: {
    workspaceId: string;
    campaignId?: string;
    adSetId?: string;
    adId?: string;
  }): Promise<boolean> {
    const leads = await this.prisma.lead.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input.adSetId ? { adSetId: input.adSetId } : {}),
        ...(input.adId ? { adId: input.adId } : {})
      },
      select: { id: true },
      take: 1
    });

    return leads.length > 0;
  }

  private async loadLeadEvidence(input: {
    workspaceId: string;
    campaignIds: string[];
    adSetIds: string[];
    adIds: string[];
  }): Promise<LeadEvidenceMaps> {
    const evidence: LeadEvidenceMaps = {
      campaigns: new Set(),
      adSets: new Set(),
      ads: new Set()
    };

    if (
      input.campaignIds.length === 0 &&
      input.adSetIds.length === 0 &&
      input.adIds.length === 0
    ) {
      return evidence;
    }

    const leads = (await this.prisma.lead.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.campaignIds.length
          ? { campaignId: { in: input.campaignIds } }
          : {})
      },
      select: {
        campaignId: true,
        adSetId: true,
        adId: true
      }
    })) as LeadRecord[];

    const adSetIds = new Set(input.adSetIds);
    const adIds = new Set(input.adIds);

    for (const lead of leads) {
      if (lead.campaignId) {
        evidence.campaigns.add(lead.campaignId);
      }

      if (lead.adSetId && adSetIds.has(lead.adSetId)) {
        evidence.adSets.add(lead.adSetId);
      }

      if (lead.adId && adIds.has(lead.adId)) {
        evidence.ads.add(lead.adId);
      }
    }

    return evidence;
  }

  private campaignMetricOverrides(
    adSets: MetaAdSetRecord[]
  ): Map<string, CampaignMetricOverride> {
    const metrics = new Map<string, CampaignMetricOverride>();

    for (const adSet of adSets) {
      const current =
        metrics.get(adSet.campaignId) ??
        ({
          spendCents: 0,
          metaConversationsStarted: 0,
          adSetIds: new Set<string>()
        } satisfies CampaignMetricOverride);

      current.spendCents += adSet.spendCents;
      current.metaConversationsStarted += adSet.metaConversationsStarted;
      current.adSetIds.add(adSet.adSetId);
      metrics.set(adSet.campaignId, current);
    }

    return metrics;
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

  private async metaSnapshotWhere(input: {
    workspaceId: string;
  } & ReportFilterInput): Promise<MetaSnapshotWhere> {
    const where = (await this.metaHierarchyWhere(input)) as MetaSnapshotWhere;

    const classification = input.whatsappClassification ?? "whatsapp";

    if (classification === "whatsapp") {
      where.whatsappClassification = {
        in: [
          "auto_whatsapp",
          "creative_whatsapp",
          "detected_by_leads",
          "manual_include"
        ]
      };
    } else if (classification === "needs_review") {
      where.whatsappClassification = "needs_review";
    } else if (classification === "excluded") {
      where.whatsappClassification = "manual_exclude";
    }

    return where;
  }

  private async metaHierarchyWhere(input: {
    workspaceId: string;
  } & ReportFilterInput): Promise<Omit<MetaSnapshotWhere, "whatsappClassification">> {
    const where: Omit<MetaSnapshotWhere, "whatsappClassification"> = {
      workspaceId: input.workspaceId
    };
    const activeAccounts = (await this.prisma.metaReportingAccount.findMany({
      where: {
        workspaceId: input.workspaceId,
        active: true,
        ...(input.businessId ? { businessId: input.businessId } : {}),
        ...(input.adAccountId ? { adAccountId: input.adAccountId } : {})
      },
      select: {
        businessId: true,
        adAccountId: true
      }
    })) as Array<{ businessId: string; adAccountId: string }>;

    if (input.businessId) {
      where.businessId = input.businessId;
    }

    if (input.adAccountId) {
      where.adAccountId = activeAccounts.some(
        (account) => account.adAccountId === input.adAccountId
      )
        ? input.adAccountId
        : { in: [] };
      return where;
    }

    where.adAccountId = {
      in: [...new Set(activeAccounts.map((account) => account.adAccountId))]
    };

    if (!input.businessId && activeAccounts.length > 0) {
      where.businessId = {
        in: [...new Set(activeAccounts.map((account) => account.businessId))]
      };
    }

    return where;
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

  private centsToDecimal(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  private csvCell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  private csvFilename(input: { since?: string; until?: string }): string {
    return input.since && input.until
      ? `wpptrack-campanhas-${input.since}-${input.until}.csv`
      : "wpptrack-campanhas.csv";
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
