export default function SettingsPage() {
  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h1>Workspace e regras</h1>
          <p>Empresa, membros, papeis, palavras-chave, etiquetas e mapeamento de eventos.</p>
        </div>
        <div className="header-actions">
          <button className="button primary" type="button">Salvar alteracoes</button>
          <button className="button" type="button">Testar eventos</button>
        </div>
      </header>

      <div className="config-grid">
        <article className="config-card">
          <span className="micro-label">Workspace</span>
          <strong>Operacao principal</strong>
          <p className="muted">Documento fiscal, timezone, dominio de tracking e politica de retencao.</p>
          <div className="control-row">
            <label>
              Nome publico
              <input defaultValue="Operacao principal" />
            </label>
            <label>
              Timezone
              <select defaultValue="America/Sao_Paulo">
                <option>America/Sao_Paulo</option>
                <option>America/Manaus</option>
              </select>
            </label>
          </div>
        </article>

        <article className="config-card">
          <span className="micro-label">Membros</span>
          <strong>3 usuarios ativos</strong>
          <p className="muted">Administrador, operador de vendas e analista de trafego com acessos separados.</p>
          <div className="chip-row">
            <span className="tag">Admin</span>
            <span className="tag">Vendas</span>
            <span className="tag">Trafego</span>
          </div>
        </article>

        <article className="config-card">
          <span className="micro-label">Meta API</span>
          <strong>Versao v21.0</strong>
          <p className="muted">Controle operacional da versao usada em insights, OAuth, Pixel e CAPI.</p>
          <div className="control-row">
            <label>
              Versao ativa
              <select defaultValue="v21.0">
                <option>v21.0</option>
                <option>v20.0</option>
              </select>
            </label>
          </div>
        </article>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Mapeamento de eventos</span>
        <h2>Etiquetas do WhatsApp viram eventos do Pixel</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Regra</th>
                <th>Origem</th>
                <th>Evento Meta</th>
                <th>Prioridade</th>
                <th>Saude</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Novo lead</strong><span>Primeira mensagem valida</span></td>
                <td>WhatsApp webhook</td>
                <td>LeadSubmitted</td>
                <td>Alta</td>
                <td><span className="event-chip">ativo</span></td>
              </tr>
              <tr>
                <td><strong>Lead qualificado</strong><span>Etiqueta comercial aplicada</span></td>
                <td>CRM / atendimento</td>
                <td>QualifiedLead</td>
                <td>Media</td>
                <td><span className="event-chip warn">revisar</span></td>
              </tr>
              <tr>
                <td><strong>Compra confirmada</strong><span>Pedido pago ou tag venda</span></td>
                <td>Checkout / manual</td>
                <td>Purchase</td>
                <td>Alta</td>
                <td><span className="event-chip">ativo</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
