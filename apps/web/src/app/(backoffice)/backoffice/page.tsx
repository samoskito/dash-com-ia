import type { DiagnosticEventDto } from "@wpptrack/shared";
import { apiFetch } from "../../../lib/api";

async function getDiagnosticEvents(): Promise<DiagnosticEventDto[]> {
  try {
    return await apiFetch<DiagnosticEventDto[]>("/backoffice/diagnostics/events?limit=5");
  } catch {
    return [];
  }
}

export default async function BackofficePage() {
  const diagnosticEvents = await getDiagnosticEvents();
  const panels = [
    ["Billing", "R$ 18.420", "MRR consolidado, inadimplencia e notas pendentes."],
    ["Split", "94.2%", "Repasse capturado por workspace com divergencias sinalizadas."],
    ["Workspaces", "128", "Operacoes ativas, suspensas e em trial monitoradas."],
    ["Diagnosticos", "7 alertas", "Webhooks, Meta tokens, filas e entregas CAPI."]
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
                  </tr>
                  <tr>
                    <td><strong>Meta CAPI</strong><span>Envio e acceptance rate</span></td>
                    <td>1</td>
                    <td>ha 42 min</td>
                    <td>99.7%</td>
                    <td><span className="event-chip">normal</span></td>
                  </tr>
                  <tr>
                    <td><strong>Billing split</strong><span>Webhook pagamento e repasse</span></td>
                    <td>2</td>
                    <td>ha 2 h</td>
                    <td>98.8%</td>
                    <td><span className="event-chip">normal</span></td>
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
