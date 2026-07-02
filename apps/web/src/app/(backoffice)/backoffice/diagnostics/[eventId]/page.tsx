import type { DiagnosticEventDetailDto } from "@wpptrack/shared";
import { serverApiFetch } from "../../../../../lib/server-api";

type DiagnosticEventPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

async function getDiagnosticEvent(
  eventId: string
): Promise<DiagnosticEventDetailDto | null> {
  try {
    return await serverApiFetch<DiagnosticEventDetailDto>(
      `/backoffice/diagnostics/events/${eventId}`
    );
  } catch {
    return null;
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
        reason: "Retry solicitado na tela de detalhe do backoffice WppTrack"
      })
    });
  } catch {
    return;
  }
}

function payloadText(payload: DiagnosticEventDetailDto["summaryPayload"]) {
  if (!payload) {
    return "{}";
  }

  return JSON.stringify(payload, null, 2);
}

export default async function DiagnosticEventPage({
  params
}: DiagnosticEventPageProps) {
  const { eventId } = await params;
  const event = await getDiagnosticEvent(eventId);

  if (!event) {
    return (
      <section className="page-stack standalone-page">
        <header className="page-header">
          <div>
            <span className="eyebrow">Central de diagnostico</span>
            <h1>Evento nao encontrado</h1>
            <p>O evento solicitado nao foi localizado ou a sessao nao tem acesso.</p>
          </div>
          <a className="button" href="/backoffice">Voltar</a>
        </header>
      </section>
    );
  }

  const metadata = [
    ["Evento", event.id],
    ["Workspace", event.workspaceId ?? "plataforma"],
    ["Fonte", event.source],
    ["Tipo", event.eventType],
    ["Status", event.status],
    ["Severidade", event.severity],
    ["Codigo", event.errorCode ?? "-"],
    ["Lead", event.leadId ?? "-"],
    ["Telefone", event.phoneHash ?? "-"],
    ["Campanha", event.campaignId ?? "-"],
    ["Conjunto", event.adSetId ?? "-"],
    ["Anuncio", event.adId ?? "-"],
    ["Job", event.jobId ?? "-"]
  ];

  return (
    <section className="page-stack standalone-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Central de diagnostico</span>
          <h1>{event.title}</h1>
          <p>{event.message}</p>
        </div>
        <div className="header-actions">
          <span className={`event-chip${event.severity === "error" || event.severity === "critical" ? " warn" : ""}`}>
            {event.status}
          </span>
          <a className="button" href="/backoffice">Voltar</a>
        </div>
      </header>

      <div className="surface-panel">
        <span className="eyebrow">Resumo</span>
        <h2>Dados do evento</h2>
        <div className="diagnostic-detail-grid">
          {metadata.map(([label, value]) => (
            <article className="config-card" key={label}>
              <span className="micro-label">{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Payload sanitizado</span>
        <h2>Resposta e contexto tecnico</h2>
        <pre className="payload-block">{payloadText(event.summaryPayload)}</pre>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Acao operacional</span>
        <h2>Reprocessamento auditado</h2>
        <p className="muted">
          O retry cria trilha de auditoria e tentativa de job sem expor credenciais externas.
        </p>
        <form className="action-row" action={retryDiagnosticEvent}>
          <input type="hidden" name="eventId" value={event.id} />
          <button className="button primary" type="submit">Reprocessar evento</button>
        </form>
      </div>
    </section>
  );
}
