import type { CampaignReportRowDto, ReportOverviewDto } from "@wpptrack/shared";
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

async function getOverviewReport(): Promise<ReportOverviewDto> {
  try {
    return await serverApiFetch<ReportOverviewDto>("/reports/campaigns");
  } catch {
    return mockReportOverview;
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
  const leadSubmitted = campaigns.reduce(
    (total, campaign) => total + campaign.leadSubmitted,
    0
  );
  const qualifiedLead = campaigns.reduce(
    (total, campaign) => total + campaign.qualifiedLead,
    0
  );
  const purchase = campaigns.reduce((total, campaign) => total + campaign.purchase, 0);

  return {
    id: "all_campaigns",
    name: campaigns.length === 1 ? campaigns[0]?.name ?? "Campanha" : "Todas as campanhas",
    status: campaigns.some((campaign) => campaign.status === "active") ? "active" : "unknown",
    spendCents,
    metaConversationsStarted,
    costPerMetaConversationCents: costPer(spendCents, metaConversationsStarted),
    realConversations,
    costPerRealConversationCents: costPer(spendCents, realConversations),
    leadSubmitted,
    costPerLeadSubmittedCents: costPer(spendCents, leadSubmitted),
    qualifiedLead,
    costPerQualifiedLeadCents: costPer(spendCents, qualifiedLead),
    purchase,
    costPerPurchaseCents: costPer(spendCents, purchase),
    roas: null
  };
}

function costPer(spendCents: number, count: number): number | null {
  return count > 0 ? Math.floor(spendCents / count) : null;
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function funnelWidth(part: number, total: number): string {
  return `${Math.max(percent(part, total), part > 0 ? 3 : 0)}%`;
}

export default async function OverviewPage() {
  const report = await getOverviewReport();
  const campaigns = report.campaigns;
  const campaign = sumCampaigns(campaigns);
  const trackedRate = percent(campaign.realConversations, campaign.metaConversationsStarted);
  const leadRate = percent(campaign.leadSubmitted, campaign.realConversations);
  const purchaseRate = percent(campaign.purchase, campaign.leadSubmitted);

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
          <span className="tag">{report.rangeLabel}</span>
          <span className="tag">{campaigns.length} campanhas</span>
          <span className="tag">{trackedRate}% conciliadas</span>
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
            <FunnelStep
              label="Conversa real"
              value={campaign.realConversations}
              width={funnelWidth(campaign.realConversations, campaign.metaConversationsStarted)}
            />
            <FunnelStep
              label="LeadSubmitted"
              value={campaign.leadSubmitted}
              width={funnelWidth(campaign.leadSubmitted, campaign.metaConversationsStarted)}
            />
            <FunnelStep
              label="QualifiedLead"
              value={campaign.qualifiedLead}
              width={funnelWidth(campaign.qualifiedLead, campaign.metaConversationsStarted)}
            />
            <FunnelStep
              label="Purchase"
              value={campaign.purchase}
              width={funnelWidth(campaign.purchase, campaign.metaConversationsStarted)}
            />
          </div>
          <div className="chip-row" aria-label="Campanhas no recorte">
            {campaigns.map((item) => (
              <span className="event-chip" key={item.id}>{item.name}</span>
            ))}
          </div>
        </div>

        <aside className="surface-panel" aria-label="Qualidade do tracking">
          <span className="eyebrow">Qualidade do tracking</span>
          <h2>Sinal sem ruido</h2>
          <div className="quality-list">
            <QualityItem label="Conversas reais sobre Meta" value={`${trackedRate}%`} />
            <QualityItem label="Leads sobre conversas reais" value={`${leadRate}%`} />
            <QualityItem label="Compras sobre leads" value={`${purchaseRate}%`} />
            <QualityItem
              label="Custo por conversa real"
              value={money(campaign.costPerRealConversationCents)}
            />
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
