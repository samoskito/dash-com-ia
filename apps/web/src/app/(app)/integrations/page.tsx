import type {
  IntegrationHealthSummaryDto,
  WhatsappInstanceSummaryDto
} from "@wpptrack/shared";
import { serverApiFetch } from "../../../lib/server-api";

async function getHealth(): Promise<IntegrationHealthSummaryDto | null> {
  try {
    return await serverApiFetch<IntegrationHealthSummaryDto>("/integrations/health");
  } catch {
    return null;
  }
}

async function getWhatsappInstances(): Promise<WhatsappInstanceSummaryDto[]> {
  try {
    return await serverApiFetch<WhatsappInstanceSummaryDto[]>(
      "/integrations/whatsapp/instances"
    );
  } catch {
    return [];
  }
}

async function connectWhatsappInstance(formData: FormData) {
  "use server";

  const instanceId = String(formData.get("instanceId") ?? "");

  if (!instanceId) {
    return;
  }

  try {
    await serverApiFetch(`/integrations/whatsapp/instances/${instanceId}/connect`, {
      method: "POST"
    });
  } catch {
    return;
  }
}

function providerTitle(provider: string) {
  const titles: Record<string, string> = {
    uazapi: "WhatsApp / Uazapi",
    meta: "Meta OAuth",
    asaas: "Asaas"
  };

  return titles[provider] ?? provider;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    connected: "Configurado",
    disconnected: "Configurar",
    error: "Erro",
    pending_payment: "Pagamento pendente",
    needs_reconnect: "Reconectar",
    syncing: "Sincronizando"
  };

  return labels[status] ?? status;
}

export default async function IntegrationsPage() {
  const [health, whatsappInstances] = await Promise.all([
    getHealth(),
    getWhatsappInstances()
  ]);
  const integrations =
    health?.providers.map((item) => ({
      title: providerTitle(item.provider),
      status: statusLabel(item.status),
      tone: item.status === "connected" ? "" : "warn",
      description:
        item.message ??
        "Credenciais encontradas. Proxima etapa depende do fluxo operacional do provedor.",
      detail: `Verificado em ${new Date(item.checkedAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
      })}`
    })) ?? [
      {
        title: "WhatsApp / Uazapi",
        status: "Aguardando API",
        tone: "warn",
        description: "Nao foi possivel ler o backend agora; exibindo fallback visual.",
        detail: "Fallback local"
      },
      {
        title: "Meta OAuth",
        status: "Aguardando API",
        tone: "warn",
        description: "O endpoint real sera usado quando a API estiver acessivel.",
        detail: "Fallback local"
      },
      {
        title: "Asaas",
        status: "Aguardando API",
        tone: "warn",
        description: "Status de cobranca e webhooks entra pelo backend.",
        detail: "Fallback local"
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
          <span className="status-chip">{health ? "API conectada" : "Fallback visual"}</span>
          <span className="status-chip warn">Sem credenciais reais</span>
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
        <span className="eyebrow">WhatsApp Business</span>
        <h2>Instancias conectadas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instancia</th>
                <th>Provider</th>
                <th>Billing</th>
                <th>ID Uazapi</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {whatsappInstances.length > 0 ? (
                whatsappInstances.map((instance) => (
                  <tr key={instance.id}>
                    <td>
                      <strong>{instance.name}</strong>
                      <span>{instance.id}</span>
                    </td>
                    <td>{instance.provider}</td>
                    <td>{statusLabel(instance.billingStatus)}</td>
                    <td>{instance.providerInstanceId ?? "aguardando conexao"}</td>
                    <td>
                      {instance.billingStatus === "active" ? (
                        <form action={connectWhatsappInstance}>
                          <input type="hidden" name="instanceId" value={instance.id} />
                          <button className="button" type="submit">
                            Conectar WhatsApp
                          </button>
                        </form>
                      ) : (
                        <span className="event-chip warn">Pagamento pendente</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td>
                    <strong>Nenhuma instancia</strong>
                    <span>Adicione e pague uma instancia para conectar o WhatsApp</span>
                  </td>
                  <td>uazapi</td>
                  <td>Pagamento pendente</td>
                  <td>aguardando conexao</td>
                  <td><span className="event-chip warn">sem dados</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
