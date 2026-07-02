export default function LeadsPage() {
  const leads = [
    {
      name: "Mariana Alves",
      phone: "+55 11 98844-1020",
      campaign: "Black Friday WhatsApp",
      source: "ctwa / ad 2389",
      event: "QualifiedLead",
      status: "Atendimento ativo",
      score: "86"
    },
    {
      name: "Rafael Costa",
      phone: "+55 31 97710-4300",
      campaign: "Remarketing 7 dias",
      source: "pixel / publico quente",
      event: "LeadSubmitted",
      status: "Aguardando resposta",
      score: "71"
    },
    {
      name: "Bianca Lima",
      phone: "+55 21 96683-2022",
      campaign: "Publico frio - videos",
      source: "ctwa / criativo 04",
      event: "Purchase",
      status: "Compra atribuida",
      score: "94"
    },
    {
      name: "Paulo Mendes",
      phone: "+55 41 99116-8801",
      campaign: "Black Friday WhatsApp",
      source: "manual / direct",
      event: "Sem evento",
      status: "Origem parcial",
      score: "42"
    }
  ];

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Leads</span>
          <h1>Leads rastreados pelo WhatsApp</h1>
          <p>Busca por nome ou telefone, filtros por campanha, etiquetas e eventos enviados.</p>
        </div>
        <div className="header-actions">
          <span className="status-chip">142 conversas reais</span>
          <span className="status-chip warn">8 pendencias</span>
        </div>
      </header>

      <div className="filter-bar" aria-label="Filtros de leads">
        <span className="filter-control">Periodo: 7 dias</span>
        <span className="filter-control">Campanha: todas</span>
        <span className="filter-control">Evento: todos</span>
        <span className="filter-control">Status: em aberto</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lead</th>
              <th>Campanha / origem</th>
              <th>Evento</th>
              <th>Status</th>
              <th>Score</th>
              <th>Ultimo toque</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.phone}>
                <td>
                  <strong>{lead.name}</strong>
                  <span>{lead.phone}</span>
                </td>
                <td>
                  {lead.campaign}
                  <span>{lead.source}</span>
                </td>
                <td>
                  <span className={`event-chip${lead.event === "Sem evento" ? " warn" : ""}`}>
                    {lead.event}
                  </span>
                </td>
                <td>{lead.status}</td>
                <td>{lead.score}</td>
                <td>ha 12 min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
