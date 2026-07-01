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

export default function ReportsPage() {
  return (
    <section className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Relatorios</span>
        <div>
          <h1>Performance por campanha</h1>
          <p>Metricas Meta Ads combinadas com leads reais e eventos de conversao.</p>
        </div>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Investimento</th>
              <th>Conversas Meta</th>
              <th>Conversa real</th>
              <th>LeadSubmitted</th>
              <th>QualifiedLead</th>
              <th>Purchase</th>
              <th>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {mockReportOverview.campaigns.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <span>{row.status}</span>
                </td>
                <td>{money(row.spendCents)}</td>
                <td>{row.metaConversationsStarted}</td>
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
