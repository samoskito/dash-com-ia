import type { ReportOverviewDto } from "@wpptrack/shared";
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

export default async function ReportsPage() {
  const report = await getCampaignReports();
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
    </section>
  );
}
