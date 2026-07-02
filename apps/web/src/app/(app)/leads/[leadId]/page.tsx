import type { LeadDetailDto } from "@wpptrack/shared";
import Link from "next/link";
import { serverApiFetch } from "../../../../lib/server-api";

type LeadDetailParams = {
  leadId: string;
};

type LeadDetailResult = {
  detail: LeadDetailDto | null;
  state: "real" | "error";
};

async function getLeadDetail(leadId: string): Promise<LeadDetailResult> {
  try {
    return {
      detail: await serverApiFetch<LeadDetailDto>(`/leads/${leadId}`),
      state: "real"
    };
  } catch {
    return {
      detail: null,
      state: "error"
    };
  }
}

function dateTime(value: string | null) {
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

function statusTone(status: string) {
  return ["error", "failed", "not_configured", "pending_meta_context"].includes(status)
    ? " warn"
    : "";
}

export default async function LeadDetailPage({
  params
}: {
  params: Promise<LeadDetailParams>;
}) {
  const { leadId } = await params;
  const result = await getLeadDetail(leadId);
  const detail = result.detail;

  if (!detail) {
    return (
      <section className="page-stack">
        <header className="page-header">
          <div>
            <span className="eyebrow">Leads</span>
            <h1>Nao foi possivel carregar o lead</h1>
            <p>Confira a API antes de analisar a jornada deste contato.</p>
          </div>
          <div className="header-actions">
            <span className="status-chip warn">API indisponivel</span>
            <Link className="button" href="/leads">Voltar</Link>
          </div>
        </header>
      </section>
    );
  }

  const { lead } = detail;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Lead</span>
          <h1>{lead.name ?? "Lead sem nome"}</h1>
          <p>{lead.phoneDisplay ?? lead.phoneHash}</p>
        </div>
        <div className="header-actions">
          <span className="status-chip">{lead.status}</span>
          <span className="status-chip warn">Score {lead.score}</span>
          <Link className="button" href="/leads">Voltar</Link>
        </div>
      </header>

      <div className="metric-grid compact">
        <div className="metric-card">
          <span className="micro-label">Campanha</span>
          <strong>{detail.attribution.campaignName ?? "Nao resolvida"}</strong>
        </div>
        <div className="metric-card">
          <span className="micro-label">Conjunto</span>
          <strong>{detail.attribution.adSetName ?? lead.adSetId ?? "-"}</strong>
        </div>
        <div className="metric-card">
          <span className="micro-label">Anuncio</span>
          <strong>{detail.attribution.adName ?? lead.adId ?? "-"}</strong>
        </div>
        <div className="metric-card">
          <span className="micro-label">Ultimo evento</span>
          <strong>{lead.lastEventName ?? "Sem evento"}</strong>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Jornada</span>
        <h2>Rastreamento do lead</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <td>Origem</td>
                <td>{lead.source ?? "-"}</td>
              </tr>
              <tr>
                <td>Primeira mensagem</td>
                <td>{dateTime(lead.firstMessageAt)}</td>
              </tr>
              <tr>
                <td>Ultima mensagem</td>
                <td>{dateTime(lead.lastMessageAt)}</td>
              </tr>
              <tr>
                <td>IDs Meta</td>
                <td>{[lead.campaignId, lead.adSetId, lead.adId].filter(Boolean).join(" / ") || "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Conversoes</span>
        <h2>Eventos do Pixel/CAPI</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Evento</th>
                <th>Status</th>
                <th>Gatilho</th>
                <th>Pixel</th>
                <th>Enviado</th>
              </tr>
            </thead>
            <tbody>
              {detail.conversionEvents.length > 0 ? (
                detail.conversionEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.eventName}</strong>
                      <span>{event.id}</span>
                    </td>
                    <td>
                      <span className={`event-chip${statusTone(event.status)}`}>
                        {event.status}
                      </span>
                      {event.errorMessage ? <span>{event.errorMessage}</span> : null}
                    </td>
                    <td>{event.sourceTrigger}</td>
                    <td>{event.pixelId ?? "-"}</td>
                    <td>{dateTime(event.sentAt ?? event.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <strong>Nenhum evento de conversao</strong>
                    <span>Eventos por palavra-chave ou etiqueta aparecerao aqui.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Webhooks</span>
        <h2>Webhook Uazapi e diagnosticos vinculados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Webhook</th>
                <th>Status</th>
                <th>Recebido</th>
                <th>Processado</th>
              </tr>
            </thead>
            <tbody>
              {detail.webhookEvents.length > 0 ? (
                detail.webhookEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>Webhook {event.source}</strong>
                      <span>{event.eventType} / {event.id}</span>
                    </td>
                    <td>
                      <span className={`event-chip${statusTone(event.status)}`}>
                        {event.status}
                      </span>
                      {event.errorMessage ? <span>{event.errorMessage}</span> : null}
                    </td>
                    <td>{dateTime(event.receivedAt)}</td>
                    <td>{dateTime(event.processedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <strong>Nenhum webhook vinculado</strong>
                    <span>Quando houver logs com este lead/telefone, eles aparecerao aqui.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
