import type {
  BackofficeInboundWebhookReplayBatchDto,
  BackofficeInboundWebhookReplayPreviewDto,
  InboundWebhookReplayStatusDto,
} from "@wpptrack/shared";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  ShieldAlert,
} from "lucide-react";
import {
  BackofficeActionForm,
} from "../../../../../../components/backoffice-action-form";
import { BackofficeNavigation } from "../../../../../../components/backoffice-navigation";
import { InboundReplaySubmitButton } from "../../../../../../components/inbound-replay-submit-button";
import { formatDateTime } from "../../../../../../lib/date-time";
import { serverApiFetch } from "../../../../../../lib/server-api";
import {
  authorizeInboundWebhookReplayAction,
  certifyInboundWebhookParserAction,
} from "../actions";

type PreviewResult = {
  data: BackofficeInboundWebhookReplayPreviewDto | null;
  state: "real" | "error";
};

async function getPreview(connectionId: string): Promise<PreviewResult> {
  try {
    const data =
      await serverApiFetch<BackofficeInboundWebhookReplayPreviewDto>(
        `/backoffice/inbound-webhooks/connections/${encodeURIComponent(connectionId)}/replay-preview`,
      );

    return { data, state: "real" };
  } catch {
    return { data: null, state: "error" };
  }
}

function replayStatusLabel(status: InboundWebhookReplayStatusDto): string {
  switch (status) {
    case "queued":
      return "Na fila";
    case "processing":
      return "Processando";
    case "completed":
      return "Concluido";
    case "completed_with_failures":
      return "Concluido com falhas";
    case "failed":
      return "Falhou";
  }
}

function replayStatusTone(
  status: InboundWebhookReplayStatusDto,
): "bad" | "good" | "neutral" | "warn" {
  if (status === "completed") {
    return "good";
  }

  if (status === "failed") {
    return "bad";
  }

  if (status === "completed_with_failures") {
    return "warn";
  }

  return "neutral";
}

function BatchSummary({
  batch,
}: {
  batch: BackofficeInboundWebhookReplayBatchDto;
}) {
  return (
    <div className="inbound-replay-batch">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">Ultimo lote</span>
          <h2>Resultado do replay</h2>
        </div>
        <span className={`status-chip ${replayStatusTone(batch.status)}`}>
          {replayStatusLabel(batch.status)}
        </span>
      </div>
      <div className="inbound-replay-batch-grid">
        <span>
          <small>Selecionados</small>
          <strong>{batch.totalItems}</strong>
        </span>
        <span>
          <small>Materializados</small>
          <strong>{batch.materializedCount}</strong>
        </span>
        <span>
          <small>Duplicados</small>
          <strong>{batch.duplicateCount}</strong>
        </span>
        <span>
          <small>Ignorados</small>
          <strong>{batch.skippedCount}</strong>
        </span>
        <span>
          <small>Falhas</small>
          <strong>{batch.failedCount}</strong>
        </span>
        <span>
          <small>Criado em</small>
          <strong>{formatDateTime(batch.createdAt)}</strong>
        </span>
      </div>
    </div>
  );
}

export default async function InboundWebhookReplayPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const result = await getPreview(connectionId);
  const preview = result.data;

  if (result.state === "error" || !preview) {
    return (
      <section className="page-stack standalone-page inbound-replay-page">
        <BackofficeNavigation active="webhooks" />
        <header className="page-header">
          <div>
            <span className="eyebrow">Replay controlado</span>
            <h1>Conexao indisponivel</h1>
            <p>
              O registro nao existe ou esta sessao nao possui acesso de
              platform owner.
            </p>
          </div>
          <a className="button ghost" href="/backoffice/inbound-webhooks">
            <ArrowLeft aria-hidden="true" size={17} strokeWidth={2} />
            Voltar
          </a>
        </header>
      </section>
    );
  }

  const parserCertified = preview.parserRelease.status === "certified";
  const parserRetired = preview.parserRelease.status === "retired";
  const activeBatch =
    preview.latestBatch?.status === "queued" ||
    preview.latestBatch?.status === "processing";
  const connectionReady = preview.connection.status === "observation";
  const canReplay =
    parserCertified &&
    preview.replayEnabled &&
    connectionReady &&
    preview.counts.eligible > 0 &&
    !activeBatch;

  return (
    <section className="page-stack standalone-page inbound-replay-page">
      <BackofficeNavigation active="webhooks" />

      <header className="page-header inbound-replay-header">
        <div>
          <span className="eyebrow">Replay controlado Umbler</span>
          <h1>{preview.connection.displayName}</h1>
          <p>
            Reprocesse somente eventos CTWA com payload retido e rota Meta
            completa.
          </p>
        </div>
        <a className="button ghost" href="/backoffice/inbound-webhooks">
          <ArrowLeft aria-hidden="true" size={17} strokeWidth={2} />
          Entregas
        </a>
      </header>

      <div className="inbound-replay-safety-banner">
        <LockKeyhole aria-hidden="true" size={20} strokeWidth={2} />
        <span>
          <strong>A observacao continua isolada</strong>
          <span>
            Nenhuma entrega e processada automaticamente. O lote abaixo exige
            certificacao, trava de ambiente e confirmacao manual.
          </span>
        </span>
      </div>

      <section className="inbound-replay-overview">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Escopo redigido</span>
            <h2>Eventos preservados</h2>
          </div>
          <span className="event-chip neutral">
            {preview.oldestOccurredAt && preview.newestOccurredAt
              ? `${formatDateTime(preview.oldestOccurredAt)} a ${formatDateTime(preview.newestOccurredAt)}`
              : "Sem janela disponivel"}
          </span>
        </div>
        <div className="inbound-replay-metrics">
          <span>
            <small>CTWA observados</small>
            <strong>{preview.counts.totalCtwa}</strong>
          </span>
          <span>
            <small>Rota completa</small>
            <strong>{preview.counts.routeResolved}</strong>
          </span>
          <span>
            <small>Sem rota</small>
            <strong>{preview.counts.routeUnresolved}</strong>
          </span>
          <span>
            <small>Payload disponivel</small>
            <strong>{preview.counts.payloadAvailable}</strong>
          </span>
          <span>
            <small>Payload expirado</small>
            <strong>{preview.counts.payloadExpired}</strong>
          </span>
          <span>
            <small>Payload removido</small>
            <strong>{preview.counts.payloadUnavailable}</strong>
          </span>
          <span>
            <small>Ja materializados</small>
            <strong>{preview.counts.alreadyMaterialized}</strong>
          </span>
          <span className="eligible">
            <small>Elegiveis agora</small>
            <strong>{preview.counts.eligible}</strong>
          </span>
        </div>
      </section>

      <section className="inbound-replay-readiness">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Barreiras de seguranca</span>
            <h2>Prontidao do lote</h2>
          </div>
        </div>

        <div className="inbound-replay-check-list">
          <div className={parserCertified ? "good" : "warn"}>
            {parserCertified ? (
              <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            ) : (
              <ShieldAlert aria-hidden="true" size={20} strokeWidth={2} />
            )}
            <span>
              <strong>Parser {preview.parserRelease.version}</strong>
              <small>
                {parserCertified
                  ? preview.parserRelease.certifiedAt
                    ? `Certificado em ${formatDateTime(preview.parserRelease.certifiedAt)}`
                    : "Parser certificado."
                  : parserRetired
                    ? "Parser retirado; esta versao nao pode ser certificada."
                    : "A certificacao exige ao menos um CTWA real processado."}
              </small>
            </span>
            {!parserCertified && !parserRetired ? (
              <BackofficeActionForm
                action={certifyInboundWebhookParserAction}
                className="inbound-replay-inline-action"
              >
                <input
                  type="hidden"
                  name="connectionId"
                  value={preview.connection.id}
                />
                <input
                  type="hidden"
                  name="releaseId"
                  value={preview.parserRelease.id}
                />
                <InboundReplaySubmitButton mode="certify" />
              </BackofficeActionForm>
            ) : null}
          </div>

          <div className={preview.replayEnabled ? "good" : "warn"}>
            {preview.replayEnabled ? (
              <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            ) : (
              <LockKeyhole aria-hidden="true" size={20} strokeWidth={2} />
            )}
            <span>
              <strong>Trava do ambiente</strong>
              <small>
                {preview.replayEnabled
                  ? "Replay manual liberado na API."
                  : "INBOUND_WEBHOOK_REPLAY_ENABLED permanece desativada."}
              </small>
            </span>
          </div>

          <div className={connectionReady ? "good" : "warn"}>
            {connectionReady ? (
              <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            ) : (
              <Clock3 aria-hidden="true" size={20} strokeWidth={2} />
            )}
            <span>
              <strong>Conexao em observacao</strong>
              <small>
                {connectionReady
                  ? "A origem permanece recebendo e classificando eventos."
                  : "Retome a conexao em observacao antes do replay."}
              </small>
            </span>
          </div>
        </div>
      </section>

      {preview.latestBatch ? (
        <BatchSummary batch={preview.latestBatch} />
      ) : null}

      <section className="inbound-replay-authorization">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Autorizacao final</span>
            <h2>Materializar eventos elegiveis</h2>
          </div>
          <span className={`status-chip ${canReplay ? "good" : "warn"}`}>
            {canReplay ? "Pronto" : "Bloqueado"}
          </span>
        </div>

        {canReplay ? (
          <BackofficeActionForm
            action={authorizeInboundWebhookReplayAction}
            className="inbound-replay-confirmation"
          >
            <input
              type="hidden"
              name="connectionId"
              value={preview.connection.id}
            />
            <label>
              <span>
                Digite exatamente <strong>{preview.connection.displayName}</strong>
              </span>
              <input
                name="confirmation"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                spellCheck={false}
                placeholder="Nome exato da conexao"
              />
            </label>
            <InboundReplaySubmitButton mode="replay" />
          </BackofficeActionForm>
        ) : (
          <div className="inbound-replay-blocked">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>O lote ainda nao pode ser autorizado</strong>
              <span>
                {activeBatch
                  ? "Ja existe um replay em andamento para esta conexao."
                  : preview.counts.eligible === 0
                    ? "Associe as rotas Meta enquanto o payload ainda esta retido."
                    : "Conclua as barreiras de seguranca exibidas acima."}
              </span>
            </span>
          </div>
        )}
      </section>
    </section>
  );
}
