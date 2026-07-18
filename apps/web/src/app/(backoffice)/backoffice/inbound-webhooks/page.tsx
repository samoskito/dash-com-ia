import type {
  BackofficeInboundWebhookDeliveryDto,
  InboundWebhookDeliveryStatusDto,
  InboundWebhookEventClassificationDto,
} from "@wpptrack/shared";
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
  { value: "eligible_route_resolved", label: "CTWA com rota" },
  { value: "eligible_route_unresolved", label: "CTWA sem rota" },
  { value: "ignored_no_ctwa", label: "Ignorado sem CTWA" },
  { value: "ignored_outbound", label: "Ignorado de saida" },
  { value: "ignored_private", label: "Ignorado privado" },
  { value: "unsupported_event", label: "Evento nao suportado" },
  { value: "invalid_payload", label: "Payload invalido" },
];

function asStringParam(
  value: string | string[] | undefined,
): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;

  return resolved?.trim() || undefined;
}

async function getDeliveries(
  filters: DeliveryFilters,
): Promise<DeliveryResult> {
  try {
    const params = new URLSearchParams({ limit: "50" });

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
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

function statusLabel(status: InboundWebhookDeliveryStatusDto): string {
  return (
    deliveryStatuses.find((candidate) => candidate.value === status)?.label ??
    status
  );
}

function classificationLabel(
  classification: InboundWebhookEventClassificationDto | null,
): string {
  if (!classification) {
    return "Ainda nao classificado";
  }

  return (
    eventClassifications.find((candidate) => candidate.value === classification)
      ?.label ?? classification
  );
}

function statusClass(
  status: InboundWebhookDeliveryStatusDto,
): "bad" | "neutral" | "warn" | undefined {
  if (status === "failed") {
    return "bad";
  }

  if (status === "pending" || status === "queued") {
    return "warn";
  }

  if (status === "processing") {
    return "neutral";
  }

  return undefined;
}

function payloadLabel(delivery: BackofficeInboundWebhookDeliveryDto): string {
  if (delivery.payloadAvailable) {
    return "Disponivel";
  }

  return new Date(delivery.payloadExpiresAt).getTime() <= Date.now()
    ? "Expirado"
    : "Removido";
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
  const result = await getDeliveries(filters);

  return (
    <section className="page-stack standalone-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Observacao de webhooks WhatsApp</span>
          <h1>Entregas recebidas</h1>
          <p>
            Auditoria de payloads Umbler antes de qualquer liberacao para
            producao.
          </p>
        </div>
        <div className="header-actions">
          <span className="status-chip warn">Somente observacao</span>
          <a className="button ghost" href="/backoffice">
            Voltar ao backoffice
          </a>
        </div>
      </header>

      <div className="action-notice error">
        <strong>Acesso restrito</strong>
        <span>
          O payload bruto pode conter dados pessoais. Apenas o platform owner
          pode abri-lo, e cada tentativa de acesso fica registrada na auditoria.
        </span>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Filtros operacionais</span>
        <h2>Localizar entregas</h2>
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
                <option key={classification.value} value={classification.value}>
                  {classification.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            Aplicar filtros
          </button>
          <a className="button ghost" href="/backoffice/inbound-webhooks">
            Limpar
          </a>
        </form>
      </div>

      <div className="surface-panel">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Historico de entrada</span>
            <h2>Ultimas entregas</h2>
          </div>
          <span className="event-chip neutral">
            {result.data.length} registro(s)
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
            <strong>Nenhuma entrega encontrada</strong>
            <p>
              Ajuste os filtros ou aguarde o primeiro evento recebido pela URL
              de observacao.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="inbound-backoffice-table">
              <thead>
                <tr>
                  <th>Conexao</th>
                  <th>Workspace</th>
                  <th>Parser</th>
                  <th>Classificacao</th>
                  <th>Status</th>
                  <th>Recebimento</th>
                  <th>Payload bruto</th>
                  <th>Auditoria</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((delivery) => {
                  const chipClass = statusClass(delivery.status);

                  return (
                    <tr key={delivery.id}>
                      <td>
                        <strong>{delivery.connectionName}</strong>
                        <span>
                          {delivery.provider} / {delivery.connectionId}
                        </span>
                      </td>
                      <td>
                        <strong>{delivery.workspaceId}</strong>
                        <span>
                          {delivery.providerEventType ?? "tipo ausente"}
                        </span>
                      </td>
                      <td>
                        <strong>{delivery.parserVersion}</strong>
                        <span>{delivery.parserReleaseStatus}</span>
                      </td>
                      <td>
                        <strong>
                          {classificationLabel(delivery.classification)}
                        </strong>
                        <span>
                          {delivery.eventCount} evento(s) normalizado(s)
                        </span>
                      </td>
                      <td>
                        <span
                          className={`event-chip${
                            chipClass ? ` ${chipClass}` : ""
                          }`}
                        >
                          {statusLabel(delivery.status)}
                        </span>
                        <span>{delivery.attemptCount} tentativa(s)</span>
                      </td>
                      <td>
                        <strong>
                          {formatDateTime(delivery.lastReceivedAt)}
                        </strong>
                        <span>
                          Primeiro: {formatDateTime(delivery.firstReceivedAt)}
                        </span>
                      </td>
                      <td>
                        <strong>{payloadLabel(delivery)}</strong>
                        <span>
                          Expira: {formatDateTime(delivery.payloadExpiresAt)}
                        </span>
                      </td>
                      <td>
                        <a
                          className="button ghost compact-button"
                          href={`/backoffice/inbound-webhooks/${delivery.id}/payload`}
                        >
                          Inspecionar
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
