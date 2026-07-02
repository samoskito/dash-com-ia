import type {
  DiagnosticEventDto,
  SplitReceiverDto,
  WorkspaceBillingDto
} from "@wpptrack/shared";
import { serverApiFetch } from "../../../lib/server-api";

async function getDiagnosticEvents(): Promise<DiagnosticEventDto[]> {
  try {
    return await serverApiFetch<DiagnosticEventDto[]>("/backoffice/diagnostics/events?limit=5");
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

export default async function BackofficePage() {
  const [diagnosticEvents, workspaceBilling, splitReceivers] = await Promise.all([
    getDiagnosticEvents(),
    getWorkspaceBilling(),
    getSplitReceivers()
  ]);
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
