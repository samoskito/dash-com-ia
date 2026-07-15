import type {
  IntegrationHealthSummaryDto,
  IntegrationPipelineOverviewDto,
  MetaAssetsDto,
  MetaConnectionCapabilitiesDto,
  MetaConnectionDto,
  MetaManualConfigurationDto,
  CurrentWorkspaceDto,
  WhatsappInstanceCheckoutDto,
  WhatsappInstanceConnectionDto,
  WhatsappInstanceQuoteDto,
  WhatsappInstanceSummaryDto,
  WorkspaceSubscriptionSummaryDto,
} from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SubmitButton } from "../../../components/submit-button";
import { displayTimeZone } from "../../../lib/date-time";
import { serverApiFetch } from "../../../lib/server-api";
import { getCurrentWorkspace } from "../../../lib/current-workspace";
import { MetaConversionDestinationForm } from "./meta-conversion-destination-form";
import {
  createMetaManualConnectionAction,
  createMetaManualCredentialAction,
  discoverMetaManualAssetsAction,
  rotateMetaManualCredentialAction,
  setMetaManualAccountDestinationAction,
  setMetaManualConnectionStatusAction,
  testMetaManualConnectionAction,
} from "./meta-manual-actions";
import { MetaManualConnectionPanel } from "./meta-manual-connection-panel";
import {
  metaAssetsRefreshSucceeded,
  resolveMetaStatus,
} from "./meta-connection-state";
import {
  completeMetaOAuthForCurrentWorkspace,
  startMetaOAuthForCurrentWorkspace,
} from "./meta-oauth-actions";
import { MetaOAuthButton } from "./meta-oauth-button";
import { MetaReportingAccountsForm } from "./meta-reporting-accounts-form";

type ResourceResult<T> = {
  data: T;
  state: "real" | "empty" | "error";
};

type IntegrationsSearchParams = {
  meta?: string;
  notice?: string;
};

type IntegrationsPageProps = {
  searchParams?: Promise<IntegrationsSearchParams>;
};

type PageNotice = {
  tone: "success" | "warn";
  title: string;
  message: string;
};

async function getHealth(): Promise<
  ResourceResult<IntegrationHealthSummaryDto | null>
> {
  try {
    const health = await serverApiFetch<IntegrationHealthSummaryDto>(
      "/integrations/health",
    );

    return {
      data: health,
      state: health.providers.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

async function getWhatsappInstances(): Promise<
  ResourceResult<WhatsappInstanceSummaryDto[]>
> {
  try {
    const instances = await serverApiFetch<WhatsappInstanceSummaryDto[]>(
      "/integrations/whatsapp/instances",
    );

    return {
      data: instances,
      state: instances.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getWhatsappInstanceStatuses(
  instances: WhatsappInstanceSummaryDto[],
): Promise<Record<string, WhatsappInstanceConnectionDto>> {
  const configuredTimeout = Number(
    process.env.WPPTRACK_WEB_PROVIDER_STATUS_TIMEOUT_MS ?? 2000,
  );
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 2000;
  const activeInstances = instances.filter(
    (instance) => instance.billingStatus === "active",
  );
  const entries = await Promise.all(
    activeInstances.map(async (instance) => {
      try {
        const status = await serverApiFetch<WhatsappInstanceConnectionDto>(
          `/integrations/whatsapp/instances/${instance.id}/status`,
          { signal: AbortSignal.timeout(timeoutMs) },
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
            message: "Nao foi possivel carregar o status da instancia.",
          },
        ] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}

async function getWhatsappQuote(): Promise<
  ResourceResult<WhatsappInstanceQuoteDto | null>
> {
  try {
    return {
      data: await serverApiFetch<WhatsappInstanceQuoteDto>(
        "/billing/whatsapp-instance/quote",
      ),
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

async function getBillingSubscription(): Promise<
  ResourceResult<WorkspaceSubscriptionSummaryDto | null>
> {
  try {
    return {
      data: await serverApiFetch<WorkspaceSubscriptionSummaryDto>(
        "/billing/subscription",
      ),
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

async function getIntegrationPipeline(): Promise<
  ResourceResult<IntegrationPipelineOverviewDto | null>
> {
  try {
    const pipeline = await serverApiFetch<IntegrationPipelineOverviewDto>(
      "/integrations/pipeline",
    );

    return {
      data: pipeline,
      state: pipeline.stages.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

async function getCurrentWorkspaceResource(): Promise<
  ResourceResult<CurrentWorkspaceDto | null>
> {
  try {
    return {
      data: await getCurrentWorkspace(),
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

async function getMetaConnection(): Promise<
  ResourceResult<MetaConnectionDto | null>
> {
  try {
    return {
      data: await serverApiFetch<MetaConnectionDto>(
        "/integrations/meta/connection",
      ),
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

async function getMetaAssets(): Promise<ResourceResult<MetaAssetsDto | null>> {
  try {
    return {
      data: await serverApiFetch<MetaAssetsDto>("/integrations/meta/assets"),
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

async function getMetaCapabilities(): Promise<
  ResourceResult<MetaConnectionCapabilitiesDto>
> {
  try {
    return {
      data: await serverApiFetch<MetaConnectionCapabilitiesDto>(
        "/integrations/meta/capabilities",
      ),
      state: "real",
    };
  } catch {
    return {
      data: {
        enabledModes: ["oauth"],
        oauthEnabled: true,
        manualEnabled: false,
      },
      state: "error",
    };
  }
}

async function getMetaManualConfiguration(): Promise<
  ResourceResult<MetaManualConfigurationDto | null>
> {
  try {
    return {
      data: await serverApiFetch<MetaManualConfigurationDto>(
        "/integrations/meta/manual",
      ),
      state: "real",
    };
  } catch {
    return { data: null, state: "error" };
  }
}

async function refreshMetaAssets(formData: FormData) {
  "use server";

  const businessId = nullableFormText(formData, "businessId");
  let target = "/integrations?notice=meta-assets-refresh-error";

  try {
    const assets = await serverApiFetch<MetaAssetsDto>(
      "/integrations/meta/assets/refresh",
      {
        method: "POST",
        body: JSON.stringify({ businessId }),
      },
    );

    if (!metaAssetsRefreshSucceeded(assets)) {
      throw new Error("MetaAssetsRefreshNotConnected");
    }

    revalidatePath("/integrations");
    target = "/integrations?notice=meta-assets-refreshed";
  } catch {
    target = "/integrations?notice=meta-assets-refresh-error";
  }

  redirect(target);
}

async function connectWhatsappInstance(formData: FormData) {
  "use server";

  const instanceId = formText(formData, "instanceId");

  if (!instanceId) {
    redirect("/integrations?notice=whatsapp-connect-error");
  }

  let target = "/integrations?notice=whatsapp-connect-error";

  try {
    await serverApiFetch(
      `/integrations/whatsapp/instances/${instanceId}/connect`,
      {
        method: "POST",
      },
    );
    revalidatePath("/integrations");
    target = "/integrations?notice=whatsapp-connect-requested";
  } catch {
    target = "/integrations?notice=whatsapp-connect-error";
  }

  redirect(target);
}

async function createWhatsappCheckout(formData: FormData) {
  "use server";

  const instanceName = formText(formData, "instanceName");

  if (!instanceName) {
    redirect("/integrations?notice=whatsapp-checkout-missing");
  }

  let checkout: WhatsappInstanceCheckoutDto;

  try {
    checkout = await serverApiFetch<WhatsappInstanceCheckoutDto>(
      "/billing/whatsapp-instance/checkout",
      {
        method: "POST",
        body: JSON.stringify({
          instanceName,
          provider: "uazapi",
        }),
      },
    );
  } catch {
    redirect("/integrations?notice=whatsapp-checkout-error");
  }

  if (checkout.checkoutUrl) {
    redirect(checkout.checkoutUrl);
  }

  revalidatePath("/integrations");
  redirect("/integrations?notice=whatsapp-checkout-created");
}

async function saveMetaConversionDestination(formData: FormData) {
  "use server";

  const businessId = formText(formData, "businessId");
  const pixelId = formText(formData, "pixelId");
  const pixelName = formText(formData, "pixelName");
  const pageId = formText(formData, "pageId");
  const pageName = formText(formData, "pageName");

  if (!businessId || !pixelId || !pixelName || !pageId || !pageName) {
    redirect("/integrations?notice=meta-destination-missing");
  }

  let target = "/integrations?notice=meta-destination-error";

  try {
    await serverApiFetch("/integrations/meta/conversion-destination", {
      method: "PUT",
      body: JSON.stringify({
        pixelId,
        pixelName,
        pageId,
        pageName,
      }),
    });
    revalidatePath("/integrations");
    target = "/integrations?notice=meta-destination-saved";
  } catch {
    target = "/integrations?notice=meta-destination-error";
  }

  redirect(target);
}

async function loadMetaBusinessDestinationAssets(
  businessId: string,
): Promise<Pick<MetaAssetsDto, "pixels" | "pages">> {
  "use server";

  const normalizedBusinessId = businessId.trim();

  if (!normalizedBusinessId) {
    return { pixels: [], pages: [] };
  }

  try {
    const assets = await serverApiFetch<MetaAssetsDto>(
      "/integrations/meta/assets/refresh",
      {
        method: "POST",
        body: JSON.stringify({ businessId: normalizedBusinessId }),
      },
    );
    return {
      pixels: assets.pixels,
      pages: assets.pages ?? [],
    };
  } catch {
    return { pixels: [], pages: [] };
  }
}

async function saveMetaReportingAccount(formData: FormData) {
  "use server";

  const businessId = formText(formData, "businessId");
  const businessName = formText(formData, "businessName");
  const adAccountId = formText(formData, "adAccountId");
  const adAccountName = formText(formData, "adAccountName");
  const currency = nullableFormText(formData, "currency");
  const timezoneName = nullableFormText(formData, "timezoneName");

  if (!businessId || !businessName || !adAccountId || !adAccountName) {
    redirect("/integrations?notice=meta-reporting-missing");
  }

  let target = "/integrations?notice=meta-reporting-error";

  try {
    await serverApiFetch("/integrations/meta/reporting-accounts", {
      method: "POST",
      body: JSON.stringify({
        businessId,
        businessName,
        adAccountId,
        adAccountName,
        currency,
        timezoneName,
      }),
    });
    revalidatePath("/integrations");
    target = "/integrations?notice=meta-reporting-saved";
  } catch {
    target = "/integrations?notice=meta-reporting-error";
  }

  redirect(target);
}

async function loadMetaBusinessReportingAssets(
  businessId: string,
): Promise<Pick<MetaAssetsDto, "adAccounts">> {
  "use server";

  const normalizedBusinessId = businessId.trim();

  if (!normalizedBusinessId) {
    return { adAccounts: [] };
  }

  try {
    const assets = await serverApiFetch<MetaAssetsDto>(
      "/integrations/meta/assets/refresh",
      {
        method: "POST",
        body: JSON.stringify({ businessId: normalizedBusinessId }),
      },
    );
    return {
      adAccounts: assets.adAccounts,
    };
  } catch {
    return { adAccounts: [] };
  }
}

async function setMetaReportingAccountStatus(formData: FormData) {
  "use server";

  const id = formText(formData, "id");
  const active = formText(formData, "active") === "true";

  if (!id) {
    redirect("/integrations?notice=meta-reporting-status-error");
  }

  let target = "/integrations?notice=meta-reporting-status-error";

  try {
    await serverApiFetch(
      `/integrations/meta/reporting-accounts/${encodeURIComponent(id)}/status`,
      {
        method: "PUT",
        body: JSON.stringify({ active }),
      },
    );
    revalidatePath("/integrations");
    target = "/integrations?notice=meta-reporting-status-saved";
  } catch {
    target = "/integrations?notice=meta-reporting-status-error";
  }

  redirect(target);
}

function money(cents: number | null | undefined) {
  if (!cents) {
    return "Aguardando preco";
  }

  return (cents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

function providerTitle(provider: string) {
  const titles: Record<string, string> = {
    uazapi: "WhatsApp / Uazapi",
    meta: "Meta OAuth",
    asaas: "Asaas",
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
    syncing: "Sincronizando",
    completed: "Sincronizado",
    failed: "Falha na sincronizacao",
    configured: "Configurado",
    needs_configuration: "Configurar",
  };

  return labels[status] ?? "Status desconhecido";
}

function sourceSyncLabel(value: string | null | undefined) {
  if (!value) {
    return "Aguardando primeira sincronizacao";
  }

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: displayTimeZone,
  });
}

function formText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function nullableFormText(formData: FormData, key: string): string | null {
  const value = formText(formData, key);

  return value || null;
}

function integrationsNotice(
  searchParams: IntegrationsSearchParams,
): PageNotice | null {
  const notice = searchParams.notice;
  const meta = searchParams.meta;

  if (meta === "connected") {
    return {
      tone: "success",
      title: "Meta conectada",
      message:
        "A conexao foi salva. Selecione BM, Pixel, pagina e contas de relatorio.",
    };
  }

  if (meta === "error") {
    return {
      tone: "warn",
      title: "Falha ao conectar Meta",
      message:
        "Tente conectar novamente ou revise o retorno do OAuth no diagnostico.",
    };
  }

  const notices: Record<string, PageNotice> = {
    "meta-destination-saved": {
      tone: "success",
      title: "Destino salvo",
      message:
        "Pixel e pagina principal foram salvos para o envio de conversoes.",
    },
    "meta-destination-error": {
      tone: "warn",
      title: "Destino nao salvo",
      message: "Nao foi possivel salvar Pixel e pagina agora. Tente novamente.",
    },
    "meta-destination-missing": {
      tone: "warn",
      title: "Destino incompleto",
      message: "Selecione BM, Pixel e pagina antes de salvar.",
    },
    "meta-assets-refreshed": {
      tone: "success",
      title: "Ativos Meta atualizados",
      message:
        "BMs, contas, Pixels e paginas foram salvos para carregamento rapido.",
    },
    "meta-assets-refresh-error": {
      tone: "warn",
      title: "Ativos nao atualizados",
      message:
        "Nao foi possivel sincronizar ativos Meta agora. Tente novamente.",
    },
    "meta-reporting-saved": {
      tone: "success",
      title: "Conta adicionada",
      message: "A conta de anuncio foi adicionada aos relatorios.",
    },
    "meta-reporting-error": {
      tone: "warn",
      title: "Conta nao adicionada",
      message: "Nao foi possivel adicionar a conta aos relatorios agora.",
    },
    "meta-reporting-missing": {
      tone: "warn",
      title: "Conta incompleta",
      message: "Selecione BM e conta de anuncio antes de adicionar.",
    },
    "meta-reporting-status-saved": {
      tone: "success",
      title: "Status atualizado",
      message: "A conta de anuncio foi atualizada nos relatorios.",
    },
    "meta-reporting-status-error": {
      tone: "warn",
      title: "Status nao atualizado",
      message: "Nao foi possivel alterar o status da conta agora.",
    },
    "whatsapp-connect-requested": {
      tone: "success",
      title: "Conexao solicitada",
      message: "A solicitacao de conexao do WhatsApp foi enviada ao provedor.",
    },
    "whatsapp-connect-error": {
      tone: "warn",
      title: "Conexao nao iniciada",
      message: "Nao foi possivel solicitar a conexao do WhatsApp agora.",
    },
    "whatsapp-checkout-missing": {
      tone: "warn",
      title: "Instancia sem nome",
      message: "Informe um nome para gerar a cobranca da instancia.",
    },
    "whatsapp-checkout-created": {
      tone: "success",
      title: "Cobranca criada",
      message: "A instancia foi criada como pendente de pagamento.",
    },
    "whatsapp-checkout-error": {
      tone: "warn",
      title: "Cobranca nao criada",
      message: "Nao foi possivel gerar a cobranca da instancia agora.",
    },
  };

  return notice ? (notices[notice] ?? null) : null;
}

function metaConnectionTitle(
  status?: MetaAssetsDto["status"] | MetaConnectionDto["status"],
) {
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

function metaAssetsDetail(
  metaAssets: MetaAssetsDto | null,
  state: ResourceResult<MetaAssetsDto | null>["state"],
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
    metaAssets.lastSyncedAt &&
    metaAssets.status === "connected" &&
    metaAssets.businesses.length === 0
  ) {
    return "A Meta nao retornou nenhum BM para este usuario. Confirme o acesso ao Business Manager e conecte novamente.";
  }

  if (
    metaAssets.lastSyncedAt &&
    metaAssets.businesses.length > 0 &&
    metaAssets.adAccounts.length === 0 &&
    metaAssets.pixels.length === 0 &&
    (metaAssets.pages ?? []).length === 0
  ) {
    return "Os BMs foram carregados, mas o BM selecionado nao retornou conta de anuncio, Pixel ou Pagina. Selecione outro BM ou revise as permissoes Meta.";
  }

  if (
    metaAssets.businesses.length === 0 &&
    metaAssets.adAccounts.length === 0 &&
    metaAssets.pixels.length === 0
  ) {
    return "Conta conectada. Clique em Atualizar ativos Meta para buscar BMs, contas, Pixels e paginas.";
  }

  return "Ativos disponiveis para selecionar no proximo passo do fluxo operacional.";
}

function metaLastSyncedAt(metaAssets: MetaAssetsDto | null) {
  if (!metaAssets?.lastSyncedAt) {
    return "Ativos ainda nao sincronizados neste workspace.";
  }

  return `Ativos atualizados em ${new Date(
    metaAssets.lastSyncedAt,
  ).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })}.`;
}

function pipelineWidth(value: number, maxValue: number) {
  if (maxValue <= 0 || value <= 0) {
    return "0%";
  }

  return `${Math.max(8, Math.round((value / maxValue) * 100))}%`;
}

export default async function IntegrationsPage({
  searchParams,
}: IntegrationsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const pageNotice = integrationsNotice(resolvedSearchParams);
  const [
    healthResult,
    whatsappInstancesResult,
    metaConnectionResult,
    metaAssetsResult,
    whatsappQuoteResult,
    billingSubscriptionResult,
    pipelineResult,
    workspaceResult,
    metaCapabilitiesResult,
  ] = await Promise.all([
    getHealth(),
    getWhatsappInstances(),
    getMetaConnection(),
    getMetaAssets(),
    getWhatsappQuote(),
    getBillingSubscription(),
    getIntegrationPipeline(),
    getCurrentWorkspaceResource(),
    getMetaCapabilities(),
  ]);
  const usesExternalWhatsapp =
    pipelineResult.data?.whatsappSource?.mode === "external";
  const health = healthResult.data;
  const whatsappInstances = whatsappInstancesResult.data;
  const whatsappInstanceStatuses = usesExternalWhatsapp
    ? {}
    : await getWhatsappInstanceStatuses(whatsappInstances);
  const metaConnection = metaConnectionResult.data;
  const metaAssets = metaAssetsResult.data;
  const metaCapabilities = metaCapabilitiesResult.data;
  const legacyMetaConnected = metaConnection?.status === "connected";
  const metaManualResult =
    metaCapabilities.manualEnabled && !legacyMetaConnected
      ? await getMetaManualConfiguration()
      : ({ data: null, state: "empty" } as const);
  const whatsappQuote = whatsappQuoteResult.data;
  const billingSubscription = billingSubscriptionResult.data;
  const pipeline = pipelineResult.data;
  const workspace = workspaceResult.data;
  const isPlatformOperator = Boolean(workspace?.platformRole);
  const workspacePermissionsUnavailable = workspaceResult.state === "error";
  const canManageIntegrations = Boolean(
    workspace?.permissions.canManageIntegrations,
  );
  const canManageBilling = Boolean(workspace?.permissions.canManageBilling);
  const maxPipelineValue = Math.max(
    ...(pipeline?.stages ?? []).map((stage) => stage.value),
    0,
  );
  const hasIntegrationError = [
    healthResult.state,
    metaConnectionResult.state,
    metaAssetsResult.state,
    pipelineResult.state,
    workspaceResult.state,
    metaCapabilitiesResult.state,
    ...(metaCapabilities.manualEnabled && !legacyMetaConnected
      ? [metaManualResult.state]
      : []),
    ...(usesExternalWhatsapp
      ? []
      : [
          whatsappInstancesResult.state,
          whatsappQuoteResult.state,
          billingSubscriptionResult.state,
        ]),
  ].includes("error");
  const metaStatus = resolveMetaStatus(
    metaConnection?.status,
    metaAssets?.status,
  );
  const activeReportingAccounts = (metaAssets?.reportingAccounts ?? []).filter(
    (account) => account.active,
  ).length;
  const manualActiveConnections =
    metaManualResult.data?.businessConnections.filter(
      (connection) => connection.status === "active",
    ).length ?? 0;
  const manualActiveReportingAccounts =
    metaManualResult.data?.reportingAccounts.filter((account) => account.active)
      .length ?? 0;
  const manualConfigured = manualActiveConnections > 0;
  const metaRefreshBusinessId =
    metaAssets?.selection.businessId &&
    metaAssets.businesses.some(
      (business) => business.id === metaAssets.selection.businessId,
    )
      ? metaAssets.selection.businessId
      : (metaAssets?.businesses[0]?.id ?? "");
  const integrations =
    health?.providers.map((item) => ({
      title: providerTitle(item.provider),
      status: statusLabel(item.status),
      tone: item.status === "connected" ? "" : "warn",
      description:
        item.message ??
        "Credenciais encontradas. Proxima etapa depende do fluxo operacional do provedor.",
      detail: `Verificado em ${new Date(item.checkedAt).toLocaleTimeString(
        "pt-BR",
        {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: displayTimeZone,
        },
      )}`,
    })) ?? [];
  const metaStatusLabel =
    metaAssetsResult.state === "error" && metaConnectionResult.state === "error"
      ? "API indisponivel"
      : manualConfigured
        ? "Conectado por token"
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
          <p>
            {usesExternalWhatsapp
              ? "Dados do WhatsApp via integracao externa e campanhas direto da Meta."
              : "Uazapi primeiro, Meta OAuth desde o inicio e Cloud API preparada para futuro."}
          </p>
        </div>
        {isPlatformOperator ? (
          <div className="header-actions">
            <span
              className={`status-chip${hasIntegrationError ? " warn" : ""}`}
            >
              {hasIntegrationError ? "API indisponivel" : "API conectada"}
            </span>
            <span className="status-chip">
              {integrations.length} provedores
            </span>
          </div>
        ) : null}
      </header>

      {pageNotice ? (
        <div className={`feedback-banner ${pageNotice.tone}`} role="status">
          <strong>{pageNotice.title}</strong>
          <span>{pageNotice.message}</span>
        </div>
      ) : null}

      {isPlatformOperator ? (
        <div className="integration-grid">
          {integrations.length > 0 ? (
            integrations.map((item) => (
              <article className="integration-card" key={item.title}>
                <span
                  className={`status-chip${item.tone ? ` ${item.tone}` : ""}`}
                >
                  {item.status}
                </span>
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
                {healthResult.state === "error"
                  ? "API indisponivel"
                  : "Sem provedores"}
              </span>
              <div>
                <span className="micro-label">Integracoes</span>
                <strong>
                  {healthResult.state === "error"
                    ? "Nao foi possivel carregar integracoes"
                    : "Nenhuma integracao retornada"}
                </strong>
              </div>
              <p className="muted">
                A lista sera preenchida somente com provedores retornados pelo
                backend.
              </p>
            </article>
          )}
        </div>
      ) : null}

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
          {canManageIntegrations || workspacePermissionsUnavailable ? (
            <div className="meta-connection-actions">
              <MetaOAuthButton
                completeOAuthAction={completeMetaOAuthForCurrentWorkspace}
                connected={metaStatus === "connected"}
                startOAuthAction={startMetaOAuthForCurrentWorkspace}
              />
              {canManageIntegrations ? (
                <form action={refreshMetaAssets}>
                  <input
                    type="hidden"
                    name="businessId"
                    value={metaRefreshBusinessId}
                  />
                  <SubmitButton
                    disabled={metaStatus !== "connected"}
                    pendingLabel="Atualizando..."
                    statusText="Buscando ativos no Meta e salvando snapshot."
                  >
                    Atualizar ativos Meta
                  </SubmitButton>
                </form>
              ) : (
                <span className="action-note warn">
                  Permissoes temporariamente indisponiveis. A API validara a
                  acao ao continuar.
                </span>
              )}
            </div>
          ) : (
            <span className="event-chip warn">
              {workspacePermissionsUnavailable
                ? "permissoes indisponiveis"
                : "sem permissao"}
            </span>
          )}
        </div>
        <MetaManualConnectionPanel
          capabilities={metaCapabilities}
          initialConfiguration={metaManualResult.data}
          legacyConnected={legacyMetaConnected}
          canManage={canManageIntegrations}
          createCredentialAction={createMetaManualCredentialAction}
          discoverAssetsAction={discoverMetaManualAssetsAction}
          createConnectionAction={createMetaManualConnectionAction}
          rotateCredentialAction={rotateMetaManualCredentialAction}
          setConnectionStatusAction={setMetaManualConnectionStatusAction}
          testConnectionAction={testMetaManualConnectionAction}
          setAccountDestinationAction={setMetaManualAccountDestinationAction}
        />
        <div className="metric-grid compact">
          <div className="metric-card">
            <span className="micro-label">Status</span>
            <strong>{metaStatusLabel}</strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Destino CAPI</span>
            <strong>
              {manualConfigured
                ? `${metaManualResult.data?.destinations.length ?? 0} configurado(s)`
                : metaAssets?.conversionDestination
                  ? statusLabel(metaAssets.conversionDestination.status)
                  : "Nao configurado"}
            </strong>
          </div>
          <div className="metric-card">
            <span className="micro-label">Contas em relatorios</span>
            <strong>
              {manualConfigured
                ? manualActiveReportingAccounts
                : activeReportingAccounts}
            </strong>
          </div>
        </div>
        {!manualConfigured ? (
          <>
            <p className="muted">
              {metaAssetsDetail(metaAssets, metaAssetsResult.state)}
            </p>
            <p className="muted">{metaLastSyncedAt(metaAssets)}</p>
          </>
        ) : null}
        {metaAssets &&
        (legacyMetaConnected || !metaCapabilities.manualEnabled) ? (
          <>
            <div className="meta-config-section">
              <div>
                <span className="eyebrow">Destino de conversao</span>
                <h2>Pixel e Pagina Facebook principal</h2>
              </div>
              <div className="metric-grid compact">
                <div className="metric-card">
                  <span className="micro-label">Pixel CAPI</span>
                  <strong>
                    {metaAssets.conversionDestination?.pixelName ?? "Sem Pixel"}
                  </strong>
                </div>
                <div className="metric-card">
                  <span className="micro-label">Pagina Facebook principal</span>
                  <strong>
                    {metaAssets.conversionDestination?.pageName ?? "Sem Pagina"}
                  </strong>
                </div>
                <div className="metric-card">
                  <span className="micro-label">Status destino</span>
                  <strong>
                    {metaAssets.conversionDestination
                      ? statusLabel(metaAssets.conversionDestination.status)
                      : "Nao configurado"}
                  </strong>
                </div>
              </div>
              {canManageIntegrations ? (
                <MetaConversionDestinationForm
                  assets={metaAssets}
                  action={saveMetaConversionDestination}
                  loadBusinessAssetsAction={loadMetaBusinessDestinationAssets}
                />
              ) : (
                <p className="muted">
                  {workspacePermissionsUnavailable
                    ? "Nao foi possivel confirmar as permissoes agora."
                    : "Sem permissao para alterar destino Meta"}
                </p>
              )}
            </div>

            <div className="meta-config-section">
              <div>
                <span className="eyebrow">Contas para relatorios</span>
                <h2>Contas Meta sincronizadas nos relatorios</h2>
              </div>
              {canManageIntegrations ? (
                <MetaReportingAccountsForm
                  assets={metaAssets}
                  action={saveMetaReportingAccount}
                  loadBusinessAssetsAction={loadMetaBusinessReportingAssets}
                  statusAction={setMetaReportingAccountStatus}
                />
              ) : (
                <p className="muted">
                  {workspacePermissionsUnavailable
                    ? "Nao foi possivel confirmar as permissoes agora."
                    : "Sem permissao para alterar contas de relatorio"}
                </p>
              )}
            </div>
          </>
        ) : null}
        <p className="muted">
          A conexao Meta fica protegida no backend. Esta tela mostra apenas o
          destino unico de conversao e as contas ativas usadas nos relatorios.
        </p>
      </div>

      {usesExternalWhatsapp ? (
        <div className="surface-panel external-source-panel">
          <div>
            <span className="eyebrow">Fonte do WhatsApp</span>
            <h2>Dados recebidos por integracao externa do MySQL</h2>
            <p className="muted">
              As conversas deste workspace chegam por uma integracao externa com
              o MySQL. Nao ha instancia ou cobranca adicional para configurar
              aqui.
            </p>
          </div>
          <div className="metric-grid compact">
            <div className="metric-card">
              <span className="micro-label">Origem</span>
              <strong>Integracao externa MySQL</strong>
            </div>
            <div className="metric-card">
              <span className="micro-label">Ultima sincronizacao</span>
              <strong>
                {sourceSyncLabel(pipeline?.whatsappSource?.lastSyncCompletedAt)}
              </strong>
            </div>
            <div className="metric-card">
              <span className="micro-label">Status</span>
              <strong>
                {statusLabel(
                  pipeline?.whatsappSource?.lastSyncStatus ?? "pending",
                )}
              </strong>
            </div>
          </div>
        </div>
      ) : null}

      {!usesExternalWhatsapp && (
        <div className="surface-panel">
          <span className="eyebrow">WhatsApp Business</span>
          <h2>Instancias conectadas</h2>
          <div className="metric-grid compact">
            <div className="metric-card">
              <span className="micro-label">Instancias ativas</span>
              <strong>
                {whatsappQuote?.activeInstances ?? whatsappInstances.length}
              </strong>
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
              <strong>
                {billingSubscription?.planName ?? "Por instancia"}
              </strong>
            </div>
            <div className="metric-card">
              <span className="micro-label">Mensal estimado</span>
              <strong>{money(billingSubscription?.monthlyAmountCents)}</strong>
            </div>
            <div className="metric-card">
              <span className="micro-label">Asaas</span>
              <strong>
                {billingSubscription?.asaasSubscriptionId ?? "Nao vinculada"}
              </strong>
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
                <SubmitButton
                  pendingLabel="Gerando cobranca..."
                  statusText="Gerando cobranca da instancia no backend."
                >
                  Adicionar instancia
                </SubmitButton>
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
            <p className="muted">
              {workspacePermissionsUnavailable
                ? "Nao foi possivel confirmar as permissoes agora."
                : "Sem permissao para adicionar instancias"}
            </p>
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
                                whatsappInstanceStatuses[instance.id]
                                  .connectionStatus,
                              )}
                            </strong>
                            {whatsappInstanceStatuses[instance.id].message ? (
                              <span>
                                {whatsappInstanceStatuses[instance.id].message}
                              </span>
                            ) : null}
                            {whatsappInstanceStatuses[instance.id].qrCode ? (
                              <code>
                                {whatsappInstanceStatuses[instance.id].qrCode}
                              </code>
                            ) : null}
                          </>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td>
                        {instance.providerInstanceId ??
                          "ID Uazapi ainda nao emitido"}
                      </td>
                      <td>
                        {instance.billingStatus === "active" &&
                        canManageIntegrations ? (
                          <form action={connectWhatsappInstance}>
                            <input
                              type="hidden"
                              name="instanceId"
                              value={instance.id}
                            />
                            <SubmitButton
                              pendingLabel="Conectando..."
                              statusText="Solicitando conexao do WhatsApp."
                            >
                              Conectar WhatsApp
                            </SubmitButton>
                          </form>
                        ) : instance.billingStatus === "active" ? (
                          <span className="event-chip warn">
                            {workspacePermissionsUnavailable
                              ? "permissoes indisponiveis"
                              : "sem permissao"}
                          </span>
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
                          <span className="event-chip warn">
                            Pagamento pendente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td>
                      <strong>{whatsappInstancesEmptyTitle}</strong>
                      <span>
                        Adicione e pague uma instancia para conectar o WhatsApp
                      </span>
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
      )}

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
                  <i
                    style={{
                      width: pipelineWidth(stage.value, maxPipelineValue),
                    }}
                  />
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
              <div className="signal-bar">
                <i style={{ width: "0%" }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
