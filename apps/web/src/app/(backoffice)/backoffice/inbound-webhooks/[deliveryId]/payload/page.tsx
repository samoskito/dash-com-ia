import type {
  BackofficeInboundWebhookPayloadDto,
  InboundWebhookEventClassificationDto,
} from "@wpptrack/shared";
import { formatDateTime } from "../../../../../../lib/date-time";
import { serverApiFetch } from "../../../../../../lib/server-api";

type InboundWebhookPayloadPageProps = {
  params: Promise<{
    deliveryId: string;
  }>;
};

const classificationLabels: Record<
  InboundWebhookEventClassificationDto,
  string
> = {
  eligible_route_resolved: "CTWA com rota resolvida",
  eligible_route_unresolved: "CTWA sem rota resolvida",
  ignored_no_ctwa: "Ignorado sem CTWA",
  ignored_outbound: "Ignorado por ser mensagem de saida",
  ignored_private: "Ignorado por ser evento privado",
  unsupported_event: "Evento nao suportado",
  invalid_payload: "Payload invalido",
};

async function getInboundWebhookPayload(
  deliveryId: string,
): Promise<BackofficeInboundWebhookPayloadDto | null> {
  try {
    return await serverApiFetch<BackofficeInboundWebhookPayloadDto>(
      `/backoffice/inbound-webhooks/deliveries/${deliveryId}/payload`,
    );
  } catch {
    return null;
  }
}

function payloadText(payload: BackofficeInboundWebhookPayloadDto["payload"]) {
  return payload ? JSON.stringify(payload, null, 2) : "";
}

export default async function InboundWebhookPayloadPage({
  params,
}: InboundWebhookPayloadPageProps) {
  const { deliveryId } = await params;
  const result = await getInboundWebhookPayload(deliveryId);

  if (!result) {
    return (
      <section className="page-stack standalone-page">
        <header className="page-header">
          <div>
            <span className="eyebrow">Observacao de webhooks WhatsApp</span>
            <h1>Entrega nao encontrada</h1>
            <p>
              O registro nao existe ou esta sessao nao possui acesso de platform
              owner.
            </p>
          </div>
          <a className="button" href="/backoffice/inbound-webhooks">
            Voltar
          </a>
        </header>
      </section>
    );
  }

  const { delivery, events, payload } = result;
  const metadata = [
    ["Entrega", delivery.id],
    ["Workspace", delivery.workspaceId],
    ["Conexao", delivery.connectionName],
    ["Plataforma", delivery.provider],
    ["Evento recebido", delivery.providerEventType ?? "nao informado"],
    ["Parser", delivery.parserVersion],
    ["Liberacao", delivery.parserReleaseStatus],
    ["Tentativas", String(delivery.attemptCount)],
  ];

  return (
    <section className="page-stack standalone-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Auditoria restrita do payload</span>
          <h1>{delivery.connectionName}</h1>
          <p>
            Comparacao auditada entre a entrega original e a normalizacao do
            parser.
          </p>
        </div>
        <div className="header-actions">
          <span className="status-chip warn">Somente observacao</span>
          <a className="button ghost" href="/backoffice/inbound-webhooks">
            Voltar as entregas
          </a>
        </div>
      </header>

      <div className="action-notice error">
        <strong>Leitura auditada</strong>
        <span>
          Esta abertura foi registrada com ator, workspace, entrega e IP de
          origem. O payload bruto nao e utilizado para criar leads ou enviar
          conversoes.
        </span>
      </div>

      <div className="surface-panel">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Resumo da entrega</span>
            <h2>Contexto de processamento</h2>
          </div>
          <span
            className={`event-chip${
              delivery.status === "failed" ? " bad" : ""
            }`}
          >
            {delivery.status}
          </span>
        </div>
        <div className="diagnostic-detail-grid">
          {metadata.map(([label, value]) => (
            <article className="config-card" key={label}>
              <span className="micro-label">{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="inbound-payload-comparison">
        <section className="surface-panel">
          <span className="eyebrow">Entrada criptografada</span>
          <h2>Payload bruto recebido</h2>
          <p>
            Retencao ate {formatDateTime(delivery.payloadExpiresAt)}. Depois
            disso, o conteudo deixa de estar disponivel.
          </p>
          {delivery.payloadAvailable && payload ? (
            <pre
              className="payload-block inbound-raw-payload"
              data-presentation-sensitive-field="true"
            >
              {payloadText(payload)}
            </pre>
          ) : (
            <div className="inbound-empty-state">
              <strong>Payload bruto indisponivel</strong>
              <p>
                O periodo de retencao terminou ou os campos criptografados ja
                foram removidos. Os metadados seguros continuam preservados.
              </p>
            </div>
          )}
        </section>

        <section className="surface-panel">
          <span className="eyebrow">Saida do parser</span>
          <h2>Eventos normalizados</h2>
          <p>
            {events.length} evento(s) produzidos pelo parser{" "}
            {delivery.parserVersion}.
          </p>
          {events.length > 0 ? (
            <div className="inbound-normalized-events">
              {events.map((event) => (
                <article className="inbound-normalized-event" key={event.id}>
                  <div className="section-heading-row">
                    <strong>
                      {classificationLabels[event.classification]}
                    </strong>
                    <span
                      className={`event-chip${event.hasCtwa ? "" : " neutral"}`}
                    >
                      {event.hasCtwa ? "Com CTWA" : "Sem CTWA"}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Ocorrido</dt>
                      <dd>{formatDateTime(event.occurredAt)}</dd>
                    </div>
                    <div>
                      <dt>Canal</dt>
                      <dd>
                        {event.connectedPhoneSuffix ?? "nao identificado"}
                      </dd>
                    </div>
                    <div>
                      <dt>Mensagem</dt>
                      <dd>{event.externalMessageId ?? "nao informada"}</dd>
                    </div>
                    <div>
                      <dt>Anuncio</dt>
                      <dd>{event.adId ?? "nao informado"}</dd>
                    </div>
                    <div>
                      <dt>Motivo</dt>
                      <dd>{event.classificationReason ?? "classificado"}</dd>
                    </div>
                    <div>
                      <dt>Rota</dt>
                      <dd>
                        {event.resolvedBusinessConnectionId
                          ? "resolvida"
                          : "nao resolvida"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="inbound-empty-state">
              <strong>Nenhum evento normalizado</strong>
              <p>
                Consulte os codigos seguros da entrega para identificar falha de
                parser ou evento ainda nao suportado.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="surface-panel">
        <span className="eyebrow">Diagnostico seguro</span>
        <h2>Resumo sem conteudo pessoal</h2>
        <div className="diagnostic-detail-grid">
          <article className="config-card">
            <span className="micro-label">Classificacao</span>
            <strong>{delivery.classification ?? "pendente"}</strong>
          </article>
          <article className="config-card">
            <span className="micro-label">Erro de parser</span>
            <strong>{delivery.parseErrorCode ?? "nenhum"}</strong>
          </article>
          <article className="config-card">
            <span className="micro-label">Erro de rota</span>
            <strong>{delivery.routingErrorCode ?? "nenhum"}</strong>
          </article>
          <article className="config-card">
            <span className="micro-label">Ultimo recebimento</span>
            <strong>{formatDateTime(delivery.lastReceivedAt)}</strong>
          </article>
        </div>
        {delivery.normalizedSummary ? (
          <pre className="payload-block compact">
            {JSON.stringify(delivery.normalizedSummary, null, 2)}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
