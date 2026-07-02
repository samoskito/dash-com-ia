import type { ConversionRuleDto } from "@wpptrack/shared";
import { serverApiFetch } from "../../../lib/server-api";

async function getConversionRules(): Promise<ConversionRuleDto[] | null> {
  try {
    return await serverApiFetch<ConversionRuleDto[]>("/conversion-rules");
  } catch {
    return null;
  }
}

function triggerLabel(rule: Pick<ConversionRuleDto, "triggerType">): string {
  return rule.triggerType === "keyword" ? "Palavra-chave" : "Etiqueta WhatsApp";
}

function matchLabel(rule: Pick<ConversionRuleDto, "matchMode" | "triggerValue">): string {
  const mode = rule.matchMode === "exact" ? "igual a" : "contem";
  return `${mode}: ${rule.triggerValue}`;
}

const fallbackRules: ConversionRuleDto[] = [
  {
    id: "fallback_1",
    workspaceId: "workspace_preview",
    name: "Novo lead",
    triggerType: "keyword",
    triggerValue: "primeira mensagem valida",
    matchMode: "contains",
    eventName: "LeadSubmitted",
    pixelId: null,
    active: true,
    createdAt: "2026-07-02T03:00:00.000Z",
    updatedAt: "2026-07-02T03:00:00.000Z"
  },
  {
    id: "fallback_2",
    workspaceId: "workspace_preview",
    name: "Lead qualificado",
    triggerType: "whatsapp_label",
    triggerValue: "Qualificado",
    matchMode: "exact",
    eventName: "QualifiedLead",
    pixelId: null,
    active: true,
    createdAt: "2026-07-02T03:00:00.000Z",
    updatedAt: "2026-07-02T03:00:00.000Z"
  },
  {
    id: "fallback_3",
    workspaceId: "workspace_preview",
    name: "Compra confirmada",
    triggerType: "whatsapp_label",
    triggerValue: "Venda fechada",
    matchMode: "exact",
    eventName: "Purchase",
    pixelId: null,
    active: true,
    createdAt: "2026-07-02T03:00:00.000Z",
    updatedAt: "2026-07-02T03:00:00.000Z"
  }
];

export default async function SettingsPage() {
  const conversionRules = await getConversionRules();
  const rules = conversionRules ?? fallbackRules;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h1>Workspace e regras</h1>
          <p>Empresa, membros, papeis, palavras-chave, etiquetas e mapeamento de eventos.</p>
        </div>
        <div className="header-actions">
          <span className="status-chip">{conversionRules ? "API conectada" : "Fallback visual"}</span>
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
                <th>Gatilho</th>
                <th>Saude</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td><strong>{rule.name}</strong><span>{matchLabel(rule)}</span></td>
                  <td>{triggerLabel(rule)}</td>
                  <td>{rule.eventName}</td>
                  <td>{rule.triggerValue}</td>
                  <td>
                    <span className={`event-chip${rule.active ? "" : " warn"}`}>
                      {rule.active ? "ativo" : "pausado"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
