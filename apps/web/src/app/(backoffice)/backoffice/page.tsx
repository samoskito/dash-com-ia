import type {
  DiagnosticEventDto,
  SplitReceiverDto,
  WorkspaceBillingDto
} from "@wpptrack/shared";
import { serverApiFetch } from "../../../lib/server-api";

type BackofficeSearchParams = Record<string, string | string[] | undefined>;

type DiagnosticFilters = {
  adId?: string;
  adSetId?: string;
  campaignId?: string;
  errorCode?: string;
  eventType?: string;
  leadId?: string;
  phoneHash?: string;
  q?: string;
  severity?: string;
  since?: string;
  source?: string;
  status?: string;
  until?: string;
  workspaceId?: string;
};

async function getDiagnosticEvents(
  filters: DiagnosticFilters
): Promise<DiagnosticEventDto[]> {
  try {
    const params = new URLSearchParams({ limit: "25" });

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }

    return await serverApiFetch<DiagnosticEventDto[]>(
      `/backoffice/diagnostics/events?${params.toString()}`
    );
  } catch {
    return [];
  }
}

async function getSplitReceivers(): Promise<SplitReceiverDto[]> {
  try {
    return await serverApiFetch<SplitReceiverDto[]>("/backoffice/split/receivers");
  } catch {
    return [];
  }
}

async function getWorkspaceBilling(): Promise<WorkspaceBillingDto[]> {
  try {
    return await serverApiFetch<WorkspaceBillingDto[]>("/backoffice/workspaces/billing");
  } catch {
    return [];
  }
}

async function retryDiagnosticEvent(formData: FormData) {
  "use server";

  const eventId = String(formData.get("eventId") ?? "");

  if (!eventId) {
    return;
  }

  try {
    await serverApiFetch(`/backoffice/diagnostics/events/${eventId}/retry`, {
      method: "POST",
      body: JSON.stringify({
        reason: "Retry solicitado pelo backoffice WppTrack"
      })
    });
  } catch {
    return;
  }
}

async function updateWorkspaceBilling(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const rawCustomerId = String(formData.get("asaasCustomerId") ?? "").trim();

  if (!workspaceId) {
    return;
  }

  try {
    await serverApiFetch(`/backoffice/workspaces/${workspaceId}/billing`, {
      method: "PATCH",
      body: JSON.stringify({
        asaasCustomerId: rawCustomerId || null
      })
    });
  } catch {
    return;
  }
}

function percentFromBps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function asStringParam(
  value: string | string[] | undefined
): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;

  return resolved?.trim() || undefined;
}

function normalizeDateFilter(
  value: string | undefined,
  boundary: "start" | "end"
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.includes("T")) {
    return value;
  }

  return boundary === "start"
    ? `${value}T00:00:00.000Z`
    : `${value}T23:59:59.000Z`;
}

function dateInputValue(value: string | undefined): string | undefined {
  return value?.slice(0, 10);
}

export default async function BackofficePage({
  searchParams
}: {
  searchParams?: Promise<BackofficeSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const diagnosticFilters: DiagnosticFilters = {
    workspaceId: asStringParam(resolvedSearchParams.workspaceId),
    source: asStringParam(resolvedSearchParams.source),
    status: asStringParam(resolvedSearchParams.status),
    severity: asStringParam(resolvedSearchParams.severity),
    eventType: asStringParam(resolvedSearchParams.eventType),
    q: asStringParam(resolvedSearchParams.q),
    since: normalizeDateFilter(
      asStringParam(resolvedSearchParams.since),
      "start"
    ),
    until: normalizeDateFilter(asStringParam(resolvedSearchParams.until), "end"),
    leadId: asStringParam(resolvedSearchParams.leadId),
    phoneHash: asStringParam(resolvedSearchParams.phoneHash),
    campaignId: asStringParam(resolvedSearchParams.campaignId),
    adSetId: asStringParam(resolvedSearchParams.adSetId),
    adId: asStringParam(resolvedSearchParams.adId),
    errorCode: asStringParam(resolvedSearchParams.errorCode)
  };
  const [diagnosticEvents, workspaceBilling, splitReceivers] = await Promise.all([
    getDiagnosticEvents(diagnosticFilters),
    getWorkspaceBilling(),
    getSplitReceivers()
  ]);
  const activeDiagnosticFilterCount = Object.values(diagnosticFilters).filter(
    Boolean
  ).length;
  const panels = [
    ["Billing", "R$ 18.420", "MRR consolidado, inadimplencia e notas pendentes."],
    ["Split", "94.2%", "Repasse capturado por workspace com divergencias sinalizadas."],
    ["Workspaces", "128", "Operacoes ativas, suspensas e em trial monitoradas."],
    ["Diagnosticos", "7 alertas", "Webhooks, Meta tokens, filas e entregas CAPI."]
  ];
  const receivers =
    splitReceivers.length > 0
      ? splitReceivers
      : [
          {
            id: "fallback_receiver_1",
            name: "Recebedor principal",
            walletId: "wallet_asaas_preview",
            email: "financeiro@wpptrack.local",
            percentageBps: 10000,
            active: true,
            createdAt: "2026-07-02T03:00:00.000Z",
            updatedAt: "2026-07-02T03:00:00.000Z"
          }
        ];

  return (
    <section className="page-stack standalone-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Backoffice interno</span>
          <h1>Backoffice WppTrack</h1>
          <p>Financeiro, split, workspaces e Central de Diagnostico operacional.</p>
        </div>
        <div className="header-actions">
          <span className="status-chip">Jobs online</span>
          <span className="status-chip warn">3 tokens a vencer</span>
        </div>
      </header>

      <div className="backoffice-grid">
        {panels.map(([label, value, description]) => (
          <article className="config-card" key={label}>
            <span className="micro-label">{label}</span>
            <strong>{value}</strong>
            <p className="muted">{description}</p>
          </article>
        ))}
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Workspaces</span>
        <h2>Customers Asaas por workspace</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Slug</th>
                <th>Customer Asaas</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {workspaceBilling.length > 0 ? (
                workspaceBilling.map((workspace) => (
                  <tr key={workspace.id}>
                    <td>
                      <strong>{workspace.name}</strong>
                      <span>{workspace.id}</span>
                    </td>
                    <td>{workspace.slug}</td>
                    <td>
                      <form className="inline-form" action={updateWorkspaceBilling}>
                        <input type="hidden" name="workspaceId" value={workspace.id} />
                        <input
                          aria-label={`Customer Asaas de ${workspace.name}`}
                          className="input-field compact-input"
                          defaultValue={workspace.asaasCustomerId ?? ""}
                          name="asaasCustomerId"
                          placeholder="Configurar customer"
                        />
                        <button className="button" type="submit">Salvar</button>
                      </form>
                    </td>
                    <td>
                      <span className={`event-chip${workspace.asaasCustomerId ? "" : " warn"}`}>
                        {workspace.asaasCustomerId ? "configurado" : "pendente"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td><strong>Nenhum workspace carregado</strong><span>Confira permissao de backoffice</span></td>
                  <td>-</td>
                  <td><span className="muted">Configurar customer</span></td>
                  <td><span className="event-chip warn">sem dados</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Split Asaas</span>
        <h2>Recebedores da plataforma</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recebedor</th>
                <th>Wallet</th>
                <th>Email</th>
                <th>Percentual</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {receivers.map((receiver) => (
                <tr key={receiver.id}>
                  <td><strong>{receiver.name}</strong><span>{receiver.id}</span></td>
                  <td>{receiver.walletId}</td>
                  <td>{receiver.email ?? "sem email"}</td>
                  <td>{percentFromBps(receiver.percentageBps)}</td>
                  <td>
                    <span className={`event-chip${receiver.active ? "" : " warn"}`}>
                      {receiver.active ? "ativo" : "pausado"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Central de diagnostico</span>
        <h2>Saude operacional por camada</h2>
        <form className="filter-bar" aria-label="Filtros de diagnostico" action="/backoffice">
          <input
            className="filter-control"
            name="q"
            placeholder="Buscar erro, evento ou texto"
            defaultValue={diagnosticFilters.q}
          />
          <input
            className="filter-control"
            name="workspaceId"
            placeholder="Workspace"
            defaultValue={diagnosticFilters.workspaceId}
          />
          <select className="filter-control" name="source" defaultValue={diagnosticFilters.source ?? ""}>
            <option value="">Todas as origens</option>
            <option value="meta">Meta</option>
            <option value="uazapi">Uazapi</option>
            <option value="asaas">Asaas</option>
            <option value="internal">Interno</option>
          </select>
          <select className="filter-control" name="severity" defaultValue={diagnosticFilters.severity ?? ""}>
            <option value="">Todas severidades</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>
          <input
            className="filter-control"
            name="status"
            placeholder="Status"
            defaultValue={diagnosticFilters.status}
          />
          <input
            className="filter-control"
            name="eventType"
            placeholder="Tipo de evento"
            defaultValue={diagnosticFilters.eventType}
          />
          <input
            className="filter-control"
            name="since"
            type="date"
            defaultValue={dateInputValue(diagnosticFilters.since)}
          />
          <input
            className="filter-control"
            name="until"
            type="date"
            defaultValue={dateInputValue(diagnosticFilters.until)}
          />
          <input
            className="filter-control"
            name="leadId"
            placeholder="Lead"
            defaultValue={diagnosticFilters.leadId}
          />
          <input
            className="filter-control"
            name="phoneHash"
            placeholder="Telefone hash"
            defaultValue={diagnosticFilters.phoneHash}
          />
          <input
            className="filter-control"
            name="campaignId"
            placeholder="Campanha"
            defaultValue={diagnosticFilters.campaignId}
          />
          <input
            className="filter-control"
            name="adSetId"
            placeholder="Conjunto"
            defaultValue={diagnosticFilters.adSetId}
          />
          <input
            className="filter-control"
            name="adId"
            placeholder="Anuncio"
            defaultValue={diagnosticFilters.adId}
          />
          <input
            className="filter-control"
            name="errorCode"
            placeholder="Codigo do erro"
            defaultValue={diagnosticFilters.errorCode}
          />
          <button className="button" type="submit">Filtrar</button>
          <a className="button ghost" href="/backoffice">Limpar</a>
        </form>
        <p className="muted">
          {activeDiagnosticFilterCount > 0
            ? `${activeDiagnosticFilterCount} filtros ativos`
            : "Mostrando os ultimos eventos recebidos pela plataforma."}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Camada</th>
                <th>Workspaces afetados</th>
                <th>Ultima falha</th>
                <th>SLA</th>
                <th>Estado</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {diagnosticEvents.length > 0 ? (
                diagnosticEvents.map((event) => (
                  <tr key={event.id}>
                    <td><strong>{event.title}</strong><span>{event.message}</span></td>
                    <td>{event.workspaceId ?? "plataforma"}</td>
                    <td>{new Date(event.occurredAt).toLocaleString("pt-BR")}</td>
                    <td>{event.source}</td>
                    <td>
                      <span className={`event-chip${event.severity === "error" || event.severity === "critical" ? " warn" : ""}`}>
                        {event.status}
                      </span>
                    </td>
                    <td>
                      <a className="button ghost" href={`/backoffice/diagnostics/${event.id}`}>
                        Detalhes
                      </a>
                      <form action={retryDiagnosticEvent}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <button className="button" type="submit">Reprocessar</button>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  <tr>
                    <td><strong>WhatsApp sessions</strong><span>Uazapi e reconexao QR</span></td>
                    <td>4</td>
                    <td>ha 9 min</td>
                    <td>99.1%</td>
                    <td><span className="event-chip warn">observacao</span></td>
                    <td><span className="muted">aguardando evento</span></td>
                  </tr>
                  <tr>
                    <td><strong>Meta CAPI</strong><span>Envio e acceptance rate</span></td>
                    <td>1</td>
                    <td>ha 42 min</td>
                    <td>99.7%</td>
                    <td><span className="event-chip">normal</span></td>
                    <td><span className="muted">aguardando evento</span></td>
                  </tr>
                  <tr>
                    <td><strong>Billing split</strong><span>Webhook pagamento e repasse</span></td>
                    <td>2</td>
                    <td>ha 2 h</td>
                    <td>98.8%</td>
                    <td><span className="event-chip">normal</span></td>
                    <td><span className="muted">aguardando evento</span></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
