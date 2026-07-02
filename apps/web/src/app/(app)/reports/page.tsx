import type {
  AdReportOverviewDto,
  AdReportRowDto,
  AdSetReportOverviewDto,
  AdSetReportRowDto,
  CampaignReportRowDto,
  CurrentWorkspaceDto,
  MetaStructureReportDto,
  ReportOverviewDto
} from "@wpptrack/shared";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";

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
type PerformanceRow =
  | CampaignReportRowDto
  | AdSetReportRowDto
  | AdReportRowDto;
type ReportTotals = {
  spendCents: number;
  metaConversationsStarted: number;
  realConversations: number;
  leadSubmitted: number;
  qualifiedLead: number;
  purchase: number;
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

async function getCampaignReports(filters: {
  since?: string;
  until?: string;
}): Promise<CampaignReportsResult> {
  try {
    const query = reportQuery(filters);

    const report = await serverApiFetch<ReportOverviewDto>(
      query ? `/reports/campaigns?${query}` : "/reports/campaigns"
    );

    return {
      report,
      state: report.campaigns.length > 0 ? "real" : "empty"
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

async function getAdSetReports(filters: {
  since?: string;
  until?: string;
}): Promise<AdSetReportsResult> {
  try {
    const query = reportQuery(filters);
    const report = await serverApiFetch<AdSetReportOverviewDto>(
      query ? `/reports/adsets?${query}` : "/reports/adsets"
    );

    return {
      report,
      state: report.adSets.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      report: {
        workspaceId: "unavailable",
        rangeLabel: "API indisponivel",
        adSets: []
      },
      state: "error"
    };
  }
}

async function getAdReports(filters: {
  since?: string;
  until?: string;
}): Promise<AdReportsResult> {
  try {
    const query = reportQuery(filters);
    const report = await serverApiFetch<AdReportOverviewDto>(
      query ? `/reports/ads?${query}` : "/reports/ads"
    );

    return {
      report,
      state: report.ads.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      report: {
        workspaceId: "unavailable",
        rangeLabel: "API indisponivel",
        ads: []
      },
      state: "error"
    };
  }
}

async function getMetaStructureReport(): Promise<MetaStructureReportDto | null> {
  try {
    return await serverApiFetch<MetaStructureReportDto>("/reports/meta/structure");
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

function reportQuery(filters: { since?: string; until?: string }) {
  const params = new URLSearchParams();

  if (filters.since) {
    params.set("since", filters.since);
  }

  if (filters.until) {
    params.set("until", filters.until);
  }

  return params.toString();
}

async function syncMetaReports(formData: FormData) {
  "use server";

  try {
    const since = String(formData.get("since") ?? "");
    const until = String(formData.get("until") ?? "");
    const params = new URLSearchParams();

    if (since) {
      params.set("since", since);
    }

    if (until) {
      params.set("until", until);
    }

    const query = params.toString();

    await serverApiFetch(query ? `/reports/meta/sync?${query}` : "/reports/meta/sync", {
      method: "POST"
    });
    revalidatePath("/reports");
  } catch {
    return;
  }
}

function asStringParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function leadsHref(filters: {
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  since?: string;
  until?: string;
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

  const query = params.toString();

  return query ? `/leads?${query}` : "/leads";
}

function reportExportHref(filters: { since?: string; until?: string }): string {
  const params = new URLSearchParams();

  if (filters.since) {
    params.set("since", filters.since);
  }

  if (filters.until) {
    params.set("until", filters.until);
  }

  const query = params.toString();

  return query ? `/reports/export?${query}` : "/reports/export";
}

function reportStatusChip(status: PerformanceRow["status"]) {
  return (
    <span className={`event-chip${status === "paused" ? " warn" : ""}`}>
      {status}
    </span>
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
      <td>0<span>-</span></td>
      <td>0<span>-</span></td>
      <td>0<span>-</span></td>
      <td>0<span>-</span></td>
      <td>0<span>-</span></td>
      <td>-</td>
    </>
  );
}

function reportTotals(rows: CampaignReportRowDto[]): ReportTotals {
  return rows.reduce(
    (totals, row) => ({
      spendCents: totals.spendCents + (row.spendCents ?? 0),
      metaConversationsStarted:
        totals.metaConversationsStarted + row.metaConversationsStarted,
      realConversations: totals.realConversations + row.realConversations,
      leadSubmitted: totals.leadSubmitted + row.leadSubmitted,
      qualifiedLead: totals.qualifiedLead + row.qualifiedLead,
      purchase: totals.purchase + row.purchase
    }),
    {
      spendCents: 0,
      metaConversationsStarted: 0,
      realConversations: 0,
      leadSubmitted: 0,
      qualifiedLead: 0,
      purchase: 0
    }
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
  format = String
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
  searchParams
}: {
  searchParams?: Promise<ReportsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const since = asStringParam(resolvedSearchParams.since);
  const until = asStringParam(resolvedSearchParams.until);
  const compareSince = asStringParam(resolvedSearchParams.compareSince);
  const compareUntil = asStringParam(resolvedSearchParams.compareUntil);
  const hasComparison = Boolean(compareSince && compareUntil);
  const [
    campaignReports,
    metaStructure,
    adSetReports,
    adReports,
    currentWorkspace,
    comparisonReports
  ] = await Promise.all([
    getCampaignReports({ since, until }),
    getMetaStructureReport(),
    getAdSetReports({ since, until }),
    getAdReports({ since, until }),
    getCurrentWorkspace(),
    hasComparison
      ? getCampaignReports({ since: compareSince, until: compareUntil })
      : Promise.resolve(null)
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
    currentWorkspace?.permissions.canManageIntegrations
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

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Relatorios</span>
          <h1>Performance por campanha</h1>
          <p>Metricas Meta Ads combinadas com leads reais e eventos de conversao.</p>
        </div>
        <div className="header-actions">
          <form className="inline-form" action="/reports">
            <input type="date" name="since" defaultValue={since} aria-label="Data inicial" />
            <input type="date" name="until" defaultValue={until} aria-label="Data final" />
            <input
              type="date"
              name="compareSince"
              defaultValue={compareSince}
              aria-label="Data inicial comparada"
            />
            <input
              type="date"
              name="compareUntil"
              defaultValue={compareUntil}
              aria-label="Data final comparada"
            />
            <button className="button" type="submit">Filtrar periodo</button>
          </form>
          <Link
            className="button"
            href={reportExportHref({ since, until })}
          >
            Exportar CSV
          </Link>
          {canSyncMetaReports ? (
            <form action={syncMetaReports}>
              <input type="hidden" name="since" value={since ?? ""} />
              <input type="hidden" name="until" value={until ?? ""} />
              <button className="button" type="submit">Sincronizar Meta</button>
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

      <div className="table-wrap">
        <table>
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
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        <Link
                          href={leadsHref({
                            campaignId: row.id,
                            since,
                            until
                          })}
                        >
                          {row.name}
                        </Link>
                      </strong>
                      {reportStatusChip(row.status)}
                    </td>
                    <PerformanceMetricsCells row={row} />
                  </tr>
              ))
            ) : (
              <tr>
                <td>
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
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Conjuntos</span>
        <h2>Performance por conjunto</h2>
        <p className="muted">Insights Meta por conjunto sincronizados com leads reais e eventos de conversao.</p>
        <div className="table-wrap">
          <table>
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
              </tr>
            </thead>
            <tbody>
              {adSetRows.length > 0 ? (
                adSetRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        <Link
                          href={leadsHref({
                            campaignId: row.campaignId,
                            adSetId: row.id,
                            since,
                            until
                          })}
                        >
                          {row.name}
                        </Link>
                      </strong>
                      <span>{row.campaignName}</span>
                      {reportStatusChip(row.status)}
                    </td>
                    <PerformanceMetricsCells row={row} />
                  </tr>
                ))
              ) : (
                <tr>
                  <td>
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
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Anuncios</span>
        <h2>Performance por anuncio</h2>
        <p className="muted">Insights Meta por anuncio sincronizados com leads reais e eventos de conversao.</p>
        <div className="table-wrap">
          <table>
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
              </tr>
            </thead>
            <tbody>
              {adRows.length > 0 ? (
                adRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        <Link
                          href={leadsHref({
                            campaignId: row.campaignId,
                            adSetId: row.adSetId,
                            adId: row.id,
                            since,
                            until
                          })}
                        >
                          {row.name}
                        </Link>
                      </strong>
                      <span>{row.campaignName} / {row.adSetName}</span>
                      {reportStatusChip(row.status)}
                    </td>
                    <PerformanceMetricsCells row={row} />
                  </tr>
                ))
              ) : (
                <tr>
                  <td>
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
                </tr>
              )}
            </tbody>
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
                              <span>{campaign.objective ?? "sem objetivo"}</span>
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
                                {ad.effectiveStatus ?? ad.status ?? "unknown"}
                              </span>
                            </td>
                          </tr>
                        ))
                      : [
                          <tr key={`${campaign.id}:${adSet.id}:empty`}>
                            <td>
                              <strong>{campaign.name}</strong>
                              <span>{campaign.objective ?? "sem objetivo"}</span>
                            </td>
                            <td>
                              <strong>{adSet.name}</strong>
                              <span>{adSet.id}</span>
                            </td>
                            <td>Sem anuncios sincronizados</td>
                            <td>
                              <span className="event-chip warn">
                                {adSet.effectiveStatus ?? adSet.status ?? "unknown"}
                              </span>
                            </td>
                          </tr>
                        ]
                  )
                )
              ) : (
                <tr>
                  <td>
                    <strong>Nenhuma estrutura Meta sincronizada</strong>
                    <span>{syncStructureHint}</span>
                  </td>
                  <td>sem conjunto</td>
                  <td>sem anuncio</td>
                  <td><span className="event-chip warn">aguardando sync</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
