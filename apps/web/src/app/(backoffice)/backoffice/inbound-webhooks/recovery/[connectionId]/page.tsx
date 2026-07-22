import type {
  BackofficeInboundWebhookProductionRecoveryPreviewDto,
  InboundWebhookReplaySelectionDto,
} from "@wpptrack/shared";
import {
  ArrowLeft,
  CheckCircle2,
  History,
  LifeBuoy,
  LockKeyhole,
  ShieldAlert,
} from "lucide-react";
import { BackofficeActionForm } from "../../../../../../components/backoffice-action-form";
import { BackofficeNavigation } from "../../../../../../components/backoffice-navigation";
import { InboundReplaySubmitButton } from "../../../../../../components/inbound-replay-submit-button";
import { formatDateTime } from "../../../../../../lib/date-time";
import { serverApiFetch } from "../../../../../../lib/server-api";
import { authorizeInboundWebhookProductionRecoveryAction } from "../actions";

type RecoverySearchParams = Record<string, string | string[] | undefined>;

type PreviewResult = {
  data: BackofficeInboundWebhookProductionRecoveryPreviewDto | null;
  state: "real" | "error";
};

async function getPreview(connectionId: string): Promise<PreviewResult> {
  try {
    const data =
      await serverApiFetch<BackofficeInboundWebhookProductionRecoveryPreviewDto>(
        `/backoffice/inbound-webhooks/connections/${encodeURIComponent(connectionId)}/production-recovery-preview`,
      );

    return { data, state: "real" };
  } catch {
    return { data: null, state: "error" };
  }
}

function asStringParam(
  value: string | string[] | undefined,
): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;

  return resolved?.trim() || undefined;
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

export default async function InboundWebhookProductionRecoveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ connectionId: string }>;
  searchParams?: Promise<RecoverySearchParams>;
}) {
  const { connectionId } = await params;
  const query = searchParams ? await searchParams : {};
  const requestedChannelId = asStringParam(query.channelId);
  const result = await getPreview(connectionId);
  const preview = result.data;

  if (result.state === "error" || !preview) {
    return (
      <section className="page-stack standalone-page inbound-replay-page">
        <BackofficeNavigation active="webhooks" />
        <header className="page-header">
          <div>
            <span className="eyebrow">Recuperacao de producao</span>
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

  const eligibleChannels = preview.channels.filter(
    (channel) => channel.eligible > 0,
  );
  const requestedChannel = eligibleChannels.find(
    (channel) => channel.id === requestedChannelId,
  );
  const defaultChannel = requestedChannel ?? eligibleChannels[0];
  const connectionReady =
    preview.connection.status === "production" &&
    preview.connection.parserReleaseStatus === "certified";
  const canRecover =
    preview.productionEnabled &&
    connectionReady &&
    preview.counts.eligible > 0 &&
    Boolean(defaultChannel);

  return (
    <section className="page-stack standalone-page inbound-replay-page inbound-recovery-page">
      <BackofficeNavigation active="webhooks" />

      <header className="page-header inbound-replay-header">
        <div>
          <span className="eyebrow">Recuperacao de producao Umbler</span>
          <h1>{preview.connection.displayName}</h1>
          <p>
            Recupere somente lacunas criadas depois da ativacao do envio
            automatico.
          </p>
        </div>
        <a
          className="button ghost"
          href={`/backoffice/inbound-webhooks?workspaceId=${preview.workspace.id}&connectionId=${preview.connection.id}`}
        >
          <ArrowLeft aria-hidden="true" size={17} strokeWidth={2} />
          Entregas
        </a>
      </header>

      <div className="inbound-replay-safety-banner inbound-recovery-safety-banner">
        <LifeBuoy aria-hidden="true" size={20} strokeWidth={2} />
        <span>
          <strong>
            A fila normal continua sendo a unica saida para a Meta
          </strong>
          <span>
            Esta operacao apenas recoloca lacunas pos-ativacao na fila
            idempotente de producao. Eventos anteriores continuam exclusivos do
            replay historico.
          </span>
        </span>
      </div>

      <section className="inbound-replay-overview">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Contexto operacional</span>
            <h2>{preview.workspace.name}</h2>
            <p>
              Conexao {preview.connection.displayName} / ativada em{" "}
              {preview.connection.productionActivatedAt
                ? formatDateTime(preview.connection.productionActivatedAt)
                : "data nao registrada"}
            </p>
          </div>
          <a
            className="button ghost compact-button"
            href={`/backoffice/inbound-webhooks/replay/${preview.connection.id}`}
          >
            <History aria-hidden="true" size={16} strokeWidth={2} />
            Replay historico
          </a>
        </div>

        <div className="inbound-replay-metrics inbound-recovery-metrics">
          <span>
            <small>CTWA observados</small>
            <strong>{preview.counts.totalCtwa}</strong>
          </span>
          <span>
            <small>Historicos</small>
            <strong>{preview.counts.historical}</strong>
          </span>
          <span>
            <small>Rota pendente</small>
            <strong>{preview.counts.routeUnresolved}</strong>
          </span>
          <span>
            <small>Fora da recuperacao</small>
            <strong>{preview.counts.unavailable}</strong>
          </span>
          <span>
            <small>Ja na fila</small>
            <strong>{preview.counts.alreadyQueued}</strong>
          </span>
          <span className="eligible">
            <small>Elegiveis agora</small>
            <strong>{preview.counts.eligible}</strong>
          </span>
        </div>
      </section>

      <section className="inbound-replay-channel-scope">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Escopo da recuperacao</span>
            <h2>Canais desta conexao</h2>
          </div>
          <span className="event-chip neutral">
            {preview.channels.length} canal(is)
          </span>
        </div>
        <div className="inbound-replay-channel-list">
          {preview.channels.map((channel) => {
            const postActivation = Math.max(
              0,
              channel.totalCtwa - channel.historical,
            );

            return (
              <div key={channel.id}>
                <span>
                  <strong>{channel.displayName}</strong>
                  <small>{channel.connectedPhone}</small>
                </span>
                <span>
                  <small>Pos-ativacao</small>
                  <strong>{postActivation}</strong>
                </span>
                <span>
                  <small>Ja na fila</small>
                  <strong>{channel.alreadyQueued}</strong>
                </span>
                <span className={channel.eligible > 0 ? "eligible" : ""}>
                  <small>Elegiveis</small>
                  <strong>{channel.eligible}</strong>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="inbound-replay-readiness">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Barreiras de seguranca</span>
            <h2>Prontidao da recuperacao</h2>
          </div>
        </div>
        <div className="inbound-replay-check-list">
          <div className={preview.productionEnabled ? "good" : "warn"}>
            {preview.productionEnabled ? (
              <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            ) : (
              <LockKeyhole aria-hidden="true" size={20} strokeWidth={2} />
            )}
            <span>
              <strong>Fila de producao</strong>
              <small>
                {preview.productionEnabled
                  ? "Processamento automatico liberado no ambiente."
                  : "INBOUND_WEBHOOK_PRODUCTION_ENABLED permanece desativada."}
              </small>
            </span>
          </div>
          <div className={connectionReady ? "good" : "warn"}>
            {connectionReady ? (
              <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            ) : (
              <ShieldAlert aria-hidden="true" size={20} strokeWidth={2} />
            )}
            <span>
              <strong>Conexao e parser</strong>
              <small>
                {connectionReady
                  ? "Conexao produtiva com parser certificado."
                  : "A conexao precisa estar em producao com parser certificado."}
              </small>
            </span>
          </div>
          <div className={preview.counts.eligible > 0 ? "good" : "warn"}>
            {preview.counts.eligible > 0 ? (
              <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            ) : (
              <ShieldAlert aria-hidden="true" size={20} strokeWidth={2} />
            )}
            <span>
              <strong>Lacunas pos-ativacao</strong>
              <small>
                {preview.counts.eligible > 0
                  ? `${preview.counts.eligible} evento(s) possuem rota exata e payload retido.`
                  : "Nenhuma lacuna elegivel foi encontrada neste momento."}
              </small>
            </span>
          </div>
        </div>
      </section>

      <section className="inbound-replay-authorization">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Autorizacao final</span>
            <h2>Recolocar eventos na fila normal</h2>
          </div>
          <span className={`status-chip ${canRecover ? "good" : "warn"}`}>
            {canRecover ? "Pronto" : "Bloqueado"}
          </span>
        </div>

        {canRecover ? (
          <BackofficeActionForm
            action={authorizeInboundWebhookProductionRecoveryAction}
            className="inbound-replay-confirmation"
          >
            <input
              type="hidden"
              name="connectionId"
              value={preview.connection.id}
            />
            <label>
              <span>Canal que sera recuperado</span>
              <select
                name="channelId"
                required
                defaultValue={defaultChannel?.id}
              >
                {eligibleChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.displayName} - {channel.eligible} elegivel(is)
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="inbound-replay-selection">
              <legend>Escolha o tamanho da recuperacao real</legend>
              <div className="inbound-replay-selection-grid">
                {(
                  [
                    ["canary_1", "1 evento", "Primeira validacao"],
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
                          defaultChannel?.eligible ?? 0,
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
            <InboundReplaySubmitButton mode="recovery" />
          </BackofficeActionForm>
        ) : (
          <div className="inbound-replay-blocked">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>A recuperacao ainda nao pode ser autorizada</strong>
              <span>
                {preview.counts.eligible === 0
                  ? "Corrija a rota dos eventos pendentes ou use o replay historico para eventos anteriores a ativacao."
                  : "Conclua as barreiras de seguranca exibidas acima."}
              </span>
            </span>
          </div>
        )}
      </section>
    </section>
  );
}
