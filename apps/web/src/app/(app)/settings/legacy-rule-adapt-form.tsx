"use client";

import type {
  ConversionRuleDto,
  InboundWebhookChannelDto,
  InboundWebhookConnectionDto,
} from "@wpptrack/shared";
import { ArrowRight, Check, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { ProviderConversionRuleActionResult } from "../integrations/provider-conversion-rule-actions";

export type LegacyRuleAdaptConnection = {
  connection: InboundWebhookConnectionDto;
  channels: InboundWebhookChannelDto[];
};

type LegacyRuleAdaptFormProps = {
  action: (formData: FormData) => Promise<ProviderConversionRuleActionResult>;
  connections: LegacyRuleAdaptConnection[];
  rule: ConversionRuleDto;
};

export function LegacyRuleAdaptForm({
  action,
  connections,
  rule,
}: LegacyRuleAdaptFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState(
    connections[0]?.connection.id ?? "",
  );
  const selectedConnection = useMemo(
    () =>
      connections.find((item) => item.connection.id === connectionId) ??
      connections[0] ??
      null,
    [connectionId, connections],
  );
  const [channelIds, setChannelIds] = useState<string[]>(() => {
    const channels = connections[0]?.channels ?? [];
    return channels.length === 1 ? [channels[0].id] : [];
  });
  const [triggerPhrases, setTriggerPhrases] = useState(rule.triggerValue);
  const [messageAuthorScope, setMessageAuthorScope] = useState<
    "team" | "contact" | "both"
  >("team");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  function selectConnection(nextConnectionId: string) {
    const nextConnection = connections.find(
      (item) => item.connection.id === nextConnectionId,
    );
    setConnectionId(nextConnectionId);
    setChannelIds(
      nextConnection?.channels.length === 1
        ? [nextConnection.channels[0].id]
        : [],
    );
  }

  function toggleChannel(channelId: string) {
    setChannelIds((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phrases = triggerPhrases
      .split(/\r?\n/u)
      .map((phrase) => phrase.trim())
      .filter(Boolean);

    if (!connectionId || channelIds.length === 0) {
      setNotice({
        tone: "error",
        message: "Selecione a conexao e ao menos um canal Umbler.",
      });
      return;
    }
    if (phrases.length === 0) {
      setNotice({
        tone: "error",
        message: "Informe ao menos uma frase gatilho.",
      });
      return;
    }

    setPending(true);
    setNotice(null);
    const formData = new FormData();
    formData.set("legacyRuleId", rule.id);
    formData.set(
      "payload",
      JSON.stringify({
        connectionId,
        channelIds,
        triggerPhrases: phrases,
        messageAuthorScope,
      }),
    );
    const result = await action(formData);
    setPending(false);
    setNotice({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });

    if (result.ok) {
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button
        className="button compact"
        type="button"
        onClick={() => setOpen(true)}
        disabled={connections.length === 0}
      >
        <Link2 size={14} aria-hidden="true" />
        Adaptar para Umbler
      </button>
    );
  }

  return (
    <div className="legacy-rule-adapt-overlay" role="presentation">
      <form
        className="legacy-rule-adapt"
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={`Adaptar ${rule.name} para Umbler`}
      >
        <header className="legacy-rule-adapt-heading">
          <div>
            <span className="micro-label">Migracao assistida</span>
            <strong>Vincular regra aos canais Umbler</strong>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Fechar adaptacao"
            aria-label="Fechar adaptacao"
            onClick={() => setOpen(false)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </header>

        <div className="legacy-rule-adapt-grid">
          <label>
            <span>Conexao Umbler</span>
            <select
              value={connectionId}
              onChange={(event) => selectConnection(event.target.value)}
              required
            >
              {connections.map(({ connection }) => (
                <option key={connection.id} value={connection.id}>
                  {connection.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Quem pode enviar</span>
            <select
              value={messageAuthorScope}
              onChange={(event) =>
                setMessageAuthorScope(
                  event.target.value as "team" | "contact" | "both",
                )
              }
            >
              <option value="team">Equipe ou bot</option>
              <option value="contact">Somente contato</option>
              <option value="both">Equipe, bot ou contato</option>
            </select>
          </label>
          <label className="legacy-rule-adapt-phrases">
            <span>Frases gatilho</span>
            <textarea
              rows={3}
              value={triggerPhrases}
              onChange={(event) => setTriggerPhrases(event.target.value)}
              maxLength={4_800}
              required
            />
            <small>
              Uma por linha. Na Umbler, a frase pode estar contida em uma
              mensagem maior; maiusculas e acentos nao alteram o reconhecimento.
            </small>
          </label>
        </div>

        <fieldset className="legacy-rule-adapt-channels">
          <legend>Canais desta regra</legend>
          {selectedConnection?.channels.length ? (
            <div className="provider-channel-selector-grid">
              {selectedConnection.channels.map((channel) => (
                <label key={channel.id}>
                  <input
                    type="checkbox"
                    checked={channelIds.includes(channel.id)}
                    onChange={() => toggleChannel(channel.id)}
                  />
                  <span>
                    <strong>
                      {channel.channelName ?? channel.connectedPhone}
                    </strong>
                    <small>{channel.connectedPhone}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="muted">
              Esta conexao ainda nao possui canais descobertos.
            </p>
          )}
        </fieldset>

        <div className="legacy-rule-adapt-warning">
          <ArrowRight size={16} aria-hidden="true" />
          <span>
            A regra preservara seu historico, deixara o recebimento antigo e
            passara a observar somente os canais selecionados.
          </span>
        </div>

        {notice ? (
          <div className={`feedback-banner ${notice.tone}`} role="status">
            {notice.tone === "success" ? (
              <Check size={15} aria-hidden="true" />
            ) : null}
            <span>{notice.message}</span>
          </div>
        ) : null}

        <button
          className="button primary"
          type="submit"
          disabled={pending || channelIds.length === 0}
        >
          <Link2 size={15} aria-hidden="true" />
          {pending ? "Adaptando..." : "Adaptar em observacao"}
        </button>
      </form>
    </div>
  );
}
