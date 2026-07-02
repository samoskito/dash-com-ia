import type {
  IntegrationHealthSummaryDto,
  MetaAssetsDto,
  MetaConnectionDto,
  WhatsappInstanceCheckoutDto,
  WhatsappInstanceQuoteDto,
  WhatsappInstanceSummaryDto
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

async function getWhatsappQuote(): Promise<WhatsappInstanceQuoteDto | null> {
  try {
    return await serverApiFetch<WhatsappInstanceQuoteDto>(
      "/billing/whatsapp-instance/quote"
    );
  } catch {
    return null;
  }
}

async function getMetaConnection(): Promise<MetaConnectionDto | null> {
  try {
    return await serverApiFetch<MetaConnectionDto>("/integrations/meta/connection");
  } catch {
    return null;
  }
}

async function getMetaAssets(): Promise<MetaAssetsDto | null> {
  try {
    return await serverApiFetch<MetaAssetsDto>("/integrations/meta/assets");
  } catch {
    return null;
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

async function createWhatsappCheckout(formData: FormData) {
  "use server";

  const instanceName = String(formData.get("instanceName") ?? "").trim();

  if (!instanceName) {
    return;
  }

  let checkout: WhatsappInstanceCheckoutDto;

  try {
    checkout = await serverApiFetch<WhatsappInstanceCheckoutDto>(
      "/billing/whatsapp-instance/checkout",
      {
        method: "POST",
        body: JSON.stringify({
          instanceName,
          provider: "uazapi"
        })
      }
    );
  } catch {
    return;
  }

  if (checkout.checkoutUrl) {
    redirect(checkout.checkoutUrl);
  }

  revalidatePath("/integrations");
}

function money(cents: number | null | undefined) {
  if (!cents) {
    return "Aguardando preco";
  }

  return (cents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency"
  });
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
    not_connected: "Nao conectado",
    error: "Erro",
    pending_payment: "Pagamento pendente",
    needs_reconnect: "Reconectar",
    syncing: "Sincronizando"
  };

  return labels[status] ?? status;
}

function metaConnectionTitle(status?: MetaAssetsDto["status"] | MetaConnectionDto["status"]) {
  if (status === "connected") {
    return "Meta conectado";
  }

  if (status === "needs_reconnect") {
    return "Meta precisa reconectar";
  }

  if (status === "error") {
    return "Meta com erro";
  }

  return "Meta nao conectado";
}

function selectedMetaAssetName<T extends { id: string; name: string }>(
  items: T[],
  selectedId: string | null | undefined,
  emptyLabel: string
) {
  if (!selectedId) {
    return emptyLabel;
  }

  return items.find((item) => item.id === selectedId)?.name ?? "ativo selecionado nao encontrado";
}

function metaAssetsDetail(metaAssets: MetaAssetsDto | null) {
  if (!metaAssets) {
    return "Nao foi possivel ler os ativos Meta agora; exibindo fallback visual.";
  }

  if (metaAssets.status === "not_connected") {
    return "Conecte a conta Meta para carregar BMs, contas de anuncio e Pixels.";
  }

  if (metaAssets.syncError) {
    return metaAssets.syncError;
  }

  if (
    metaAssets.businesses.length === 0 &&
    metaAssets.adAccounts.length === 0 &&
    metaAssets.pixels.length === 0
  ) {
    return "Conta conectada, mas nenhum ativo Meta foi encontrado neste workspace.";
  }

  return "Ativos disponiveis para selecionar no proximo passo do fluxo operacional.";
}

export default async function IntegrationsPage() {
  const [health, whatsappInstances, metaConnection, metaAssets, whatsappQuote] = await Promise.all([
    getHealth(),
    getWhatsappInstances(),
    getMetaConnection(),
    getMetaAssets(),
    getWhatsappQuote()
  ]);
  const metaStatus = metaAssets?.status ?? metaConnection?.status;
  const selectedBusinessName = selectedMetaAssetName(
    metaAssets?.businesses ?? [],
    metaAssets?.selection.businessId,
    metaAssets?.status === "connected" ? "aguardando BM" : "Meta nao conectado"
  );
  const selectedAdAccountName = selectedMetaAssetName(
    metaAssets?.adAccounts ?? [],
    metaAssets?.selection.adAccountId,
    metaAssets?.status === "connected" ? "aguardando conta" : "Meta nao conectado"
  );
  const selectedPixelName = selectedMetaAssetName(
    metaAssets?.pixels ?? [],
    metaAssets?.selection.pixelId,
    metaAssets?.status === "connected" ? "aguardando Pixel" : "Meta nao conectado"
  );
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
        <span className="eyebrow">Meta OAuth</span>
        <h2>{metaConnectionTitle(metaStatus)}</h2>
        <div className="metric-grid compact">
          <div className="metric-card">
            <span className="micro-label">Status</span>
            <strong>{metaStatus ? statusLabel(metaStatus) : "Fallback visual"}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">BM selecionado</span>
            <strong>{selectedBusinessName}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Conta selecionada</span>
            <strong>{selectedAdAccountName}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Pixel selecionado</span>
            <strong>{selectedPixelName}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Escopos</span>
            <strong>
              {metaConnection?.scopes.length ? metaConnection.scopes.join(", ") : "sem escopos"}
            </strong>
          </div>
        </div>
        <p className="muted">
          {metaAssetsDetail(metaAssets)}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Ativo</th>
                <th>Detalhe</th>
                <th>Selecao</th>
              </tr>
            </thead>
            <tbody>
              {metaAssets ? (
                <>
                  <tr>
                    <td>Business Manager</td>
                    <td>
                      <strong>{selectedBusinessName}</strong>
                      <span>{metaAssets.selection.businessId ?? "sem selecao"}</span>
                    </td>
                    <td>
                      {metaAssets.businesses.find(
                        (business) => business.id === metaAssets.selection.businessId
                      )?.verificationStatus ?? "sem status"}
                    </td>
                    <td><button className="button" type="button">Selecionar</button></td>
                  </tr>
                  <tr>
                    <td>Conta de anuncio</td>
                    <td>
                      <strong>{selectedAdAccountName}</strong>
                      <span>{metaAssets.selection.adAccountId ?? "sem selecao"}</span>
                    </td>
                    <td>
                      {metaAssets.adAccounts.find(
                        (adAccount) => adAccount.id === metaAssets.selection.adAccountId
                      )?.currency ?? "sem moeda"}
                    </td>
                    <td><button className="button" type="button">Selecionar</button></td>
                  </tr>
                  <tr>
                    <td>Pixel</td>
                    <td>
                      <strong>{selectedPixelName}</strong>
                      <span>{metaAssets.selection.pixelId ?? "sem selecao"}</span>
                    </td>
                    <td>
                      {metaAssets.pixels.find((pixel) => pixel.id === metaAssets.selection.pixelId)
                        ?.code ?? "sem codigo"}
                    </td>
                    <td><button className="button" type="button">Selecionar</button></td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td>Meta</td>
                  <td>
                    <strong>Ativos indisponiveis</strong>
                    <span>fallback visual</span>
                  </td>
                  <td>aguardando API</td>
                  <td><span className="event-chip warn">sem dados</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Tokens Meta ficam criptografados no backend. Esta tela mostra apenas estado,
          escopos e selecoes operacionais.
        </p>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">WhatsApp Business</span>
        <h2>Instancias conectadas</h2>
        <div className="metric-grid compact">
          <div className="metric-card">
            <span className="micro-label">Instancias ativas</span>
            <strong>{whatsappQuote?.activeInstances ?? whatsappInstances.length}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Nova instancia</span>
            <strong>{money(whatsappQuote?.nextInstanceAmountCents)}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Cobranca</span>
            <strong>Antecipada via Asaas</strong>
          </div>
        </div>
        <form className="inline-form" action={createWhatsappCheckout}>
          <input
            name="instanceName"
            placeholder="Nome da instancia"
            aria-label="Nome da instancia WhatsApp"
          />
          <button className="button" type="submit">
            Adicionar instancia
          </button>
        </form>
        <p className="muted">
          Ao adicionar uma instancia, o backend gera a cobranca no Asaas antes de liberar a conexao.
        </p>
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
