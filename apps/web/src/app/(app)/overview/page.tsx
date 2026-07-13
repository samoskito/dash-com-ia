import type {
  CampaignReportRowDto,
  ReportFunnelStepDto,
  ReportOverviewDto
} from "@wpptrack/shared";
import Link from "next/link";
import type { CSSProperties } from "react";
import { serverApiFetch } from "../../../lib/server-api";

type OverviewFetchState = "real" | "empty" | "error";
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
    style: "currency"
  });
}

async function getOverviewReport(): Promise<OverviewReportResult> {
  try {
    const report = await serverApiFetch<ReportOverviewDto>(
      "/reports/campaigns?includeSummary=true"
    );

    return {
      report,
      state:
        report.campaigns.length > 0 || (report.summary?.totalReceived ?? 0) > 0
          ? "real"
          : "empty"
    };
  } catch {
    return {
      report: {
        workspaceId: "unavailable",
        rangeLabel: "API indisponivel",
        campaigns: []
      },
      state: "error"
    };
  }
}

function sumCampaigns(campaigns: CampaignReportRowDto[]): CampaignReportRowDto {
  const spendCents = campaigns.reduce((total, campaign) => total + campaign.spendCents, 0);
  const metaConversationsStarted = campaigns.reduce(
    (total, campaign) => total + campaign.metaConversationsStarted,
    0
  );
  const realConversations = campaigns.reduce(
    (total, campaign) => total + campaign.realConversations,
    0
  );
  const organicLeads = campaigns.reduce(
    (total, campaign) => total + campaign.organicLeads,
    0
  );
  const totalReceived = campaigns.reduce(
    (total, campaign) => total + campaign.totalReceived,
    0
  );
  const qualifiedLead = campaigns.reduce(
    (total, campaign) => total + campaign.qualifiedLead,
    0
  );
  const purchases = campaigns.reduce((total, campaign) => total + campaign.purchases, 0);
  const firstPurchases = campaigns.reduce(
    (total, campaign) => total + campaign.firstPurchases,
    0
  );
  const repurchases = campaigns.reduce(
    (total, campaign) => total + campaign.repurchases,
    0
  );
  const trafficRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.trafficRevenueCents,
    0
  );
  const organicRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.organicRevenueCents,
    0
  );
  const totalRevenueCents = trafficRevenueCents + organicRevenueCents;
  const firstPurchaseRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.firstPurchaseRevenueCents,
    0
  );
  const repurchaseRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.repurchaseRevenueCents,
    0
  );
  const estimatedRevenueCents = campaigns.reduce(
    (total, campaign) => total + campaign.estimatedRevenueCents,
    0
  );
  const visibleFunnelKeys = new Set(
    campaigns.flatMap((campaign) => campaign.funnelSteps.map((step) => step.key))
  );

  return {
    id: "all_campaigns",
    name:
      campaigns.length === 0
        ? "Nenhuma campanha sincronizada"
        : campaigns.length === 1
          ? campaigns[0]?.name ?? "Campanha"
          : "Todas as campanhas",
    status: campaigns.some((campaign) => campaign.status === "active") ? "active" : "unknown",
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
      (campaign) => campaign.roasAcquisition
    ),
    roasWithRepurchase: weightedRoas(
      campaigns,
      (campaign) => campaign.roasWithRepurchase
    ),
    funnelSteps: [
      funnelStep(
        "real_conversations",
        "Conversas reais iniciadas",
        realConversations,
        costPer(spendCents, realConversations)
      ),
      ...(visibleFunnelKeys.has("qualified_lead") || qualifiedLead > 0
        ? [
            funnelStep(
              "qualified_lead",
              "Lead qualificado",
              qualifiedLead,
              costPer(spendCents, qualifiedLead)
            )
          ]
        : []),
      ...(visibleFunnelKeys.has("purchase") || purchases > 0
        ? [
            funnelStep(
              "purchase",
              "Compras",
              purchases,
              costPer(spendCents, purchases)
            )
          ]
        : []),
      ...(visibleFunnelKeys.has("first_purchase") || firstPurchases > 0
        ? [
            funnelStep(
              "first_purchase",
              "Primeira compra",
              firstPurchases,
              costPer(spendCents, firstPurchases)
            )
          ]
        : []),
      ...(visibleFunnelKeys.has("repurchase") || repurchases > 0
        ? [
            funnelStep(
              "repurchase",
              "Recompra",
              repurchases,
              costPer(spendCents, repurchases)
            )
          ]
        : [])
    ]
  };
}

function costPer(spendCents: number, count: number): number | null {
  return count > 0 ? Math.floor(spendCents / count) : null;
}

function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

function weightedRoas(
  campaigns: CampaignReportRowDto[],
  selectRoas: (campaign: CampaignReportRowDto) => number | null
): number | null {
  const weighted = campaigns.reduce(
    (total, campaign) => {
      const value = selectRoas(campaign);

      if (value === null || campaign.spendCents === 0) {
        return total;
      }

      return {
        revenueBasis: total.revenueBasis + value * campaign.spendCents,
        spendCents: total.spendCents + campaign.spendCents
      };
    },
    { revenueBasis: 0, spendCents: 0 }
  );

  return weighted.spendCents > 0
    ? weighted.revenueBasis / weighted.spendCents
    : null;
}

function ratePercent(rate: number | null): number {
  return rate === null ? 0 : Math.round(rate * 100);
}

type TrackingHealthState =
  | "unavailable"
  | "waiting"
  | "healthy"
  | "attention"
  | "critical";

function trackingHealthState(
  reportState: OverviewFetchState,
  totalReceived: number,
  trackingRate: number | null
): TrackingHealthState {
  if (reportState === "error") {
    return "unavailable";
  }

  if (totalReceived === 0 || trackingRate === null) {
    return "waiting";
  }

  if (trackingRate >= 0.8) {
    return "healthy";
  }

  if (trackingRate >= 0.6) {
    return "attention";
  }

  return "critical";
}

function trackingHealthLabel(state: TrackingHealthState): string {
  const labels: Record<TrackingHealthState, string> = {
    unavailable: "Dados indisponiveis",
    waiting: "Aguardando conversas",
    healthy: "Cobertura alta",
    attention: "Cobertura moderada",
    critical: "Cobertura baixa"
  };

  return labels[state];
}

function ratioLabel(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}x`;
}

function purchaseBreakdownLabel(firstPurchases: number, repurchases: number): string {
  if (firstPurchases === 0 && repurchases === 0) {
    return "Nenhuma compra no periodo";
  }

  const firstPurchaseLabel = `${firstPurchases} ${firstPurchases === 1 ? "primeira compra" : "primeiras compras"}`;

  if (repurchases === 0) {
    return firstPurchaseLabel;
  }

  return `${firstPurchaseLabel}, ${repurchases} ${repurchases === 1 ? "recompra" : "recompras"}`;
}

function funnelStep(
  key: ReportFunnelStepDto["key"],
  label: ReportFunnelStepDto["label"],
  value: number,
  costCents: number | null
): ReportFunnelStepDto {
  return {
    key,
    label,
    value,
    costCents
  };
}

function leadsByAttributionHref(
  attribution: "paid" | "organic",
  report: ReportOverviewDto,
): string {
  const params = new URLSearchParams({ attribution });

  if (report.since) {
    params.set("since", report.since);
  }

  if (report.until) {
    params.set("until", report.until);
  }

  return `/leads?${params.toString()}`;
}

export default async function OverviewPage() {
  const { report, state: reportState } = await getOverviewReport();
  const campaigns = report.campaigns;
  const campaign = report.summary ?? sumCampaigns(campaigns);
  const dataAvailable = reportState !== "error";
  const trackedRate = dataAvailable && campaign.trackingRate !== null
    ? ratePercent(campaign.trackingRate)
    : null;
  const trackingState = trackingHealthState(
    reportState,
    campaign.totalReceived,
    campaign.trackingRate
  );
  const hasTrackingSample = trackingState !== "unavailable" && trackingState !== "waiting";
  const trackingScoreStyle = hasTrackingSample
    ? ({ "--tracking-rate": `${trackedRate}%` } as CSSProperties)
    : undefined;
  const hasRepurchases = campaign.repurchases > 0 || campaign.repurchaseRevenueCents > 0;
  const funnelStages: ReportFunnelStepDto[] = [
    {
      key: "meta_conversations",
      label: "Conversas Meta",
      value: campaign.metaConversationsStarted,
      costCents: campaign.costPerMetaConversationCents
    },
    ...campaign.funnelSteps
  ];

  return (
    <section className="page-stack">
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
          ) : (
            <>
              <span className="tag">{report.rangeLabel}</span>
              <span className="tag">{campaigns.length} campanhas</span>
              <span className="tag">
                {trackedRate === null ? "Aguardando conversas" : `${trackedRate}% rastreadas`}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="metric-grid">
        <Metric
          label="Conversas Meta"
          value={dataAvailable ? String(campaign.metaConversationsStarted) : "-"}
          delta={dataAvailable ? report.rangeLabel : "Aguardando resposta da API"}
          unavailable={!dataAvailable}
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
        <Metric
          label="Receita trafego"
          value={dataAvailable ? money(campaign.trafficRevenueCents) : "-"}
          delta={dataAvailable ? `ROAS ${ratioLabel(campaign.roasAcquisition)}` : "Aguardando resposta da API"}
          unavailable={!dataAvailable}
        />
        <Metric
          label="Compras"
          value={dataAvailable ? String(campaign.purchases) : "-"}
          delta={dataAvailable ? purchaseBreakdownLabel(campaign.firstPurchases, campaign.repurchases) : "Aguardando resposta da API"}
          unavailable={!dataAvailable}
        />
      </div>

      <div className="panel-grid">
        <div className="surface-panel">
          <div>
            <span className="eyebrow">Funil integrado</span>
            <h2>
              {reportState === "error"
                ? "Nao foi possivel carregar relatorios"
                : campaign.name}
            </h2>
          </div>
          <p>
            {reportState === "error"
              ? "Os numeros permanecem ocultos ate a API responder, evitando exibir zero como dado confirmado."
              : campaigns.length > 0
              ? `Investimento de ${money(campaign.spendCents)} gerou ${campaign.realConversations} conversas reais, ${campaign.organicLeads} conversas organicas e ${money(campaign.totalRevenueCents)} em receita total.`
              : campaign.totalReceived > 0
                ? `${campaign.realConversations} ${campaign.realConversations === 1 ? "conversa" : "conversas"} com origem identificada e ${campaign.organicLeads} ${campaign.organicLeads === 1 ? "conversa organica" : "conversas organicas"} foram recebidas. Campanha e conjunto serao exibidos quando a estrutura Meta for resolvida.`
                : "Nenhuma campanha sincronizada. Use Sincronizar Meta em Relatorios para carregar dados reais."}
          </p>
          {dataAvailable ? (
            <div className="overview-finance-strip" aria-label="Saude financeira">
              <OverviewSummaryValue
                label="Receita trafego"
                value={money(campaign.trafficRevenueCents)}
              />
              <OverviewSummaryValue
                label="Receita organica"
                value={money(campaign.organicRevenueCents)}
              />
              <OverviewSummaryValue
                label="Receita total"
                value={money(campaign.totalRevenueCents)}
              />
              <OverviewSummaryValue
                label="ROAS aquisicao"
                value={ratioLabel(campaign.roasAcquisition)}
              />
              {hasRepurchases ? (
                <OverviewSummaryValue
                  label="ROAS com recompra"
                  value={ratioLabel(campaign.roasWithRepurchase)}
                />
              ) : null}
            </div>
          ) : null}
          {dataAvailable ? (
            <ConversionFunnel stages={funnelStages} />
          ) : (
            <div className="overview-unavailable" role="status">
              <span className="status-dot" aria-hidden="true" />
              <div>
                <strong>Dados temporariamente indisponiveis</strong>
                <span>Tente novamente quando a API concluir a inicializacao.</span>
              </div>
            </div>
          )}
          <div className="overview-report-link">
            <span>
              {dataAvailable
                ? `${campaigns.length} campanha${campaigns.length === 1 ? "" : "s"} no recorte`
                : "Detalhamento preservado em Relatorios"}
            </span>
            <Link className="button ghost" href="/reports">
              Ver relatorios
            </Link>
          </div>
        </div>

        <aside className="surface-panel tracking-health" aria-label="Qualidade do rastreamento">
          <div className="tracking-health-header">
            <div>
              <span className="eyebrow">Qualidade do rastreamento</span>
              <h2>Cobertura das conversas</h2>
            </div>
            <span className={`tracking-health-status ${trackingState}`}>
              {trackingHealthLabel(trackingState)}
            </span>
          </div>

          <div className="tracking-health-body">
            <div
              className={`tracking-score ${trackingState}`}
              style={trackingScoreStyle}
              aria-label={hasTrackingSample ? `${trackedRate}% das conversas identificadas` : trackingHealthLabel(trackingState)}
            >
              <div>
                <strong>{hasTrackingSample ? `${trackedRate}%` : "-"}</strong>
                <span>identificadas</span>
              </div>
            </div>

            <div className="tracking-breakdown">
              <TrackingBreakdownItem
                label="Com origem identificada"
                value={dataAvailable ? String(campaign.realConversations) : "-"}
                tone="brand"
                href={
                  dataAvailable
                    ? leadsByAttributionHref("paid", report)
                    : undefined
                }
              />
              <TrackingBreakdownItem
                label="Conversas organicas"
                value={dataAvailable ? String(campaign.organicLeads) : "-"}
                tone="muted"
                href={
                  dataAvailable
                    ? leadsByAttributionHref("organic", report)
                    : undefined
                }
              />
              <TrackingBreakdownItem
                label="Total recebido"
                value={dataAvailable ? String(campaign.totalReceived) : "-"}
                tone="neutral"
              />
            </div>
          </div>

          <p className="tracking-health-note">
            {trackingState === "unavailable"
              ? "A API nao respondeu. Valores indisponiveis nao foram tratados como zero."
              : trackingState === "waiting"
                ? "A cobertura aparecera quando chegarem conversas do WhatsApp."
                : "A cobertura compara conversas com origem identificada ao total recebido no WhatsApp."}
          </p>

          <div className="tracking-health-footer">
            <span>Custo por conversa real</span>
            <strong>
              {dataAvailable ? money(campaign.costPerRealConversationCents) : "-"}
            </strong>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  delta,
  unavailable = false
}: {
  label: string;
  value: string;
  delta: string;
  unavailable?: boolean;
}) {
  return (
    <div className={`metric-card${unavailable ? " unavailable" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  );
}

function ConversionFunnel({ stages }: { stages: ReportFunnelStepDto[] }) {
  const palette = [
    "var(--mint)",
    "var(--teal)",
    "var(--cyan)",
    "var(--blue)",
    "var(--amber)",
    "var(--coral)"
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
      Math.round(Math.min(value / visualBase, 1) * maximumHalfHeight)
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
      "Z"
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
    <section className="conversion-funnel" aria-label={`Funil de conversao. ${funnelLabel}`}>
      <div className="conversion-funnel-heading">
        <div>
          <span className="micro-label">Jornada completa</span>
          <h3>Funil de conversao</h3>
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
            <div className="conversion-funnel-mobile-stage" key={`${stage.key}-${index}`}>
              <div>
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
              <span
                className="conversion-funnel-mobile-band"
                style={{
                  "--funnel-stage-color": color,
                  "--funnel-mobile-width": mobileWidth(stage.value)
                } as CSSProperties}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OverviewSummaryValue({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="overview-summary-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrackingBreakdownItem({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone: "brand" | "muted" | "neutral";
  href?: string;
}) {
  const content = (
    <>
      <span className={`tracking-legend-dot ${tone}`} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );

  return href ? (
    <Link className="tracking-breakdown-row" href={href}>
      {content}
    </Link>
  ) : (
    <div className="tracking-breakdown-row">{content}</div>
  );
}
