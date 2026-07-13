import type { LeadDetailDto } from "@wpptrack/shared";
import Link from "next/link";
import { formatDateTime } from "../../../../lib/date-time";
import { serverApiFetch } from "../../../../lib/server-api";
import { CreativePreview } from "./creative-preview";

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
      state: "real",
    };
  } catch {
    return {
      detail: null,
      state: "error",
    };
  }
}

function dateTime(value: string | null) {
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

function statusTone(status: string) {
  return ["error", "failed", "not_configured", "pending_meta_context"].includes(
    status,
  )
    ? " warn"
    : "";
}

function eventStatusLabel(status: string) {
  if (status === "imported") {
    return "Importado";
  }

  if (status === "shadow_observed") {
    return "Observado em sombra";
  }

  return status === "not_eligible" ? "Nao elegivel para CAPI" : status;
}

function AttributionStep({
  id,
  index,
  label,
  name,
}: {
  id: string | null;
  index: string;
  label: string;
  name: string | null;
}) {
  const resolvedName = name ?? "Nao resolvido";

  return (
    <li className="lead-attribution-step">
      <div className="lead-attribution-meta">
        <span>{index}</span>
        <span>{label}</span>
      </div>
      <strong title={resolvedName}>{resolvedName}</strong>
      <small title={id ?? undefined}>
        {id ? `ID ${id}` : "ID indisponivel"}
      </small>
    </li>
  );
}

export default async function LeadDetailPage({
  params,
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
            <Link className="button" href="/leads">
              Voltar
            </Link>
          </div>
        </header>
      </section>
    );
  }

  const { lead } = detail;

  return (
    <section className="page-stack lead-detail-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Lead</span>
          <h1>{lead.name ?? "Lead sem nome"}</h1>
          <p>{lead.phoneDisplay ?? lead.phoneHash}</p>
        </div>
        <div className="header-actions">
          <span className="status-chip">{lead.status}</span>
          <Link className="button" href="/leads">
            Voltar
          </Link>
        </div>
      </header>

      <div
        className={`lead-attribution-layout${lead.adId ? " has-creative" : ""}`}
      >
        <section className="lead-attribution-panel">
          <header className="lead-attribution-heading">
            <span className="eyebrow">Atribuicao</span>
            <h2>Origem do anuncio</h2>
          </header>

          <ol className="lead-attribution-path">
            <AttributionStep
              id={lead.campaignId}
              index="01"
              label="Campanha"
              name={detail.attribution.campaignName}
            />
            <AttributionStep
              id={lead.adSetId}
              index="02"
              label="Conjunto"
              name={detail.attribution.adSetName ?? lead.adSetId}
            />
            <AttributionStep
              id={lead.adId}
              index="03"
              label="Anuncio"
              name={detail.attribution.adName ?? lead.adId}
            />
          </ol>

          <footer className="lead-latest-event">
            <span className="micro-label">Ultimo evento</span>
            <strong>{lead.lastEventName ?? "Sem evento"}</strong>
          </footer>
        </section>

        {lead.adId ? (
          <CreativePreview
            adName={detail.attribution.adName ?? lead.adId}
            destinationUrl={detail.attribution.creative?.destinationUrl ?? null}
            thumbnailUrl={detail.attribution.creative?.thumbnailUrl ?? null}
          />
        ) : null}
      </div>

      <section className="lead-detail-section">
        <header className="lead-detail-section-header">
          <span className="eyebrow">Jornada</span>
          <h2>Rastreamento do lead</h2>
        </header>
        <dl className="lead-facts">
          <div>
            <dt>Origem</dt>
            <dd>{lead.source ?? "-"}</dd>
          </div>
          <div>
            <dt>Primeira mensagem</dt>
            <dd>{dateTime(lead.firstMessageAt)}</dd>
          </div>
          <div>
            <dt>Ultima mensagem</dt>
            <dd>{dateTime(lead.lastMessageAt)}</dd>
          </div>
          <div>
            <dt>IDs Meta</dt>
            <dd>
              {[lead.campaignId, lead.adSetId, lead.adId]
                .filter(Boolean)
                .join(" / ") || "-"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="lead-detail-section">
        <header className="lead-detail-section-header">
          <span className="eyebrow">Conversoes</span>
          <h2>Eventos do Pixel/CAPI</h2>
        </header>
        <div className="table-wrap lead-detail-table">
          <table>
            <thead>
              <tr>
                <th>Evento</th>
                <th>Status</th>
                <th>Gatilho</th>
                <th>Pixel</th>
                <th>Ocorrido em</th>
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
                        {eventStatusLabel(event.status)}
                      </span>
                      {event.errorMessage ? (
                        <span>{event.errorMessage}</span>
                      ) : null}
                    </td>
                    <td>{event.sourceTrigger}</td>
                    <td>{event.pixelId ?? "-"}</td>
                    <td>{dateTime(event.occurredAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <strong>Nenhum evento de conversao</strong>
                    <span>
                      Eventos por palavra-chave ou etiqueta aparecerao aqui.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lead-detail-section">
        <header className="lead-detail-section-header">
          <span className="eyebrow">Webhooks</span>
          <h2>Webhook Uazapi e diagnosticos vinculados</h2>
        </header>
        <div className="table-wrap lead-detail-table">
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
                      <span>
                        {event.eventType} / {event.id}
                      </span>
                    </td>
                    <td>
                      <span className={`event-chip${statusTone(event.status)}`}>
                        {event.status}
                      </span>
                      {event.errorMessage ? (
                        <span>{event.errorMessage}</span>
                      ) : null}
                    </td>
                    <td>{dateTime(event.receivedAt)}</td>
                    <td>{dateTime(event.processedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <strong>Nenhum webhook vinculado</strong>
                    <span>
                      Quando houver logs com este lead/telefone, eles aparecerao
                      aqui.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
