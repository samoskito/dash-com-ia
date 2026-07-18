import type {
  BackofficeInboundWebhookDeliveryDto,
  BackofficeInboundWebhookDeliverySummaryDto,
  InboundWebhookDeliveryStatusDto,
  InboundWebhookEventClassificationDto,
} from "@wpptrack/shared";
import {
  AlertTriangle,
  Eye,
  SlidersHorizontal,
} from "lucide-react";
import { BackofficeNavigation } from "../../../../components/backoffice-navigation";
import { formatDateTime } from "../../../../lib/date-time";
import { serverApiFetch } from "../../../../lib/server-api";

type InboundWebhookSearchParams = Record<string, string | string[] | undefined>;

type DeliveryFilters = {
  classification?: string;
  connectionId?: string;
  provider?: string;
  status?: string;
  workspaceId?: string;
};

type DeliveryResult = {
  data: BackofficeInboundWebhookDeliveryDto[];
  state: "real" | "empty" | "error";
};

type DeliverySummaryResult = {
  data: BackofficeInboundWebhookDeliverySummaryDto | null;
  state: "real" | "error";
};

type QuickFilterKey =
  | "all"
  | "ctwa_pending"
  | "ctwa_routed"
  | "failed"
  | "no_ctwa";

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

  if (filters.provider) {
    params.set("provider", filters.provider);
  }

  return params;
}

async function getDeliveries(
  filters: DeliveryFilters,
): Promise<DeliveryResult> {
  try {
    const params = deliveryScopeParams(filters);
    params.set("limit", "50");

    if (filters.status) {
      params.set("status", filters.status);
    }

    if (filters.classification) {
      params.set("classification", filters.classification);
    }

    const deliveries = await serverApiFetch<
      BackofficeInboundWebhookDeliveryDto[]
    >(`/backoffice/inbound-webhooks/deliveries?${params.toString()}`);

    return {
      data: deliveries,
      state: deliveries.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
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

  if (quickFilter === "ctwa_pending") {
    params.set("classification", "eligible_route_unresolved");
  } else if (quickFilter === "ctwa_routed") {
    params.set("classification", "eligible_route_resolved");
  } else if (quickFilter === "no_ctwa") {
    params.set("classification", "ignored_no_ctwa");
  } else if (quickFilter === "failed") {
    params.set("status", "failed");
  }

  const query = params.toString();

  return `/backoffice/inbound-webhooks${query ? `?${query}` : ""}`;
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

function payloadLabel(delivery: BackofficeInboundWebhookDeliveryDto): string {
  if (delivery.payloadAvailable) {
    return "Payload disponivel";
  }

  return new Date(delivery.payloadExpiresAt).getTime() <= Date.now()
    ? "Payload expirado"
    : "Payload removido";
}

function activeQuickFilter(
  filters: DeliveryFilters,
): QuickFilterKey | null {
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
    provider: asStringParam(resolvedSearchParams.provider),
    status: asStringParam(resolvedSearchParams.status),
    classification: asStringParam(resolvedSearchParams.classification),
  };
  const [result, summaryResult] = await Promise.all([
    getDeliveries(filters),
    getDeliverySummary(filters),
  ]);
  const deliveries = result.data;
  const quickFilter = activeQuickFilter(filters);
  const hasAdvancedFilters = Boolean(
    filters.workspaceId ||
      filters.connectionId ||
      filters.provider ||
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
        : quickFilters.find((filter) => filter.key === quickFilter)?.label;
  const activeTotal =
    quickFilter === "all"
      ? totals?.all
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
          <span className="eyebrow">Observacao Umbler</span>
          <h1>Entregas do WhatsApp</h1>
          <p>
            Encontre o evento recente, confirme o CTWA e abra o payload
            recebido.
          </p>
        </div>
        <span className="status-chip warn">Somente observacao</span>
      </header>

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
            href="/backoffice/inbound-webhooks?classification=eligible_route_unresolved"
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

      <details
        className="inbound-advanced-filters"
        open={hasAdvancedFilters}
      >
        <summary>
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2} />
          <span>Filtros avancados</span>
          {hasAdvancedFilters ? <strong>Ativos</strong> : null}
        </summary>
        <form
          className="filter-bar inbound-backoffice-filter"
          action="/backoffice/inbound-webhooks"
        >
          <label className="filter-field">
            <span>Workspace ID</span>
            <input
              name="workspaceId"
              defaultValue={filters.workspaceId}
              placeholder="Todos os workspaces"
            />
          </label>
          <label className="filter-field">
            <span>Conexao ID</span>
            <input
              name="connectionId"
              defaultValue={filters.connectionId}
              placeholder="Todas as conexoes"
            />
          </label>
          <label className="filter-field">
            <span>Plataforma</span>
            <select name="provider" defaultValue={filters.provider ?? ""}>
              <option value="">Todas</option>
              <option value="umbler">Umbler</option>
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
                <option
                  key={classification.value}
                  value={classification.value}
                >
                  {classification.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            Aplicar
          </button>
          <a
            className="button ghost"
            href="/backoffice/inbound-webhooks"
          >
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
              : `${deliveries.length} entrega(s) / ${activeTotal} evento(s)`}
          </span>
        </div>

        {result.state === "error" ? (
          <div className="inbound-empty-state">
            <strong>Nao foi possivel carregar as entregas</strong>
            <p>
              Confirme a sessao de platform owner e tente novamente. Nenhum
              detalhe sensivel foi exibido.
            </p>
          </div>
        ) : result.state === "empty" ? (
          <div className="inbound-empty-state">
            <strong>Nenhuma entrega recebida</strong>
            <p>O primeiro evento da plataforma aparecera aqui.</p>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="inbound-empty-state">
            <strong>Nenhuma entrega neste filtro</strong>
            <p>Escolha outra categoria ou limpe os filtros avancados.</p>
          </div>
        ) : (
          <div className="inbound-delivery-list" role="list">
            {deliveries.map((delivery) => {
              const tone = deliveryTone(delivery);

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
                    <span className="micro-label">Conexao</span>
                    <strong>{delivery.connectionName}</strong>
                    <span>
                      {delivery.providerEventType ?? "Tipo nao informado"}
                    </span>
                  </div>

                  <div className="inbound-delivery-result">
                    <span className="micro-label">Resultado</span>
                    <strong>{classificationLabel(delivery.classification)}</strong>
                    <span>
                      {classificationDescription(delivery.classification)}
                    </span>
                  </div>

                  <div className="inbound-delivery-payload">
                    <span className="micro-label">Auditoria</span>
                    <strong>{payloadLabel(delivery)}</strong>
                    <span>
                      {statusLabel(delivery.status)} - {delivery.eventCount}{" "}
                      evento(s)
                    </span>
                  </div>

                  <a
                    className="button ghost compact-button inbound-payload-link"
                    href={`/backoffice/inbound-webhooks/${delivery.id}/payload`}
                  >
                    <Eye aria-hidden="true" size={16} strokeWidth={2} />
                    Ver payload
                  </a>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
