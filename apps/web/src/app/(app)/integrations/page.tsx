import type {
  IntegrationHealthSummaryDto,
  IntegrationPipelineOverviewDto,
  MetaAssetsDto,
  MetaConnectionDto,
  CurrentWorkspaceDto,
  WhatsappInstanceCheckoutDto,
  WhatsappInstanceConnectionDto,
  WhatsappInstanceQuoteDto,
  WhatsappInstanceSummaryDto,
  WorkspaceSubscriptionSummaryDto
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverApiFetch } from "../../../lib/server-api";
import { MetaOAuthButton } from "./meta-oauth-button";

type ResourceResult<T> = {
  data: T;
  state: "real" | "empty" | "error";
};

async function getHealth(): Promise<ResourceResult<IntegrationHealthSummaryDto | null>> {
  try {
    const health = await serverApiFetch<IntegrationHealthSummaryDto>("/integrations/health");

    return {
      data: health,
      state: health.providers.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      data: null,
      state: "error"
    };
  }
}

async function getWhatsappInstances(): Promise<ResourceResult<WhatsappInstanceSummaryDto[]>> {
  try {
    const instances = await serverApiFetch<WhatsappInstanceSummaryDto[]>(
      "/integrations/whatsapp/instances"
    );

    return {
      data: instances,
      state: instances.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      data: [],
      state: "error"
    };
  }
}

async function getWhatsappInstanceStatuses(
  instances: WhatsappInstanceSummaryDto[]
): Promise<Record<string, WhatsappInstanceConnectionDto>> {
  const activeInstances = instances.filter(
    (instance) => instance.billingStatus === "active"
  );
  const entries = await Promise.all(
    activeInstances.map(async (instance) => {
      try {
        const status = await serverApiFetch<WhatsappInstanceConnectionDto>(
          `/integrations/whatsapp/instances/${instance.id}/status`
        );

        return [instance.id, status] as const;
      } catch {
        return [
          instance.id,
          {
            whatsappInstanceId: instance.id,
            provider: instance.provider,
            billingStatus: instance.billingStatus,
            connectionStatus: "error",
            qrCode: null,
            message: "Nao foi possivel carregar o status da instancia."
          }
        ] as const;
      }
    })
  );

  return Object.fromEntries(entries);
}

async function getWhatsappQuote(): Promise<ResourceResult<WhatsappInstanceQuoteDto | null>> {
  try {
    return {
      data: await serverApiFetch<WhatsappInstanceQuoteDto>(
        "/billing/whatsapp-instance/quote"
      ),
      state: "real"
    };
  } catch {
    return {
      data: null,
      state: "error"
    };
  }
}

async function getBillingSubscription(): Promise<ResourceResult<WorkspaceSubscriptionSummaryDto | null>> {
  try {
    return {
      data: await serverApiFetch<WorkspaceSubscriptionSummaryDto>(
        "/billing/subscription"
      ),
      state: "real"
    };
  } catch {
    return {
      data: null,
      state: "error"
    };
  }
}

async function getIntegrationPipeline(): Promise<ResourceResult<IntegrationPipelineOverviewDto | null>> {
  try {
    const pipeline = await serverApiFetch<IntegrationPipelineOverviewDto>(
      "/integrations/pipeline"
    );

    return {
      data: pipeline,
      state: pipeline.stages.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      data: null,
      state: "error"
    };
  }
}

async function getCurrentWorkspace(): Promise<ResourceResult<CurrentWorkspaceDto | null>> {
  try {
    return {
      data: await serverApiFetch<CurrentWorkspaceDto>("/workspaces/current"),
      state: "real"
    };
  } catch {
    return {
      data: null,
      state: "error"
    };
  }
}

async function getMetaConnection(): Promise<ResourceResult<MetaConnectionDto | null>> {
  try {
    return {
      data: await serverApiFetch<MetaConnectionDto>("/integrations/meta/connection"),
      state: "real"
    };
  } catch {
    return {
      data: null,
      state: "error"
    };
  }
}

async function getMetaAssets(): Promise<ResourceResult<MetaAssetsDto | null>> {
  try {
    return {
      data: await serverApiFetch<MetaAssetsDto>("/integrations/meta/assets"),
      state: "real"
    };
  } catch {
    return {
      data: null,
      state: "error"
    };
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
    revalidatePath("/integrations");
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

async function saveMetaAssetSelection(formData: FormData) {
  "use server";

  const businessId = String(formData.get("businessId") ?? "").trim();
  const adAccountId = String(formData.get("adAccountId") ?? "").trim();
  const pixelId = String(formData.get("pixelId") ?? "").trim();

  if (!businessId && !adAccountId && !pixelId) {
    return;
  }

  try {
    await serverApiFetch("/integrations/meta/assets/selection", {
      method: "PUT",
      body: JSON.stringify({
        businessId: businessId || null,
        adAccountId: adAccountId || null,
        pixelId: pixelId || null
      })
    });
    revalidatePath("/integrations");
  } catch {
    return;
  }
}

async function saveMetaCapiToken(formData: FormData) {
  "use server";

  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const clear = String(formData.get("clear") ?? "") === "true";

  if (!accessToken && !clear) {
    return;
  }

  try {
    await serverApiFetch("/integrations/meta/capi-token", {
      method: "PUT",
      body: JSON.stringify(
        clear
          ? { clear: true }
          : {
              accessToken
            }
      )
    });
    revalidatePath("/integrations");
  } catch {
    return;
  }
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

  return titles[provider] ?? "Provedor desconhecido";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    connected: "Configurado",
    disconnected: "Configurar",
    not_connected: "Nao conectado",
    error: "Erro",
    pending_payment: "Pagamento pendente",
    active: "Ativa",
    needs_reconnect: "Reconectar",
    not_configured: "Nao configurado",
    pending: "Aguardando",
    qr_required: "QR pendente",
    syncing: "Sincronizando"
  };

  return labels[status] ?? "Status desconhecido";
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

  if (status && status !== "not_connected") {
    return "Meta com status desconhecido";
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

  return (
    items.find((item) => item.id === selectedId)?.name ??
    "Ativo selecionado fora da ultima sincronizacao"
  );
}

function selectedMetaAssetDetail<T extends { id: string }>(
  items: T[],
  selectedId: string | null | undefined,
  detail: (item: T) => string | null | undefined,
  emptyLabel: string
) {
  if (!selectedId) {
    return emptyLabel;
  }

  const item = items.find((candidate) => candidate.id === selectedId);

  if (!item) {
    return "Ressincronize a Meta ou escolha outro ativo";
  }

  return detail(item) ?? emptyLabel;
}

function metaAssetsDetail(
  metaAssets: MetaAssetsDto | null,
  state: ResourceResult<MetaAssetsDto | null>["state"]
) {
  if (!metaAssets) {
    return state === "error"
      ? "Nao foi possivel ler os ativos Meta agora."
      : "Conecte a conta Meta para carregar os ativos.";
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

function pipelineWidth(value: number, maxValue: number) {
  if (maxValue <= 0 || value <= 0) {
    return "0%";
  }

  return `${Math.max(8, Math.round((value / maxValue) * 100))}%`;
}

export default async function IntegrationsPage() {
  const [
    healthResult,
    whatsappInstancesResult,
    metaConnectionResult,
    metaAssetsResult,
    whatsappQuoteResult,
    billingSubscriptionResult,
    pipelineResult,
    workspaceResult
  ] = await Promise.all([
    getHealth(),
    getWhatsappInstances(),
    getMetaConnection(),
    getMetaAssets(),
    getWhatsappQuote(),
    getBillingSubscription(),
    getIntegrationPipeline(),
    getCurrentWorkspace()
  ]);
  const health = healthResult.data;
  const whatsappInstances = whatsappInstancesResult.data;
  const whatsappInstanceStatuses = await getWhatsappInstanceStatuses(
    whatsappInstances
  );
  const metaConnection = metaConnectionResult.data;
  const metaAssets = metaAssetsResult.data;
  const whatsappQuote = whatsappQuoteResult.data;
  const billingSubscription = billingSubscriptionResult.data;
  const pipeline = pipelineResult.data;
  const workspace = workspaceResult.data;
  const canManageIntegrations = Boolean(
    workspace?.permissions.canManageIntegrations
  );
  const canManageBilling = Boolean(workspace?.permissions.canManageBilling);
  const maxPipelineValue = Math.max(
    ...((pipeline?.stages ?? []).map((stage) => stage.value)),
    0
  );
  const hasIntegrationError = [
    healthResult.state,
    whatsappInstancesResult.state,
    metaConnectionResult.state,
    metaAssetsResult.state,
    whatsappQuoteResult.state,
    billingSubscriptionResult.state,
    pipelineResult.state,
    workspaceResult.state
  ].includes("error");
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
    })) ?? [];
  const metaStatusLabel =
    metaAssetsResult.state === "error" && metaConnectionResult.state === "error"
      ? "API indisponivel"
      : metaStatus
        ? statusLabel(metaStatus)
        : "Meta nao conectado";
  const whatsappInstancesEmptyTitle =
    whatsappInstancesResult.state === "error"
      ? "Nao foi possivel carregar instancias"
      : "Nenhuma instancia";

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Integracoes</span>
          <h1>WhatsApp, Meta e Pixel</h1>
          <p>Uazapi primeiro, Meta OAuth desde o inicio e Cloud API preparada para futuro.</p>
        </div>
        <div className="header-actions">
          <span className={`status-chip${hasIntegrationError ? " warn" : ""}`}>
            {hasIntegrationError ? "API indisponivel" : "API conectada"}
          </span>
          <span className="status-chip">{integrations.length} provedores</span>
        </div>
      </header>

      <div className="integration-grid">
        {integrations.length > 0 ? (
          integrations.map((item) => (
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
          ))
        ) : (
          <article className="integration-card">
            <span className="status-chip warn">
              {healthResult.state === "error" ? "API indisponivel" : "Sem provedores"}
            </span>
            <div>
              <span className="micro-label">Integracoes</span>
              <strong>
                {healthResult.state === "error"
                  ? "Nao foi possivel carregar integracoes"
                  : "Nenhuma integracao retornada"}
              </strong>
            </div>
            <p className="muted">A lista sera preenchida somente com provedores retornados pelo backend.</p>
          </article>
        )}
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Meta OAuth</span>
        <h2>{metaConnectionTitle(metaStatus)}</h2>
        <div className="connection-callout">
          <div>
            <span className="micro-label">Login social Facebook</span>
            <strong>
              {metaStatus === "connected"
                ? "Conta Meta conectada"
                : "Conectar conta Meta"}
            </strong>
            <p className="muted">
              Use o OAuth oficial para autorizar BM, contas de anuncio e Pixels.
              O token nasce no backend e fica criptografado.
            </p>
          </div>
          {canManageIntegrations ? (
            <MetaOAuthButton connected={metaStatus === "connected"} />
          ) : (
            <span className="event-chip warn">sem permissao</span>
          )}
        </div>
        <div className="metric-grid compact">
          <div className="metric-card">
            <span className="micro-label">Status</span>
            <strong>{metaStatusLabel}</strong>
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
          <div className="metric-card">
            <span className="micro-label">Token CAPI</span>
            <strong>
              {metaConnection?.capiTokenConfigured
                ? "Token CAPI configurado"
                : "Token CAPI ausente"}
            </strong>
          </div>
        </div>
        <p className="muted">
          {metaAssetsDetail(metaAssets, metaAssetsResult.state)}
        </p>
        {metaAssets && canManageIntegrations ? (
          <form className="filter-bar" action={saveMetaAssetSelection}>
            <select
              className="filter-control"
              name="businessId"
              defaultValue={metaAssets.selection.businessId ?? ""}
              aria-label="Business Manager Meta"
            >
              <option value="">Sem BM</option>
              {metaAssets.businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
            <select
              className="filter-control"
              name="adAccountId"
              defaultValue={metaAssets.selection.adAccountId ?? ""}
              aria-label="Conta de anuncio Meta"
            >
              <option value="">Sem conta</option>
              {metaAssets.adAccounts.map((adAccount) => (
                <option key={adAccount.id} value={adAccount.id}>
                  {adAccount.name}
                </option>
              ))}
            </select>
            <select
              className="filter-control"
              name="pixelId"
              defaultValue={metaAssets.selection.pixelId ?? ""}
              aria-label="Pixel Meta"
            >
              <option value="">Sem Pixel</option>
              {metaAssets.pixels.map((pixel) => (
                <option key={pixel.id} value={pixel.id}>
                  {pixel.name}
                </option>
              ))}
            </select>
            <button className="button" type="submit">Salvar selecao Meta</button>
          </form>
        ) : metaAssets ? (
          <p className="muted">Sem permissao para alterar Meta</p>
        ) : null}
        {metaConnection && canManageIntegrations ? (
          <div className="inline-form">
            <form className="inline-form" action={saveMetaCapiToken}>
              <input
                autoComplete="off"
                name="accessToken"
                placeholder="Token CAPI do Pixel"
                type="password"
                aria-label="Token CAPI Meta"
              />
              <button className="button" type="submit">
                Salvar token CAPI
              </button>
            </form>
            {metaConnection.capiTokenConfigured ? (
              <form action={saveMetaCapiToken}>
                <input type="hidden" name="clear" value="true" />
                <button className="button" type="submit">
                  Remover token CAPI
                </button>
              </form>
            ) : null}
          </div>
        ) : metaConnection ? (
          <p className="muted">
            {metaConnection.capiTokenConfigured
              ? "Token CAPI configurado"
              : "Token CAPI ausente"}
          </p>
        ) : null}
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
                      {selectedMetaAssetDetail(
                        metaAssets.businesses,
                        metaAssets.selection.businessId,
                        (business) => business.verificationStatus,
                        "sem status"
                      )}
                    </td>
                    <td><span className="event-chip">selecionado</span></td>
                  </tr>
                  <tr>
                    <td>Conta de anuncio</td>
                    <td>
                      <strong>{selectedAdAccountName}</strong>
                      <span>{metaAssets.selection.adAccountId ?? "sem selecao"}</span>
                    </td>
                    <td>
                      {selectedMetaAssetDetail(
                        metaAssets.adAccounts,
                        metaAssets.selection.adAccountId,
                        (adAccount) => adAccount.currency,
                        "sem moeda"
                      )}
                    </td>
                    <td><span className="event-chip">selecionado</span></td>
                  </tr>
                  <tr>
                    <td>Pixel</td>
                    <td>
                      <strong>{selectedPixelName}</strong>
                      <span>{metaAssets.selection.pixelId ?? "sem selecao"}</span>
                    </td>
                    <td>
                      {selectedMetaAssetDetail(
                        metaAssets.pixels,
                        metaAssets.selection.pixelId,
                        (pixel) => pixel.code,
                        "sem codigo"
                      )}
                    </td>
                    <td><span className="event-chip">selecionado</span></td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td>Meta</td>
                  <td>
                    <strong>Ativos Meta indisponiveis</strong>
                    <span>
                      {metaAssetsResult.state === "error"
                        ? "Leitura de ativos indisponivel"
                        : "Conecte a Meta para carregar ativos"}
                    </span>
                  </td>
                  <td>
                    {metaAssetsResult.state === "error"
                      ? "Tente novamente apos a API responder"
                      : "Aguardando conexao Meta"}
                  </td>
                  <td>
                    <span className="event-chip warn">
                      {metaAssetsResult.state === "error" ? "indisponivel" : "sem ativos"}
                    </span>
                  </td>
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
        <div className="metric-grid compact">
          <div className="metric-card">
            <span className="micro-label">Assinatura</span>
            <strong>
              {billingSubscription
                ? statusLabel(billingSubscription.status)
                : billingSubscriptionResult.state === "error"
                  ? "API indisponivel"
                  : "sem assinatura"}
            </strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Plano</span>
            <strong>{billingSubscription?.planName ?? "Por instancia"}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Mensal estimado</span>
            <strong>{money(billingSubscription?.monthlyAmountCents)}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Asaas</span>
            <strong>{billingSubscription?.asaasSubscriptionId ?? "Nao vinculada"}</strong>
          </div>
        </div>
        {canManageBilling ? (
          <>
            <form className="inline-form" action={createWhatsappCheckout}>
              <input
                minLength={2}
                name="instanceName"
                placeholder="Nome da instancia"
                required
                aria-label="Nome da instancia WhatsApp"
              />
              <button className="button" type="submit">
                Adicionar instancia
              </button>
            </form>
            <span className="action-note">
              Preencha o nome para gerar a cobranca. A conexao do WhatsApp so
              libera depois do pagamento confirmado.
            </span>
            <p className="muted">
              Ao continuar, o backend vai gerar uma cobranca de{" "}
              {money(whatsappQuote?.nextInstanceAmountCents)} no Asaas antes
              da conexao.
            </p>
          </>
        ) : (
          <p className="muted">Sem permissao para adicionar instancias</p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instancia</th>
                <th>Provider</th>
                <th>Billing</th>
                <th>Conexao</th>
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
                    <td>
                      {whatsappInstanceStatuses[instance.id] ? (
                        <>
                          <strong>
                            {statusLabel(
                              whatsappInstanceStatuses[instance.id].connectionStatus
                            )}
                          </strong>
                          {whatsappInstanceStatuses[instance.id].message ? (
                            <span>{whatsappInstanceStatuses[instance.id].message}</span>
                          ) : null}
                          {whatsappInstanceStatuses[instance.id].qrCode ? (
                            <code>{whatsappInstanceStatuses[instance.id].qrCode}</code>
                          ) : null}
                        </>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                    <td>{instance.providerInstanceId ?? "ID Uazapi ainda nao emitido"}</td>
                    <td>
                      {instance.billingStatus === "active" && canManageIntegrations ? (
                        <form action={connectWhatsappInstance}>
                          <input type="hidden" name="instanceId" value={instance.id} />
                          <button className="button" type="submit">
                            Conectar WhatsApp
                          </button>
                        </form>
                      ) : instance.billingStatus === "active" ? (
                        <span className="event-chip warn">sem permissao</span>
                      ) : instance.checkoutUrl ? (
                        <a
                          className="button primary"
                          href={instance.checkoutUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Pagar agora
                        </a>
                      ) : (
                        <span className="event-chip warn">Pagamento pendente</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td>
                    <strong>{whatsappInstancesEmptyTitle}</strong>
                    <span>Adicione e pague uma instancia para conectar o WhatsApp</span>
                  </td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>
                    <span className="event-chip warn">
                      {whatsappInstancesResult.state === "error"
                        ? "indisponivel"
                        : "sem instancias"}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Pipeline de sinal</span>
        <h2>Do clique no anuncio ao evento enviado</h2>
        <p className="muted">
          {pipeline
            ? `${pipeline.rangeLabel} com dados reais do workspace.`
            : "Nao foi possivel carregar o pipeline operacional agora."}
        </p>
        <div className="funnel-row" aria-label="Pipeline das integracoes">
          {pipeline?.stages.length ? (
            pipeline.stages.map((stage) => (
              <div className="funnel-step" key={stage.key}>
                <span>{stage.label}</span>
                <strong>{stage.value}</strong>
                <p>{stage.detail}</p>
                <div className="signal-bar">
                  <i style={{ width: pipelineWidth(stage.value, maxPipelineValue) }} />
                </div>
              </div>
            ))
          ) : (
            <div className="funnel-step">
              <span>Pipeline</span>
              <strong>
                {pipelineResult.state === "error"
                  ? "API indisponivel"
                  : "Aguardando eventos reais"}
              </strong>
              <div className="signal-bar"><i style={{ width: "0%" }} /></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
