import type {
  BackofficeInboundWebhookParserRecoveryPreviewDto,
  InboundWebhookParserRecoverySelectionDto,
} from "@wpptrack/shared";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { BackofficeActionForm } from "../../../../../../components/backoffice-action-form";
import { BackofficeNavigation } from "../../../../../../components/backoffice-navigation";
import { InboundReplaySubmitButton } from "../../../../../../components/inbound-replay-submit-button";
import { serverApiFetch } from "../../../../../../lib/server-api";
import { recoverInboundWebhookParserBatchAction } from "../actions";

type PreviewResult = {
  data: BackofficeInboundWebhookParserRecoveryPreviewDto | null;
  state: "real" | "error";
};

const selectionLimits: Record<
  InboundWebhookParserRecoverySelectionDto,
  number
> = {
  canary_10: 10,
  batch_100: 100,
  batch_500: 500,
  remaining: 500,
};

async function getPreview(connectionId: string): Promise<PreviewResult> {
  try {
    const data =
      await serverApiFetch<BackofficeInboundWebhookParserRecoveryPreviewDto>(
        `/backoffice/inbound-webhooks/connections/${encodeURIComponent(connectionId)}/parser-recovery-preview`,
      );

    return { data, state: "real" };
  } catch {
    return { data: null, state: "error" };
  }
}

function selectedCount(
  selection: InboundWebhookParserRecoverySelectionDto,
  recoverable: number,
): number {
  return Math.min(selectionLimits[selection], recoverable);
}

export default async function InboundWebhookParserRecoveryPage({
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
            <span className="eyebrow">Recuperacao do parser</span>
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

  const canRecover = preview.counts.recoverable > 0;

  return (
    <section className="page-stack standalone-page inbound-replay-page">
      <BackofficeNavigation active="webhooks" />

      <header className="page-header inbound-replay-header">
        <div>
          <span className="eyebrow">Recuperacao controlada do parser</span>
          <h1>{preview.connection.displayName}</h1>
          <p>
            Releia payloads preservados que chegaram antes do suporte completo
            deste parser.
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

      <div className="inbound-replay-safety-banner">
        <RefreshCw aria-hidden="true" size={20} strokeWidth={2} />
        <span>
          <strong>
            Esta operacao nao envia eventos diretamente para a Meta
          </strong>
          <span>
            Cada entrega volta para a fila normal, passa pelo parser real e
            preserva deduplicacao, roteamento e auditoria existentes.
          </span>
        </span>
      </div>

      <section className="inbound-replay-overview">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Inventario preservado</span>
            <h2>{preview.workspace.name}</h2>
            <p>
              Parser {preview.connection.provider}{" "}
              {preview.connection.parserVersion} / conexao{" "}
              {preview.connection.status === "production"
                ? "em producao"
                : "em observacao"}
            </p>
          </div>
          <span className="event-chip neutral">
            Maximo {preview.maxBatchSize} por operacao
          </span>
        </div>

        <div className="inbound-replay-metrics inbound-recovery-metrics">
          <span>
            <small>Aguardando parser</small>
            <strong>{preview.counts.awaitingParser}</strong>
          </span>
          <span className="eligible">
            <small>Recuperaveis</small>
            <strong>{preview.counts.recoverable}</strong>
          </span>
          <span>
            <small>Ja em processamento</small>
            <strong>{preview.counts.inFlight}</strong>
          </span>
          <span>
            <small>Payload expirado</small>
            <strong>{preview.counts.expired}</strong>
          </span>
          <span>
            <small>Payload removido</small>
            <strong>{preview.counts.unavailable}</strong>
          </span>
        </div>
      </section>

      <section className="inbound-replay-readiness">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Protecoes operacionais</span>
            <h2>Antes de recuperar</h2>
          </div>
        </div>
        <div className="inbound-replay-check-list">
          <div className="good">
            <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Escopo exato da conexao</strong>
              <small>
                Somente payloads de {preview.connection.displayName} serao
                reivindicados.
              </small>
            </span>
          </div>
          <div className="good">
            <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Eventos canonicos protegidos</strong>
              <small>
                Entregas que ja criaram eventos nunca entram nesta operacao.
              </small>
            </span>
          </div>
          <div className={preview.counts.inFlight > 0 ? "warn" : "good"}>
            {preview.counts.inFlight > 0 ? (
              <Clock3 aria-hidden="true" size={20} strokeWidth={2} />
            ) : (
              <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2} />
            )}
            <span>
              <strong>Fila atual</strong>
              <small>
                {preview.counts.inFlight > 0
                  ? `${preview.counts.inFlight} entrega(s) ja estao sendo processadas em paralelo.`
                  : "Nenhuma entrega desta conexao esta em transicao."}
              </small>
            </span>
          </div>
        </div>
      </section>

      <section className="inbound-replay-authorization">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Autorizacao final</span>
            <h2>Recolocar payloads na fila do parser</h2>
          </div>
          <span className={`status-chip ${canRecover ? "good" : "warn"}`}>
            {canRecover ? "Pronto" : "Sem payload"}
          </span>
        </div>

        {canRecover ? (
          <BackofficeActionForm
            action={recoverInboundWebhookParserBatchAction}
            className="inbound-replay-confirmation"
          >
            <input
              type="hidden"
              name="connectionId"
              value={preview.connection.id}
            />
            <fieldset className="inbound-replay-selection">
              <legend>Escolha o tamanho do lote</legend>
              <div className="inbound-replay-selection-grid">
                {(
                  [
                    ["canary_10", "10 eventos", "Canario inicial"],
                    ["batch_100", "100 eventos", "Expansao controlada"],
                    ["batch_500", "500 eventos", "Lote operacional"],
                    ["remaining", "Restante", "Maximo de 500"],
                  ] as const
                ).map(([value, label, detail]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="selection"
                      value={value}
                      defaultChecked={value === "canary_10"}
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {detail} -{" "}
                        {selectedCount(value, preview.counts.recoverable)}{" "}
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
            <InboundReplaySubmitButton mode="parser" />
          </BackofficeActionForm>
        ) : (
          <div className="inbound-replay-blocked">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Nenhum payload pode ser recuperado agora</strong>
              <span>
                Payloads expirados permanecem apenas no historico de auditoria.
              </span>
            </span>
          </div>
        )}
      </section>
    </section>
  );
}
