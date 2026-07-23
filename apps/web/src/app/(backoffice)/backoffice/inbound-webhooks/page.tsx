import type {
  BackofficeInboundWebhookDeliveryDto,
  BackofficeInboundWebhookDeliverySummaryDto,
  BackofficeInboundWebhookOperationsScopeDto,
  InboundWebhookDeliveryPurposeDto,
  InboundWebhookDeliveryStatusDto,
  InboundWebhookEventClassificationDto,
} from "@wpptrack/shared";
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Inbox,
  LifeBuoy,
  Radio,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { BackofficeActionForm } from "../../../../components/backoffice-action-form";
import { BackofficeNavigation } from "../../../../components/backoffice-navigation";
import { InboundProviderConversionRecoveryButton } from "../../../../components/inbound-provider-conversion-recovery-button";
import { formatDateTime } from "../../../../lib/date-time";
import { serverApiFetch } from "../../../../lib/server-api";
import { reprocessInboundProviderConversionsAction } from "./actions";

type InboundWebhookSearchParams = Record<string, string | string[] | undefined>;

type DeliveryFilters = {
  channelId?: string;
  classification?: string;
  connectionId?: string;
  provider?: string;
  purpose?: InboundWebhookDeliveryPurposeDto;
  receivedFrom?: string;
  receivedUntil?: string;
  status?: string;
  workspaceId?: string;
};

type DeliveryResult = {
  data: BackofficeInboundWebhookDeliveryDto[];
  hasNextPage: boolean;
  state: "real" | "empty" | "error";
};

type DeliverySummaryResult = {
  data: BackofficeInboundWebhookDeliverySummaryDto | null;
  state: "real" | "error";
};

type OperationsScopeResult = {
  data: BackofficeInboundWebhookOperationsScopeDto | null;
  state: "real" | "error";
};

type QuickFilterKey =
  | "all"
  | "automation"
  | "awaiting_parser"
  | "ctwa_pending"
  | "ctwa_routed"
  | "failed"
  | "no_ctwa";

const deliveryPageSize = 50;

const deliveryStatuses: Array<{
  label: string;
  value: InboundWebhookDeliveryStatusDto;
}> = [
  { value: "pending", label: "Pendente" },
  { value: "queued", label: "Na fila" },
  { value: "processing", label: "Processando" },
  { value: "processed", label: "Processado" },
  { value: "failed", label: "Falhou" },
];

const eventClassifications: Array<{
  label: string;
  value: InboundWebhookEventClassificationDto;
}> = [
  { value: "eligible_route_resolved", label: "CTWA roteado" },
  { value: "eligible_route_unresolved", label: "CTWA pendente" },
  { value: "ignored_no_ctwa", label: "Sem CTWA" },
  { value: "ignored_outbound", label: "Mensagem de saida" },
  { value: "ignored_private", label: "Mensagem privada" },
  { value: "unsupported_event", label: "Evento nao suportado" },
  { value: "invalid_payload", label: "Payload invalido" },
];

function asStringParam(
  value: string | string[] | undefined,
): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;

  return resolved?.trim() || undefined;
}

function deliveryScopeParams(filters: DeliveryFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.workspaceId) {
    params.set("workspaceId", filters.workspaceId);
  }

  if (filters.connectionId) {
    params.set("connectionId", filters.connectionId);
  }

  if (filters.channelId) {
    params.set("channelId", filters.channelId);
  }

  if (filters.provider) {
    params.set("provider", filters.provider);
  }

  if (filters.purpose) {
    params.set("purpose", filters.purpose);
  }

  if (filters.receivedFrom) {
    params.set("receivedFrom", filters.receivedFrom);
  }

  if (filters.receivedUntil) {
    params.set("receivedUntil", filters.receivedUntil);
  }

  return params;
}

function deliveryFilterParams(filters: DeliveryFilters): URLSearchParams {
  const params = deliveryScopeParams(filters);

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.classification) {
    params.set("classification", filters.classification);
  }

  return params;
}

async function getOperationsScope(): Promise<OperationsScopeResult> {
  try {
    const data =
      await serverApiFetch<BackofficeInboundWebhookOperationsScopeDto>(
        "/backoffice/inbound-webhooks/scope",
      );

    return { data, state: "real" };
  } catch {
    return { data: null, state: "error" };
  }
}

async function getDeliveries(
  filters: DeliveryFilters,
  page: number,
): Promise<DeliveryResult> {
  try {
    const params = deliveryFilterParams(filters);
    params.set("limit", String(deliveryPageSize + 1));
    params.set("offset", String((page - 1) * deliveryPageSize));

    const deliveries = await serverApiFetch<
      BackofficeInboundWebhookDeliveryDto[]
    >(`/backoffice/inbound-webhooks/deliveries?${params.toString()}`);
    const visibleDeliveries = deliveries.slice(0, deliveryPageSize);

    return {
      data: visibleDeliveries,
      hasNextPage: deliveries.length > deliveryPageSize,
      state: visibleDeliveries.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      hasNextPage: false,
      state: "error",
    };
  }
}

async function getDeliverySummary(
  filters: DeliveryFilters,
): Promise<DeliverySummaryResult> {
  try {
    const params = deliveryScopeParams(filters);
    const query = params.toString();
    const suffix = query ? `?${query}` : "";
    const summary =
      await serverApiFetch<BackofficeInboundWebhookDeliverySummaryDto>(
        `/backoffice/inbound-webhooks/summary${suffix}`,
      );

    return {
      data: summary,
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

function quickFilterHref(
  filters: DeliveryFilters,
  quickFilter: QuickFilterKey,
): string {
  const params = deliveryScopeParams(filters);

  if (quickFilter === "automation") {
    params.set("purpose", "conversion_automation");
  } else {
    params.delete("purpose");
  }

  if (quickFilter === "ctwa_pending") {
    params.set("classification", "eligible_route_unresolved");
  } else if (quickFilter === "ctwa_routed") {
    params.set("classification", "eligible_route_resolved");
  } else if (quickFilter === "awaiting_parser") {
    params.set("classification", "unsupported_event");
  } else if (quickFilter === "no_ctwa") {
    params.set("classification", "ignored_no_ctwa");
  } else if (quickFilter === "failed") {
    params.set("status", "failed");
  }

  const query = params.toString();

  return `/backoffice/inbound-webhooks${query ? `?${query}` : ""}`;
}

function deliveryPageHref(filters: DeliveryFilters, page: number): string {
  const params = deliveryFilterParams(filters);

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return `/backoffice/inbound-webhooks${query ? `?${query}` : ""}`;
}

function pageParam(value: string | string[] | undefined): number {
  const parsed = Number(asStringParam(value));

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 2_001);
}

function classificationLabel(
  classification: InboundWebhookEventClassificationDto | null,
): string {
  if (!classification) {
    return "Aguardando classificacao";
  }

  return (
    eventClassifications.find((candidate) => candidate.value === classification)
      ?.label ?? classification
  );
}

function statusLabel(status: InboundWebhookDeliveryStatusDto): string {
  return (
    deliveryStatuses.find((candidate) => candidate.value === status)?.label ??
    status
  );
}

function classificationDescription(
  classification: InboundWebhookEventClassificationDto | null,
): string {
  switch (classification) {
    case "eligible_route_unresolved":
      return "CTWA encontrado; falta associar o canal a estrutura Meta.";
    case "eligible_route_resolved":
      return "CTWA encontrado e rota Meta identificada.";
    case "ignored_no_ctwa":
      return "Mensagem recebida sem identificacao de anuncio.";
    case "ignored_outbound":
      return "Mensagem enviada pela equipe; nao conta como nova conversa.";
    case "ignored_private":
      return "Evento privado preservado apenas para observacao.";
    case "unsupported_event":
      return "O parser ainda nao reconhece este tipo de evento.";
    case "invalid_payload":
      return "O formato recebido precisa ser analisado.";
    default:
      return "A entrega ainda esta sendo processada.";
  }
}

function deliveryPurposeLabel(
  purpose: InboundWebhookDeliveryPurposeDto,
): string {
  return purpose === "conversion_automation"
    ? "Automacao de conversao"
    : "Mensagem WhatsApp";
}

function deliveryResultLabel(
  delivery: BackofficeInboundWebhookDeliveryDto,
): string {
  return delivery.purpose === "conversion_automation"
    ? "Callback preservado"
    : classificationLabel(delivery.classification);
}

function deliveryResultDescription(
  delivery: BackofficeInboundWebhookDeliveryDto,
): string {
  return delivery.purpose === "conversion_automation"
    ? "Payload da automacao retido para validar e certificar o parser."
    : classificationDescription(delivery.classification);
}

function payloadLabel(delivery: BackofficeInboundWebhookDeliveryDto): string {
  if (delivery.payloadAvailable) {
    return "Payload disponivel";
  }

  return new Date(delivery.payloadExpiresAt).getTime() <= Date.now()
    ? "Payload expirado"
    : "Payload removido";
}

function activeQuickFilter(filters: DeliveryFilters): QuickFilterKey | null {
  if (filters.purpose === "conversion_automation") {
    return "automation";
  }

  if (filters.status === "failed") {
    return "failed";
  }

  if (filters.classification === "eligible_route_unresolved") {
    return "ctwa_pending";
  }

  if (filters.classification === "eligible_route_resolved") {
    return "ctwa_routed";
  }

  if (filters.classification === "ignored_no_ctwa") {
    return "no_ctwa";
  }

  if (filters.classification === "unsupported_event") {
    return "awaiting_parser";
  }

  if (filters.status || filters.classification) {
    return null;
  }

  return "all";
}

function deliveryTone(
  delivery: BackofficeInboundWebhookDeliveryDto,
): "bad" | "good" | "neutral" | "warn" {
  if (
    delivery.status === "failed" ||
    delivery.classification === "invalid_payload"
  ) {
    return "bad";
  }

  if (delivery.classification === "eligible_route_unresolved") {
    return "warn";
  }

  if (delivery.classification === "eligible_route_resolved") {
    return "good";
  }

  return "neutral";
}

export default async function InboundWebhookDeliveriesPage({
  searchParams,
}: {
  searchParams?: Promise<InboundWebhookSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters: DeliveryFilters = {
    workspaceId: asStringParam(resolvedSearchParams.workspaceId),
    connectionId: asStringParam(resolvedSearchParams.connectionId),
    channelId: asStringParam(resolvedSearchParams.channelId),
    provider: asStringParam(resolvedSearchParams.provider),
    purpose: asStringParam(resolvedSearchParams.purpose) as
      InboundWebhookDeliveryPurposeDto | undefined,
    receivedFrom: asStringParam(resolvedSearchParams.receivedFrom),
    receivedUntil: asStringParam(resolvedSearchParams.receivedUntil),
    status: asStringParam(resolvedSearchParams.status),
    classification: asStringParam(resolvedSearchParams.classification),
  };
  const page = pageParam(resolvedSearchParams.page);
  const [result, summaryResult, scopeResult] = await Promise.all([
    getDeliveries(filters, page),
    getDeliverySummary(filters),
    getOperationsScope(),
  ]);
  const deliveries = result.data;
  const scope = scopeResult.data?.workspaces ?? [];
  const connectionEntries = scope.flatMap((workspace) =>
    workspace.connections.map((connection) => ({ workspace, connection })),
  );
  const selectedWorkspace = scope.find(
    (workspace) => workspace.id === filters.workspaceId,
  );
  const selectedConnectionEntry =
    connectionEntries.find(
      ({ connection }) => connection.id === filters.connectionId,
    ) ??
    connectionEntries.find(({ connection }) =>
      connection.channels.some((channel) => channel.id === filters.channelId),
    );
  const selectedConnection = selectedConnectionEntry?.connection;
  const activeWorkspace =
    selectedWorkspace ?? selectedConnectionEntry?.workspace;
  const connectionOptions = selectedWorkspace
    ? selectedWorkspace.connections.map((connection) => ({
        workspace: selectedWorkspace,
        connection,
      }))
    : connectionEntries;
  const channelOptions = selectedConnection
    ? selectedConnection.channels.map((channel) => ({
        workspace: selectedConnectionEntry!.workspace,
        connection: selectedConnection,
        channel,
      }))
    : connectionOptions.flatMap(({ workspace, connection }) =>
        connection.channels.map((channel) => ({
          workspace,
          connection,
          channel,
        })),
      );
  const selectedChannel = channelOptions.find(
    ({ channel }) => channel.id === filters.channelId,
  )?.channel;
  const quickFilter = activeQuickFilter(filters);
  const hasAdvancedFilters = Boolean(
    filters.provider ||
    filters.receivedFrom ||
    filters.receivedUntil ||
    filters.purpose === "message_observation" ||
    quickFilter === null,
  );
  const totals = summaryResult.data;
  const quickFilters: Array<{
    count: number | null;
    href: string;
    key: QuickFilterKey;
    label: string;
  }> = [
    {
      key: "all",
      label: "Todos eventos",
      count: totals?.all ?? null,
      href: quickFilterHref(filters, "all"),
    },
    {
      key: "automation",
      label: "Automacoes",
      count: totals?.automationCallbacks ?? null,
      href: quickFilterHref(filters, "automation"),
    },
    {
      key: "awaiting_parser",
      label: "Aguardando parser",
      count: totals?.awaitingParser ?? null,
      href: quickFilterHref(filters, "awaiting_parser"),
    },
    {
      key: "ctwa_pending",
      label: "CTWA pendente",
      count: totals?.ctwaPending ?? null,
      href: quickFilterHref(filters, "ctwa_pending"),
    },
    {
      key: "ctwa_routed",
      label: "CTWA roteado",
      count: totals?.ctwaRouted ?? null,
      href: quickFilterHref(filters, "ctwa_routed"),
    },
    {
      key: "no_ctwa",
      label: "Sem CTWA",
      count: totals?.noCtwa ?? null,
      href: quickFilterHref(filters, "no_ctwa"),
    },
    {
      key: "failed",
      label: "Falhas de entrega",
      count: totals?.failed ?? null,
      href: quickFilterHref(filters, "failed"),
    },
  ];
  const deliveryHeading =
    quickFilter === null
      ? "Resultados filtrados"
      : quickFilter === "all"
        ? "Ultimas entregas"
        : quickFilter === "automation"
          ? "Callbacks de automacao"
          : quickFilters.find((filter) => filter.key === quickFilter)?.label;
  const activeTotal =
    quickFilter === "all"
      ? totals?.all
      : quickFilter === "automation"
        ? totals?.automationCallbacks
        : quickFilter === "awaiting_parser"
          ? totals?.awaitingParser
          : quickFilter === "ctwa_pending"
            ? totals?.ctwaPending
            : quickFilter === "ctwa_routed"
              ? totals?.ctwaRouted
              : quickFilter === "no_ctwa"
                ? totals?.noCtwa
                : quickFilter === "failed"
                  ? totals?.failed
                  : undefined;

  return (
    <section className="page-stack standalone-page inbound-deliveries-page">
      <BackofficeNavigation active="webhooks" />

      <header className="page-header">
        <div>
          <span className="eyebrow">Observacao de provedores</span>
          <h1>Entregas do WhatsApp</h1>
          <p>
            Encontre o evento recente, confirme o CTWA e abra o payload
            recebido.
          </p>
        </div>
        <span className="status-chip neutral">Auditoria e recuperacao</span>
      </header>

      <section
        className="inbound-operator-scope"
        aria-labelledby="operator-scope-title"
      >
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Navegacao operacional</span>
            <h2 id="operator-scope-title">Cliente, conexao e canal</h2>
            <p>
              Escolha o contexto pelo nome para auditar callbacks, CTWAs e
              operacoes de recuperacao.
            </p>
          </div>
          {activeWorkspace ? (
            <span className="event-chip neutral">
              {activeWorkspace.name}
              {selectedConnection ? ` / ${selectedConnection.displayName}` : ""}
              {selectedChannel ? ` / ${selectedChannel.displayName}` : ""}
            </span>
          ) : null}
        </div>

        {scopeResult.state === "error" ? (
          <div className="inbound-scope-error">
            <AlertTriangle aria-hidden="true" size={18} strokeWidth={2} />
            Nao foi possivel carregar os nomes dos clientes. Os filtros tecnicos
            continuam protegidos.
          </div>
        ) : (
          <form
            action="/backoffice/inbound-webhooks"
            className="inbound-scope-form"
          >
            {filters.receivedFrom ? (
              <input
                type="hidden"
                name="receivedFrom"
                value={filters.receivedFrom}
              />
            ) : null}
            {filters.receivedUntil ? (
              <input
                type="hidden"
                name="receivedUntil"
                value={filters.receivedUntil}
              />
            ) : null}
            <label>
              <span>
                <Building2 aria-hidden="true" size={15} strokeWidth={2} />
                Workspace
              </span>
              <select
                name="workspaceId"
                defaultValue={activeWorkspace?.id ?? ""}
              >
                <option value="">Todos os clientes</option>
                {scope.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>
                <Radio aria-hidden="true" size={15} strokeWidth={2} />
                Conexao
              </span>
              <select
                name="connectionId"
                defaultValue={selectedConnection?.id ?? ""}
              >
                <option value="">Todas as conexoes</option>
                {connectionOptions.map(({ workspace, connection }) => (
                  <option key={connection.id} value={connection.id}>
                    {selectedWorkspace ? "" : `${workspace.name} / `}
                    {connection.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>
                <Radio aria-hidden="true" size={15} strokeWidth={2} />
                Canal WhatsApp
              </span>
              <select name="channelId" defaultValue={selectedChannel?.id ?? ""}>
                <option value="">Todos os canais</option>
                {channelOptions.map(({ workspace, connection, channel }) => (
                  <option key={channel.id} value={channel.id}>
                    {selectedConnection
                      ? ""
                      : `${workspace.name} / ${connection.displayName} / `}
                    {channel.displayName} / {channel.connectedPhone}
                  </option>
                ))}
              </select>
            </label>

            <button className="button" type="submit">
              Abrir escopo
            </button>
            <a className="button ghost" href="/backoffice/inbound-webhooks">
              Limpar
            </a>
          </form>
        )}

        {selectedConnection ? (
          <div className="inbound-scope-actions">
            <span>
              <strong>{selectedConnection.displayName}</strong>
              <small>
                {selectedConnection.status === "production"
                  ? "Envio automatico ativo"
                  : "Conexao fora da producao automatica"}
              </small>
            </span>
            <a
              className="button ghost compact-button"
              href={`/backoffice/inbound-webhooks/replay/${selectedConnection.id}`}
            >
              <History aria-hidden="true" size={16} strokeWidth={2} />
              Replay historico
            </a>
            {selectedConnection.status === "production" ? (
              <a
                className="button ghost compact-button"
                href={`/backoffice/inbound-webhooks/recovery/${selectedConnection.id}${
                  selectedChannel ? `?channelId=${selectedChannel.id}` : ""
                }`}
              >
                <LifeBuoy aria-hidden="true" size={16} strokeWidth={2} />
                Recuperar producao
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      {(totals?.ctwaPending ?? 0) > 0 ? (
        <div className="inbound-attention-banner">
          <span className="inbound-attention-icon" aria-hidden="true">
            <AlertTriangle size={18} strokeWidth={2} />
          </span>
          <span>
            <strong>
              {totals?.ctwaPending} CTWA aguardando validacao do payload
            </strong>
            <span>
              O evento foi reconhecido e ainda nao possui rota Meta associada.
            </span>
          </span>
          <a
            className="button compact-button"
            href={quickFilterHref(filters, "ctwa_pending")}
          >
            Ver agora
          </a>
        </div>
      ) : null}

      <nav className="inbound-quick-filters" aria-label="Filtros rapidos">
        {quickFilters.map((filter) => (
          <a
            className={`inbound-quick-filter${
              quickFilter === filter.key ? " active" : ""
            }`}
            href={filter.href}
            aria-current={quickFilter === filter.key ? "page" : undefined}
            key={filter.key}
          >
            <span>{filter.label}</span>
            <strong>{filter.count ?? "--"}</strong>
          </a>
        ))}
      </nav>

      <details className="inbound-advanced-filters" open={hasAdvancedFilters}>
        <summary>
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2} />
          <span>Filtros avancados</span>
          {hasAdvancedFilters ? <strong>Ativos</strong> : null}
        </summary>
        <form
          className="filter-bar inbound-backoffice-filter"
          action="/backoffice/inbound-webhooks"
        >
          {filters.workspaceId ? (
            <input
              type="hidden"
              name="workspaceId"
              value={filters.workspaceId}
            />
          ) : null}
          {filters.connectionId ? (
            <input
              type="hidden"
              name="connectionId"
              value={filters.connectionId}
            />
          ) : null}
          {filters.channelId ? (
            <input type="hidden" name="channelId" value={filters.channelId} />
          ) : null}
          <label className="filter-field">
            <span>Recebido a partir de</span>
            <input
              type="datetime-local"
              name="receivedFrom"
              defaultValue={filters.receivedFrom ?? ""}
              step="60"
            />
          </label>
          <label className="filter-field">
            <span>Recebido ate</span>
            <input
              type="datetime-local"
              name="receivedUntil"
              defaultValue={filters.receivedUntil ?? ""}
              step="60"
              title="O minuto selecionado e incluido por completo"
            />
          </label>
          <label className="filter-field">
            <span>Plataforma</span>
            <select name="provider" defaultValue={filters.provider ?? ""}>
              <option value="">Todas</option>
              <option value="umbler">Umbler</option>
              <option value="gupshup">Gupshup</option>
            </select>
          </label>
          <label className="filter-field">
            <span>Tipo de entrada</span>
            <select name="purpose" defaultValue={filters.purpose ?? ""}>
              <option value="">Todos</option>
              <option value="message_observation">Mensagens WhatsApp</option>
              <option value="conversion_automation">
                Automacoes de conversao
              </option>
            </select>
          </label>
          <label className="filter-field">
            <span>Status</span>
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">Todos</option>
              {deliveryStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Classificacao</span>
            <select
              name="classification"
              defaultValue={filters.classification ?? ""}
            >
              <option value="">Todas</option>
              {eventClassifications.map((classification) => (
                <option key={classification.value} value={classification.value}>
                  {classification.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            Aplicar
          </button>
          <a className="button ghost" href="/backoffice/inbound-webhooks">
            Limpar
          </a>
        </form>
      </details>

      <section className="inbound-delivery-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Historico recente</span>
            <h2>{deliveryHeading}</h2>
          </div>
          <span className="event-chip neutral">
            {activeTotal === undefined
              ? `${deliveries.length} entrega(s) exibida(s)`
              : `${deliveries.length} entrega(s) / ${activeTotal} ${
                  quickFilter === "automation" ? "callback(s)" : "evento(s)"
                }`}
          </span>
        </div>

        {result.state === "error" ? (
          <div className="inbound-empty-state">
            <AlertTriangle aria-hidden="true" size={20} />
            <div>
              <strong>Nao foi possivel carregar as entregas</strong>
              <p>
                Confirme a sessao de platform owner e tente novamente. Nenhum
                detalhe sensivel foi exibido.
              </p>
            </div>
          </div>
        ) : result.state === "empty" ? (
          <div className="inbound-empty-state">
            <Inbox aria-hidden="true" size={20} />
            <div>
              <strong>Nenhuma entrega recebida</strong>
              <p>O primeiro evento da plataforma aparecera aqui.</p>
            </div>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="inbound-empty-state">
            <SlidersHorizontal aria-hidden="true" size={20} />
            <div>
              <strong>Nenhuma entrega neste filtro</strong>
              <p>Escolha outra categoria ou limpe os filtros avancados.</p>
            </div>
          </div>
        ) : (
          <div className="inbound-delivery-list" role="list">
            {deliveries.map((delivery) => {
              const tone = deliveryTone(delivery);
              const deliveryConnection = connectionEntries.find(
                ({ connection }) => connection.id === delivery.connectionId,
              )?.connection;
              const channelSummary = delivery.channels.length
                ? delivery.channels
                    .map(
                      (channel) =>
                        `${channel.displayName} / ${channel.connectedPhone}`,
                    )
                    .join(", ")
                : "Callback sem canal normalizado";

              return (
                <article
                  className={`inbound-delivery-row ${tone}`}
                  key={delivery.id}
                  role="listitem"
                >
                  <div className="inbound-delivery-when">
                    <span className="micro-label">Recebido</span>
                    <strong>{formatDateTime(delivery.lastReceivedAt)}</strong>
                    <span>{delivery.attemptCount} tentativa(s)</span>
                  </div>

                  <div className="inbound-delivery-source">
                    <span className="micro-label">Cliente / conexao</span>
                    <strong>{delivery.workspaceName}</strong>
                    <span>{delivery.connectionName}</span>
                    <small>{channelSummary}</small>
                    <span>
                      {deliveryPurposeLabel(delivery.purpose)} /{" "}
                      {delivery.providerEventType ?? "Tipo nao informado"}
                    </span>
                  </div>

                  <div className="inbound-delivery-result">
                    <span className="micro-label">Resultado</span>
                    <strong>{deliveryResultLabel(delivery)}</strong>
                    <span>{deliveryResultDescription(delivery)}</span>
                  </div>

                  <div className="inbound-delivery-payload">
                    <span className="micro-label">Auditoria</span>
                    <strong>{payloadLabel(delivery)}</strong>
                    <span>
                      {statusLabel(delivery.status)} - {delivery.eventCount}{" "}
                      evento(s)
                    </span>
                  </div>

                  <div className="inbound-delivery-actions">
                    <a
                      className="button ghost compact-button inbound-payload-link"
                      href={`/backoffice/inbound-webhooks/${delivery.id}/payload`}
                    >
                      <Eye aria-hidden="true" size={16} strokeWidth={2} />
                      Ver payload
                    </a>
                    {delivery.purpose === "message_observation" &&
                    delivery.status === "processed" ? (
                      <>
                        {delivery.providerConversionsObservedAt ? (
                          <span
                            className="event-chip good"
                            title={`Conversoes lidas em ${formatDateTime(
                              delivery.providerConversionsObservedAt,
                            )}`}
                          >
                            Conversoes lidas
                          </span>
                        ) : null}
                        {delivery.payloadAvailable ? (
                          <BackofficeActionForm
                            action={reprocessInboundProviderConversionsAction}
                            className="inbound-inline-action-form"
                          >
                            <input
                              name="deliveryId"
                              type="hidden"
                              value={delivery.id}
                            />
                            <InboundProviderConversionRecoveryButton />
                          </BackofficeActionForm>
                        ) : (
                          <span className="event-chip warn">
                            Payload expirado
                          </span>
                        )}
                      </>
                    ) : null}
                    {delivery.classification === "eligible_route_resolved" ||
                    delivery.classification === "eligible_route_unresolved" ? (
                      <a
                        className="button ghost compact-button inbound-replay-link"
                        href={`/backoffice/inbound-webhooks/replay/${delivery.connectionId}`}
                      >
                        <RotateCcw
                          aria-hidden="true"
                          size={16}
                          strokeWidth={2}
                        />
                        Replay historico
                      </a>
                    ) : null}
                    {deliveryConnection?.status === "production" &&
                    (delivery.classification === "eligible_route_resolved" ||
                      delivery.classification ===
                        "eligible_route_unresolved") ? (
                      <a
                        className="button ghost compact-button inbound-replay-link"
                        href={`/backoffice/inbound-webhooks/recovery/${delivery.connectionId}${
                          delivery.channels.length === 1
                            ? `?channelId=${delivery.channels[0].id}`
                            : ""
                        }`}
                      >
                        <LifeBuoy
                          aria-hidden="true"
                          size={16}
                          strokeWidth={2}
                        />
                        Recuperar producao
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {result.state !== "error" && (page > 1 || result.hasNextPage) ? (
        <nav
          className="report-pagination"
          aria-label="Paginacao das entregas do WhatsApp"
        >
          <span>
            Pagina {page} - {deliveryPageSize} entregas por pagina
          </span>
          <div>
            {page > 1 ? (
              <a
                className="button ghost"
                href={deliveryPageHref(filters, page - 1)}
              >
                <ChevronLeft aria-hidden="true" size={16} strokeWidth={2} />
                Anterior
              </a>
            ) : (
              <span className="button ghost disabled">
                <ChevronLeft aria-hidden="true" size={16} strokeWidth={2} />
                Anterior
              </span>
            )}
            {result.hasNextPage ? (
              <a
                className="button ghost"
                href={deliveryPageHref(filters, page + 1)}
              >
                Proxima
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
              </a>
            ) : (
              <span className="button ghost disabled">
                Proxima
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
