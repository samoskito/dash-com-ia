import type {
  BackofficeInboundWebhookReplayBatchDto,
  BackofficeInboundWebhookReplayPreviewDto,
  InboundWebhookReplaySelectionDto,
  InboundWebhookReplayStatusDto,
} from "@wpptrack/shared";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  ShieldAlert,
} from "lucide-react";
import { BackofficeActionForm } from "../../../../../../components/backoffice-action-form";
import { BackofficeNavigation } from "../../../../../../components/backoffice-navigation";
import { InboundReplaySubmitButton } from "../../../../../../components/inbound-replay-submit-button";
import { formatDateTime } from "../../../../../../lib/date-time";
import { serverApiFetch } from "../../../../../../lib/server-api";
import {
  authorizeInboundWebhookReplayAction,
  certifyInboundWebhookParserAction,
  retryInboundWebhookReplayAction,
} from "../actions";

type PreviewResult = {
  data: BackofficeInboundWebhookReplayPreviewDto | null;
  state: "real" | "error";
};

async function getPreview(connectionId: string): Promise<PreviewResult> {
  try {
    const data = await serverApiFetch<BackofficeInboundWebhookReplayPreviewDto>(
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

function selectionLabel(selection: InboundWebhookReplaySelectionDto): string {
  switch (selection) {
    case "canary_1":
      return "Canario de 1";
    case "canary_5":
      return "Canario de 5";
    case "canary_10":
      return "Canario de 10";
    case "remaining":
      return "Restante";
  }
}

function effectiveSelectionCount(
  selection: InboundWebhookReplaySelectionDto,
  eligible: number,
): number {
  const limits: Record<InboundWebhookReplaySelectionDto, number> = {
    canary_1: 1,
    canary_5: 5,
    canary_10: 10,
    remaining: 500,
  };

  return Math.min(limits[selection], eligible);
}

function expirySummary(value: string | null): {
  detail: string;
  label: string;
  tone: "bad" | "neutral" | "warn";
} {
  if (!value) {
    return {
      detail: "Nenhum payload pendente permanece disponivel.",
      label: "Sem prazo ativo",
      tone: "neutral",
    };
  }

  const remainingMs = new Date(value).getTime() - Date.now();

  if (remainingMs <= 0) {
    return {
      detail: `Prazo registrado em ${formatDateTime(value)}.`,
      label: "Payload expirando",
      tone: "bad",
    };
  }

  const remainingHours = Math.ceil(remainingMs / 3_600_000);
  const days = Math.floor(remainingHours / 24);
  const hours = remainingHours % 24;
  const duration = days > 0 ? `${days}d ${hours}h` : `${remainingHours}h`;

  return {
    detail: `Proximo vencimento em ${formatDateTime(value)}.`,
    label: `${duration} restantes`,
    tone: remainingHours <= 48 ? "warn" : "neutral",
  };
}

function BatchSummary({
  batch,
  connectionId,
  connectionName,
  retryAllowed,
  channelLabel,
}: {
  batch: BackofficeInboundWebhookReplayBatchDto;
  connectionId: string;
  connectionName: string;
  retryAllowed: boolean;
  channelLabel: string | null;
}) {
  return (
    <article className="inbound-replay-batch">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">{selectionLabel(batch.selection)}</span>
          <h3>Lote de {formatDateTime(batch.createdAt)}</h3>
          {channelLabel ? <small>Canal: {channelLabel}</small> : null}
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
          <small>Recuperacoes</small>
          <strong>{batch.retryCount}</strong>
        </span>
      </div>
      {retryAllowed && batch.retryableFailedCount > 0 ? (
        <BackofficeActionForm
          action={retryInboundWebhookReplayAction}
          className="inbound-replay-retry"
        >
          <input type="hidden" name="connectionId" value={connectionId} />
          <input type="hidden" name="batchId" value={batch.id} />
          <label>
            <span>
              {batch.retryableFailedCount} falha(s) transitoria(s). Digite{" "}
              <strong>{connectionName}</strong> para recuperar.
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
          <InboundReplaySubmitButton mode="retry" />
        </BackofficeActionForm>
      ) : null}
    </article>
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
              O registro nao existe ou esta sessao nao possui acesso de platform
              owner.
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
  const expiry = expirySummary(preview.nextPayloadExpiresAt);
  const defaultChannel = preview.channels.find(
    (channel) => channel.eligible > 0,
  );
  const canReplay =
    parserCertified &&
    preview.replayEnabled &&
    connectionReady &&
    preview.counts.eligible > 0 &&
    Boolean(defaultChannel) &&
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
        <div className={`inbound-replay-expiry ${expiry.tone}`}>
          <Clock3 aria-hidden="true" size={20} strokeWidth={2} />
          <span>
            <strong>{expiry.label}</strong>
            <small>{expiry.detail}</small>
          </span>
        </div>
      </section>

      <section className="inbound-replay-channel-scope">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Escopo do canario</span>
            <h2>Canais desta conexao</h2>
          </div>
          <span className="event-chip neutral">
            {preview.channels.length} canal(is)
          </span>
        </div>
        <div className="inbound-replay-channel-list">
          {preview.channels.map((channel) => (
            <div key={channel.id}>
              <span>
                <strong>{channel.displayName}</strong>
                <small>{channel.connectedPhone ?? "Numero indisponivel"}</small>
              </span>
              <span>
                <small>CTWA</small>
                <strong>{channel.totalCtwa}</strong>
              </span>
              <span>
                <small>Rota completa</small>
                <strong>{channel.routeResolved}</strong>
              </span>
              <span className={channel.eligible > 0 ? "eligible" : ""}>
                <small>Elegiveis</small>
                <strong>{channel.eligible}</strong>
              </span>
            </div>
          ))}
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

      {preview.recentBatches.length > 0 ? (
        <section className="inbound-replay-history">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Historico operacional</span>
              <h2>Ultimos lotes</h2>
            </div>
            <span className="event-chip neutral">
              {preview.recentBatches.length} lote(s)
            </span>
          </div>
          <div className="inbound-replay-history-list">
            {preview.recentBatches.map((batch) => (
              <BatchSummary
                key={batch.id}
                batch={batch}
                connectionId={preview.connection.id}
                connectionName={preview.connection.displayName}
                retryAllowed={preview.replayEnabled && !activeBatch}
                channelLabel={
                  batch.channelId
                    ? (preview.channels.find(
                        (channel) => channel.id === batch.channelId,
                      )?.displayName ?? "Canal removido")
                    : null
                }
              />
            ))}
          </div>
        </section>
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
              <span>Canal que sera reprocessado</span>
              <select
                name="channelId"
                required
                defaultValue={defaultChannel?.id}
              >
                {preview.channels
                  .filter((channel) => channel.eligible > 0)
                  .map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.displayName} - {channel.eligible} elegivel(is)
                    </option>
                  ))}
              </select>
            </label>
            <fieldset className="inbound-replay-selection">
              <legend>Escolha o tamanho do lote real</legend>
              <div className="inbound-replay-selection-grid">
                {(
                  [
                    ["canary_1", "1 evento", "Primeiro teste real"],
                    ["canary_5", "5 eventos", "Segunda validacao"],
                    ["canary_10", "10 eventos", "Expansao controlada"],
                    ["remaining", "Restante", "Maximo de 500"],
                  ] as const
                ).map(([value, label, detail]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="selection"
                      value={value}
                      defaultChecked={value === "canary_1"}
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {detail} -{" "}
                        {effectiveSelectionCount(
                          value,
                          preview.counts.eligible,
                        )}{" "}
                        selecionado(s)
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>
                Digite exatamente{" "}
                <strong>{preview.connection.displayName}</strong>
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
