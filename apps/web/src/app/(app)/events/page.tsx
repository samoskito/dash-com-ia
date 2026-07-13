import type {
  ConversionAuditDeliveryStateDto,
  ConversionAuditOverviewDto,
  ConversionAuditSourceDto
} from "@wpptrack/shared";
import Link from "next/link";
import { formatDateTime } from "../../../lib/date-time";
import { serverApiFetch } from "../../../lib/server-api";

type EventsSearchParams = Record<string, string | string[] | undefined>;

type AuditFilters = {
  since: string;
  until: string;
  eventName?: string;
  status?: ConversionAuditDeliveryStateDto;
  source?: ConversionAuditSourceDto;
  page: number;
  pageSize: number;
};

type AuditResult =
  | { state: "real" | "empty"; report: ConversionAuditOverviewDto }
  | { state: "error"; report: null };

const emptySummary = {
  total: 0,
  sent: 0,
  queued: 0,
  blocked: 0,
  failed: 0,
  notEligible: 0,
  historical: 0,
  discarded: 0
};

function asStringParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveIntegerParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function dateOnlyInSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function defaultPeriod() {
  const until = dateOnlyInSaoPaulo(new Date());
  const sinceDate = new Date(`${until}T12:00:00.000Z`);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 6);

  return { since: sinceDate.toISOString().slice(0, 10), until };
}

function auditQuery(filters: AuditFilters, page = filters.page): string {
  const params = new URLSearchParams({
    since: filters.since,
    until: filters.until,
    page: String(page),
    pageSize: String(filters.pageSize)
  });

  if (filters.eventName) {
    params.set("eventName", filters.eventName);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.source) {
    params.set("source", filters.source);
  }

  return params.toString();
}

async function getAudit(filters: AuditFilters): Promise<AuditResult> {
  try {
    const report = await serverApiFetch<ConversionAuditOverviewDto>(
      `/reports/conversions/audit?${auditQuery(filters)}`
    );

    return {
      state: report.events.length ? "real" : "empty",
      report
    };
  } catch {
    return { state: "error", report: null };
  }
}

function stateChipClass(state: ConversionAuditDeliveryStateDto): string {
  if (state === "failed") {
    return "event-chip bad";
  }

  if (state === "queued" || state === "blocked") {
    return "event-chip warn";
  }

  if (
    state === "not_eligible" ||
    state === "historical" ||
    state === "discarded"
  ) {
    return "event-chip neutral";
  }

  return "event-chip";
}

function auditDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return formatDateTime(value, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export default async function EventsPage({
  searchParams
}: {
  searchParams?: Promise<EventsSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const period = defaultPeriod();
  const since = asStringParam(params.since) ?? period.since;
  const until = asStringParam(params.until) ?? period.until;
  const eventName = asStringParam(params.eventName);
  const status = asStringParam(params.status) as
    ConversionAuditDeliveryStateDto | undefined;
  const source = asStringParam(params.source) as
    ConversionAuditSourceDto | undefined;
  const page = positiveIntegerParam(asStringParam(params.page), 1);
  const pageSize = Math.min(
    positiveIntegerParam(asStringParam(params.pageSize), 25),
    100
  );
  const filters: AuditFilters = {
    since,
    until,
    eventName,
    status,
    source,
    page,
    pageSize
  };
  const result = await getAudit(filters);
  const report = result.report;
  const summary = report?.summary ?? emptySummary;
  const pagination = report?.pagination ?? {
    page,
    pageSize,
    totalItems: 0,
    totalPages: 0
  };
  const hasAttention = summary.blocked + summary.failed > 0;

  return (
    <section className="page-stack audit-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Eventos Meta</span>
          <h1>Auditoria de conversoes</h1>
          <p>
            Acompanhe o que foi enviado, o que esta aguardando e o que precisa
            de atencao antes de chegar a Meta.
          </p>
        </div>
        <div className="header-actions">
          {result.state === "error" ? (
            <span className="status-chip bad">API indisponivel</span>
          ) : hasAttention ? (
            <span className="status-chip warn">Requer atencao</span>
          ) : (
            <span className="status-chip">Fluxo acompanhado</span>
          )}
          <span className="status-chip neutral">
            {summary.total} eventos no periodo
          </span>
        </div>
      </header>

      <section className="audit-summary" aria-label="Resumo das entregas Meta">
        {[
          ["Enviados", summary.sent, "sent"],
          ["Aguardando", summary.queued, "queued"],
          ["Bloqueados", summary.blocked, "blocked"],
          ["Falhas", summary.failed, "failed"],
          ["Nao elegiveis", summary.notEligible, "not_eligible"],
          ["Historicos", summary.historical, "historical"],
          ["Descartados", summary.discarded, "discarded"]
        ].map(([label, value, state]) => (
          <div className={`audit-summary-item ${state}`} key={String(state)}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <form
        action="/events"
        aria-label="Filtros da auditoria Meta"
        className="filter-bar audit-filter-bar"
      >
        <input type="hidden" name="pageSize" value={pageSize} />
        <label className="filter-field">
          <span>Inicio</span>
          <input type="date" name="since" defaultValue={since} />
        </label>
        <label className="filter-field">
          <span>Fim</span>
          <input type="date" name="until" defaultValue={until} />
        </label>
        <select
          className="filter-control"
          name="eventName"
          defaultValue={eventName ?? ""}
        >
          <option value="">Todos os eventos</option>
          <option value="LeadSubmitted">Conversa iniciada</option>
          <option value="QualifiedLead">Lead qualificado</option>
          <option value="Purchase">Compra</option>
        </select>
        <select
          className="filter-control"
          name="status"
          defaultValue={status ?? ""}
        >
          <option value="">Todos os estados</option>
          <option value="sent">Enviados</option>
          <option value="queued">Aguardando envio</option>
          <option value="blocked">Bloqueados</option>
          <option value="failed">Falhas</option>
          <option value="not_eligible">Nao elegiveis</option>
          <option value="historical">Historicos</option>
          <option value="discarded">Descartados</option>
        </select>
        <select
          className="filter-control"
          name="source"
          defaultValue={source ?? ""}
        >
          <option value="">Todas as origens</option>
          <option value="external_integration">Integracao externa</option>
          <option value="whatsapp_automation">Automacao do WhatsApp</option>
          <option value="system">Regra automatica</option>
          <option value="manual_test">Teste manual</option>
          <option value="other">Outra origem</option>
        </select>
        <button className="button" type="submit">
          Filtrar
        </button>
        {eventName || status || source ? (
          <Link
            className="button ghost"
            href={`/events?since=${since}&until=${until}&pageSize=${pageSize}`}
          >
            Limpar
          </Link>
        ) : null}
      </form>

      <div className="audit-section-heading">
        <div>
          <span className="eyebrow">Historico de entrega</span>
          <h2>Eventos do periodo</h2>
        </div>
        <span className="muted">
          {report?.rangeLabel ?? `${since} a ${until}`}
        </span>
      </div>

      <div className="table-wrap audit-table-scroll">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Evento / origem</th>
              <th>Lead</th>
              <th>Campanha</th>
              <th>Entrega</th>
              <th>Ocorrido / enviado</th>
            </tr>
          </thead>
          <tbody>
            {report?.events.length ? (
              report.events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <strong>{event.eventLabel}</strong>
                    <span>{event.eventName}</span>
                    <span>{event.sourceLabel}</span>
                  </td>
                  <td>
                    <strong>
                      {event.leadId ? (
                        <Link href={`/leads/${event.leadId}`}>
                          {event.leadName ?? "Lead sem nome"}
                        </Link>
                      ) : (
                        "Lead nao vinculado"
                      )}
                    </strong>
                    <span>{event.phoneDisplay ?? "Telefone indisponivel"}</span>
                  </td>
                  <td>
                    <strong>
                      {event.campaignName ?? "Campanha nao resolvida"}
                    </strong>
                    <span>{event.adSetName ?? "Conjunto nao resolvido"}</span>
                    <span>{event.adName ?? "Anuncio nao resolvido"}</span>
                  </td>
                  <td>
                    <span className={stateChipClass(event.deliveryState)}>
                      {event.statusLabel}
                    </span>
                    <span>{event.statusDetail}</span>
                    {event.errorMessage ? (
                      <span className="audit-error-copy">
                        {event.errorMessage}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <strong>{auditDate(event.occurredAt)}</strong>
                    <span>
                      {event.sentAt
                        ? `Enviado ${auditDate(event.sentAt)}`
                        : "Ainda nao enviado"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>
                  <strong>
                    {result.state === "error"
                      ? "Nao foi possivel carregar a auditoria"
                      : "Nenhum evento encontrado"}
                  </strong>
                  <span>
                    {result.state === "error"
                      ? "A leitura falhou. Tente novamente depois que a API responder."
                      : "Ajuste o periodo ou aguarde a chegada de novos eventos."}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav className="report-pagination" aria-label="Paginacao de eventos Meta">
        <span>
          Pagina {pagination.page} de {Math.max(pagination.totalPages, 1)} ·{" "}
          {pagination.totalItems} eventos
        </span>
        <div>
          {pagination.page > 1 ? (
            <Link
              className="button ghost"
              href={`/events?${auditQuery(filters, pagination.page - 1)}`}
            >
              Anterior
            </Link>
          ) : (
            <span className="button ghost disabled" aria-disabled="true">
              Anterior
            </span>
          )}
          {pagination.page < pagination.totalPages ? (
            <Link
              className="button ghost"
              href={`/events?${auditQuery(filters, pagination.page + 1)}`}
            >
              Proxima
            </Link>
          ) : (
            <span className="button ghost disabled" aria-disabled="true">
              Proxima
            </span>
          )}
        </div>
      </nav>
    </section>
  );
}
