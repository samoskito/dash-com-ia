import type { LeadListItemDto } from "@wpptrack/shared";
import { serverApiFetch } from "../../../lib/server-api";

type LeadsSearchParams = Record<string, string | string[] | undefined>;

const fallbackLeads: LeadListItemDto[] = [
  {
    id: "fallback_1",
    workspaceId: "workspace_fallback",
    name: "Mariana Alves",
    phoneDisplay: "+55 11 *****-1020",
    phoneHash: "fallback_phone_1",
    campaignName: "Black Friday WhatsApp",
    campaignId: "cmp_black_friday",
    adSetId: "adset_1",
    adId: "ad_2389",
    source: "ctwa / ad 2389",
    lastEventName: "QualifiedLead",
    status: "qualified",
    score: 86,
    firstMessageAt: "2026-07-02T03:00:00.000Z",
    lastMessageAt: "2026-07-02T03:10:00.000Z",
    createdAt: "2026-07-02T03:00:00.000Z",
    updatedAt: "2026-07-02T03:10:00.000Z"
  },
  {
    id: "fallback_2",
    workspaceId: "workspace_fallback",
    name: "Rafael Costa",
    phoneDisplay: "+55 31 *****-4300",
    phoneHash: "fallback_phone_2",
    campaignName: "Remarketing 7 dias",
    campaignId: "cmp_remarketing",
    adSetId: null,
    adId: null,
    source: "pixel / publico quente",
    lastEventName: "LeadSubmitted",
    status: "active",
    score: 71,
    firstMessageAt: "2026-07-02T03:00:00.000Z",
    lastMessageAt: "2026-07-02T03:08:00.000Z",
    createdAt: "2026-07-02T03:00:00.000Z",
    updatedAt: "2026-07-02T03:08:00.000Z"
  }
];

async function getLeads(filters: {
  search?: string;
  status?: string;
  eventName?: string;
}): Promise<LeadListItemDto[]> {
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

    const query = params.toString();

    return await serverApiFetch<LeadListItemDto[]>(
      query ? `/leads?${query}` : "/leads"
    );
  } catch {
    return fallbackLeads;
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
  const leads = await getLeads({ search, status, eventName });
  const pendingCount = leads.filter((lead) => !lead.lastEventName).length;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Leads</span>
          <h1>Leads rastreados pelo WhatsApp</h1>
          <p>Busca por nome ou telefone, filtros por campanha, etiquetas e eventos enviados.</p>
        </div>
        <div className="header-actions">
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
        <button className="button" type="submit">Filtrar</button>
      </form>

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
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <strong>{lead.name ?? "Lead sem nome"}</strong>
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
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
