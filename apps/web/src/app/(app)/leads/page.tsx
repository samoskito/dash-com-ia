import type { LeadListItemDto, LeadListPageDto } from "@wpptrack/shared";
import Link from "next/link";
import { serverApiFetch } from "../../../lib/server-api";

type LeadsSearchParams = Record<string, string | string[] | undefined>;

type LeadsResult = {
  leads: LeadListItemDto[];
  pagination: LeadListPageDto["pagination"];
  state: "real" | "empty" | "error";
};

type LeadFilters = {
  search?: string;
  status?: string;
  eventName?: string;
  label?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  since?: string;
  until?: string;
  page: number;
  pageSize: number;
};

async function getLeads(filters: LeadFilters): Promise<LeadsResult> {
  try {
    const query = leadQuery(filters);
    const response = await serverApiFetch<LeadListPageDto>(
      `/leads/page?${query}`,
    );

    return {
      leads: response.items,
      pagination: response.pagination,
      state: response.items.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      leads: [],
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems: 0,
        totalPages: 0,
      },
      state: "error",
    };
  }
}

function leadQuery(filters: LeadFilters, page = filters.page): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries({
    search: filters.search,
    status: filters.status,
    eventName: filters.eventName,
    label: filters.label,
    campaignId: filters.campaignId,
    adSetId: filters.adSetId,
    adId: filters.adId,
    since: filters.since,
    until: filters.until,
  })) {
    if (value) {
      params.set(key, value);
    }
  }

  params.set("page", String(page));
  params.set("pageSize", String(filters.pageSize));

  return params.toString();
}

function positiveIntegerParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function asStringParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: LeadListItemDto["status"]): string {
  const labels: Record<LeadListItemDto["status"], string> = {
    new: "Novo",
    active: "Atendimento ativo",
    qualified: "Lead qualificado",
    converted: "Compra atribuida",
    lost: "Perdido",
  };

  return labels[status];
}

function lastTouchLabel(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<LeadsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = asStringParam(resolvedSearchParams.search);
  const status = asStringParam(resolvedSearchParams.status);
  const eventName = asStringParam(resolvedSearchParams.eventName);
  const label = asStringParam(resolvedSearchParams.label);
  const campaignId = asStringParam(resolvedSearchParams.campaignId);
  const adSetId = asStringParam(resolvedSearchParams.adSetId);
  const adId = asStringParam(resolvedSearchParams.adId);
  const since = asStringParam(resolvedSearchParams.since);
  const until = asStringParam(resolvedSearchParams.until);
  const page = positiveIntegerParam(
    asStringParam(resolvedSearchParams.page),
    1,
  );
  const pageSize = Math.min(
    positiveIntegerParam(asStringParam(resolvedSearchParams.pageSize), 25),
    100,
  );
  const hasReportFilter = Boolean(
    campaignId || adSetId || adId || since || until,
  );
  const leadFilters: LeadFilters = {
    search,
    status,
    eventName,
    label,
    campaignId,
    adSetId,
    adId,
    since,
    until,
    page,
    pageSize,
  };
  const result = await getLeads(leadFilters);
  const { leads } = result;
  const pendingCount = leads.filter((lead) => !lead.lastEventName).length;
  const emptyTitle =
    result.state === "error"
      ? "Nao foi possivel carregar leads"
      : "Nenhum lead encontrado";
  const emptyDescription =
    result.state === "error"
      ? "Confira a API antes de analisar conversas."
      : "Quando o webhook Uazapi receber conversas, elas aparecem aqui.";

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Leads</span>
          <h1>Leads rastreados pelo WhatsApp</h1>
          <p>
            Busca por nome ou telefone, filtros por campanha, etiquetas e
            eventos enviados.
          </p>
        </div>
        <div className="header-actions">
          {result.state === "error" ? (
            <span className="status-chip warn">API indisponivel</span>
          ) : null}
          <span className="status-chip">
            {result.pagination.totalItems} conversas reais
          </span>
          <span className="status-chip warn">{pendingCount} pendencias</span>
        </div>
      </header>

      <form
        className="filter-bar"
        aria-label="Filtros de leads"
        action="/leads"
      >
        <input type="hidden" name="pageSize" value={pageSize} />
        <input
          className="filter-control"
          name="search"
          placeholder="Buscar lead"
          defaultValue={search}
        />
        <select
          className="filter-control"
          name="status"
          defaultValue={status ?? ""}
        >
          <option value="">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="qualified">Qualificados</option>
          <option value="converted">Convertidos</option>
        </select>
        <select
          className="filter-control"
          name="eventName"
          defaultValue={eventName ?? ""}
        >
          <option value="">Todos os eventos</option>
          <option value="LeadSubmitted">LeadSubmitted</option>
          <option value="QualifiedLead">QualifiedLead</option>
          <option value="Purchase">Purchase</option>
        </select>
        <input
          className="filter-control"
          name="label"
          placeholder="Etiqueta"
          defaultValue={label}
        />
        <input type="hidden" name="campaignId" value={campaignId ?? ""} />
        <input type="hidden" name="adSetId" value={adSetId ?? ""} />
        <input type="hidden" name="adId" value={adId ?? ""} />
        <input type="hidden" name="since" value={since ?? ""} />
        <input type="hidden" name="until" value={until ?? ""} />
        <button className="button" type="submit">
          Filtrar
        </button>
      </form>
      {hasReportFilter ? (
        <p className="muted">
          Filtro do relatorio aplicado
          {since && until ? `: ${since} ate ${until}` : "."}
        </p>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lead</th>
              <th>Campanha / origem</th>
              <th>Evento</th>
              <th>Status</th>
              <th>Score</th>
              <th>Ultimo toque</th>
            </tr>
          </thead>
          <tbody>
            {leads.length > 0 ? (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>
                      <Link href={`/leads/${lead.id}`}>
                        {lead.name ?? "Lead sem nome"}
                      </Link>
                    </strong>
                    <span>{lead.phoneDisplay ?? lead.phoneHash}</span>
                  </td>
                  <td>
                    {lead.campaignName ?? "Campanha nao resolvida"}
                    <span>{lead.source ?? lead.adId ?? "origem parcial"}</span>
                    {lead.labels.length > 0 ? (
                      <span>{lead.labels.join(", ")}</span>
                    ) : null}
                  </td>
                  <td>
                    <span
                      className={`event-chip${lead.lastEventName ? "" : " warn"}`}
                    >
                      {lead.lastEventName ?? "Sem evento"}
                    </span>
                  </td>
                  <td>{statusLabel(lead.status)}</td>
                  <td>{lead.score}</td>
                  <td>{lastTouchLabel(lead.lastMessageAt)}</td>
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

      <nav className="report-pagination" aria-label="Paginacao de leads">
        <span>
          Pagina {result.pagination.page} de{" "}
          {Math.max(result.pagination.totalPages, 1)} ·{" "}
          {result.pagination.totalItems} leads
        </span>
        <div>
          {result.pagination.page > 1 ? (
            <Link
              className="button ghost"
              href={`/leads?${leadQuery(leadFilters, result.pagination.page - 1)}`}
            >
              Anterior
            </Link>
          ) : (
            <span className="button ghost disabled" aria-disabled="true">
              Anterior
            </span>
          )}
          {result.pagination.page < result.pagination.totalPages ? (
            <Link
              className="button ghost"
              href={`/leads?${leadQuery(leadFilters, result.pagination.page + 1)}`}
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
