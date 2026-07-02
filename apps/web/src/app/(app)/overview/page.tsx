import { mockReportOverview } from "../../../mock/reporting";

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency"
  });
}

export default function OverviewPage() {
  const campaign = mockReportOverview.campaigns[0];
  const trackedRate = Math.round((campaign.realConversations / campaign.metaConversationsStarted) * 100);
  const leadRate = Math.round((campaign.leadSubmitted / campaign.realConversations) * 100);
  const purchaseRate = Math.round((campaign.purchase / campaign.leadSubmitted) * 100);

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Visao geral</span>
          <h1>Cockpit da operacao</h1>
          <p>
            {mockReportOverview.rangeLabel} cruzando investimento, conversas reais e eventos
            enviados ao Pixel.
          </p>
        </div>
        <div className="header-actions" aria-label="Filtros ativos">
          <span className="tag">Ultimos 7 dias</span>
          <span className="tag">Meta Ads conectado</span>
          <span className="tag">Pixel em tempo real</span>
        </div>
      </header>

      <div className="metric-grid">
        <Metric label="Conversas Meta" value={String(campaign.metaConversationsStarted)} delta="+12.4% vs periodo anterior" />
        <Metric label="Conversas reais" value={String(campaign.realConversations)} delta={`${trackedRate}% conciliadas`} />
        <Metric label="LeadSubmitted" value={String(campaign.leadSubmitted)} delta={`${leadRate}% das conversas reais`} />
        <Metric label="Purchase" value={String(campaign.purchase)} delta={`${purchaseRate}% dos leads`} />
      </div>

      <div className="panel-grid">
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
            <FunnelStep label="Meta conv." value={campaign.metaConversationsStarted} width="100%" />
            <FunnelStep label="Conversa real" value={campaign.realConversations} width="81%" />
            <FunnelStep label="LeadSubmitted" value={campaign.leadSubmitted} width="35%" />
            <FunnelStep label="QualifiedLead" value={campaign.qualifiedLead} width="16%" />
            <FunnelStep label="Purchase" value={campaign.purchase} width="5%" />
          </div>
        </div>

        <aside className="surface-panel" aria-label="Qualidade do tracking">
          <span className="eyebrow">Qualidade do tracking</span>
          <h2>Sinal sem ruido</h2>
          <div className="quality-list">
            <QualityItem label="CTWA com origem preservada" value="98.7%" />
            <QualityItem label="Eventos Pixel aceitos" value="99.2%" />
            <QualityItem label="Leads com campanha resolvida" value="92.1%" />
            <QualityItem label="Fila de envio media" value="18s" />
          </div>
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  );
}

function FunnelStep({ label, value, width }: { label: string; value: number; width: string }) {
  return (
    <div className="funnel-step">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="signal-bar" aria-hidden="true">
        <i style={{ width }} />
      </div>
    </div>
  );
}

function QualityItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="quality-card">
      <div>
        <span className="micro-label">{label}</span>
      </div>
      <span>{value}</span>
    </div>
  );
}
