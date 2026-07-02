import type { ConversionRuleDto } from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { serverApiFetch } from "../../../lib/server-api";

type ConversionRulesResult = {
  rules: ConversionRuleDto[];
  state: "real" | "empty" | "error";
};

async function getConversionRules(): Promise<ConversionRulesResult> {
  try {
    const rules = await serverApiFetch<ConversionRuleDto[]>("/conversion-rules");

    return {
      rules,
      state: rules.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      rules: [],
      state: "error"
    };
  }
}

function triggerLabel(rule: Pick<ConversionRuleDto, "triggerType">): string {
  return rule.triggerType === "keyword" ? "Palavra-chave" : "Etiqueta WhatsApp";
}

function matchLabel(rule: Pick<ConversionRuleDto, "matchMode" | "triggerValue">): string {
  const mode = rule.matchMode === "exact" ? "igual a" : "contem";
  return `${mode}: ${rule.triggerValue}`;
}

async function createConversionRule(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const triggerType = String(formData.get("triggerType") ?? "keyword");
  const triggerValue = String(formData.get("triggerValue") ?? "").trim();
  const matchMode = String(formData.get("matchMode") ?? "contains");
  const eventName = String(formData.get("eventName") ?? "LeadSubmitted");
  const pixelId = String(formData.get("pixelId") ?? "").trim();

  if (!name || !triggerValue) {
    return;
  }

  try {
    await serverApiFetch("/conversion-rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        triggerType,
        triggerValue,
        matchMode,
        eventName,
        pixelId: pixelId || null,
        active: true
      })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

async function updateConversionRuleStatus(formData: FormData) {
  "use server";

  const ruleId = String(formData.get("ruleId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!ruleId) {
    return;
  }

  try {
    await serverApiFetch(`/conversion-rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({ active })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

export default async function SettingsPage() {
  const conversionRules = await getConversionRules();
  const { rules } = conversionRules;
  const emptyTitle =
    conversionRules.state === "error"
      ? "Nao foi possivel carregar regras"
      : "Nenhuma regra configurada";
  const emptyDescription =
    conversionRules.state === "error"
      ? "Confira a API antes de alterar mapeamentos de evento."
      : "Crie uma regra por palavra-chave ou etiqueta para iniciar o envio de eventos.";

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h1>Workspace e regras</h1>
          <p>Empresa, membros, papeis, palavras-chave, etiquetas e mapeamento de eventos.</p>
        </div>
        <div className="header-actions">
          <span className={`status-chip${conversionRules.state === "error" ? " warn" : ""}`}>
            {conversionRules.state === "error" ? "API indisponivel" : "API conectada"}
          </span>
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
        <form className="inline-form" action={createConversionRule}>
          <input name="name" placeholder="Nome da regra" aria-label="Nome da regra" />
          <select name="triggerType" defaultValue="keyword" aria-label="Origem do gatilho">
            <option value="keyword">Palavra-chave</option>
            <option value="whatsapp_label">Etiqueta WhatsApp</option>
          </select>
          <input name="triggerValue" placeholder="Gatilho" aria-label="Gatilho da regra" />
          <select name="matchMode" defaultValue="contains" aria-label="Modo de comparacao">
            <option value="contains">Contem</option>
            <option value="exact">Igual a</option>
          </select>
          <select name="eventName" defaultValue="LeadSubmitted" aria-label="Evento Meta">
            <option value="LeadSubmitted">LeadSubmitted</option>
            <option value="QualifiedLead">QualifiedLead</option>
            <option value="Purchase">Purchase</option>
            <option value="Contact">Contact</option>
            <option value="CompleteRegistration">CompleteRegistration</option>
          </select>
          <input name="pixelId" placeholder="Pixel opcional" aria-label="Pixel opcional" />
          <button className="button primary" type="submit">Criar regra</button>
        </form>
        <p className="muted">Nova regra de conversao</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Regra</th>
                <th>Origem</th>
                <th>Evento Meta</th>
                <th>Gatilho</th>
                <th>Saude</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {rules.length > 0 ? (
                rules.map((rule) => (
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
                    <td>
                      <form action={updateConversionRuleStatus}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <input type="hidden" name="active" value={String(!rule.active)} />
                        <button className="button" type="submit">
                          {rule.active ? "Pausar" : "Ativar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <strong>{emptyTitle}</strong>
                    <span>{emptyDescription}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
