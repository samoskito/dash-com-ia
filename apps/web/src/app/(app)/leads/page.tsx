import type { LeadListItemDto } from "@wpptrack/shared";
import Link from "next/link";
import { serverApiFetch } from "../../../lib/server-api";

type LeadsSearchParams = Record<string, string | string[] | undefined>;

type LeadsResult = {
  leads: LeadListItemDto[];
  state: "real" | "empty" | "error";
};

async function getLeads(filters: {
  search?: string;
  status?: string;
  eventName?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  since?: string;
  until?: string;
}): Promise<LeadsResult> {
  try {
    const params = new URLSearchParams();

    if (filters.search) {
      params.set("search", filters.search);
    }

    if (filters.status) {
      params.set("status", filters.status);
    }

    if (filters.eventName) {
      params.set("eventName", filters.eventName);
    }

    if (filters.campaignId) {
      params.set("campaignId", filters.campaignId);
    }

    if (filters.adSetId) {
      params.set("adSetId", filters.adSetId);
    }

    if (filters.adId) {
      params.set("adId", filters.adId);
    }

    if (filters.since) {
      params.set("since", filters.since);
    }

    if (filters.until) {
      params.set("until", filters.until);
    }

    const query = params.toString();

    const leads = await serverApiFetch<LeadListItemDto[]>(
      query ? `/leads?${query}` : "/leads"
    );

    return {
      leads,
      state: leads.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      leads: [],
      state: "error"
    };
  }
}

function asStringParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: LeadListItemDto["status"]): string {
  const labels: Record<LeadListItemDto["status"], string> = {
    new: "Novo",
    active: "Atendimento ativo",
    qualified: "Lead qualificado",
    converted: "Compra atribuida",
    lost: "Perdido"
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
    month: "2-digit"
  });
}

export default async function LeadsPage({
  searchParams
}: {
  searchParams?: Promise<LeadsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = asStringParam(resolvedSearchParams.search);
  const status = asStringParam(resolvedSearchParams.status);
  const eventName = asStringParam(resolvedSearchParams.eventName);
  const campaignId = asStringParam(resolvedSearchParams.campaignId);
  const adSetId = asStringParam(resolvedSearchParams.adSetId);
  const adId = asStringParam(resolvedSearchParams.adId);
  const since = asStringParam(resolvedSearchParams.since);
  const until = asStringParam(resolvedSearchParams.until);
  const hasReportFilter = Boolean(campaignId || adSetId || adId || since || until);
  const result = await getLeads({
    search,
    status,
    eventName,
    campaignId,
    adSetId,
    adId,
    since,
    until
  });
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
          <p>Busca por nome ou telefone, filtros por campanha, etiquetas e eventos enviados.</p>
        </div>
        <div className="header-actions">
          {result.state === "error" ? (
            <span className="status-chip warn">API indisponivel</span>
          ) : null}
          <span className="status-chip">{leads.length} conversas reais</span>
          <span className="status-chip warn">{pendingCount} pendencias</span>
        </div>
      </header>

      <form className="filter-bar" aria-label="Filtros de leads" action="/leads">
        <input className="filter-control" name="search" placeholder="Buscar lead" defaultValue={search} />
        <select className="filter-control" name="status" defaultValue={status ?? ""}>
          <option value="">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="qualified">Qualificados</option>
          <option value="converted">Convertidos</option>
        </select>
        <select className="filter-control" name="eventName" defaultValue={eventName ?? ""}>
          <option value="">Todos os eventos</option>
          <option value="LeadSubmitted">LeadSubmitted</option>
          <option value="QualifiedLead">QualifiedLead</option>
          <option value="Purchase">Purchase</option>
        </select>
        <input type="hidden" name="campaignId" value={campaignId ?? ""} />
        <input type="hidden" name="adSetId" value={adSetId ?? ""} />
        <input type="hidden" name="adId" value={adId ?? ""} />
        <input type="hidden" name="since" value={since ?? ""} />
        <input type="hidden" name="until" value={until ?? ""} />
        <button className="button" type="submit">Filtrar</button>
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
                  </td>
                  <td>
                    <span className={`event-chip${lead.lastEventName ? "" : " warn"}`}>
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
    </section>
  );
}
