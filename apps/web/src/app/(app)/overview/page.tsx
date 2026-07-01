import { mockReportOverview } from "../../../mock/reporting";

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency"
  });
}

export default function OverviewPage() {
  const campaign = mockReportOverview.campaigns[0];

  return (
    <section className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Visao geral</span>
        <div>
          <h1>Cockpit da operacao</h1>
          <p>
            {mockReportOverview.rangeLabel} cruzando investimento, conversas reais e eventos
            enviados ao Pixel.
          </p>
        </div>
      </header>

      <div className="metric-grid">
        <Metric label="Conversas Meta" value={String(campaign.metaConversationsStarted)} />
        <Metric label="Conversas reais" value={String(campaign.realConversations)} />
        <Metric label="LeadSubmitted" value={String(campaign.leadSubmitted)} />
        <Metric label="Purchase" value={String(campaign.purchase)} />
      </div>

      <div className="surface-panel">
        <div>
          <span className="eyebrow">Funil integrado</span>
          <h2>{campaign.name}</h2>
        </div>
        <p>
          Investimento de {money(campaign.spendCents)} gerou {campaign.realConversations} conversas
          reais, {campaign.leadSubmitted} leads e {campaign.purchase} compras atribuidas.
        </p>
        <div className="funnel-row" aria-label="Resumo do funil">
          <span>Anuncio</span>
          <span>Conversa real</span>
          <span>LeadSubmitted</span>
          <span>QualifiedLead</span>
          <span>Purchase</span>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
