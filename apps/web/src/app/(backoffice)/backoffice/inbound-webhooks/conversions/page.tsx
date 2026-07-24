import { randomUUID } from "node:crypto";
import type {
  BackofficeInboundWebhookOperationsScopeDto,
  BackofficeProviderConversionTraceItemDto,
  BackofficeProviderConversionTraceListDto,
  BackofficeProviderConversionTraceStateDto,
  ProviderConversionDecisionCodeDto,
} from "@wpptrack/shared";
import { providerConversionDecisionCodes } from "@wpptrack/shared";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  FileJson,
  Filter,
  Inbox,
  ShieldAlert,
  Waypoints,
  XCircle,
} from "lucide-react";
import { BackofficeActionForm } from "../../../../../components/backoffice-action-form";
import { BackofficeNavigation } from "../../../../../components/backoffice-navigation";
import { ProviderConversionReevaluateButton } from "../../../../../components/provider-conversion-reevaluate-button";
import { ProviderConversionRetryButton } from "../../../../../components/provider-conversion-retry-button";
import { formatDateTime } from "../../../../../lib/date-time";
import { serverApiFetch } from "../../../../../lib/server-api";
import {
  reevaluateProviderConversionDecisionAction,
  retryProviderConversionDeliveryAction,
} from "../actions";

type TraceSearchParams = Record<string, string | string[] | undefined>;

type TraceFilters = {
  workspaceId?: string;
  connectionId?: string;
  channelId?: string;
  deliveryId?: string;
  providerRuleId?: string;
  eventName?: string;
  decisionCode?: ProviderConversionDecisionCodeDto;
  state?: BackofficeProviderConversionTraceStateDto;
  receivedFrom?: string;
  receivedUntil?: string;
};

const tracePageSize = 50;

const traceStates: Array<{
  value: BackofficeProviderConversionTraceStateDto;
  label: string;
}> = [
  { value: "review_required", label: "Revisao de compra" },
  { value: "observed", label: "Somente observado" },
  { value: "queued", label: "Na fila" },
  { value: "sent", label: "Enviado a Meta" },
  { value: "duplicate", label: "Duplicado" },
  { value: "blocked_configuration", label: "Bloqueado por configuracao" },
  { value: "failed_retryable", label: "Falha transitoria" },
  { value: "failed_permanent", label: "Falha permanente" },
  { value: "internal_outcome", label: "Resultado interno" },
];

const decisionLabels: Record<ProviderConversionDecisionCodeDto, string> = {
  ignored_empty_template: "Template vazio ignorado",
  ignored_untracked_lead: "Lead fora da base paga",
  review_required: "Revisao necessaria",
  eligible: "Elegivel para envio",
  duplicate: "Duplicado",
};

function asStringParam(
  value: string | string[] | undefined,
): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;

  return resolved?.trim() || undefined;
}

function pageParam(value: string | string[] | undefined): number {
  const parsed = Number(asStringParam(value));

  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 2_001) : 1;
}

function traceParams(
  filters: TraceFilters,
  page?: number,
): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  if (page && page > 1) params.set("page", String(page));

  return params;
}

function traceHref(filters: TraceFilters, page?: number): string {
  const query = traceParams(filters, page).toString();

  return `/backoffice/inbound-webhooks/conversions${
    query ? `?${query}` : ""
  }`;
}

function deliveriesHref(filters: TraceFilters): string {
  const params = new URLSearchParams();

  if (filters.workspaceId) params.set("workspaceId", filters.workspaceId);
  if (filters.connectionId) params.set("connectionId", filters.connectionId);
  if (filters.channelId) params.set("channelId", filters.channelId);
  if (filters.receivedFrom) params.set("receivedFrom", filters.receivedFrom);
  if (filters.receivedUntil) params.set("receivedUntil", filters.receivedUntil);

  const query = params.toString();

  return `/backoffice/inbound-webhooks${query ? `?${query}` : ""}`;
}

async function getScope(): Promise<BackofficeInboundWebhookOperationsScopeDto | null> {
  try {
    return await serverApiFetch<BackofficeInboundWebhookOperationsScopeDto>(
      "/backoffice/inbound-webhooks/scope",
    );
  } catch {
    return null;
  }
}

async function getTraces(
  filters: TraceFilters,
  page: number,
): Promise<{
  data: BackofficeProviderConversionTraceListDto | null;
  state: "real" | "empty" | "error";
}> {
  try {
    const params = traceParams(filters);
    params.set("limit", String(tracePageSize));
    params.set("offset", String((page - 1) * tracePageSize));
    const data =
      await serverApiFetch<BackofficeProviderConversionTraceListDto>(
        `/backoffice/inbound-webhooks/conversion-traces?${params.toString()}`,
      );

    return {
      data,
      state: data.items.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

function stateLabel(state: BackofficeProviderConversionTraceStateDto): string {
  return (
    traceStates.find((candidate) => candidate.value === state)?.label ?? state
  );
}

function stateTone(
  state: BackofficeProviderConversionTraceStateDto,
): "bad" | "good" | "neutral" | "warn" {
  if (state === "sent") return "good";
  if (state === "failed_retryable" || state === "review_required") {
    return "warn";
  }
  if (
    state === "failed_permanent" ||
    state === "blocked_configuration"
  ) {
    return "bad";
  }

  return "neutral";
}

function eventLabel(eventName: string): string {
  if (eventName === "QualifiedLead") return "Lead qualificado";
  if (eventName === "Purchase") return "Compra";
  if (eventName === "LeadSubmitted") return "Conversa iniciada";

  return eventName;
}

function humanizeCode(value: string | null): string {
  if (!value) return "Sem motivo adicional";

  const known: Record<string, string> = {
    automation_matched: "Automacao reconhecida",
    catalog_combination_not_found: "Combinacao ausente no catalogo",
    paid_lead_not_found: "Lead pago nao localizado",
    purchase_template_missing_required_attributes:
      "Template vazio ignorado internamente",
    MetaCapiNetworkError: "Falha de comunicacao com a Meta",
    MissingMetaDestination: "Destino Meta nao configurado",
  };

  return (
    known[value] ??
    value
      .replaceAll("_", " ")
      .replace(/^\w/u, (character) => character.toUpperCase())
  );
}

function formatValue(item: BackofficeProviderConversionTraceItemDto): string {
  if (item.decision.valueCents === null) return "Sem valor";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: item.decision.currency ?? "BRL",
  }).format(item.decision.valueCents / 100);
}

function summaryValue(
  result: BackofficeProviderConversionTraceListDto,
  state: BackofficeProviderConversionTraceStateDto,
): number {
  const field: Record<
    BackofficeProviderConversionTraceStateDto,
    keyof BackofficeProviderConversionTraceListDto["summary"]
  > = {
    internal_outcome: "internalOutcome",
    review_required: "reviewRequired",
    observed: "observed",
    queued: "queued",
    sent: "sent",
    duplicate: "duplicate",
    blocked_configuration: "blockedConfiguration",
    failed_retryable: "failedRetryable",
    failed_permanent: "failedPermanent",
  };

  return result.summary[field[state]];
}

function jsonPreview(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default async function ProviderConversionTracePage({
  searchParams,
}: {
  searchParams?: Promise<TraceSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters: TraceFilters = {
    workspaceId: asStringParam(resolvedSearchParams.workspaceId),
    connectionId: asStringParam(resolvedSearchParams.connectionId),
    channelId: asStringParam(resolvedSearchParams.channelId),
    deliveryId: asStringParam(resolvedSearchParams.deliveryId),
    providerRuleId: asStringParam(resolvedSearchParams.providerRuleId),
    eventName: asStringParam(resolvedSearchParams.eventName),
    decisionCode: asStringParam(resolvedSearchParams.decisionCode) as
      | ProviderConversionDecisionCodeDto
      | undefined,
    state: asStringParam(resolvedSearchParams.state) as
      | BackofficeProviderConversionTraceStateDto
      | undefined,
    receivedFrom: asStringParam(resolvedSearchParams.receivedFrom),
    receivedUntil: asStringParam(resolvedSearchParams.receivedUntil),
  };
  const page = pageParam(resolvedSearchParams.page);
  const [traceResult, scopeResult] = await Promise.all([
    getTraces(filters, page),
    getScope(),
  ]);
  const result = traceResult.data;
  const scope = scopeResult?.workspaces ?? [];
  const selectedWorkspace = scope.find(
    (workspace) => workspace.id === filters.workspaceId,
  );
  const connectionEntries = scope.flatMap((workspace) =>
    workspace.connections.map((connection) => ({ workspace, connection })),
  );
  const selectedConnectionEntry =
    connectionEntries.find(
      ({ connection }) => connection.id === filters.connectionId,
    ) ??
    connectionEntries.find(({ connection }) =>
      connection.channels.some((channel) => channel.id === filters.channelId),
    );
  const selectedConnection = selectedConnectionEntry?.connection;
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
  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / tracePageSize))
    : 1;

  return (
    <section className="page-stack standalone-page conversion-trace-page">
      <BackofficeNavigation active="webhooks" />

      <header className="page-header">
        <div>
          <span className="eyebrow">Rastreabilidade operacional</span>
          <h1>Auditoria de conversoes</h1>
          <p>
            Siga cada ocorrencia do payload ate a decisao, a fila e a resposta
            final da Meta.
          </p>
        </div>
        <span className="status-chip neutral">Uma linha por ocorrencia</span>
      </header>

      <nav className="conversion-trace-view-switch" aria-label="Tipo de auditoria">
        <a href={deliveriesHref(filters)}>
          <FileJson aria-hidden="true" size={17} strokeWidth={2} />
          Entregas e payloads
        </a>
        <a className="active" href={traceHref(filters)} aria-current="page">
          <Waypoints aria-hidden="true" size={17} strokeWidth={2} />
          Conversoes
        </a>
      </nav>

      <section className="conversion-trace-filter-panel">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Escopo da auditoria</span>
            <h2>Cliente, origem e resultado</h2>
          </div>
          {result ? (
            <span className="event-chip neutral">
              {filters.deliveryId
                ? "Entrega selecionada"
                : `${result.total} ocorrencia(s) no filtro`}
            </span>
          ) : null}
        </div>

        <form
          action="/backoffice/inbound-webhooks/conversions"
          className="conversion-trace-filter-grid"
        >
          {filters.deliveryId ? (
            <input type="hidden" name="deliveryId" value={filters.deliveryId} />
          ) : null}
          <label>
            <span>Workspace</span>
            <select
              name="workspaceId"
              defaultValue={selectedWorkspace?.id ?? ""}
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
            <span>Conexao</span>
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
            <span>Canal WhatsApp</span>
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

          <label>
            <span>Regra</span>
            <select
              name="providerRuleId"
              defaultValue={filters.providerRuleId ?? ""}
            >
              <option value="">Todas as regras</option>
              {(result?.facets.rules ?? []).map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name} / {eventLabel(rule.eventName)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Evento</span>
            <select name="eventName" defaultValue={filters.eventName ?? ""}>
              <option value="">Todos os eventos</option>
              <option value="QualifiedLead">Lead qualificado</option>
              <option value="Purchase">Compra</option>
              <option value="LeadSubmitted">Conversa iniciada</option>
            </select>
          </label>

          <label>
            <span>Estado operacional</span>
            <select name="state" defaultValue={filters.state ?? ""}>
              <option value="">Todos os estados</option>
              {traceStates.map((state) => (
                <option key={state.value} value={state.value}>
                  {state.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Decisao do motor</span>
            <select
              name="decisionCode"
              defaultValue={filters.decisionCode ?? ""}
            >
              <option value="">Todas as decisoes</option>
              {providerConversionDecisionCodes.map((decisionCode) => (
                <option key={decisionCode} value={decisionCode}>
                  {decisionLabels[decisionCode]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Recebido a partir de</span>
            <input
              type="datetime-local"
              name="receivedFrom"
              defaultValue={filters.receivedFrom ?? ""}
              step="60"
            />
          </label>

          <label>
            <span>Recebido ate</span>
            <input
              type="datetime-local"
              name="receivedUntil"
              defaultValue={filters.receivedUntil ?? ""}
              step="60"
              title="O minuto selecionado e incluido por completo"
            />
          </label>

          <div className="conversion-trace-filter-actions">
            <button className="button" type="submit">
              <Filter aria-hidden="true" size={16} strokeWidth={2} />
              Aplicar
            </button>
            <a
              className="button ghost"
              href={
                filters.deliveryId
                  ? `/backoffice/inbound-webhooks/conversions?deliveryId=${encodeURIComponent(
                      filters.deliveryId,
                    )}`
                  : "/backoffice/inbound-webhooks/conversions"
              }
            >
              {filters.deliveryId ? "Limpar mantendo entrega" : "Limpar"}
            </a>
          </div>
        </form>
      </section>

      {result ? (
        <section className="conversion-trace-summary" aria-label="Resumo do filtro">
          <article>
            <span>Total no filtro</span>
            <strong>{result.summary.all}</strong>
          </article>
          <article className="good">
            <span>Enviados</span>
            <strong>{result.summary.sent}</strong>
          </article>
          <article>
            <span>Na fila</span>
            <strong>{result.summary.queued}</strong>
          </article>
          <article className="warn">
            <span>Para revisar</span>
            <strong>{result.summary.reviewRequired}</strong>
          </article>
          <article className="bad">
            <span>Falhas transitorias</span>
            <strong>{result.summary.failedRetryable}</strong>
          </article>
          <article className="bad">
            <span>Falhas permanentes</span>
            <strong>{result.summary.failedPermanent}</strong>
          </article>
        </section>
      ) : null}

      <section className="conversion-trace-list-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Historico consolidado</span>
            <h2>Ocorrencias do filtro</h2>
          </div>
          <a className="button ghost compact-button" href={deliveriesHref(filters)}>
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
            Ver entregas
          </a>
        </div>

        {traceResult.state === "error" ? (
          <div className="inbound-empty-state">
            <AlertTriangle aria-hidden="true" size={20} />
            <div>
              <strong>Nao foi possivel carregar a auditoria</strong>
              <p>Tente novamente sem alterar as ocorrencias preservadas.</p>
            </div>
          </div>
        ) : traceResult.state === "empty" ? (
          <div className="inbound-empty-state">
            <Inbox aria-hidden="true" size={20} />
            <div>
              <strong>Nenhuma conversao neste filtro</strong>
              <p>Ajuste o periodo, cliente ou estado operacional.</p>
            </div>
          </div>
        ) : (
          <div className="conversion-trace-list">
            {result?.items.map((item) => {
              const tone = stateTone(item.state);

              return (
                <article className={`conversion-trace-row ${tone}`} key={item.decisionId}>
                  <div className="conversion-trace-primary">
                    <div>
                      <span className="micro-label">Recebido</span>
                      <strong>{formatDateTime(item.delivery.lastReceivedAt)}</strong>
                      <small>Decisao v{item.decisionVersion}</small>
                    </div>
                    <div>
                      <span className="micro-label">Cliente / origem</span>
                      <strong>{item.workspace.name}</strong>
                      <span>{item.connection.name}</span>
                      <small>
                        {item.channel
                          ? `${item.channel.name} / ${item.channel.connectedPhone}`
                          : "Canal nao identificado"}
                      </small>
                    </div>
                    <div>
                      <span className="micro-label">Regra / evento</span>
                      <strong>{item.rule.name}</strong>
                      <span>{eventLabel(item.rule.eventName)}</span>
                      <small>{formatValue(item)}</small>
                    </div>
                    <div>
                      <span className="micro-label">Estado operacional</span>
                      <span className={`event-chip ${tone}`}>
                        {item.state === "sent" ? (
                          <CheckCircle2 aria-hidden="true" size={14} />
                        ) : item.state === "queued" ? (
                          <Clock3 aria-hidden="true" size={14} />
                        ) : item.state === "failed_permanent" ? (
                          <XCircle aria-hidden="true" size={14} />
                        ) : (
                          <ShieldAlert aria-hidden="true" size={14} />
                        )}
                        {stateLabel(item.state)}
                      </span>
                      <strong>
                        {humanizeCode(
                          item.meta?.errorCode ??
                            item.execution?.reasonCode ??
                            item.decision.reasonCode,
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="conversion-trace-actions">
                    <a
                      className="button ghost compact-button"
                      href={`/backoffice/inbound-webhooks/${item.delivery.id}/payload`}
                    >
                      <FileJson aria-hidden="true" size={16} strokeWidth={2} />
                      Payload
                    </a>
                    {item.meta ? (
                      <a
                        className="button ghost compact-button"
                        href={`/backoffice?view=operations&area=health&section=conversions&q=${encodeURIComponent(
                          item.meta.id,
                        )}`}
                      >
                        <Eye aria-hidden="true" size={16} strokeWidth={2} />
                        Evento Meta
                      </a>
                    ) : null}
                    {item.retryable && item.meta ? (
                      <BackofficeActionForm
                        action={retryProviderConversionDeliveryAction}
                        className="inbound-inline-action-form"
                      >
                        <input
                          type="hidden"
                          name="conversionEventLogId"
                          value={item.meta.id}
                        />
                        <ProviderConversionRetryButton />
                      </BackofficeActionForm>
                    ) : null}
                    {item.reevaluable ? (
                      <BackofficeActionForm
                        action={reevaluateProviderConversionDecisionAction}
                        className="inbound-inline-action-form"
                      >
                        <input
                          type="hidden"
                          name="decisionId"
                          value={item.decisionId}
                        />
                        <input
                          type="hidden"
                          name="requestKey"
                          value={`backoffice:${item.decisionId}:${randomUUID()}`}
                        />
                        <ProviderConversionReevaluateButton />
                      </BackofficeActionForm>
                    ) : null}
                  </div>

                  {item.meta ? (
                    <details className="conversion-trace-meta-details">
                      <summary>Resposta tecnica da Meta</summary>
                      <div>
                        <dl>
                          <div>
                            <dt>Status</dt>
                            <dd>{item.meta.status}</dd>
                          </div>
                          <div>
                            <dt>Pixel</dt>
                            <dd>{item.meta.pixelId ?? "Nao resolvido"}</dd>
                          </div>
                          <div>
                            <dt>Pagina</dt>
                            <dd>{item.meta.pageId ?? "Nao resolvida"}</dd>
                          </div>
                          <div>
                            <dt>Enviado</dt>
                            <dd>
                              {item.meta.sentAt
                                ? formatDateTime(item.meta.sentAt)
                                : "Ainda nao"}
                            </dd>
                          </div>
                        </dl>
                        {item.meta.errorMessage ? (
                          <p className="conversion-trace-error">
                            {item.meta.errorMessage}
                          </p>
                        ) : null}
                        {item.meta.responseSummary !== null ? (
                          <pre>{jsonPreview(item.meta.responseSummary)}</pre>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {result && totalPages > 1 ? (
        <nav className="report-pagination" aria-label="Paginacao das conversoes">
          <span>
            Pagina {page} de {totalPages} / {result.total} ocorrencia(s)
          </span>
          <div>
            {page > 1 ? (
              <a className="button ghost" href={traceHref(filters, page - 1)}>
                Anterior
              </a>
            ) : (
              <span className="button ghost disabled">Anterior</span>
            )}
            {page < totalPages ? (
              <a className="button ghost" href={traceHref(filters, page + 1)}>
                Proxima
              </a>
            ) : (
              <span className="button ghost disabled">Proxima</span>
            )}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
