import {
  funnelMetricLabels,
  type CampaignOptionDto,
  type CampaignOptionsResponseDto,
  type CampaignReportRowDto,
  type MetaAssetsDto,
  type ReportDailyComparisonPointDto,
  type ReportFunnelStepDto,
  type ReportOverviewDto,
  type WhatsappInstanceSummaryDto,
} from "@wpptrack/shared";
import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { PresentationMask } from "../../../components/presentation-mask";
import { isApiRequestError, serverApiFetch } from "../../../lib/server-api";
import { OverviewFilters } from "./overview-filters";
import { instanceLabel } from "./overview-labels";

type OverviewSearchParams = Record<string, string | string[] | undefined>;
type OverviewFiltersInput = {
  adAccountId?: string;
  businessId?: string;
  since?: string;
  until?: string;
  whatsappInstanceId?: string;
  campaignId?: string;
};

/**
 * `invalid_filter`: the API rejected `campaignId` (removed campaign, inactive
 * account or another workspace). Never rendered as zeros.
 */
type OverviewFetchState = "real" | "empty" | "error" | "invalid_filter";
type MetaMetricsScope = NonNullable<ReportOverviewDto["metaMetricsScope"]>;
type OverviewReportResult = {
  report: ReportOverviewDto;
  state: OverviewFetchState;
};

function money(cents: number | null) {
  if (cents === null) {
    return "-";
  }

  return (cents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

async function getOverviewReport(
  filters: OverviewFiltersInput,
): Promise<OverviewReportResult> {
  try {
    const params = new URLSearchParams({
      includeDaily: "true",
      includeSummary: "true",
    });

    if (filters.since && filters.until) {
      params.set("since", filters.since);
      params.set("until", filters.until);
    }

    if (filters.businessId) {
      params.set("businessId", filters.businessId);
    }

    if (filters.adAccountId) {
      params.set("adAccountId", filters.adAccountId);
    }

    if (filters.whatsappInstanceId) {
      params.set("whatsappInstanceId", filters.whatsappInstanceId);
    }

    if (filters.campaignId) {
      params.set("campaignId", filters.campaignId);
    }

    const report = await serverApiFetch<ReportOverviewDto>(
      `/reports/campaigns?${params.toString()}`,
    );

    return {
      report,
      state:
        report.campaigns.length > 0 || (report.summary?.totalReceived ?? 0) > 0
          ? "real"
          : "empty",
    };
  } catch (error) {
    const invalidFilter =
      Boolean(filters.campaignId) &&
      isApiRequestError(error) &&
      error.status === 404;

    return {
      report: {
        workspaceId: "unavailable",
        rangeLabel: invalidFilter ? "Filtro invalido" : "API indisponivel",
        campaigns: [],
      },
      state: invalidFilter ? "invalid_filter" : "error",
    };
  }
}

/**
 * Campaign options come from their own endpoint: once `campaignId` is applied,
 * `report.campaigns` shrinks to that row and cannot feed the dropdown.
 * `null` disables the field without blocking the report.
 */
async function getCampaignOptions(
  filters: OverviewFiltersInput,
): Promise<CampaignOptionDto[] | null> {
  const params = new URLSearchParams();

  if (filters.since && filters.until) {
    params.set("since", filters.since);
    params.set("until", filters.until);
  }

  if (filters.businessId) {
    params.set("businessId", filters.businessId);
  }

  if (filters.adAccountId) {
    params.set("adAccountId", filters.adAccountId);
  }

  const query = params.toString();

  try {
    const response = await serverApiFetch<CampaignOptionsResponseDto>(
      query
        ? `/reports/campaign-options?${query}`
        : "/reports/campaign-options",
    );

    return Array.isArray(response?.campaigns) ? response.campaigns : null;
  } catch {
    return null;
  }
}

async function getMetaAssets(): Promise<MetaAssetsDto | null> {
  try {
    return await serverApiFetch<MetaAssetsDto>("/integrations/meta/assets");
  } catch {
    return null;
  }
}

async function getWhatsappInstances(): Promise<WhatsappInstanceSummaryDto[]> {
  try {
    const instances = await serverApiFetch<WhatsappInstanceSummaryDto[]>(
      "/integrations/whatsapp/instances",
    );

    // Connections are soft-deleted by changing their billing status. The
    // overview only offers chips that can currently receive conversations;
    // report URLs with an old instance id remain valid for historical data.
    return instances.filter((instance) => instance.billingStatus === "active");
  } catch {
    return [];
  }
}

function asStringParam(value: string | string[] | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sumCampaigns(campaigns: CampaignReportRowDto[]): CampaignReportRowDto {
  const spendCents = campaigns.reduce(
    (total, campaign) => total + campaign.spendCents,
    0,
  );
  const metaConversationsStarted = campaigns.reduce(
    (total, campaign) => total + campaign.metaConversationsStarted,
    0,
  );
  const realConversations = campaigns.reduce(
    (total, campaign) => total + campaign.realConversations,
    0,
  );
  const organicLeads = campaigns.reduce(
    (total, campaign) => total + campaign.organicLeads,
    0,
  );
  const totalReceived = campaigns.reduce(
    (total, campaign) => total + campaign.totalReceived,
    0,
  );
  const qualifiedLead = campaigns.reduce(
    (total, campaign) => total + campaign.qualifiedLead,
    0,
  );
  const purchases = campaigns.reduce(
    (total, campaign) => total + campaign.purchases,
    0,
  );
  const firstPurchases = campaigns.reduce(
    (total, campaign) => total + campaign.firstPurchases,
    0,
  );
  const repurchases = campaigns.reduce(
    (total, campaign) => total + campaign.repurchases,
    0,
  );
  const trafficRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.trafficRevenueCents,
    0,
  );
  const organicRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.organicRevenueCents,
    0,
  );
  const totalRevenueCents = trafficRevenueCents + organicRevenueCents;
  const firstPurchaseRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.firstPurchaseRevenueCents,
    0,
  );
  const repurchaseRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.repurchaseRevenueCents,
    0,
  );
  const estimatedRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.estimatedRevenueCents,
    0,
  );

  return {
    id: "all_campaigns",
    name:
      campaigns.length === 0
        ? "Nenhuma campanha sincronizada"
        : campaigns.length === 1
          ? (campaigns[0]?.name ?? "Campanha")
          : "Todas as campanhas",
    status: campaigns.some((campaign) => campaign.status === "active")
      ? "active"
      : "unknown",
    spendCents,
    metaConversationsStarted,
    costPerMetaConversationCents: costPer(spendCents, metaConversationsStarted),
    realConversations,
    costPerRealConversationCents: costPer(spendCents, realConversations),
    organicLeads,
    totalReceived,
    trackingRate: ratio(realConversations, totalReceived),
    qualifiedLead,
    costPerQualifiedLeadCents: costPer(spendCents, qualifiedLead),
    purchases,
    firstPurchases,
    repurchases,
    costPerPurchaseCents: costPer(spendCents, purchases),
    trafficRevenueCents,
    organicRevenueCents,
    totalRevenueCents,
    firstPurchaseRevenueCents,
    repurchaseRevenueCents,
    estimatedRevenueCents,
    hasEstimatedRevenue: estimatedRevenueCents > 0,
    roasAcquisition: weightedRoas(
      campaigns,
      (campaign) => campaign.roasAcquisition,
    ),
    roasWithRepurchase: weightedRoas(
      campaigns,
      (campaign) => campaign.roasWithRepurchase,
    ),
    // R1: preserve every configured funnel stage from the API (IC, AddToCart,
    // custom events). Hardcoding QL/Purchase dropped InitiateCheckout when the
    // overview fell back to client-side aggregation.
    funnelSteps: aggregateFunnelSteps(campaigns, spendCents),
  };
}

function aggregateFunnelSteps(
  campaigns: CampaignReportRowDto[],
  spendCents: number,
): ReportFunnelStepDto[] {
  const steps = new Map<string, ReportFunnelStepDto>();
  const order: string[] = [];

  for (const campaign of campaigns) {
    // Merge estavel: a API ja manda as etapas na ordem do funil, mas linhas sem
    // compra omitem first_purchase/repurchase. Anexar no fim jogaria uma etapa
    // do meio do funil para o final; inserimos logo apos a etapa anterior desta
    // mesma linha.
    let insertAt = 0;

    for (const step of campaign.funnelSteps) {
      const current = steps.get(step.key);
      const known = order.indexOf(step.key);

      if (known >= 0) {
        insertAt = known + 1;
      } else {
        order.splice(insertAt, 0, step.key);
        insertAt += 1;
      }

      steps.set(step.key, {
        key: step.key,
        label: current?.label ?? step.label,
        value: (current?.value ?? 0) + step.value,
        costCents: null,
      });
    }
  }

  return order.map((key) => {
    const step = steps.get(key)!;
    return {
      ...step,
      costCents: costPer(spendCents, step.value),
    };
  });
}

function costPer(spendCents: number, count: number): number | null {
  return count > 0 ? Math.floor(spendCents / count) : null;
}

function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

function weightedRoas(
  campaigns: CampaignReportRowDto[],
  selectRoas: (campaign: CampaignReportRowDto) => number | null,
): number | null {
  const weighted = campaigns.reduce(
    (total, campaign) => {
      const value = selectRoas(campaign);

      if (value === null || campaign.spendCents === 0) {
        return total;
      }

      return {
        revenueBasis: total.revenueBasis + value * campaign.spendCents,
        spendCents: total.spendCents + campaign.spendCents,
      };
    },
    { revenueBasis: 0, spendCents: 0 },
  );

  return weighted.spendCents > 0
    ? weighted.revenueBasis / weighted.spendCents
    : null;
}

function ratePercent(rate: number | null): number {
  return rate === null ? 0 : Math.round(rate * 100);
}

function ratioLabel(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}x`;
}

function purchaseBreakdownLabel(
  firstPurchases: number,
  repurchases: number,
): string {
  if (firstPurchases === 0 && repurchases === 0) {
    return "Nenhuma compra no periodo";
  }

  const firstPurchaseLabel = `${firstPurchases} ${firstPurchases === 1 ? "primeira compra" : "primeiras compras"}`;

  if (repurchases === 0) {
    return firstPurchaseLabel;
  }

  return `${firstPurchaseLabel}, ${repurchases} ${repurchases === 1 ? "recompra" : "recompras"}`;
}

/**
 * Curated cost captions apply only while a stage still carries its catalog
 * label. Once the workspace renames a stage (QualifiedLead -> "Cliente
 * potencial", Purchase -> "Vendas"...), the caption follows the configured
 * label so cards and funnel rows never contradict the stage name.
 */
const defaultStageCostCaptions: Record<
  string,
  { label: string; caption: string }
> = {
  meta_conversations: {
    label: "Conversas Meta",
    caption: "Custo por conversa Meta",
  },
  real_conversations: {
    label: funnelMetricLabels.real_conversations,
    caption: "Custo por lead",
  },
  qualified_lead: {
    label: funnelMetricLabels.qualified_lead,
    caption: "Custo por lead qualificado",
  },
  purchase: {
    label: funnelMetricLabels.purchase,
    caption: "Custo por compra",
  },
  first_purchase: {
    label: funnelMetricLabels.first_purchase,
    caption: "Custo por primeira compra",
  },
  repurchase: {
    label: funnelMetricLabels.repurchase,
    caption: "Custo por recompra",
  },
  event_initiate_checkout: {
    label: "Checkout iniciado",
    caption: "Custo por checkout iniciado",
  },
  event_add_to_cart: {
    label: "Adicionou ao carrinho",
    caption: "Custo por adicao ao carrinho",
  },
};

function funnelStageCostLabel(stage: ReportFunnelStepDto): string {
  const normalized = stage.label.trim().toLocaleLowerCase("pt-BR");
  const curated = defaultStageCostCaptions[stage.key];

  if (
    curated &&
    (normalized.length === 0 ||
      normalized === curated.label.toLocaleLowerCase("pt-BR"))
  ) {
    return curated.caption;
  }

  return normalized.length > 0 ? `Custo por ${normalized}` : "Custo por etapa";
}

/**
 * Funnel steps that are Purchase breakdowns rather than configurable stages.
 * They stay inside the "Compras" card delta (first purchase / repurchase).
 */
const purchaseBreakdownKeys = new Set(["first_purchase", "repurchase"]);

/**
 * KPI cards derive from the workspace funnel configuration that the API already
 * applies to `funnelSteps` (visible stages, custom labels, position). Nothing
 * here is hardcoded per event:
 * - `real_conversations` (LeadSubmitted) is skipped because the base card
 *   "Conversas reais" already shows it together with the tracking rate.
 * - Purchase breakdowns are folded into the "Compras" card.
 * - Everything else (QualifiedLead, ViewContent, InitiateCheckout, custom
 *   events...) becomes a count card in funnel order with its configured label.
 */
function configuredKpiStages(
  funnelSteps: ReportFunnelStepDto[],
): ReportFunnelStepDto[] {
  return funnelSteps.filter(
    (step) =>
      step.key !== "real_conversations" && !purchaseBreakdownKeys.has(step.key),
  );
}

/**
 * "Receita trafego" depends on Purchase: revenue only exists when the workspace
 * tracks purchases, so the card is rendered right after the "Compras" card and
 * only when the `purchase` stage is part of the configured funnel. Lead-only
 * workspaces never see a revenue KPI. Used by the funnel summary sentence.
 */
function hasPurchaseStage(funnelSteps: ReportFunnelStepDto[]): boolean {
  return funnelSteps.some((step) => step.key === "purchase");
}

function stageCardDelta(
  stage: ReportFunnelStepDto,
  rangeLabel: string,
): string {
  return stage.costCents != null
    ? `${funnelStageCostLabel(stage)} ${money(stage.costCents)}`
    : rangeLabel;
}

function funnelOutcomeSummary(
  rangeLabel: string,
  metaConversationsStarted: number,
  campaign: CampaignReportRowDto,
): string {
  const intro = `${rangeLabel}: ${metaConversationsStarted} conversas registradas pela Meta`;

  if (hasPurchaseStage(campaign.funnelSteps)) {
    return `${intro} chegaram a ${campaign.firstPurchases} ${campaign.firstPurchases === 1 ? "primeira compra" : "primeiras compras"}.`;
  }

  const lastStage = configuredKpiStages(campaign.funnelSteps).at(-1);

  if (lastStage) {
    return `${intro} chegaram a ${lastStage.value} em ${lastStage.label}.`;
  }

  return `${intro} no periodo.`;
}

function filtersQuery(filters: OverviewFiltersInput): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  return params.toString();
}

function reportsHref(filters: OverviewFiltersInput): string {
  const query = filtersQuery(filters);
  return query ? `/reports?${query}` : "/reports";
}

function overviewHref(filters: OverviewFiltersInput): string {
  const query = filtersQuery(filters);
  return query ? `/overview?${query}` : "/overview";
}

function conversationCount(count: number): string {
  return `${count} ${count === 1 ? "conversa real" : "conversas reais"}`;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: Promise<OverviewSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters: OverviewFiltersInput = {
    since: asStringParam(resolvedSearchParams.since),
    until: asStringParam(resolvedSearchParams.until),
    businessId: asStringParam(resolvedSearchParams.businessId),
    adAccountId: asStringParam(resolvedSearchParams.adAccountId),
    whatsappInstanceId: asStringParam(resolvedSearchParams.whatsappInstanceId),
    campaignId: asStringParam(resolvedSearchParams.campaignId),
  };
  const [
    { report, state: reportState },
    metaAssets,
    whatsappInstances,
    campaignOptions,
  ] = await Promise.all([
    getOverviewReport(filters),
    getMetaAssets(),
    getWhatsappInstances(),
    getCampaignOptions(filters),
  ]);
  const reportingAccounts = (metaAssets?.reportingAccounts ?? []).filter(
    (account) => account.active,
  );
  const campaigns = report.campaigns;
  const campaign = report.summary ?? sumCampaigns(campaigns);
  const invalidFilter = reportState === "invalid_filter";
  const dataAvailable = reportState !== "error" && !invalidFilter;
  const hasWhatsappInstanceFilter = Boolean(filters.whatsappInstanceId);
  const hasCampaignFilter = Boolean(filters.campaignId);
  // The API decides how honest Meta metrics can be for this cut (D8). Older
  // payloads without the field keep the #110 rule for an instance filter.
  const metaScope: MetaMetricsScope | undefined =
    report.metaMetricsScope ??
    (hasWhatsappInstanceFilter ? "ad_account" : undefined);
  // S2: Meta spend exists per account/campaign, never per number.
  const metaByAccount =
    metaScope === "ad_account" || metaScope === "instance_unavailable";
  // S8: campaign selected but Meta insights not synced for the period.
  const metaUnsynced = metaScope === "campaign_unsynced";
  // S5/S6: whole-campaign Meta values next to one number's outcomes.
  const metaPartial = metaScope === "campaign_shared";
  const metaHidden = metaByAccount || metaUnsynced;
  const costsHidden = metaHidden || metaPartial;
  const campaignInstanceLeads = (report.campaignInstanceLeads ?? []).filter(
    (entry) => entry.leads > 0,
  );
  const noLeadsOnSelectedNumber =
    metaPartial &&
    !campaignInstanceLeads.some(
      (entry) => entry.instanceId === filters.whatsappInstanceId,
    );
  // S7: a real zero, not "-", but there is no spend base for ROAS.
  const campaignWithoutDelivery =
    metaScope === "campaign" && campaign.spendCents === 0;
  const campaignName =
    report.filters?.campaignName ??
    campaignOptions?.find((option) => option.id === filters.campaignId)?.name;
  const trackedRate =
    dataAvailable && campaign.trackingRate !== null
      ? ratePercent(campaign.trackingRate)
      : null;
  const metaConversationStage: ReportFunnelStepDto = {
    key: "meta_conversations",
    label: "Conversas Meta",
    value: campaign.metaConversationsStarted,
    costCents: costsHidden ? null : campaign.costPerMetaConversationCents,
  };
  const scopedFunnelSteps = costsHidden
    ? campaign.funnelSteps.map((stage) => ({ ...stage, costCents: null }))
    : campaign.funnelSteps;
  const funnelStages: ReportFunnelStepDto[] = metaHidden
    ? scopedFunnelSteps
    : [metaConversationStage, ...scopedFunnelSteps];
  const kpiStages = configuredKpiStages(campaign.funnelSteps);
  const selectedBusiness = reportingAccounts.find(
    (account) => account.businessId === filters.businessId,
  );
  const selectedAccount = reportingAccounts.find(
    (account) => account.adAccountId === filters.adAccountId,
  );
  const scopeLabel =
    hasCampaignFilter && campaignName
      ? campaignName
      : (selectedAccount?.adAccountName ??
        selectedBusiness?.businessName ??
        "Todas as contas");
  const scopePlaceholder =
    hasCampaignFilter && campaignName
      ? "Campanha oculta"
      : "Conta de anuncios oculta";
  const detailHref = reportsHref(filters);
  const clearCampaignHref = overviewHref({
    ...filters,
    campaignId: undefined,
  });
  const funnelSummary = dataAvailable
    ? metaPartial
      ? `${report.rangeLabel}: ${conversationCount(campaign.realConversations)} neste numero vindas da campanha selecionada.`
      : metaByAccount
        ? `${report.rangeLabel}: ${conversationCount(campaign.realConversations)} no chip selecionado.`
        : metaUnsynced
          ? `${report.rangeLabel}: ${conversationCount(campaign.realConversations)} vindas da campanha selecionada.`
          : funnelOutcomeSummary(
              report.rangeLabel,
              campaign.metaConversationsStarted,
              campaign,
            )
    : "A jornada sera exibida quando a API concluir a inicializacao.";
  const metaDelta = (fallback: string) =>
    !dataAvailable
      ? "Aguardando resposta da API"
      : metaByAccount
        ? "Conta de anuncios (nao filtravel por chip)"
        : metaUnsynced
          ? "Aguardando sincronizacao da Meta"
          : metaPartial
            ? noLeadsOnSelectedNumber
              ? "Campanha inteira · nenhuma conversa neste numero"
              : "Campanha inteira · inclui outro numero"
            : campaignWithoutDelivery
              ? "Sem veiculacao no periodo"
              : fallback;
  const revenueDelta = !dataAvailable
    ? "Aguardando resposta da API"
    : metaByAccount
      ? "Receita do chip; ROAS indisponivel"
      : metaPartial
        ? "Receita do numero; ROAS indisponivel"
        : metaUnsynced || campaignWithoutDelivery
          ? "ROAS indisponivel"
          : `ROAS ${ratioLabel(campaign.roasAcquisition)}`;

  return (
    <section className="page-stack page-wide overview-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Visao geral</span>
          <h1>Cockpit da operacao</h1>
          <p>
            {report.rangeLabel} cruzando investimento, conversas reais e eventos
            enviados ao Pixel.
          </p>
        </div>
        <div className="header-actions" aria-label="Filtros ativos">
          {reportState === "error" ? (
            <span className="status-chip warn">API indisponivel</span>
          ) : invalidFilter ? (
            <span className="status-chip warn">Filtro invalido</span>
          ) : (
            <>
              <span className="tag">{report.rangeLabel}</span>
              <span className="tag">
                {hasCampaignFilter
                  ? "1 campanha"
                  : `${campaigns.length} campanhas`}
              </span>
              <span className="tag">
                {trackedRate === null
                  ? "Aguardando conversas"
                  : `${trackedRate}% rastreadas`}
              </span>
            </>
          )}
        </div>
      </header>

      <OverviewFilters
        adAccountId={filters.adAccountId}
        businessId={filters.businessId}
        campaignId={filters.campaignId}
        campaignName={campaignName}
        campaignOptions={campaignOptions}
        hasActiveFilter={Object.values(filters).some(Boolean)}
        reportingAccounts={reportingAccounts}
        since={report.since ?? filters.since}
        until={report.until ?? filters.until}
        whatsappInstanceId={filters.whatsappInstanceId}
        whatsappInstances={whatsappInstances}
      />

      {invalidFilter ? (
        <div
          className="overview-unavailable overview-invalid-filter"
          role="status"
        >
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Campanha nao encontrada</strong>
            <span>
              Ela pode ter sido removida ou pertencer a outra conta de anuncio.
            </span>
          </div>
          <Link className="button ghost" href={clearCampaignHref}>
            Limpar campanha
          </Link>
        </div>
      ) : (
        <>
          {dataAvailable ? (
            <OverviewScopeNote
              campaignInstanceLeads={campaignInstanceLeads}
              filters={filters}
              metaByAccount={metaByAccount}
              metaPartial={metaPartial}
              noLeadsOnSelectedNumber={noLeadsOnSelectedNumber}
              whatsappInstances={whatsappInstances}
            />
          ) : null}

          <div className="metric-grid overview-primary-metrics">
            <Metric
              label="Investimento"
              value={
                dataAvailable && !metaHidden ? money(campaign.spendCents) : "-"
              }
              delta={metaDelta(
                reportState === "empty" && !hasCampaignFilter
                  ? "Nenhuma campanha sincronizada"
                  : report.rangeLabel,
              )}
              partial={dataAvailable && metaPartial}
              unavailable={!dataAvailable || metaHidden}
            />
            <Metric
              label="Conversas Meta"
              value={
                dataAvailable && !metaHidden
                  ? String(campaign.metaConversationsStarted)
                  : "-"
              }
              delta={metaDelta(
                metaScope === "campaign"
                  ? stageCardDelta(metaConversationStage, report.rangeLabel)
                  : report.rangeLabel,
              )}
              partial={dataAvailable && metaPartial}
              unavailable={!dataAvailable || metaHidden}
            />
            <Metric
              label="Conversas reais"
              value={dataAvailable ? String(campaign.realConversations) : "-"}
              delta={
                !dataAvailable
                  ? "Aguardando resposta da API"
                  : trackedRate === null
                    ? "Aguardando conversas"
                    : `${trackedRate}% rastreadas`
              }
              unavailable={!dataAvailable}
            />
            {kpiStages.map((stage) =>
              stage.key === "purchase" ? (
                <Fragment key={stage.key}>
                  <Metric
                    label={stage.label}
                    value={dataAvailable ? String(stage.value) : "-"}
                    delta={
                      dataAvailable
                        ? purchaseBreakdownLabel(
                            campaign.firstPurchases,
                            campaign.repurchases,
                          )
                        : "Aguardando resposta da API"
                    }
                    unavailable={!dataAvailable}
                  />
                  <Metric
                    label="Receita trafego"
                    value={
                      dataAvailable ? money(campaign.trafficRevenueCents) : "-"
                    }
                    delta={revenueDelta}
                    unavailable={!dataAvailable}
                  />
                </Fragment>
              ) : (
                <Metric
                  key={stage.key}
                  label={stage.label}
                  value={dataAvailable ? String(stage.value) : "-"}
                  delta={
                    !dataAvailable
                      ? "Aguardando resposta da API"
                      : metaByAccount
                        ? "Eventos do chip selecionado"
                        : costsHidden
                          ? report.rangeLabel
                          : stageCardDelta(stage, report.rangeLabel)
                  }
                  unavailable={!dataAvailable}
                />
              ),
            )}
          </div>

          <section
            className="surface-panel overview-funnel-panel"
            aria-label="Funil integrado"
          >
            {dataAvailable ? (
              <ConversionFunnel
                description={funnelSummary}
                stages={funnelStages}
              />
            ) : (
              <>
                <div className="overview-section-heading">
                  <div>
                    <span className="eyebrow">Funil integrado</span>
                    <h2>Conversao por etapas</h2>
                    <p>{funnelSummary}</p>
                  </div>
                </div>
                <div className="overview-unavailable" role="status">
                  <span className="status-dot" aria-hidden="true" />
                  <div>
                    <strong>Dados temporariamente indisponiveis</strong>
                    <span>
                      Tente novamente quando a API concluir a inicializacao.
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>

          <DailyConversationComparison
            available={report.dailyComparisonAvailable === true}
            detailHref={detailHref}
            points={report.dailyComparison ?? []}
            reportState={reportState}
            scopeLabel={scopeLabel}
            scopePlaceholder={scopePlaceholder}
          />
        </>
      )}
    </section>
  );
}

/**
 * One `role="note"` line under the filter bar (§6.2). Campaign -> number is a
 * hint with a one-click link, never an automatic filter (D4).
 */
function OverviewScopeNote({
  campaignInstanceLeads,
  filters,
  metaByAccount,
  metaPartial,
  noLeadsOnSelectedNumber,
  whatsappInstances,
}: {
  campaignInstanceLeads: NonNullable<
    ReportOverviewDto["campaignInstanceLeads"]
  >;
  filters: OverviewFiltersInput;
  metaByAccount: boolean;
  metaPartial: boolean;
  noLeadsOnSelectedNumber: boolean;
  whatsappInstances: WhatsappInstanceSummaryDto[];
}) {
  if (metaByAccount) {
    return (
      <p className="muted" role="note">
        Investimento e Conversas Meta existem por campanha, nao por numero.
        Escolha uma campanha para ver o investimento que trouxe conversas para
        este numero.
      </p>
    );
  }

  if (metaPartial) {
    return (
      <p className="muted" role="note">
        {noLeadsOnSelectedNumber
          ? "Esta campanha nao gerou conversas neste numero no periodo. Investimento e Conversas Meta mostram a campanha inteira."
          : "Esta campanha tambem gerou conversas em outro numero. Investimento e Conversas Meta mostram a campanha inteira; custos por etapa e ROAS ficam ocultos para nao distorcer o resultado."}
      </p>
    );
  }

  if (
    !filters.campaignId ||
    filters.whatsappInstanceId ||
    campaignInstanceLeads.length === 0
  ) {
    return null;
  }

  if (campaignInstanceLeads.length > 1) {
    return (
      <p className="muted" role="note">
        Esta campanha gerou conversas em {campaignInstanceLeads.length} numeros.
        Selecione um numero para ver o resultado de cada um.
      </p>
    );
  }

  const [entry] = campaignInstanceLeads;
  const instance = whatsappInstances.find(
    (candidate) => candidate.id === entry!.instanceId,
  );

  return (
    <p className="muted overview-scope-hint" role="note">
      Esta campanha leva conversas para{" "}
      <PresentationMask placeholder="Numero oculto">
        {instance ? instanceLabel(instance) : entry!.instanceName}
      </PresentationMask>
      .{" "}
      <Link
        href={overviewHref({
          ...filters,
          whatsappInstanceId: entry!.instanceId,
        })}
      >
        Filtrar este numero
      </Link>
    </p>
  );
}

function DailyConversationComparison({
  available,
  detailHref,
  points,
  reportState,
  scopeLabel,
  scopePlaceholder,
}: {
  available: boolean;
  detailHref: string;
  points: ReportDailyComparisonPointDto[];
  reportState: OverviewFetchState;
  scopeLabel: string;
  scopePlaceholder: string;
}) {
  const metaTotal = points.reduce(
    (total, point) => total + point.metaConversationsStarted,
    0,
  );
  const realTotal = points.reduce(
    (total, point) => total + point.realConversations,
    0,
  );
  const difference = metaTotal - realTotal;
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => [
      point.metaConversationsStarted,
      point.realConversations,
    ]),
  );
  const viewWidth = Math.max(760, points.length * 54 + 92);
  const viewHeight = 286;
  const plotTop = 22;
  const plotBottom = 226;
  const plotHeight = plotBottom - plotTop;
  const plotLeft = 48;
  const plotRight = viewWidth - 24;
  const plotWidth = plotRight - plotLeft;
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(15, Math.max(6, groupWidth * 0.28));
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  const barHeight = (value: number) => (value / maximum) * plotHeight;
  const formatDate = (date: string) => {
    const [, month, day] = date.split("-");
    return `${day}/${month}`;
  };
  const differenceLabel =
    difference === 0
      ? "Volumes conciliados no periodo"
      : difference > 0
        ? `${difference} ${difference === 1 ? "conversa" : "conversas"} a mais na Meta`
        : `${Math.abs(difference)} ${Math.abs(difference) === 1 ? "conversa real" : "conversas reais"} a mais`;

  return (
    <section
      className="surface-panel daily-comparison"
      aria-labelledby="daily-comparison-title"
    >
      <div className="daily-comparison-header">
        <div>
          <span className="eyebrow">Conciliacao diaria</span>
          <h2 id="daily-comparison-title">Meta x conversas reais</h2>
          <p>
            Compare os volumes dia a dia e localize rapidamente onde surgiu a
            divergencia.
          </p>
        </div>
        <div
          className="daily-comparison-summary"
          aria-label="Resumo do comparativo"
        >
          <span>
            <PresentationMask placeholder={scopePlaceholder}>
              {scopeLabel}
            </PresentationMask>
          </span>
          <strong>{differenceLabel}</strong>
        </div>
      </div>

      {reportState === "error" ? (
        <div className="daily-comparison-empty" role="status">
          <strong>Comparativo indisponivel</strong>
          <span>A API precisa responder para montar a serie diaria.</span>
        </div>
      ) : !available ? (
        <div className="daily-comparison-empty" role="status">
          <strong>Sincronize este periodo para ver a comparacao diaria</strong>
          <span>
            A serie historica da Meta sera registrada na proxima sincronizacao.
          </span>
          <Link className="button ghost" href={detailHref}>
            Abrir relatorios
          </Link>
        </div>
      ) : (
        <>
          <div className="daily-comparison-legend" aria-label="Legenda">
            <span>
              <i className="meta" aria-hidden="true" />
              Meta <strong>{metaTotal}</strong>
            </span>
            <span>
              <i className="real" aria-hidden="true" />
              Conversas reais <strong>{realTotal}</strong>
            </span>
          </div>
          <div className="daily-comparison-scroll">
            <svg
              className="daily-comparison-chart"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              style={{ minWidth: `${viewWidth}px` }}
              role="img"
              aria-label={`Comparacao diaria. Meta ${metaTotal}, conversas reais ${realTotal}.`}
            >
              <title>Conversas da Meta e conversas reais por dia</title>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = plotBottom - ratio * plotHeight;
                const value = Math.round(maximum * ratio);

                return (
                  <g key={ratio}>
                    <line x1={plotLeft} x2={plotRight} y1={y} y2={y} />
                    <text x={plotLeft - 10} y={y + 4} textAnchor="end">
                      {value}
                    </text>
                  </g>
                );
              })}
              {points.map((point, index) => {
                const center = plotLeft + groupWidth * index + groupWidth / 2;
                const metaHeight = barHeight(point.metaConversationsStarted);
                const realHeight = barHeight(point.realConversations);
                const showLabel =
                  index % labelEvery === 0 || index === points.length - 1;

                return (
                  <g key={point.date}>
                    <rect
                      className="daily-bar meta"
                      x={center - barWidth - 2}
                      y={plotBottom - metaHeight}
                      width={barWidth}
                      height={metaHeight}
                      rx="3"
                    >
                      <title>{`${formatDate(point.date)} - Meta: ${point.metaConversationsStarted}`}</title>
                    </rect>
                    <rect
                      className="daily-bar real"
                      x={center + 2}
                      y={plotBottom - realHeight}
                      width={barWidth}
                      height={realHeight}
                      rx="3"
                    >
                      <title>{`${formatDate(point.date)} - Reais: ${point.realConversations}`}</title>
                    </rect>
                    {showLabel ? (
                      <text
                        className="daily-date-label"
                        x={center}
                        y={plotBottom + 26}
                        textAnchor="middle"
                      >
                        {formatDate(point.date)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  delta,
  partial = false,
  unavailable = false,
}: {
  label: string;
  value: string;
  delta: string;
  /** Real value with a wider scope than the page (whole campaign). */
  partial?: boolean;
  unavailable?: boolean;
}) {
  return (
    <div
      className={`metric-card${unavailable ? " unavailable" : ""}${partial ? " partial" : ""}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  );
}

function ConversionFunnel({
  description,
  stages,
}: {
  description: string;
  stages: ReportFunnelStepDto[];
}) {
  const palette = [
    "var(--mint)",
    "var(--teal)",
    "var(--cyan)",
    "var(--blue)",
    "var(--amber)",
    "var(--coral)",
  ];
  const viewWidth = 1000;
  const viewHeight = 176;
  const centerY = viewHeight / 2;
  const maximumHalfHeight = centerY - 14;
  const minimumHalfHeight = 10;
  const firstValue = stages[0]?.value ?? 0;
  const visualBase = Math.max(firstValue, 1);
  const segmentWidth = viewWidth / Math.max(stages.length, 1);
  const halfHeight = (value: number) =>
    Math.max(
      minimumHalfHeight,
      Math.round(Math.min(value / visualBase, 1) * maximumHalfHeight),
    );
  const boundaries = stages.map((stage) => halfHeight(stage.value));
  const lastBoundary = boundaries[boundaries.length - 1] ?? minimumHalfHeight;
  boundaries.push(Math.max(6, Math.round(lastBoundary * 0.52)));
  const segmentPath = (index: number) => {
    const startX = index * segmentWidth;
    const endX = (index + 1) * segmentWidth;
    const middleX = startX + segmentWidth / 2;
    const leftHeight = boundaries[index] ?? minimumHalfHeight;
    const rightHeight = boundaries[index + 1] ?? minimumHalfHeight;

    return [
      `M ${startX} ${centerY - leftHeight}`,
      `C ${middleX} ${centerY - leftHeight} ${middleX} ${centerY - rightHeight} ${endX} ${centerY - rightHeight}`,
      `L ${endX} ${centerY + rightHeight}`,
      `C ${middleX} ${centerY + rightHeight} ${middleX} ${centerY + leftHeight} ${startX} ${centerY + leftHeight}`,
      "Z",
    ].join(" ");
  };
  const rateFromPrevious = (index: number) => {
    if (index === 0) {
      return null;
    }

    const previousValue = stages[index - 1]?.value ?? 0;
    return previousValue > 0
      ? Math.round(((stages[index]?.value ?? 0) / previousValue) * 100)
      : null;
  };
  const mobileWidth = (value: number) => {
    if (firstValue === 0 || value === 0) {
      return "0%";
    }

    return `${Math.max(18, Math.min(100, Math.round((value / firstValue) * 100)))}%`;
  };
  const funnelLabel = stages
    .map((stage) => `${stage.label}: ${stage.value}`)
    .join(", ");

  return (
    <section
      className="conversion-funnel"
      aria-label={`Funil de conversao. ${funnelLabel}`}
    >
      <div className="conversion-funnel-heading">
        <div>
          <span className="micro-label">Funil integrado</span>
          <h2>Conversao por etapas</h2>
          <p>{description}</p>
        </div>
        <span className="conversion-funnel-stage-count">
          {stages.length} {stages.length === 1 ? "etapa" : "etapas"}
        </span>
      </div>

      <div
        className="conversion-funnel-stage-grid"
        style={{ "--funnel-stage-count": stages.length } as CSSProperties}
      >
        {stages.map((stage, index) => {
          const rate = rateFromPrevious(index);
          const color = palette[index % palette.length];

          return (
            <div
              className="conversion-funnel-stage"
              key={`${stage.key}-${index}`}
              style={{ "--funnel-stage-color": color } as CSSProperties}
            >
              <div className="conversion-funnel-stage-label">
                <span>{index + 1}</span>
                <strong>{stage.label}</strong>
              </div>
              <b>{stage.value}</b>
              <small>
                {index === 0
                  ? "Base do funil"
                  : rate === null
                    ? "Sem base anterior"
                    : `${rate}% da etapa anterior`}
              </small>
              <div className="conversion-funnel-stage-cost">
                <span>{funnelStageCostLabel(stage)}</span>
                <strong>{money(stage.costCents ?? null)}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <svg
        className="conversion-funnel-chart"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={funnelLabel}
      >
        {stages.map((stage, index) => (
          <path
            d={segmentPath(index)}
            fill={palette[index % palette.length]}
            key={`${stage.key}-${index}`}
          />
        ))}
      </svg>

      <div className="conversion-funnel-mobile">
        {stages.map((stage, index) => {
          const rate = rateFromPrevious(index);
          const color = palette[index % palette.length];

          return (
            <div
              className="conversion-funnel-mobile-stage"
              key={`${stage.key}-${index}`}
            >
              <div className="conversion-funnel-mobile-main">
                <span
                  className="conversion-funnel-mobile-index"
                  style={{ backgroundColor: color }}
                >
                  {index + 1}
                </span>
                <strong>{stage.label}</strong>
                <b>{stage.value}</b>
              </div>
              <small>
                {index === 0
                  ? "Base do funil"
                  : rate === null
                    ? "Sem base anterior"
                    : `${rate}% da etapa anterior`}
              </small>
              <div className="conversion-funnel-mobile-cost">
                <span>{funnelStageCostLabel(stage)}</span>
                <strong>{money(stage.costCents ?? null)}</strong>
              </div>
              <span
                className="conversion-funnel-mobile-band"
                style={
                  {
                    "--funnel-stage-color": color,
                    "--funnel-mobile-width": mobileWidth(stage.value),
                  } as CSSProperties
                }
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
