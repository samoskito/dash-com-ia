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
  ReportPaginationDto,
} from "@wpptrack/shared";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SubmitButton } from "../../../components/submit-button";
import { serverApiFetch } from "../../../lib/server-api";
import { getCurrentWorkspace } from "../../../lib/current-workspace";
import { MetaReportFilters } from "./meta-report-filters";

type ReportsSearchParams = Record<string, string | string[] | undefined>;
type ReportView = "campaigns" | "adsets" | "ads";
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
  organicLeads: number;
  totalReceived: number;
  trackingRate: number | null;
  qualifiedLead: number;
  purchases: number;
  firstPurchases: number;
  repurchases: number;
  trafficRevenueCents: number;
  organicRevenueCents: number;
  totalRevenueCents: number;
  firstPurchaseRevenueCents: number;
  repurchaseRevenueCents: number;
  roasAcquisition: number | null;
  roasWithRepurchase: number | null;
};
type MetaStructureSummary = {
  campaigns: number;
  adSets: number;
  ads: number;
  activeAccounts: number;
  lastSyncedAt: string | null;
};
type MetaSyncPeriodState =
  | { kind: "none" | "missing" | "mixed" }
  | { kind: "single"; since: string; until: string };
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
type StructureNameScope = "campaign" | "adset" | "ad";
type StructureStatusFilter = "all" | "active" | "inactive";
type MetaStructureFilters = {
  nameContains?: string;
  nameScope: StructureNameScope;
  status: StructureStatusFilter;
};
type MetaStructureRow = {
  adId: string | null;
  adName: string;
  adSetId: string;
  adSetName: string;
  campaignName: string;
  campaignObjective: string | null;
  key: string;
  status: string | null | undefined;
};
type ReportNotice = {
  tone: "success" | "warn";
  title: string;
  message: string;
};
type WorkspaceFetchResult = {
  data: CurrentWorkspaceDto | null;
  state: "real" | "error";
};
type ReportFilters = {
  adAccountId?: string;
  businessId?: string;
  compareSince?: string;
  compareUntil?: string;
  nameContains?: string;
  nameScope?: string;
  page?: number;
  pageSize?: number;
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

function roas(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}x`;
}

function percent(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
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

async function getCurrentWorkspaceResource(): Promise<WorkspaceFetchResult> {
  try {
    return {
      data: await getCurrentWorkspace(),
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

async function getMetaAssets(): Promise<MetaAssetsDto | null> {
  try {
    return await serverApiFetch<MetaAssetsDto>("/integrations/meta/assets");
  } catch {
    return null;
  }
}

function reportQuery(
  filters: ReportFilters,
  includeComparison = false,
  includePagination = true,
) {
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

  if (includePagination && filters.page) {
    params.set("page", String(filters.page));
  }

  if (includePagination && filters.pageSize) {
    params.set("pageSize", String(filters.pageSize));
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
    "view",
    "pageSize",
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

function reportView(value?: string): ReportView {
  return value === "adsets" || value === "ads" ? value : "campaigns";
}

function positiveIntegerParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function structureNameScope(value?: string): StructureNameScope {
  return value === "adset" || value === "ad" ? value : "campaign";
}

function structureStatusFilter(value?: string): StructureStatusFilter {
  return value === "active" || value === "inactive" ? value : "all";
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
  const query = reportQuery(filters, true, false);

  return query ? `/reports/export?${query}` : "/reports/export";
}

function reportViewHref(view: ReportView, filters: ReportFilters): string {
  const params = new URLSearchParams(
    reportQuery({ ...filters, page: 1 }, true),
  );
  params.set("view", view);

  return `/reports?${params.toString()}`;
}

function reportPageHref(
  view: ReportView,
  filters: ReportFilters,
  page: number,
): string {
  const params = new URLSearchParams(reportQuery({ ...filters, page }, true));
  params.set("view", view);

  return `/reports?${params.toString()}`;
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
        {row.totalReceived}
        <span>{percent(row.trackingRate)}</span>
      </td>
      <td>
        {row.qualifiedLead}
        <span>{money(row.costPerQualifiedLeadCents)}</span>
      </td>
      <td>
        {row.purchases}
        <span>{money(row.costPerPurchaseCents)}</span>
      </td>
      <td>{row.firstPurchases}</td>
      <td>{row.repurchases}</td>
      <td>{row.organicLeads}</td>
      <td>{money(row.trafficRevenueCents)}</td>
      <td>{money(row.organicRevenueCents)}</td>
      <td>{money(row.totalRevenueCents)}</td>
      <td>{roas(row.roasAcquisition)}</td>
      <td>{roas(row.roasWithRepurchase)}</td>
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
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>{money(0)}</td>
      <td>{money(0)}</td>
      <td>{money(0)}</td>
      <td>-</td>
      <td>-</td>
    </>
  );
}

function weightedRoas(
  rows: PerformanceRow[],
  selectRoas: (row: PerformanceRow) => number | null,
): number | null {
  const weighted = rows.reduce(
    (total, row) => {
      const value = selectRoas(row);

      if (value === null || row.spendCents === 0) {
        return total;
      }

      return {
        spendCents: total.spendCents + row.spendCents,
        revenueBasis: total.revenueBasis + value * row.spendCents,
      };
    },
    { revenueBasis: 0, spendCents: 0 },
  );

  return weighted.spendCents > 0
    ? weighted.revenueBasis / weighted.spendCents
    : null;
}

function reportTotals(rows: PerformanceRow[]): ReportTotals {
  const totals = rows.reduce<ReportTotals>(
    (totals, row) => ({
      spendCents: totals.spendCents + (row.spendCents ?? 0),
      metaConversationsStarted:
        totals.metaConversationsStarted + row.metaConversationsStarted,
      realConversations: totals.realConversations + row.realConversations,
      organicLeads: totals.organicLeads + row.organicLeads,
      totalReceived: totals.totalReceived + row.totalReceived,
      trackingRate: null,
      qualifiedLead: totals.qualifiedLead + row.qualifiedLead,
      purchases: totals.purchases + row.purchases,
      firstPurchases: totals.firstPurchases + row.firstPurchases,
      repurchases: totals.repurchases + row.repurchases,
      trafficRevenueCents: totals.trafficRevenueCents + row.trafficRevenueCents,
      organicRevenueCents: totals.organicRevenueCents + row.organicRevenueCents,
      totalRevenueCents: totals.totalRevenueCents + row.totalRevenueCents,
      firstPurchaseRevenueCents:
        totals.firstPurchaseRevenueCents + row.firstPurchaseRevenueCents,
      repurchaseRevenueCents:
        totals.repurchaseRevenueCents + row.repurchaseRevenueCents,
      roasAcquisition: null,
      roasWithRepurchase: null,
    }),
    {
      spendCents: 0,
      metaConversationsStarted: 0,
      realConversations: 0,
      organicLeads: 0,
      totalReceived: 0,
      trackingRate: null,
      qualifiedLead: 0,
      purchases: 0,
      firstPurchases: 0,
      repurchases: 0,
      trafficRevenueCents: 0,
      organicRevenueCents: 0,
      totalRevenueCents: 0,
      firstPurchaseRevenueCents: 0,
      repurchaseRevenueCents: 0,
      roasAcquisition: null,
      roasWithRepurchase: null,
    },
  );

  return {
    ...totals,
    trackingRate:
      totals.totalReceived > 0
        ? totals.realConversations / totals.totalReceived
        : null,
    roasAcquisition: weightedRoas(rows, (row) => row.roasAcquisition),
    roasWithRepurchase: weightedRoas(rows, (row) => row.roasWithRepurchase),
  };
}

function metaStructureSummary(
  metaStructure: MetaStructureReportDto | null,
  metaAssets: MetaAssetsDto | null,
): MetaStructureSummary {
  const campaigns = metaStructure?.campaigns ?? [];

  return {
    campaigns: campaigns.length,
    adSets: campaigns.reduce(
      (total, campaign) => total + campaign.adSets.length,
      0,
    ),
    ads: campaigns.reduce(
      (total, campaign) =>
        total +
        campaign.adSets.reduce(
          (adTotal, adSet) => adTotal + adSet.ads.length,
          0,
        ),
      0,
    ),
    activeAccounts: (metaAssets?.reportingAccounts ?? []).filter(
      (account) => account.active,
    ).length,
    lastSyncedAt: metaAssets?.lastSyncedAt ?? null,
  };
}

function metaSyncPeriodState(
  metaAssets: MetaAssetsDto | null,
): MetaSyncPeriodState {
  const accounts = (metaAssets?.reportingAccounts ?? []).filter(
    (account) => account.active,
  );

  if (accounts.length === 0) {
    return { kind: "none" };
  }

  const ranges = accounts
    .map((account) =>
      account.syncStatus === "synced" &&
      account.lastSyncSince &&
      account.lastSyncUntil
        ? `${account.lastSyncSince}|${account.lastSyncUntil}`
        : null,
    )
    .filter((value): value is string => Boolean(value));

  if (ranges.length === 0) {
    return { kind: "missing" };
  }

  const uniqueRanges = [...new Set(ranges)];

  if (ranges.length !== accounts.length || uniqueRanges.length !== 1) {
    return { kind: "mixed" };
  }

  const [since, until] = uniqueRanges[0].split("|");

  return since && until
    ? { kind: "single", since, until }
    : { kind: "missing" };
}

function dateOnlyLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function periodLabel(since: string, until: string): string {
  return `${dateOnlyLabel(since)} a ${dateOnlyLabel(until)}`;
}

function metaStructureRows(
  metaStructure: MetaStructureReportDto | null,
): MetaStructureRow[] {
  const rows: MetaStructureRow[] = [];

  for (const campaign of metaStructure?.campaigns ?? []) {
    for (const adSet of campaign.adSets) {
      if (adSet.ads.length) {
        for (const ad of adSet.ads) {
          rows.push({
            adId: ad.id,
            adName: ad.name,
            adSetId: adSet.id,
            adSetName: adSet.name,
            campaignName: campaign.name,
            campaignObjective: campaign.objective,
            key: `${campaign.id}:${adSet.id}:${ad.id}`,
            status: ad.effectiveStatus ?? ad.status,
          });
        }

        continue;
      }

      rows.push({
        adId: null,
        adName: "Sem anuncios sincronizados",
        adSetId: adSet.id,
        adSetName: adSet.name,
        campaignName: campaign.name,
        campaignObjective: campaign.objective,
        key: `${campaign.id}:${adSet.id}:empty`,
        status: adSet.effectiveStatus ?? adSet.status,
      });
    }
  }

  return rows;
}

function normalizedSearch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function metaStructureRowIsActive(row: MetaStructureRow): boolean {
  return row.status?.toUpperCase() === "ACTIVE";
}

function filterMetaStructureRows(
  rows: MetaStructureRow[],
  filters: MetaStructureFilters,
): MetaStructureRow[] {
  const query = normalizedSearch(filters.nameContains);

  return rows.filter((row) => {
    const nameTarget = {
      ad: row.adName,
      adset: row.adSetName,
      campaign: row.campaignName,
    }[filters.nameScope];

    if (query && !normalizedSearch(nameTarget).includes(query)) {
      return false;
    }

    if (filters.status === "active") {
      return metaStructureRowIsActive(row);
    }

    if (filters.status === "inactive") {
      return !metaStructureRowIsActive(row);
    }

    return true;
  });
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function syncedCountLabel(
  count: number,
  singular: string,
  plural: string,
): string {
  return countLabel(count, singular, plural);
}

function syncDateLabel(value: string | null): string {
  if (!value) {
    return "sem registro";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "data indisponivel";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
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
      <td>
        {totals.totalReceived}
        <span>{percent(totals.trackingRate)}</span>
      </td>
      <td>{totals.qualifiedLead}</td>
      <td>{totals.purchases}</td>
      <td>{totals.firstPurchases}</td>
      <td>{totals.repurchases}</td>
      <td>{totals.organicLeads}</td>
      <td>{money(totals.trafficRevenueCents)}</td>
      <td>{money(totals.organicRevenueCents)}</td>
      <td>{money(totals.totalRevenueCents)}</td>
      <td>{roas(totals.roasAcquisition)}</td>
      <td>{roas(totals.roasWithRepurchase)}</td>
    </>
  );
}

function PerformanceMetricHeaders() {
  return (
    <>
      <th>Investimento</th>
      <th>Conversas Meta</th>
      <th>Conversas reais</th>
      <th>Total recebido</th>
      <th>Lead qualificado</th>
      <th>Compras</th>
      <th>Primeira compra</th>
      <th>Recompra</th>
      <th>Leads organicos</th>
      <th>Receita trafego</th>
      <th>Receita organica</th>
      <th>Receita total</th>
      <th>ROAS aquisicao</th>
      <th>ROAS com recompra</th>
    </>
  );
}

function PerformanceSummaryFooter({
  copy,
  pagination,
  rows,
  totals,
}: {
  copy: ReportEntityCopy;
  pagination?: ReportPaginationDto;
  rows: PerformanceRow[];
  totals?: ReportTotals;
}) {
  const summaryTotals = totals ?? reportTotals(rows);
  const hasFilteredTotals = Boolean(totals);

  return (
    <tfoot className="report-summary">
      <tr>
        <td className="performance-name-cell summary-name">
          <strong>
            {hasFilteredTotals
              ? "Total do filtro"
              : pagination
                ? `Subtotal da pagina ${pagination.page}`
                : copy.title}
          </strong>
          <span>
            {pagination
              ? `${rows.length} nesta pagina de ${countLabel(pagination.totalItems, copy.singular, copy.plural)} no filtro`
              : reportEntitySummary(rows, copy)}
          </span>
        </td>
        <SummaryMetricsCells totals={summaryTotals} />
        <td>
          <span className="tag">Total</span>
        </td>
      </tr>
    </tfoot>
  );
}

function ReportPagination({
  copy,
  filters,
  pagination,
  view,
}: {
  copy: ReportEntityCopy;
  filters: ReportFilters;
  pagination?: ReportPaginationDto;
  view: ReportView;
}) {
  if (!pagination) {
    return null;
  }

  return (
    <nav
      className="report-pagination"
      aria-label={`Paginacao de ${copy.plural}`}
    >
      <span>
        Pagina {pagination.page} de {Math.max(pagination.totalPages, 1)} ·{" "}
        {pagination.totalItems} {copy.plural}
      </span>
      <div>
        {pagination.page > 1 ? (
          <Link
            className="button ghost"
            href={reportPageHref(view, filters, pagination.page - 1)}
          >
            Anterior
          </Link>
        ) : (
          <span className="button ghost disabled" aria-disabled="true">
            Anterior
          </span>
        )}
        {pagination.page < pagination.totalPages ? (
          <Link
            className="button ghost"
            href={reportPageHref(view, filters, pagination.page + 1)}
          >
            Proxima
          </Link>
        ) : (
          <span className="button ghost disabled" aria-disabled="true">
            Proxima
          </span>
        )}
      </div>
    </nav>
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

function comparisonDeltaLabel(
  current: number | null,
  previous: number | null,
): string {
  if (current === null || previous === null) {
    return "-";
  }

  return deltaLabel(current, previous);
}

function ComparisonMetric({
  label,
  current,
  previous,
  format = String,
}: {
  label: string;
  current: number | null;
  previous: number | null;
  format?: (value: number) => string;
}) {
  const currentValue = current === null ? "-" : format(current);
  const previousValue = previous === null ? "-" : format(previous);

  return (
    <div className="metric-card">
      <span className="micro-label">{label}</span>
      <strong>{currentValue}</strong>
      <span>
        Periodo comparado {previousValue} /{" "}
        {comparisonDeltaLabel(current, previous)}
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
  const requestedSince = asStringParam(resolvedSearchParams.since);
  const requestedUntil = asStringParam(resolvedSearchParams.until);
  const compareSince = asStringParam(resolvedSearchParams.compareSince);
  const compareUntil = asStringParam(resolvedSearchParams.compareUntil);
  const businessId = asStringParam(resolvedSearchParams.businessId);
  const adAccountId = asStringParam(resolvedSearchParams.adAccountId);
  const nameScope = asStringParam(resolvedSearchParams.nameScope);
  const nameContains = asStringParam(resolvedSearchParams.nameContains);
  const status = asStringParam(resolvedSearchParams.status);
  const activeView = reportView(asStringParam(resolvedSearchParams.view));
  const page = positiveIntegerParam(
    asStringParam(resolvedSearchParams.page),
    1,
  );
  const pageSize = Math.min(
    positiveIntegerParam(asStringParam(resolvedSearchParams.pageSize), 10),
    100,
  );
  const structureNameContains = asStringParam(
    resolvedSearchParams.structureNameContains,
  );
  const structureNameScopeValue = structureNameScope(
    asStringParam(resolvedSearchParams.structureNameScope),
  );
  const structureStatusValue = structureStatusFilter(
    asStringParam(resolvedSearchParams.structureStatus),
  );
  const whatsappClassification = asStringParam(
    resolvedSearchParams.whatsappClassification,
  );
  const notice = asStringParam(resolvedSearchParams.notice);
  const diagnosticRequested =
    asStringParam(resolvedSearchParams.diagnostic) === "open";
  const pageNotice = reportsNotice(notice);
  const requestedReportFilters = {
    since: requestedSince,
    until: requestedUntil,
    compareSince,
    compareUntil,
    businessId,
    adAccountId,
    nameScope,
    nameContains,
    page,
    pageSize,
    status,
    whatsappClassification,
  };
  const structureFilters: MetaStructureFilters = {
    nameContains: structureNameContains,
    nameScope: structureNameScopeValue,
    status: structureStatusValue,
  };
  const structureFiltersApplied = Boolean(
    structureNameContains || structureStatusValue !== "all",
  );
  const shouldLoadMetaStructure =
    diagnosticRequested || structureFiltersApplied;
  const hasComparison = Boolean(
    activeView === "campaigns" && compareSince && compareUntil,
  );
  const [
    campaignReports,
    adSetReports,
    adReports,
    currentWorkspaceResult,
    comparisonReports,
    metaAssets,
    metaStructure,
  ] = await Promise.all([
    activeView === "campaigns"
      ? getCampaignReports(requestedReportFilters)
      : Promise.resolve(null),
    activeView === "adsets"
      ? getAdSetReports(requestedReportFilters)
      : Promise.resolve(null),
    activeView === "ads"
      ? getAdReports(requestedReportFilters)
      : Promise.resolve(null),
    getCurrentWorkspaceResource(),
    hasComparison
      ? getCampaignReports({
          ...requestedReportFilters,
          since: compareSince,
          until: compareUntil,
          page: undefined,
          pageSize: undefined,
        })
      : Promise.resolve(null),
    getMetaAssets(),
    shouldLoadMetaStructure ? getMetaStructureReport() : Promise.resolve(null),
  ]);
  const loadedReport =
    campaignReports?.report ?? adSetReports?.report ?? adReports?.report;
  const since = requestedSince ?? loadedReport?.since ?? undefined;
  const until = requestedUntil ?? loadedReport?.until ?? undefined;
  const reportFilters = {
    ...requestedReportFilters,
    since,
    until,
  };
  const rows = campaignReports?.report.campaigns ?? [];
  const adSetRows = adSetReports?.report.adSets ?? [];
  const adRows = adReports?.report.ads ?? [];
  const activeRows: PerformanceRow[] =
    activeView === "campaigns"
      ? rows
      : activeView === "adsets"
        ? adSetRows
        : adRows;
  const reportState =
    campaignReports?.state ??
    adSetReports?.state ??
    adReports?.state ??
    "error";
  const rangeLabel =
    campaignReports?.report.rangeLabel ??
    adSetReports?.report.rangeLabel ??
    adReports?.report.rangeLabel ??
    "API indisponivel";
  const pagination: ReportPaginationDto | undefined =
    campaignReports?.report.pagination ??
    adSetReports?.report.pagination ??
    adReports?.report.pagination;
  const currentTotals: ReportTotals =
    campaignReports?.report.totals ??
    adSetReports?.report.totals ??
    adReports?.report.totals ??
    reportTotals(activeRows);
  const metaSummary = metaStructureSummary(metaStructure, metaAssets);
  const metaSyncPeriod = metaSyncPeriodState(metaAssets);
  const requestedPeriodLabel =
    since && until ? periodLabel(since, until) : rangeLabel;
  const metaPeriodMatchesReport =
    metaSyncPeriod.kind === "single" &&
    metaSyncPeriod.since === since &&
    metaSyncPeriod.until === until;
  const rawMetaStructureRows = metaStructureRows(metaStructure);
  const filteredMetaStructureRows = filterMetaStructureRows(
    rawMetaStructureRows,
    structureFilters,
  );
  const comparisonTotals = comparisonReports
    ? (comparisonReports.report.totals ??
      reportTotals(comparisonReports.report.campaigns))
    : null;
  const canSyncMetaReports = Boolean(
    currentWorkspaceResult.data?.permissions?.canManageIntegrations,
  );
  const workspacePermissionsUnavailable =
    currentWorkspaceResult.state === "error";
  const syncCampaignHint = canSyncMetaReports
    ? "Use Sincronizar Meta para carregar campanhas reais."
    : workspacePermissionsUnavailable
      ? "Nao foi possivel confirmar as permissoes agora."
      : "A sincronizacao Meta depende de owner ou admin.";
  const syncAdSetHint = canSyncMetaReports
    ? "Use Sincronizar Meta para carregar conjuntos reais."
    : workspacePermissionsUnavailable
      ? "Nao foi possivel confirmar as permissoes agora."
      : "A sincronizacao Meta depende de owner ou admin.";
  const syncAdHint = canSyncMetaReports
    ? "Use Sincronizar Meta para carregar anuncios reais."
    : workspacePermissionsUnavailable
      ? "Nao foi possivel confirmar as permissoes agora."
      : "A sincronizacao Meta depende de owner ou admin.";
  const syncStructureHint = canSyncMetaReports
    ? "Use o botao Sincronizar Meta para enfileirar a leitura."
    : workspacePermissionsUnavailable
      ? "Nao foi possivel confirmar as permissoes agora."
      : "A leitura da estrutura Meta depende de owner ou admin.";
  const emptyStructureTitle = rawMetaStructureRows.length
    ? "Nenhuma estrutura encontrada"
    : "Nenhuma estrutura Meta sincronizada";
  const emptyStructureHint = rawMetaStructureRows.length
    ? "Ajuste os filtros da estrutura tecnica para ver outros itens sincronizados."
    : syncStructureHint;
  const clearStructureQuery = reportQuery(reportFilters, true);
  const clearStructureHref = clearStructureQuery
    ? `/reports?${clearStructureQuery}&view=${activeView}&diagnostic=open`
    : "/reports";
  const diagnosticHref = clearStructureQuery
    ? `/reports?${clearStructureQuery}&view=${activeView}&diagnostic=open`
    : `/reports?view=${activeView}&diagnostic=open`;
  const noReviewPermission = workspacePermissionsUnavailable
    ? "Permissoes indisponiveis"
    : "Sem permissao para revisar";
  const reportTitle = {
    ads: "Performance por anuncio",
    adsets: "Performance por conjunto",
    campaigns: "Performance por campanha",
  }[activeView];
  const activeCopy = {
    ads: adSummaryCopy,
    adsets: adSetSummaryCopy,
    campaigns: campaignSummaryCopy,
  }[activeView];
  const metaPeriodWarning: ReportNotice | null =
    metaSyncPeriod.kind === "none" || metaPeriodMatchesReport
      ? null
      : metaSyncPeriod.kind === "single"
        ? {
            tone: "warn",
            title: "Periodo Meta diferente do relatorio",
            message: `O relatorio esta em ${requestedPeriodLabel}, mas o investimento salvo veio de ${periodLabel(metaSyncPeriod.since, metaSyncPeriod.until)}. Sincronize a Meta para alinhar os valores.`,
          }
        : metaSyncPeriod.kind === "mixed"
          ? {
              tone: "warn",
              title: "Contas Meta com periodos diferentes",
              message:
                "Sincronize a Meta neste periodo para alinhar todas as contas antes de comparar os totais.",
            }
          : {
              tone: "warn",
              title: "Periodo da ultima sincronizacao ainda nao registrado",
              message: `Sincronize a Meta para confirmar o investimento de ${requestedPeriodLabel}.`,
            };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Relatorios</span>
          <h1>{reportTitle}</h1>
          <p>
            Metricas Meta Ads combinadas com leads reais e eventos de conversao.
          </p>
        </div>
        <div className="header-actions">
          <form className="inline-form report-period-form" action="/reports">
            <input type="hidden" name="view" value={activeView} />
            <input type="hidden" name="pageSize" value={pageSize} />
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
              <input type="hidden" name="view" value={activeView} />
              <input type="hidden" name="pageSize" value={pageSize} />
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
            <span className="tag">
              {workspacePermissionsUnavailable
                ? "Permissoes indisponiveis"
                : "Sem permissao para sincronizar Meta"}
            </span>
          )}
          <span className="tag">Periodo: {requestedPeriodLabel}</span>
          {metaSyncPeriod.kind === "single" ? (
            <span className="tag">
              Meta: {periodLabel(metaSyncPeriod.since, metaSyncPeriod.until)}
            </span>
          ) : null}
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

      {metaPeriodWarning ? (
        <div
          className={`feedback-banner ${metaPeriodWarning.tone}`}
          role="status"
        >
          <strong>{metaPeriodWarning.title}</strong>
          <span>{metaPeriodWarning.message}</span>
        </div>
      ) : null}

      <nav className="report-view-tabs" aria-label="Nivel do relatorio">
        {(
          [
            ["campaigns", "Campanhas"],
            ["adsets", "Conjuntos"],
            ["ads", "Anuncios"],
          ] as const
        ).map(([view, label]) => (
          <Link
            aria-current={activeView === view ? "page" : undefined}
            className={activeView === view ? "active" : ""}
            href={reportViewHref(view, reportFilters)}
            key={view}
          >
            {label}
          </Link>
        ))}
      </nav>

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
        view={activeView}
        pageSize={pageSize}
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
              label="Lead qualificado"
              current={currentTotals.qualifiedLead}
              previous={comparisonTotals.qualifiedLead}
            />
            <ComparisonMetric
              label="Compras"
              current={currentTotals.purchases}
              previous={comparisonTotals.purchases}
            />
            <ComparisonMetric
              label="Primeira compra"
              current={currentTotals.firstPurchases}
              previous={comparisonTotals.firstPurchases}
            />
            <ComparisonMetric
              label="Recompra"
              current={currentTotals.repurchases}
              previous={comparisonTotals.repurchases}
            />
            <ComparisonMetric
              label="Leads organicos"
              current={currentTotals.organicLeads}
              previous={comparisonTotals.organicLeads}
            />
            <ComparisonMetric
              label="Receita trafego"
              current={currentTotals.trafficRevenueCents}
              previous={comparisonTotals.trafficRevenueCents}
              format={money}
            />
            <ComparisonMetric
              label="Receita organica"
              current={currentTotals.organicRevenueCents}
              previous={comparisonTotals.organicRevenueCents}
              format={money}
            />
            <ComparisonMetric
              label="Receita total"
              current={currentTotals.totalRevenueCents}
              previous={comparisonTotals.totalRevenueCents}
              format={money}
            />
            <ComparisonMetric
              label="ROAS aquisicao"
              current={currentTotals.roasAcquisition}
              previous={comparisonTotals.roasAcquisition}
              format={roas}
            />
            <ComparisonMetric
              label="ROAS com recompra"
              current={currentTotals.roasWithRepurchase}
              previous={comparisonTotals.roasWithRepurchase}
              format={roas}
            />
          </div>
        </div>
      ) : null}

      {activeView === "campaigns" ? (
        <div className="table-wrap report-table-scroll">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Campanha</th>
                <PerformanceMetricHeaders />
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
            <PerformanceSummaryFooter
              copy={campaignSummaryCopy}
              pagination={pagination}
              rows={rows}
              totals={campaignReports?.report.totals}
            />
          </table>
        </div>
      ) : null}

      {activeView === "adsets" ? (
        <div className="surface-panel">
          <span className="eyebrow">Conjuntos</span>
          <h2>Performance por conjunto</h2>
          <p className="muted">
            Insights Meta por conjunto sincronizados com leads reais e eventos
            de conversao.
          </p>
          <div className="table-wrap report-table-scroll">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Conjunto</th>
                  <PerformanceMetricHeaders />
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
                        {adSetReports?.state === "error"
                          ? "Nao foi possivel carregar conjuntos"
                          : "Nenhum conjunto sincronizado"}
                      </strong>
                      <span>
                        {adSetReports?.state === "error"
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
                pagination={pagination}
                rows={adSetRows}
                totals={adSetReports?.report.totals}
              />
            </table>
          </div>
        </div>
      ) : null}

      {activeView === "ads" ? (
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
                  <PerformanceMetricHeaders />
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
                        {adReports?.state === "error"
                          ? "Nao foi possivel carregar anuncios"
                          : "Nenhum anuncio sincronizado"}
                      </strong>
                      <span>
                        {adReports?.state === "error"
                          ? "Confira a API antes de analisar anuncios."
                          : syncAdHint}
                      </span>
                    </td>
                    <EmptyPerformanceCells />
                    <td>-</td>
                  </tr>
                )}
              </tbody>
              <PerformanceSummaryFooter
                copy={adSummaryCopy}
                pagination={pagination}
                rows={adRows}
                totals={adReports?.report.totals}
              />
            </table>
          </div>
        </div>
      ) : null}

      <ReportPagination
        copy={activeCopy}
        filters={reportFilters}
        pagination={pagination}
        view={activeView}
      />

      {shouldLoadMetaStructure ? (
        <details className="surface-panel meta-diagnostic-panel" open>
          <summary className="meta-diagnostic-summary">
            <span className="meta-diagnostic-copy">
              <span className="eyebrow">Diagnostico da sincronizacao Meta</span>
              <strong>Estrutura tecnica recolhida</strong>
              <span>
                A hierarquia bruta da Meta fica aqui para conferencia tecnica.
                Os relatorios principais acima continuam sendo a fonte de
                analise.
              </span>
            </span>
            <span className="button ghost meta-diagnostic-action">
              Ver estrutura tecnica
            </span>
          </summary>

          <div
            className="meta-diagnostic-stats"
            aria-label="Resumo da estrutura Meta sincronizada"
          >
            <span>
              <strong>{metaSummary.campaigns}</strong>
              <small>
                {syncedCountLabel(
                  metaSummary.campaigns,
                  "campanha sincronizada",
                  "campanhas sincronizadas",
                )}
              </small>
            </span>
            <span>
              <strong>{metaSummary.adSets}</strong>
              <small>
                {syncedCountLabel(
                  metaSummary.adSets,
                  "conjunto sincronizado",
                  "conjuntos sincronizados",
                )}
              </small>
            </span>
            <span>
              <strong>{metaSummary.ads}</strong>
              <small>
                {syncedCountLabel(
                  metaSummary.ads,
                  "anuncio sincronizado",
                  "anuncios sincronizados",
                )}
              </small>
            </span>
            <span>
              <strong>{metaSummary.activeAccounts}</strong>
              <small>
                {syncedCountLabel(
                  metaSummary.activeAccounts,
                  "conta ativa",
                  "contas ativas",
                )}
              </small>
            </span>
            <span>
              <strong>{syncDateLabel(metaSummary.lastSyncedAt)}</strong>
              <small>ultima sincronizacao</small>
            </span>
          </div>

          <form
            className="filter-bar meta-structure-filters"
            aria-label="Filtros da estrutura tecnica Meta"
            action="/reports"
          >
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
            <select
              className="filter-control"
              name="structureNameScope"
              aria-label="Tipo de filtro da estrutura tecnica"
              defaultValue={structureFilters.nameScope}
            >
              <option value="campaign">Campanha contem</option>
              <option value="adset">Conjunto contem</option>
              <option value="ad">Anuncio contem</option>
            </select>
            <input
              className="filter-control"
              placeholder="Filtrar estrutura por nome"
              aria-label="Texto contido no nome da estrutura"
              name="structureNameContains"
              defaultValue={structureFilters.nameContains ?? ""}
            />
            <select
              className="filter-control"
              name="structureStatus"
              aria-label="Filtrar status da estrutura tecnica"
              defaultValue={structureFilters.status}
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <button className="button" type="submit">
              Filtrar estrutura
            </button>
            {structureFiltersApplied ? (
              <Link className="button ghost" href={clearStructureHref}>
                Limpar filtros
              </Link>
            ) : null}
          </form>

          <div className="table-wrap report-table-scroll meta-structure-scroll">
            <table className="meta-structure-table">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Conjunto</th>
                  <th>Anuncio</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredMetaStructureRows.length ? (
                  filteredMetaStructureRows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <strong>{row.campaignName}</strong>
                        <span>{row.campaignObjective ?? "sem objetivo"}</span>
                      </td>
                      <td>
                        <strong>{row.adSetName}</strong>
                        <span>{row.adSetId}</span>
                      </td>
                      <td>
                        <strong>{row.adName}</strong>
                        <span>{row.adId ?? "sem anuncio"}</span>
                      </td>
                      <td>
                        <span
                          className={`event-chip${
                            metaStructureRowIsActive(row) ? "" : " warn"
                          }`}
                        >
                          {metaStatusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td>
                      <strong>{emptyStructureTitle}</strong>
                      <span>{emptyStructureHint}</span>
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
        </details>
      ) : (
        <section className="surface-panel meta-diagnostic-collapsed">
          <div className="meta-diagnostic-copy">
            <span className="eyebrow">Diagnostico da sincronizacao Meta</span>
            <strong>Estrutura tecnica sob demanda</strong>
            <span>
              Carregue a hierarquia bruta somente quando precisar auditar a
              sincronizacao. Ela nao bloqueia mais a abertura dos relatorios.
            </span>
          </div>
          <Link className="button ghost" href={diagnosticHref}>
            Carregar diagnostico
          </Link>
        </section>
      )}
    </section>
  );
}
