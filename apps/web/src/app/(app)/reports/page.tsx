import type { MetaStructureReportDto, ReportOverviewDto } from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";
import { mockReportOverview } from "../../../mock/reporting";

type ReportsSearchParams = Record<string, string | string[] | undefined>;
type ReportFetchState = "real" | "empty" | "fallback";
type CampaignReportsResult = {
  report: ReportOverviewDto;
  state: ReportFetchState;
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
    const params = new URLSearchParams();

    if (filters.since) {
      params.set("since", filters.since);
    }

    if (filters.until) {
      params.set("until", filters.until);
    }

    const query = params.toString();

    const report = await serverApiFetch<ReportOverviewDto>(
      query ? `/reports/campaigns?${query}` : "/reports/campaigns"
    );

    return {
      report,
      state: report.campaigns.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      report: mockReportOverview,
      state: "fallback"
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

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<ReportsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const since = asStringParam(resolvedSearchParams.since);
  const until = asStringParam(resolvedSearchParams.until);
  const [campaignReports, metaStructure] = await Promise.all([
    getCampaignReports({ since, until }),
    getMetaStructureReport()
  ]);
  const { report, state: reportState } = campaignReports;
  const rows = report.campaigns;

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
            <button className="button" type="submit">Filtrar periodo</button>
          </form>
          <form action={syncMetaReports}>
            <input type="hidden" name="since" value={since ?? ""} />
            <input type="hidden" name="until" value={until ?? ""} />
            <button className="button" type="submit">Sincronizar Meta</button>
          </form>
          <span className="tag">{report.rangeLabel}</span>
          {reportState === "fallback" ? (
            <span className="tag">Dados de demonstracao</span>
          ) : null}
        </div>
      </header>

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
                    <strong>{row.name}</strong>
                    <span className={`event-chip${row.status === "paused" ? " warn" : ""}`}>
                      {row.status}
                    </span>
                  </td>
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
                </tr>
              ))
            ) : (
              <tr>
                <td>
                  <strong>Nenhuma campanha sincronizada</strong>
                  <span>Use Sincronizar Meta para carregar campanhas reais.</span>
                </td>
                <td>{money(0)}</td>
                <td>0<span>-</span></td>
                <td>0<span>-</span></td>
                <td>0<span>-</span></td>
                <td>0<span>-</span></td>
                <td>0<span>-</span></td>
                <td>-</td>
              </tr>
            )}
          </tbody>
        </table>
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
                    <span>Use o botao Sincronizar Meta para enfileirar a leitura.</span>
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
