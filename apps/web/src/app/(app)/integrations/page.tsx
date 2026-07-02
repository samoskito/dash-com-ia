export default function IntegrationsPage() {
  const integrations = [
    {
      title: "WhatsApp / Uazapi",
      status: "Conectado",
      tone: "",
      description: "Sessao principal com QR valido, webhooks ativos e fila de mensagens monitorada.",
      detail: "Ultimo evento recebido ha 38s"
    },
    {
      title: "Meta OAuth",
      status: "Token saudavel",
      tone: "",
      description: "Business Manager, conta de anuncio e permissoes de conversoes sincronizadas.",
      detail: "Expira em 42 dias"
    },
    {
      title: "Pixel + CAPI",
      status: "Ajustar eventos",
      tone: "warn",
      description: "LeadSubmitted e Purchase online; QualifiedLead precisa confirmar correspondencia.",
      detail: "Match quality 8.4/10"
    }
  ];

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Integracoes</span>
          <h1>WhatsApp, Meta e Pixel</h1>
          <p>Uazapi primeiro, Meta OAuth desde o inicio e Cloud API preparada para futuro.</p>
        </div>
        <div className="header-actions">
          <span className="status-chip">Webhooks online</span>
          <span className="status-chip warn">1 mapeamento pendente</span>
        </div>
      </header>

      <div className="integration-grid">
        {integrations.map((item) => (
          <article className="integration-card" key={item.title}>
            <span className={`status-chip${item.tone ? ` ${item.tone}` : ""}`}>{item.status}</span>
            <div>
              <span className="micro-label">{item.title}</span>
              <strong>{item.detail}</strong>
            </div>
            <p className="muted">{item.description}</p>
            <button className="button" type="button">
              Ver diagnostico
            </button>
          </article>
        ))}
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Pipeline de sinal</span>
        <h2>Do clique no anuncio ao evento enviado</h2>
        <div className="funnel-row" aria-label="Pipeline das integracoes">
          <div className="funnel-step">
            <span>CTWA</span>
            <strong>capturado</strong>
            <div className="signal-bar"><i style={{ width: "96%" }} /></div>
          </div>
          <div className="funnel-step">
            <span>Webhook</span>
            <strong>online</strong>
            <div className="signal-bar"><i style={{ width: "91%" }} /></div>
          </div>
          <div className="funnel-step">
            <span>Resolver campanha</span>
            <strong>92%</strong>
            <div className="signal-bar"><i style={{ width: "92%" }} /></div>
          </div>
          <div className="funnel-step">
            <span>CAPI</span>
            <strong>99%</strong>
            <div className="signal-bar"><i style={{ width: "99%" }} /></div>
          </div>
          <div className="funnel-step">
            <span>Meta ACK</span>
            <strong>18s</strong>
            <div className="signal-bar"><i style={{ width: "84%" }} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
