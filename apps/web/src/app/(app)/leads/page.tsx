import type {
  LeadListItemDto,
  LeadListPageDto,
  WhatsappInstanceSummaryDto,
} from "@wpptrack/shared";
import {
  ArrowUpRight,
  Filter,
  MessageCircle,
  RotateCcw,
  UserRoundSearch,
} from "lucide-react";
import Link from "next/link";
import { PresentationMask } from "../../../components/presentation-mask";
import { formatDateTime } from "../../../lib/date-time";
import { serverApiFetch } from "../../../lib/server-api";
import {
  hasEditableLeadFilter,
  leadFiltersClearHref,
  leadFiltersHref,
  type LeadFilterValues,
} from "./lead-filter-params";
import { LeadFilters } from "./lead-filters";

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
  whatsappInstanceId?: string;
  attribution?: string;
  since?: string;
  until?: string;
  page: number;
  pageSize: number;
};

type InstanceScope =
  | { state: "none" }
  | { state: "named"; name: string }
  | { state: "unnamed" };

/**
 * Names the instance the list is scoped to. The leads request itself enforces
 * the scope, so a failed lookup only loses the name, never the filter.
 */
async function getInstanceScope(
  whatsappInstanceId: string | undefined,
): Promise<InstanceScope> {
  if (!whatsappInstanceId) {
    return { state: "none" };
  }

  try {
    const instances = await serverApiFetch<WhatsappInstanceSummaryDto[]>(
      "/integrations/whatsapp/instances",
    );
    const instance = instances.find(({ id }) => id === whatsappInstanceId);

    return instance
      ? { state: "named", name: instance.name }
      : { state: "unnamed" };
  } catch {
    return { state: "unnamed" };
  }
}

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
    whatsappInstanceId: filters.whatsappInstanceId,
    attribution: filters.attribution,
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

function lifecycleLabel(lead: LeadListItemDto): string {
  if (lead.status === "lost") {
    return "Perdido";
  }

  const labels: Record<string, string> = {
    LeadSubmitted: "Conversa iniciada",
    QualifiedLead: "Lead qualificado",
    Purchase: "Compra atribuida",
  };

  return lead.lastEventName
    ? (labels[lead.lastEventName] ?? lead.lastEventName)
    : statusLabel(lead.status);
}

function lifecycleTone(lead: LeadListItemDto): string {
  if (lead.status === "lost") {
    return " bad";
  }

  return lead.lastEventName ? "" : " warn";
}

function lastTouchLabel(value: string | null): string {
  if (!value) {
    return "-";
  }

  return formatDateTime(value, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function sourceLabel(source: string | null, adId: string | null): string {
  if (source === "external_mysql") {
    return "Integracao externa";
  }

  if (source === "umbler_talk") {
    return "Umbler Talk";
  }

  if (source === "uazapi") {
    return "NOD API";
  }

  return source ?? adId ?? "Origem parcial";
}

function LeadIdentity({ lead }: { lead: LeadListItemDto }) {
  return (
    <>
      <PresentationMask placeholder="Lead oculto">
        <Link href={`/leads/${lead.id}`}>{lead.name ?? "Lead sem nome"}</Link>
      </PresentationMask>
      <PresentationMask placeholder="(00) 00000-0000">
        <span>{lead.phoneDisplay ?? lead.phoneHash}</span>
      </PresentationMask>
    </>
  );
}

function LeadLabels({ labels }: { labels: string[] }) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <span className="lead-label-list">
      {labels.map((label) => (
        <small key={label}>{label}</small>
      ))}
    </span>
  );
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
  const whatsappInstanceId =
    asStringParam(resolvedSearchParams.whatsappInstanceId)?.trim() ||
    undefined;
  const attribution = asStringParam(resolvedSearchParams.attribution);
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
  const hasReportScope = Boolean(campaignId || adSetId || adId);
  const hasReportFilter = hasReportScope || Boolean(attribution);
  const hasPeriodFilter = Boolean(since || until);
  const leadFilters: LeadFilters = {
    search,
    status,
    eventName,
    label,
    campaignId,
    adSetId,
    adId,
    whatsappInstanceId,
    attribution,
    since,
    until,
    page,
    pageSize,
  };
  const appliedFilters: LeadFilterValues = {
    search: search ?? "",
    status: status ?? "",
    eventName: eventName ?? "",
    label: label ?? "",
    campaignId: campaignId ?? "",
    adSetId: adSetId ?? "",
    adId: adId ?? "",
    whatsappInstanceId: whatsappInstanceId ?? "",
    attribution: attribution ?? "",
    since: since ?? "",
    until: until ?? "",
    pageSize: String(pageSize),
  };
  const [result, instanceScope] = await Promise.all([
    getLeads(leadFilters),
    getInstanceScope(whatsappInstanceId),
  ]);
  const { leads } = result;
  const pendingCount = leads.filter((lead) => !lead.lastEventName).length;
  const pageStart =
    result.pagination.totalItems > 0
      ? (result.pagination.page - 1) * result.pagination.pageSize + 1
      : 0;
  const pageEnd = Math.min(
    result.pagination.page * result.pagination.pageSize,
    result.pagination.totalItems,
  );
  const emptyTitle =
    result.state === "error"
      ? "Nao foi possivel carregar leads"
      : "Nenhum lead encontrado";
  const emptyDescription =
    result.state === "error"
      ? "Confira a API antes de analisar conversas."
      : "Quando uma integracao ativa receber conversas, elas aparecem aqui.";
  const clearHref = leadFiltersClearHref(appliedFilters);
  // Only scope applied: clearing would reload the same list, so the scope
  // banners own the way out.
  const emptyActionHref =
    result.state === "error"
      ? `/leads?${leadQuery(leadFilters)}`
      : hasEditableLeadFilter(appliedFilters) ||
          !(whatsappInstanceId || hasReportScope)
        ? clearHref
        : null;

  return (
    <section className="page-stack page-wide leads-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Leads</span>
          <h1>Leads rastreados pelo WhatsApp</h1>
          <p>
            Encontre conversas, confirme a atribuicao e acompanhe a etapa atual
            de cada lead.
          </p>
        </div>
        <div className="header-actions">
          {result.state === "error" ? (
            <span className="status-chip warn">API indisponivel</span>
          ) : null}
          <span className="status-chip">
            {result.pagination.totalItems} conversas reais
          </span>
        </div>
      </header>

      <LeadFilters applied={appliedFilters} page={page} />

      {instanceScope.state !== "none" ? (
        <div
          className="lead-filter-context lead-instance-context"
          role="status"
        >
          <MessageCircle aria-hidden="true" size={16} strokeWidth={2} />
          <strong>Instancia WhatsApp</strong>
          <span>
            Exibindo leads associados atualmente a{" "}
            {instanceScope.state === "named" ? (
              <PresentationMask placeholder="instancia oculta">
                {instanceScope.name}
              </PresentationMask>
            ) : (
              "instancia selecionada"
            )}
            . O vinculo e o atual de cada lead, nao o historico de mensagens.
          </span>
          <Link
            className="button ghost"
            href={leadFiltersHref({ ...appliedFilters, whatsappInstanceId: "" })}
          >
            Ver todas as instancias
          </Link>
        </div>
      ) : null}

      {hasReportFilter || hasPeriodFilter ? (
        <div className="lead-filter-context" role="status">
          <Filter aria-hidden="true" size={16} strokeWidth={2} />
          <strong>Recorte ativo</strong>
          <span>
            {attribution === "organic"
              ? "Exibindo conversas sem atribuicao"
              : attribution === "paid"
                ? "Exibindo conversas com atribuicao"
                : hasReportFilter
                  ? "Filtro do relatorio aplicado"
                  : "Periodo das conversas"}
            {since || until
              ? `: ${since ?? "inicio"} ate ${until ?? "hoje"}`
              : "."}
          </span>
          {hasReportScope ? (
            // Limpar keeps the drill-down; this is the way out of it.
            <Link
              className="button ghost"
              href={leadFiltersHref({
                ...appliedFilters,
                campaignId: "",
                adSetId: "",
                adId: "",
              })}
            >
              Remover recorte do relatorio
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="lead-results-section" aria-labelledby="lead-results">
        <header className="lead-results-header">
          <div>
            <span className="eyebrow">Historico</span>
            <h2 id="lead-results">Conversas recebidas</h2>
            <p>
              {result.pagination.totalItems > 0
                ? `Mostrando ${pageStart}-${pageEnd} de ${result.pagination.totalItems} leads.`
                : "Nenhuma conversa disponivel neste recorte."}
            </p>
          </div>
          {leads.length > 0 ? (
            <div className="lead-results-summary">
              <span className="status-chip">
                Pagina {result.pagination.page} de{" "}
                {Math.max(result.pagination.totalPages, 1)}
              </span>
              <span className={`status-chip${pendingCount > 0 ? " warn" : ""}`}>
                {pendingCount} sem etapa nesta pagina
              </span>
            </div>
          ) : null}
        </header>

        {leads.length > 0 ? (
          <>
            <div className="table-wrap leads-table-wrap">
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Campanha / origem</th>
                    <th>Etapa atual</th>
                    <th>Recebido</th>
                    <th>Ultima atividade</th>
                    <th>
                      <span className="sr-only">Abrir lead</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="lead-identity-cell">
                        <div className="lead-identity-content">
                          <LeadIdentity lead={lead} />
                        </div>
                      </td>
                      <td className="lead-source-cell">
                        <strong>
                          <PresentationMask placeholder="Campanha oculta">
                            {lead.campaignName ?? "Campanha nao resolvida"}
                          </PresentationMask>
                        </strong>
                        <span>{sourceLabel(lead.source, lead.adId)}</span>
                        <LeadLabels labels={lead.labels} />
                      </td>
                      <td>
                        <span className={`event-chip${lifecycleTone(lead)}`}>
                          {lifecycleLabel(lead)}
                        </span>
                      </td>
                      <td className="lead-date-cell">
                        {lastTouchLabel(lead.firstMessageAt)}
                      </td>
                      <td className="lead-date-cell">
                        {lastTouchLabel(lead.lastMessageAt)}
                      </td>
                      <td className="lead-action-cell">
                        <Link
                          className="icon-button lead-open-action"
                          href={`/leads/${lead.id}`}
                          aria-label={`Abrir ${lead.name ?? "lead sem nome"}`}
                          title="Abrir lead"
                        >
                          <ArrowUpRight
                            aria-hidden="true"
                            size={17}
                            strokeWidth={2.2}
                          />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lead-mobile-list">
              {leads.map((lead) => (
                <article className="lead-mobile-card" key={lead.id}>
                  <header>
                    <div className="lead-mobile-identity">
                      <LeadIdentity lead={lead} />
                    </div>
                    <Link
                      className="icon-button lead-open-action"
                      href={`/leads/${lead.id}`}
                      aria-label={`Abrir ${lead.name ?? "lead sem nome"}`}
                    >
                      <ArrowUpRight
                        aria-hidden="true"
                        size={17}
                        strokeWidth={2.2}
                      />
                    </Link>
                  </header>
                  <div className="lead-mobile-source">
                    <span className="micro-label">Campanha / origem</span>
                    <strong>
                      <PresentationMask placeholder="Campanha oculta">
                        {lead.campaignName ?? "Campanha nao resolvida"}
                      </PresentationMask>
                    </strong>
                    <span>{sourceLabel(lead.source, lead.adId)}</span>
                    <LeadLabels labels={lead.labels} />
                  </div>
                  <div className="lead-mobile-stage">
                    <span className="micro-label">Etapa atual</span>
                    <span className={`event-chip${lifecycleTone(lead)}`}>
                      {lifecycleLabel(lead)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Recebido</dt>
                      <dd>{lastTouchLabel(lead.firstMessageAt)}</dd>
                    </div>
                    <div>
                      <dt>Ultima atividade</dt>
                      <dd>{lastTouchLabel(lead.lastMessageAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <nav className="report-pagination" aria-label="Paginacao de leads">
              <span>
                Pagina {result.pagination.page} de{" "}
                {Math.max(result.pagination.totalPages, 1)} -{" "}
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
          </>
        ) : (
          <div className={`lead-empty-state ${result.state}`}>
            <UserRoundSearch aria-hidden="true" size={28} strokeWidth={1.8} />
            <div>
              <strong>{emptyTitle}</strong>
              <span>{emptyDescription}</span>
            </div>
            {emptyActionHref ? (
              <Link className="button ghost" href={emptyActionHref}>
                <RotateCcw aria-hidden="true" size={16} strokeWidth={2} />
                {result.state === "error"
                  ? "Tentar novamente"
                  : "Limpar filtros"}
              </Link>
            ) : null}
          </div>
        )}
      </section>
    </section>
  );
}
