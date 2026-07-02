import type { MetaStructureReportDto, ReportOverviewDto } from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";
import { mockReportOverview } from "../../../mock/reporting";

function money(cents: number | null) {
  if (cents === null) {
    return "-";
  }

  return (cents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency"
  });
}

async function getCampaignReports(): Promise<ReportOverviewDto> {
  try {
    return await serverApiFetch<ReportOverviewDto>("/reports/campaigns");
  } catch {
    return mockReportOverview;
  }
}

async function getMetaStructureReport(): Promise<MetaStructureReportDto | null> {
  try {
    return await serverApiFetch<MetaStructureReportDto>("/reports/meta/structure");
  } catch {
    return null;
  }
}

async function syncMetaReports() {
  "use server";

  try {
    await serverApiFetch("/reports/meta/sync", {
      method: "POST"
    });
    revalidatePath("/reports");
  } catch {
    return;
  }
}

export default async function ReportsPage() {
  const [report, metaStructure] = await Promise.all([
    getCampaignReports(),
    getMetaStructureReport()
  ]);
  const rows = [
    ...report.campaigns,
    {
      id: "cmp_remarketing",
      name: "Remarketing 7 dias",
      status: "unknown",
      spendCents: 84200,
      metaConversationsStarted: 121,
      costPerMetaConversationCents: 696,
      realConversations: 103,
      costPerRealConversationCents: 817,
      leadSubmitted: 46,
      costPerLeadSubmittedCents: 1830,
      qualifiedLead: 23,
      costPerQualifiedLeadCents: 3660,
      purchase: 7,
      costPerPurchaseCents: 12028,
      roas: 6.8
    },
    {
      id: "cmp_video_frio",
      name: "Publico frio - videos",
      status: "paused",
      spendCents: 67500,
      metaConversationsStarted: 88,
      costPerMetaConversationCents: 767,
      realConversations: 64,
      costPerRealConversationCents: 1054,
      leadSubmitted: 18,
      costPerLeadSubmittedCents: 3750,
      qualifiedLead: 6,
      costPerQualifiedLeadCents: 11250,
      purchase: 1,
      costPerPurchaseCents: 67500,
      roas: 1.7
    }
  ];

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Relatorios</span>
          <h1>Performance por campanha</h1>
          <p>Metricas Meta Ads combinadas com leads reais e eventos de conversao.</p>
        </div>
        <div className="header-actions">
          <span className="tag">Custo por evento</span>
          <span className="tag">Atribuicao CTWA</span>
          <span className="tag">Exportacao CSV</span>
          <form action={syncMetaReports}>
            <button className="button" type="submit">Sincronizar Meta</button>
          </form>
          <span className="tag">Atualizacao enfileirada</span>
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
            {rows.map((row) => (
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
            ))}
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
