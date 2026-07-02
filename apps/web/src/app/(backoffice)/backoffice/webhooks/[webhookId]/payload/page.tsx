import type { DiagnosticWebhookPayloadDto } from "@wpptrack/shared";
import { serverApiFetch } from "../../../../../../lib/server-api";

type WebhookPayloadPageProps = {
  params: Promise<{
    webhookId: string;
  }>;
};

async function getWebhookPayload(
  webhookId: string
): Promise<DiagnosticWebhookPayloadDto | null> {
  try {
    return await serverApiFetch<DiagnosticWebhookPayloadDto>(
      `/backoffice/diagnostics/webhooks/${webhookId}/payload`
    );
  } catch {
    return null;
  }
}

function payloadText(payload: DiagnosticWebhookPayloadDto["payload"]) {
  if (!payload) {
    return "{}";
  }

  return JSON.stringify(payload, null, 2);
}

export default async function WebhookPayloadPage({
  params
}: WebhookPayloadPageProps) {
  const { webhookId } = await params;
  const webhook = await getWebhookPayload(webhookId);

  if (!webhook) {
    return (
      <section className="page-stack standalone-page">
        <header className="page-header">
          <div>
            <span className="eyebrow">Central de diagnostico</span>
            <h1>Webhook nao encontrado</h1>
            <p>O payload solicitado nao foi localizado ou a sessao nao tem acesso.</p>
          </div>
          <a className="button" href="/backoffice">Voltar</a>
        </header>
      </section>
    );
  }

  const metadata = [
    ["Webhook", webhook.id],
    ["Workspace", webhook.workspaceId ?? "plataforma"],
    ["Fonte", webhook.source],
    ["Tipo", webhook.eventType],
    ["Evento externo", webhook.externalEventId ?? "-"],
    ["Status", webhook.status],
    ["Recebido em", webhook.receivedAt],
    ["Payload", webhook.payloadAvailable ? webhook.payloadKind : "indisponivel"]
  ];

  return (
    <section className="page-stack standalone-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Central de diagnostico</span>
          <h1>Payload do webhook</h1>
          <p>Visualizacao sanitizada e auditada para suporte operacional.</p>
        </div>
        <div className="header-actions">
          <span className="event-chip">{webhook.status}</span>
          <a className="button" href="/backoffice">Voltar</a>
        </div>
      </header>

      <div className="surface-panel">
        <span className="eyebrow">Resumo</span>
        <h2>Dados do webhook</h2>
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
        <h2>Resumo armazenado</h2>
        <pre className="payload-block">{payloadText(webhook.payload)}</pre>
      </div>
    </section>
  );
}
