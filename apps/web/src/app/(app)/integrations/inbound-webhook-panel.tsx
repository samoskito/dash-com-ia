"use client";

import type {
  InboundWebhookCapabilitiesDto,
  InboundWebhookChannelDto,
  InboundWebhookConnectionOverviewDto,
  MetaManualConfigurationDto,
} from "@wpptrack/shared";
import {
  Check,
  Copy,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { PresentationMask } from "../../../components/presentation-mask";
import type {
  InboundWebhookActionResult,
  InboundWebhookOneTimeSecret,
} from "./inbound-webhook-actions";
import { InboundWebhookRouteEditor } from "./inbound-webhook-route-editor";

type InboundWebhookAction = (
  formData: FormData,
) => Promise<InboundWebhookActionResult>;

export type InboundWebhookConnectionView = {
  overview: InboundWebhookConnectionOverviewDto;
  channels: InboundWebhookChannelDto[];
  detailState?: "real" | "error";
};

export type InboundWebhookPanelProps = {
  capabilities: InboundWebhookCapabilitiesDto;
  connections: InboundWebhookConnectionView[];
  metaConfiguration: MetaManualConfigurationDto | null;
  canManage: boolean;
  createAction: InboundWebhookAction;
  rotateSecretAction: InboundWebhookAction;
  setConnectionStatusAction: InboundWebhookAction;
  removeConnectionAction: InboundWebhookAction;
  setChannelStatusAction: InboundWebhookAction;
  saveRoutesAction: InboundWebhookAction;
};

type PanelNotice = {
  tone: "success" | "error";
  message: string;
};

export function inboundWebhookProviderLabel(provider: string): string {
  return provider === "umbler" ? "Umbler Talk" : provider;
}

export function InboundWebhookPanel({
  capabilities,
  connections,
  metaConfiguration,
  canManage,
  createAction,
  rotateSecretAction,
  setConnectionStatusAction,
  removeConnectionAction,
  setChannelStatusAction,
  saveRoutesAction,
}: InboundWebhookPanelProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(connections.length === 0);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const [oneTimeSecret, setOneTimeSecret] =
    useState<InboundWebhookOneTimeSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const creatableProviders = capabilities.providers.filter(
    (provider) => provider.creationEnabled,
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pendingAction) {
      return;
    }

    const form = event.currentTarget;
    setPendingAction("create");
    setNotice(null);
    const result = await createAction(new FormData(form));
    applyResult(result);

    if (result.ok && result.oneTimeSecret) {
      form.reset();
      setOneTimeSecret(result.oneTimeSecret);
      setCopied(false);
      setCreateOpen(false);
      router.refresh();
    }

    setPendingAction(null);
  }

  async function runConnectionAction(
    key: string,
    action: InboundWebhookAction,
    values: Record<string, string>,
  ) {
    if (pendingAction) {
      return;
    }

    const formData = new FormData();
    for (const [name, value] of Object.entries(values)) {
      formData.set(name, value);
    }

    setPendingAction(key);
    setNotice(null);
    const result = await action(formData);
    applyResult(result);

    if (result.ok) {
      if (result.oneTimeSecret) {
        setOneTimeSecret(result.oneTimeSecret);
        setCopied(false);
      }
      router.refresh();
    }

    setPendingAction(null);
  }

  function applyResult(result: InboundWebhookActionResult) {
    setNotice({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
  }

  async function copyWebhookUrl() {
    if (!oneTimeSecret) {
      return;
    }

    try {
      await navigator.clipboard.writeText(oneTimeSecret.webhookUrl);
      setCopied(true);
      setNotice({
        tone: "success",
        message: "URL copiada. Cadastre-a agora na Umbler.",
      });
    } catch {
      setNotice({
        tone: "error",
        message: "Nao foi possivel copiar automaticamente. Selecione a URL.",
      });
    }
  }

  return (
    <section className="surface-panel inbound-webhook-panel">
      <div className="inbound-webhook-heading">
        <div>
          <span className="eyebrow">Fontes de mensagens</span>
          <h2>Webhooks de plataformas WhatsApp</h2>
          <p className="muted">
            Receba e classifique mensagens de campanha em modo de observacao.
            Esta etapa nao cria leads nem envia conversoes.
          </p>
        </div>
        {canManage && capabilities.enabled ? (
          <button
            className="button"
            type="button"
            onClick={() => setCreateOpen((current) => !current)}
            aria-expanded={createOpen}
          >
            {createOpen ? (
              <X size={16} aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
            {createOpen ? "Fechar" : "Adicionar conexao"}
          </button>
        ) : (
          <span className="status-chip">
            {capabilities.enabled ? "Somente leitura" : "Indisponivel"}
          </span>
        )}
      </div>

      {createOpen && canManage ? (
        <form className="inbound-webhook-create" onSubmit={handleCreate}>
          <label>
            <span className="field-label">Plataforma</span>
            <select
              name="provider"
              defaultValue={creatableProviders[0]?.provider ?? ""}
              disabled={
                pendingAction === "create" || creatableProviders.length === 0
              }
            >
              {creatableProviders.map((provider) => (
                <option key={provider.provider} value={provider.provider}>
                  {inboundWebhookProviderLabel(provider.provider)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Nome da conexao</span>
            <input
              name="displayName"
              minLength={2}
              maxLength={120}
              placeholder="Ex.: Umbler Comercial"
              required
              disabled={pendingAction === "create"}
            />
          </label>
          <button
            className="button primary"
            type="submit"
            disabled={
              pendingAction === "create" || creatableProviders.length === 0
            }
          >
            <Webhook size={16} aria-hidden="true" />
            {pendingAction === "create" ? "Criando..." : "Gerar webhook"}
          </button>
        </form>
      ) : null}

      {oneTimeSecret ? (
        <div
          className="inbound-webhook-secret"
          data-presentation-sensitive-action="true"
        >
          <div>
            <span className="micro-label">URL exibida uma unica vez</span>
            <strong>Cadastre este webhook na Umbler agora</strong>
          </div>
          <input
            readOnly
            value={oneTimeSecret.webhookUrl}
            aria-label="URL privada do webhook Umbler"
            data-presentation-sensitive-field="true"
          />
          <button className="button" type="button" onClick={copyWebhookUrl}>
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copied ? "Copiada" : "Copiar URL"}
          </button>
          <button
            className="icon-button"
            type="button"
            title="Ocultar URL"
            aria-label="Ocultar URL"
            onClick={() => setOneTimeSecret(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {notice ? (
        <div
          className={`feedback-banner ${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <span>{notice.message}</span>
        </div>
      ) : null}

      <div className="inbound-connection-list">
        {connections.length === 0 ? (
          <div className="inbound-empty-state">
            <Webhook size={20} aria-hidden="true" />
            <div>
              <strong>Nenhum webhook configurado</strong>
              <p className="muted">
                Crie uma conexao para receber o primeiro payload de teste.
              </p>
            </div>
          </div>
        ) : (
          connections.map(({ overview, channels, detailState }) => {
            const connection = overview.connection;
            const connectionPending = pendingAction?.includes(connection.id);

            return (
              <details
                className="inbound-connection"
                key={connection.id}
                open={connections.length === 1}
              >
                <summary>
                  <div className="inbound-connection-identity">
                    <span
                      className={`status-dot ${connection.status === "observation" ? "active" : ""}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>
                        <PresentationMask placeholder="Conexao Umbler">
                          {connection.displayName}
                        </PresentationMask>
                      </strong>
                      <span>
                        {inboundWebhookProviderLabel(connection.provider)} -{" "}
                        {connection.status === "observation"
                          ? "Observando"
                          : "Pausada"}
                      </span>
                    </div>
                  </div>
                  <div className="inbound-connection-health">
                    <span>{channels.length} canal(is)</span>
                    <span>
                      Ultima entrega:{" "}
                      {formatDateTime(connection.lastDeliveryAt)}
                    </span>
                  </div>
                </summary>

                <div className="inbound-connection-body">
                  {detailState === "error" ? (
                    <p className="action-note warn">
                      Parte dos dados desta conexao esta temporariamente
                      indisponivel.
                    </p>
                  ) : null}
                  <div className="inbound-counter-grid">
                    <ObservationCounter
                      label="CTWA roteado"
                      value={overview.counters.eligibleRouted}
                      tone="success"
                    />
                    <ObservationCounter
                      label="CTWA pendente"
                      value={overview.counters.eligibleUnresolved}
                      tone="warn"
                    />
                    <ObservationCounter
                      label="Sem CTWA"
                      value={overview.counters.ignoredNoCtwa}
                    />
                    <ObservationCounter
                      label="Duplicados"
                      value={overview.counters.duplicate}
                    />
                    <ObservationCounter
                      label="Invalidos"
                      value={overview.counters.invalid}
                      tone="error"
                    />
                  </div>

                  {canManage ? (
                    <div className="inbound-connection-actions">
                      <button
                        className="button"
                        type="button"
                        disabled={Boolean(connectionPending)}
                        onClick={() =>
                          runConnectionAction(
                            `status-${connection.id}`,
                            setConnectionStatusAction,
                            {
                              connectionId: connection.id,
                              status:
                                connection.status === "paused"
                                  ? "observation"
                                  : "paused",
                            },
                          )
                        }
                      >
                        {connection.status === "paused" ? (
                          <Play size={15} aria-hidden="true" />
                        ) : (
                          <Pause size={15} aria-hidden="true" />
                        )}
                        {connection.status === "paused" ? "Retomar" : "Pausar"}
                      </button>
                      <button
                        className="button"
                        type="button"
                        disabled={Boolean(connectionPending)}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Gerar uma nova URL invalida a URL atual. Continuar?",
                            )
                          ) {
                            void runConnectionAction(
                              `rotate-${connection.id}`,
                              rotateSecretAction,
                              { connectionId: connection.id },
                            );
                          }
                        }}
                      >
                        <RefreshCw size={15} aria-hidden="true" />
                        Gerar nova URL
                      </button>
                      <button
                        className="button danger"
                        type="button"
                        disabled={Boolean(connectionPending)}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remover a conexao? O historico observado sera preservado.",
                            )
                          ) {
                            void runConnectionAction(
                              `remove-${connection.id}`,
                              removeConnectionAction,
                              { connectionId: connection.id },
                            );
                          }
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        Remover
                      </button>
                    </div>
                  ) : null}

                  <div className="inbound-channel-list">
                    <div className="inbound-channel-heading">
                      <span>Canal</span>
                      <span>Numero conectado</span>
                      <span>Status</span>
                      <span>Ultimo evento</span>
                    </div>
                    {channels.length === 0 ? (
                      <p className="muted inbound-channel-empty">
                        Os canais aparecerao depois do primeiro payload valido.
                      </p>
                    ) : (
                      channels.map((channel) => (
                        <details className="inbound-channel" key={channel.id}>
                          <summary>
                            <strong>
                              <PresentationMask placeholder="Canal oculto">
                                {channel.channelName ?? "Canal sem nome"}
                              </PresentationMask>
                            </strong>
                            <span>
                              <PresentationMask placeholder="Numero oculto">
                                {channel.connectedPhone}
                              </PresentationMask>
                            </span>
                            <span
                              className={`event-chip ${channel.status === "active" ? "" : "warn"}`}
                            >
                              {channelStatusLabel(channel.status)}
                            </span>
                            <span>{formatDateTime(channel.lastSeenAt)}</span>
                          </summary>
                          <div className="inbound-channel-body">
                            {canManage ? (
                              <div className="inbound-channel-actions">
                                <button
                                  className="button"
                                  type="button"
                                  disabled={Boolean(
                                    pendingAction?.includes(channel.id),
                                  )}
                                  onClick={() =>
                                    runConnectionAction(
                                      `channel-${channel.id}`,
                                      setChannelStatusAction,
                                      {
                                        channelId: channel.id,
                                        status:
                                          channel.status === "paused"
                                            ? "active"
                                            : "paused",
                                      },
                                    )
                                  }
                                >
                                  {channel.status === "paused" ? (
                                    <Play size={15} aria-hidden="true" />
                                  ) : (
                                    <Pause size={15} aria-hidden="true" />
                                  )}
                                  {channel.status === "paused"
                                    ? "Ativar canal"
                                    : "Pausar canal"}
                                </button>
                              </div>
                            ) : null}
                            <InboundWebhookRouteEditor
                              channel={channel}
                              metaConfiguration={metaConfiguration}
                              canManage={canManage}
                              saveAction={saveRoutesAction}
                              onUpdated={(result) => {
                                applyResult(result);
                                if (result.ok) {
                                  router.refresh();
                                }
                              }}
                            />
                          </div>
                        </details>
                      ))
                    )}
                  </div>
                </div>
              </details>
            );
          })
        )}
      </div>
    </section>
  );
}

function ObservationCounter({
  label,
  tone = "",
  value,
}: {
  label: string;
  tone?: "" | "success" | "warn" | "error";
  value: number;
}) {
  return (
    <div className={`inbound-counter${tone ? ` ${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function channelStatusLabel(status: InboundWebhookChannelDto["status"]) {
  if (status === "active") {
    return "Ativo";
  }

  if (status === "paused") {
    return "Pausado";
  }

  return "Descoberto";
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Ainda nao recebida";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Data indisponivel";
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
