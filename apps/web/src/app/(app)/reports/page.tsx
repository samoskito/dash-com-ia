import type {
  AdReportOverviewDto,
  AdReportRowDto,
  AdSetReportOverviewDto,
  AdSetReportRowDto,
  CampaignReportRowDto,
  CurrentWorkspaceDto,
  MetaAssetsDto,
  MetaStructureReportDto,
  ReportOverviewDto,
} from "@wpptrack/shared";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SubmitButton } from "../../../components/submit-button";
import { serverApiFetch } from "../../../lib/server-api";
import { MetaReportFilters } from "./meta-report-filters";

type ReportsSearchParams = Record<string, string | string[] | undefined>;
type ReportFetchState = "real" | "empty" | "error";
type CampaignReportsResult = {
  report: ReportOverviewDto;
  state: ReportFetchState;
};
type AdSetReportsResult = {
  report: AdSetReportOverviewDto;
  state: ReportFetchState;
};
type AdReportsResult = {
  report: AdReportOverviewDto;
  state: ReportFetchState;
};
type PerformanceRow = CampaignReportRowDto | AdSetReportRowDto | AdReportRowDto;
type ReportTotals = {
  spendCents: number;
  metaConversationsStarted: number;
  realConversations: number;
  leadSubmitted: number;
  qualifiedLead: number;
  purchase: number;
};
type ReportEntityCopy = {
  title: string;
  singular: string;
  plural: string;
  activeSingular: string;
  activePlural: string;
  pausedSingular: string;
  pausedPlural: string;
  deletedSingular: string;
  deletedPlural: string;
  unknownSingular: string;
  unknownPlural: string;
};
type ReportNotice = {
  tone: "success" | "warn";
  title: string;
  message: string;
};
type ReportFilters = {
  adAccountId?: string;
  businessId?: string;
  compareSince?: string;
  compareUntil?: string;
  nameContains?: string;
  nameScope?: string;
  since?: string;
  status?: string;
  until?: string;
  whatsappClassification?: string;
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

function metaStatusLabel(status: string | null | undefined) {
  if (!status) {
    return "Status desconhecido";
  }

  const labels: Record<string, string> = {
    ACTIVE: "Ativo",
    PAUSED: "Pausado",
    DELETED: "Excluido",
    ARCHIVED: "Arquivado",
    IN_PROCESS: "Em processamento",
    WITH_ISSUES: "Com problemas",
    CAMPAIGN_PAUSED: "Campanha pausada",
    ADSET_PAUSED: "Conjunto pausado",
  };

  return labels[status.toUpperCase()] ?? "Status desconhecido";
}

async function getCampaignReports(
  filters: ReportFilters,
): Promise<CampaignReportsResult> {
  try {
    const query = reportQuery(filters);

    const report = await serverApiFetch<ReportOverviewDto>(
      query ? `/reports/campaigns?${query}` : "/reports/campaigns",
    );

    return {
      report,
      state: report.campaigns.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      report: {
        workspaceId: "unavailable",
        rangeLabel: "API indisponivel",
        campaigns: [],
      },
      state: "error",
    };
  }
}

async function getAdSetReports(
  filters: ReportFilters,
): Promise<AdSetReportsResult> {
  try {
    const query = reportQuery(filters);
    const report = await serverApiFetch<AdSetReportOverviewDto>(
      query ? `/reports/adsets?${query}` : "/reports/adsets",
    );

    return {
      report,
      state: report.adSets.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      report: {
        workspaceId: "unavailable",
        rangeLabel: "API indisponivel",
        adSets: [],
      },
      state: "error",
    };
  }
}

async function getAdReports(filters: ReportFilters): Promise<AdReportsResult> {
  try {
    const query = reportQuery(filters);
    const report = await serverApiFetch<AdReportOverviewDto>(
      query ? `/reports/ads?${query}` : "/reports/ads",
    );

    return {
      report,
      state: report.ads.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      report: {
        workspaceId: "unavailable",
        rangeLabel: "API indisponivel",
        ads: [],
      },
      state: "error",
    };
  }
}

async function getMetaStructureReport(): Promise<MetaStructureReportDto | null> {
  try {
    return await serverApiFetch<MetaStructureReportDto>(
      "/reports/meta/structure",
    );
  } catch {
    return null;
  }
}

async function getCurrentWorkspace(): Promise<CurrentWorkspaceDto | null> {
  try {
    return await serverApiFetch<CurrentWorkspaceDto>("/workspaces/current");
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

function reportQuery(filters: ReportFilters, includeComparison = false) {
  const params = new URLSearchParams();

  if (filters.since) {
    params.set("since", filters.since);
  }

  if (filters.until) {
    params.set("until", filters.until);
  }

  if (includeComparison && filters.compareSince) {
    params.set("compareSince", filters.compareSince);
  }

  if (includeComparison && filters.compareUntil) {
    params.set("compareUntil", filters.compareUntil);
  }

  if (filters.businessId) {
    params.set("businessId", filters.businessId);
  }

  if (filters.adAccountId) {
    params.set("adAccountId", filters.adAccountId);
  }

  if (filters.nameContains) {
    params.set("nameContains", filters.nameContains);
    params.set("nameScope", filters.nameScope ?? "campaign");
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.whatsappClassification) {
    params.set("whatsappClassification", filters.whatsappClassification);
  }

  return params.toString();
}

async function syncMetaReports(formData: FormData) {
  "use server";

  const since = formText(formData, "since");
  const until = formText(formData, "until");
  const redirectParams = new URLSearchParams();

  for (const key of [
    "since",
    "until",
    "compareSince",
    "compareUntil",
    "businessId",
    "adAccountId",
    "nameScope",
    "nameContains",
    "status",
    "whatsappClassification",
  ]) {
    const value = formText(formData, key);

    if (value) {
      redirectParams.set(key, value);
    }
  }

  try {
    const params = new URLSearchParams();

    if (since) {
      params.set("since", since);
    }

    if (until) {
      params.set("until", until);
    }

    const query = params.toString();

    await serverApiFetch(
      query ? `/reports/meta/sync?${query}` : "/reports/meta/sync",
      {
        method: "POST",
      },
    );
    revalidatePath("/reports");
    redirectParams.set("notice", "meta-sync-queued");
  } catch {
    redirectParams.set("notice", "meta-sync-error");
  }

  redirect(`/reports?${redirectParams.toString()}`);
}

async function saveWhatsappClassification(formData: FormData) {
  "use server";

  const level = String(formData.get("level") ?? "");
  const id = String(formData.get("id") ?? "");
  const overrideValue = String(formData.get("override") ?? "");
  const override =
    overrideValue === "manual_include" || overrideValue === "manual_exclude"
      ? overrideValue
      : null;

  if (!["campaign", "adset", "ad"].includes(level) || !id) {
    return;
  }

  try {
    await serverApiFetch("/reports/meta/whatsapp-classification", {
      method: "PUT",
      body: JSON.stringify({ level, id, override }),
    });
    revalidatePath("/reports");
  } catch {
    return;
  }
}

function asStringParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function reportsNotice(notice?: string): ReportNotice | null {
  const notices: Record<string, ReportNotice> = {
    "meta-sync-queued": {
      tone: "success",
      title: "Sincronizacao iniciada",
      message:
        "A leitura dos dados Meta foi enviada para a fila. Atualize em alguns segundos para ver as campanhas.",
    },
    "meta-sync-error": {
      tone: "warn",
      title: "Sincronizacao nao iniciada",
      message:
        "Nao foi possivel iniciar a leitura dos dados Meta agora. Confira as contas ativas e os diagnosticos.",
    },
  };

  return notice ? (notices[notice] ?? null) : null;
}

function leadsHref(filters: {
  adAccountId?: string;
  campaignId?: string | null;
  businessId?: string;
  compareSince?: string;
  compareUntil?: string;
  adSetId?: string | null;
  adId?: string | null;
  since?: string;
  until?: string;
  whatsappClassification?: string;
}): string {
  const params = new URLSearchParams();

  if (filters.campaignId) {
    params.set("campaignId", filters.campaignId);
  }

  if (filters.adSetId) {
    params.set("adSetId", filters.adSetId);
  }

  if (filters.adId) {
    params.set("adId", filters.adId);
  }

  if (filters.since) {
    params.set("since", filters.since);
  }

  if (filters.until) {
    params.set("until", filters.until);
  }

  if (filters.compareSince) {
    params.set("compareSince", filters.compareSince);
  }

  if (filters.compareUntil) {
    params.set("compareUntil", filters.compareUntil);
  }

  if (filters.businessId) {
    params.set("businessId", filters.businessId);
  }

  if (filters.adAccountId) {
    params.set("adAccountId", filters.adAccountId);
  }

  if (filters.whatsappClassification) {
    params.set("whatsappClassification", filters.whatsappClassification);
  }

  const query = params.toString();

  return query ? `/leads?${query}` : "/leads";
}

function reportExportHref(filters: ReportFilters): string {
  const query = reportQuery(filters, true);

  return query ? `/reports/export?${query}` : "/reports/export";
}

function reportStatusChip(status: PerformanceRow["status"]) {
  return (
    <span className={`event-chip${status === "paused" ? " warn" : ""}`}>
      {status}
    </span>
  );
}

const campaignSummaryCopy: ReportEntityCopy = {
  title: "Resumo campanhas",
  singular: "campanha",
  plural: "campanhas",
  activeSingular: "ativa",
  activePlural: "ativas",
  pausedSingular: "pausada",
  pausedPlural: "pausadas",
  deletedSingular: "excluida",
  deletedPlural: "excluidas",
  unknownSingular: "sem status",
  unknownPlural: "sem status",
};

const adSetSummaryCopy: ReportEntityCopy = {
  title: "Resumo conjuntos",
  singular: "conjunto",
  plural: "conjuntos",
  activeSingular: "ativo",
  activePlural: "ativos",
  pausedSingular: "pausado",
  pausedPlural: "pausados",
  deletedSingular: "excluido",
  deletedPlural: "excluidos",
  unknownSingular: "sem status",
  unknownPlural: "sem status",
};

const adSummaryCopy: ReportEntityCopy = {
  title: "Resumo anuncios",
  singular: "anuncio",
  plural: "anuncios",
  activeSingular: "ativo",
  activePlural: "ativos",
  pausedSingular: "pausado",
  pausedPlural: "pausados",
  deletedSingular: "excluido",
  deletedPlural: "excluidos",
  unknownSingular: "sem status",
  unknownPlural: "sem status",
};

function ReviewActions({
  id,
  level,
}: {
  id: string;
  level: "campaign" | "adset" | "ad";
}) {
  return (
    <form className="review-actions" action={saveWhatsappClassification}>
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="override" value="manual_include">
        Incluir
      </button>
      <button type="submit" name="override" value="manual_exclude">
        Excluir
      </button>
      <button type="submit" name="override" value="">
        Resetar
      </button>
    </form>
  );
}

function PerformanceMetricsCells({ row }: { row: PerformanceRow }) {
  return (
    <>
      <td>{money(row.spendCents)}</td>
      <td>
        {row.metaConversationsStarted}
        <span>{money(row.costPerMetaConversationCents)}</span>
      </td>
      <td>
        {row.realConversations}
        <span>{money(row.costPerRealConversationCents)}</span>
      </td>
      <td>
        {row.leadSubmitted}
        <span>{money(row.costPerLeadSubmittedCents)}</span>
      </td>
      <td>
        {row.qualifiedLead}
        <span>{money(row.costPerQualifiedLeadCents)}</span>
      </td>
      <td>
        {row.purchase}
        <span>{money(row.costPerPurchaseCents)}</span>
      </td>
      <td>{row.roas === null ? "-" : `${row.roas}x`}</td>
    </>
  );
}

function EmptyPerformanceCells() {
  return (
    <>
      <td>{money(0)}</td>
      <td>
        0<span>-</span>
      </td>
      <td>
        0<span>-</span>
      </td>
      <td>
        0<span>-</span>
      </td>
      <td>
        0<span>-</span>
      </td>
      <td>
        0<span>-</span>
      </td>
      <td>-</td>
    </>
  );
}

function reportTotals(rows: PerformanceRow[]): ReportTotals {
  return rows.reduce(
    (totals, row) => ({
      spendCents: totals.spendCents + (row.spendCents ?? 0),
      metaConversationsStarted:
        totals.metaConversationsStarted + row.metaConversationsStarted,
      realConversations: totals.realConversations + row.realConversations,
      leadSubmitted: totals.leadSubmitted + row.leadSubmitted,
      qualifiedLead: totals.qualifiedLead + row.qualifiedLead,
      purchase: totals.purchase + row.purchase,
    }),
    {
      spendCents: 0,
      metaConversationsStarted: 0,
      realConversations: 0,
      leadSubmitted: 0,
      qualifiedLead: 0,
      purchase: 0,
    },
  );
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function statusCountLabel(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function reportEntitySummary(
  rows: PerformanceRow[],
  copy: ReportEntityCopy,
): string {
  const total = rows.length;

  if (total === 0) {
    return countLabel(0, copy.singular, copy.plural);
  }

  const statusCounts = {
    active: rows.filter((row) => row.status === "active").length,
    paused: rows.filter((row) => row.status === "paused").length,
    deleted: rows.filter((row) => row.status === "deleted").length,
    unknown: rows.filter((row) => row.status === "unknown").length,
  };
  const parts = [
    statusCounts.active
      ? statusCountLabel(
          statusCounts.active,
          copy.activeSingular,
          copy.activePlural,
        )
      : null,
    statusCounts.paused
      ? statusCountLabel(
          statusCounts.paused,
          copy.pausedSingular,
          copy.pausedPlural,
        )
      : null,
    statusCounts.deleted
      ? statusCountLabel(
          statusCounts.deleted,
          copy.deletedSingular,
          copy.deletedPlural,
        )
      : null,
    statusCounts.unknown
      ? statusCountLabel(
          statusCounts.unknown,
          copy.unknownSingular,
          copy.unknownPlural,
        )
      : null,
  ].filter(Boolean);

  if (parts.length === 1) {
    return `${countLabel(total, copy.singular, copy.plural)} ${String(parts[0]).replace(/^\d+\s+/, "")}`;
  }

  return `${countLabel(total, copy.singular, copy.plural)}: ${parts.join(", ")}`;
}

function SummaryMetricsCells({ totals }: { totals: ReportTotals }) {
  return (
    <>
      <td>{money(totals.spendCents)}</td>
      <td>{totals.metaConversationsStarted}</td>
      <td>{totals.realConversations}</td>
      <td>{totals.leadSubmitted}</td>
      <td>{totals.qualifiedLead}</td>
      <td>{totals.purchase}</td>
      <td>-</td>
    </>
  );
}

function PerformanceSummaryFooter({
  copy,
  rows,
}: {
  copy: ReportEntityCopy;
  rows: PerformanceRow[];
}) {
  const totals = reportTotals(rows);

  return (
    <tfoot className="report-summary">
      <tr>
        <td className="performance-name-cell summary-name">
          <strong>{copy.title}</strong>
          <span>{reportEntitySummary(rows, copy)}</span>
        </td>
        <SummaryMetricsCells totals={totals} />
        <td>
          <span className="tag">Total</span>
        </td>
      </tr>
    </tfoot>
  );
}

function deltaLabel(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? "0%" : "sem base";
  }

  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? "+" : "";

  return `${sign}${Math.round(delta)}%`;
}

function ComparisonMetric({
  label,
  current,
  previous,
  format = String,
}: {
  label: string;
  current: number;
  previous: number;
  format?: (value: number) => string;
}) {
  return (
    <div className="metric-card">
      <span className="micro-label">{label}</span>
      <strong>{format(current)}</strong>
      <span>
        Periodo comparado {format(previous)} / {deltaLabel(current, previous)}
      </span>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<ReportsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const since = asStringParam(resolvedSearchParams.since);
  const until = asStringParam(resolvedSearchParams.until);
  const compareSince = asStringParam(resolvedSearchParams.compareSince);
  const compareUntil = asStringParam(resolvedSearchParams.compareUntil);
  const businessId = asStringParam(resolvedSearchParams.businessId);
  const adAccountId = asStringParam(resolvedSearchParams.adAccountId);
  const nameScope = asStringParam(resolvedSearchParams.nameScope);
  const nameContains = asStringParam(resolvedSearchParams.nameContains);
  const status = asStringParam(resolvedSearchParams.status);
  const whatsappClassification = asStringParam(
    resolvedSearchParams.whatsappClassification,
  );
  const notice = asStringParam(resolvedSearchParams.notice);
  const pageNotice = reportsNotice(notice);
  const reportFilters = {
    since,
    until,
    compareSince,
    compareUntil,
    businessId,
    adAccountId,
    nameScope,
    nameContains,
    status,
    whatsappClassification,
  };
  const hasComparison = Boolean(compareSince && compareUntil);
  const [
    campaignReports,
    metaStructure,
    adSetReports,
    adReports,
    currentWorkspace,
    comparisonReports,
    metaAssets,
  ] = await Promise.all([
    getCampaignReports(reportFilters),
    getMetaStructureReport(),
    getAdSetReports(reportFilters),
    getAdReports(reportFilters),
    getCurrentWorkspace(),
    hasComparison
      ? getCampaignReports({
          ...reportFilters,
          since: compareSince,
          until: compareUntil,
        })
      : Promise.resolve(null),
    getMetaAssets(),
  ]);
  const { report, state: reportState } = campaignReports;
  const rows = report.campaigns;
  const adSetRows = adSetReports.report.adSets;
  const adRows = adReports.report.ads;
  const currentTotals = reportTotals(rows);
  const comparisonTotals = comparisonReports
    ? reportTotals(comparisonReports.report.campaigns)
    : null;
  const canSyncMetaReports = Boolean(
    currentWorkspace?.permissions.canManageIntegrations,
  );
  const syncCampaignHint = canSyncMetaReports
    ? "Use Sincronizar Meta para carregar campanhas reais."
    : "A sincronizacao Meta depende de owner ou admin.";
  const syncAdSetHint = canSyncMetaReports
    ? "Use Sincronizar Meta para carregar conjuntos reais."
    : "A sincronizacao Meta depende de owner ou admin.";
  const syncAdHint = canSyncMetaReports
    ? "Use Sincronizar Meta para carregar anuncios reais."
    : "A sincronizacao Meta depende de owner ou admin.";
  const syncStructureHint = canSyncMetaReports
    ? "Use o botao Sincronizar Meta para enfileirar a leitura."
    : "A leitura da estrutura Meta depende de owner ou admin.";
  const noReviewPermission = "Sem permissao para revisar";

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Relatorios</span>
          <h1>Performance por campanha</h1>
          <p>
            Metricas Meta Ads combinadas com leads reais e eventos de conversao.
          </p>
        </div>
        <div className="header-actions">
          <form className="inline-form report-period-form" action="/reports">
            <input type="hidden" name="businessId" value={businessId ?? ""} />
            <input type="hidden" name="adAccountId" value={adAccountId ?? ""} />
            <input type="hidden" name="nameScope" value={nameScope ?? ""} />
            <input
              type="hidden"
              name="nameContains"
              value={nameContains ?? ""}
            />
            <input type="hidden" name="status" value={status ?? ""} />
            <input
              type="hidden"
              name="whatsappClassification"
              value={whatsappClassification ?? ""}
            />
            <label className="filter-field">
              <span>Inicio</span>
              <input type="date" name="since" defaultValue={since} />
            </label>
            <label className="filter-field">
              <span>Fim</span>
              <input type="date" name="until" defaultValue={until} />
            </label>
            <button className="button" type="submit">
              Filtrar periodo
            </button>
          </form>
          <Link className="button" href={reportExportHref(reportFilters)}>
            Exportar CSV
          </Link>
          {canSyncMetaReports ? (
            <form action={syncMetaReports}>
              <input type="hidden" name="since" value={since ?? ""} />
              <input type="hidden" name="until" value={until ?? ""} />
              <input
                type="hidden"
                name="compareSince"
                value={compareSince ?? ""}
              />
              <input
                type="hidden"
                name="compareUntil"
                value={compareUntil ?? ""}
              />
              <input type="hidden" name="businessId" value={businessId ?? ""} />
              <input
                type="hidden"
                name="adAccountId"
                value={adAccountId ?? ""}
              />
              <input type="hidden" name="nameScope" value={nameScope ?? ""} />
              <input
                type="hidden"
                name="nameContains"
                value={nameContains ?? ""}
              />
              <input type="hidden" name="status" value={status ?? ""} />
              <input
                type="hidden"
                name="whatsappClassification"
                value={whatsappClassification ?? ""}
              />
              <SubmitButton
                pendingLabel="Sincronizando..."
                statusText="Enfileirando leitura dos dados Meta."
              >
                Sincronizar Meta
              </SubmitButton>
            </form>
          ) : (
            <span className="tag">Sem permissao para sincronizar Meta</span>
          )}
          <span className="tag">{report.rangeLabel}</span>
          {reportState === "error" ? (
            <span className="tag">API indisponivel</span>
          ) : null}
        </div>
      </header>

      {pageNotice ? (
        <div className={`feedback-banner ${pageNotice.tone}`} role="status">
          <strong>{pageNotice.title}</strong>
          <span>{pageNotice.message}</span>
        </div>
      ) : null}

      <MetaReportFilters
        assets={metaAssets}
        businessId={businessId}
        adAccountId={adAccountId}
        nameScope={nameScope}
        nameContains={nameContains}
        status={status}
        whatsappClassification={whatsappClassification}
        since={since}
        until={until}
        compareSince={compareSince}
        compareUntil={compareUntil}
      />

      {comparisonReports && comparisonTotals ? (
        <div className="surface-panel">
          <span className="eyebrow">Comparacao entre periodos</span>
          <h2>Periodo atual vs. {comparisonReports.report.rangeLabel}</h2>
          <div className="metric-grid compact">
            <ComparisonMetric
              label="Investimento"
              current={currentTotals.spendCents}
              previous={comparisonTotals.spendCents}
              format={money}
            />
            <ComparisonMetric
              label="Conversas Meta"
              current={currentTotals.metaConversationsStarted}
              previous={comparisonTotals.metaConversationsStarted}
            />
            <ComparisonMetric
              label="Conversas reais"
              current={currentTotals.realConversations}
              previous={comparisonTotals.realConversations}
            />
            <ComparisonMetric
              label="LeadSubmitted"
              current={currentTotals.leadSubmitted}
              previous={comparisonTotals.leadSubmitted}
            />
            <ComparisonMetric
              label="QualifiedLead"
              current={currentTotals.qualifiedLead}
              previous={comparisonTotals.qualifiedLead}
            />
            <ComparisonMetric
              label="Purchase"
              current={currentTotals.purchase}
              previous={comparisonTotals.purchase}
            />
          </div>
        </div>
      ) : null}

      <div className="table-wrap report-table-scroll">
        <table className="performance-table">
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Investimento</th>
              <th>Conversas Meta</th>
              <th>Conversas reais</th>
              <th>LeadSubmitted</th>
              <th>QualifiedLead</th>
              <th>Purchase</th>
              <th>ROAS</th>
              <th>Revisao WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="performance-name-cell">
                    <strong>
                      <Link
                        href={leadsHref({
                          campaignId: row.id,
                          since,
                          until,
                          compareSince,
                          compareUntil,
                          businessId,
                          adAccountId,
                          whatsappClassification,
                        })}
                      >
                        {row.name}
                      </Link>
                    </strong>
                    {reportStatusChip(row.status)}
                  </td>
                  <PerformanceMetricsCells row={row} />
                  <td>
                    {canSyncMetaReports ? (
                      <ReviewActions level="campaign" id={row.id} />
                    ) : (
                      <span className="tag">{noReviewPermission}</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="performance-name-cell">
                  <strong>
                    {reportState === "error"
                      ? "Nao foi possivel carregar campanhas"
                      : "Nenhuma campanha sincronizada"}
                  </strong>
                  <span>
                    {reportState === "error"
                      ? "Confira a API antes de analisar performance."
                      : syncCampaignHint}
                  </span>
                </td>
                <EmptyPerformanceCells />
                <td>-</td>
              </tr>
            )}
          </tbody>
          <PerformanceSummaryFooter copy={campaignSummaryCopy} rows={rows} />
        </table>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Conjuntos</span>
        <h2>Performance por conjunto</h2>
        <p className="muted">
          Insights Meta por conjunto sincronizados com leads reais e eventos de
          conversao.
        </p>
        <div className="table-wrap report-table-scroll">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Conjunto</th>
                <th>Investimento</th>
                <th>Conversas Meta</th>
                <th>Conversas reais</th>
                <th>LeadSubmitted</th>
                <th>QualifiedLead</th>
                <th>Purchase</th>
                <th>ROAS</th>
                <th>Revisao WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {adSetRows.length > 0 ? (
                adSetRows.map((row) => (
                  <tr key={row.id}>
                    <td className="performance-name-cell">
                      <strong>
                        <Link
                          href={leadsHref({
                            campaignId: row.campaignId,
                            adSetId: row.id,
                            since,
                            until,
                            compareSince,
                            compareUntil,
                            businessId,
                            adAccountId,
                            whatsappClassification,
                          })}
                        >
                          {row.name}
                        </Link>
                      </strong>
                      <span>{row.campaignName}</span>
                      {reportStatusChip(row.status)}
                    </td>
                    <PerformanceMetricsCells row={row} />
                    <td>
                      {canSyncMetaReports ? (
                        <ReviewActions level="adset" id={row.id} />
                      ) : (
                        <span className="tag">{noReviewPermission}</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="performance-name-cell">
                    <strong>
                      {adSetReports.state === "error"
                        ? "Nao foi possivel carregar conjuntos"
                        : "Nenhum conjunto sincronizado"}
                    </strong>
                    <span>
                      {adSetReports.state === "error"
                        ? "Confira a API antes de analisar conjuntos."
                        : syncAdSetHint}
                    </span>
                  </td>
                  <EmptyPerformanceCells />
                  <td>-</td>
                </tr>
              )}
            </tbody>
            <PerformanceSummaryFooter
              copy={adSetSummaryCopy}
              rows={adSetRows}
            />
          </table>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Anuncios</span>
        <h2>Performance por anuncio</h2>
        <p className="muted">
          Insights Meta por anuncio sincronizados com leads reais e eventos de
          conversao.
        </p>
        <div className="table-wrap report-table-scroll">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Anuncio</th>
                <th>Investimento</th>
                <th>Conversas Meta</th>
                <th>Conversas reais</th>
                <th>LeadSubmitted</th>
                <th>QualifiedLead</th>
                <th>Purchase</th>
                <th>ROAS</th>
                <th>Revisao WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {adRows.length > 0 ? (
                adRows.map((row) => (
                  <tr key={row.id}>
                    <td className="performance-name-cell">
                      <strong>
                        <Link
                          href={leadsHref({
                            campaignId: row.campaignId,
                            adSetId: row.adSetId,
                            adId: row.id,
                            since,
                            until,
                            compareSince,
                            compareUntil,
                            businessId,
                            adAccountId,
                            whatsappClassification,
                          })}
                        >
                          {row.name}
                        </Link>
                      </strong>
                      <span>
                        {row.campaignName} / {row.adSetName}
                      </span>
                      {reportStatusChip(row.status)}
                    </td>
                    <PerformanceMetricsCells row={row} />
                    <td>
                      {canSyncMetaReports ? (
                        <ReviewActions level="ad" id={row.id} />
                      ) : (
                        <span className="tag">{noReviewPermission}</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="performance-name-cell">
                    <strong>
                      {adReports.state === "error"
                        ? "Nao foi possivel carregar anuncios"
                        : "Nenhum anuncio sincronizado"}
                    </strong>
                    <span>
                      {adReports.state === "error"
                        ? "Confira a API antes de analisar anuncios."
                        : syncAdHint}
                    </span>
                  </td>
                  <EmptyPerformanceCells />
                  <td>-</td>
                </tr>
              )}
            </tbody>
            <PerformanceSummaryFooter copy={adSummaryCopy} rows={adRows} />
          </table>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Estrutura Meta</span>
        <h2>Campanhas, conjuntos e anuncios sincronizados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Conjunto</th>
                <th>Anuncio</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {metaStructure?.campaigns.length ? (
                metaStructure.campaigns.flatMap((campaign) =>
                  campaign.adSets.flatMap((adSet) =>
                    adSet.ads.length
                      ? adSet.ads.map((ad) => (
                          <tr key={`${campaign.id}:${adSet.id}:${ad.id}`}>
                            <td>
                              <strong>{campaign.name}</strong>
                              <span>
                                {campaign.objective ?? "sem objetivo"}
                              </span>
                            </td>
                            <td>
                              <strong>{adSet.name}</strong>
                              <span>{adSet.id}</span>
                            </td>
                            <td>
                              <strong>{ad.name}</strong>
                              <span>{ad.id}</span>
                            </td>
                            <td>
                              <span className="event-chip">
                                {metaStatusLabel(
                                  ad.effectiveStatus ?? ad.status,
                                )}
                              </span>
                            </td>
                          </tr>
                        ))
                      : [
                          <tr key={`${campaign.id}:${adSet.id}:empty`}>
                            <td>
                              <strong>{campaign.name}</strong>
                              <span>
                                {campaign.objective ?? "sem objetivo"}
                              </span>
                            </td>
                            <td>
                              <strong>{adSet.name}</strong>
                              <span>{adSet.id}</span>
                            </td>
                            <td>Sem anuncios sincronizados</td>
                            <td>
                              <span className="event-chip warn">
                                {metaStatusLabel(
                                  adSet.effectiveStatus ?? adSet.status,
                                )}
                              </span>
                            </td>
                          </tr>,
                        ],
                  ),
                )
              ) : (
                <tr>
                  <td>
                    <strong>Nenhuma estrutura Meta sincronizada</strong>
                    <span>{syncStructureHint}</span>
                  </td>
                  <td>sem conjunto</td>
                  <td>sem anuncio</td>
                  <td>
                    <span className="event-chip warn">aguardando sync</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
