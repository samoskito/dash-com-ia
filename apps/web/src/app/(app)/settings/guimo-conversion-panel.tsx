"use client";

import type {
  ConversionEventNameDto,
  GuimoConversionRuleDto,
  GuimoIntegrationDto,
} from "@wpptrack/shared";
import {
  conversionEventCarriesValue,
  conversionEventDisplayLabels,
  conversionEventNameSchema,
} from "@wpptrack/shared";
import {
  Check,
  Copy,
  Database,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { displayTimeZone } from "../../../lib/date-time";
import type {
  GuimoActionResult,
  GuimoConversionRuleActionResult,
  GuimoOneTimeWebhook,
  GuimoRuleActionResult,
} from "../integrations/guimo-actions";

type ConnectAction = (formData: FormData) => Promise<GuimoActionResult>;
type ConnectionRuleAction = (formData: FormData) => Promise<GuimoRuleActionResult>;
type ConversionRuleAction = (
  formData: FormData,
) => Promise<GuimoConversionRuleActionResult>;

export type GuimoConversionPanelProps = {
  workspaceId: string;
  integrations: GuimoIntegrationDto[];
  canManage: boolean;
  provisionAction: ConnectAction;
  rotateAction: ConnectAction;
  setActiveAction: ConnectionRuleAction;
  createRuleAction: ConversionRuleAction;
  updateRuleAction: ConversionRuleAction;
  deleteRuleAction: ConversionRuleAction;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

const conversionEventOptions = conversionEventNameSchema.options;

export function guimoStatusLabel(status: GuimoIntegrationDto["status"]): string {
  if (status === "active") return "Ativa";
  if (status === "paused") return "Pausada";
  return "Bloqueada";
}

function guimoStatusTone(status: GuimoIntegrationDto["status"]): string {
  if (status === "active") return "success";
  if (status === "paused") return "neutral";
  return "warn";
}

/**
 * Guimo e um gatilho de conversao opt-in (movimentacao de estagio no CRM), nao
 * uma fonte de WhatsApp. So aparece aqui quando o workspace ativa a conexao;
 * antes disso nao ha nada exposto para quem nao usa Guimo.
 *
 * Depois de conectado, o workspace cadastra uma lista livre de regras: cada
 * regra casa por nome de estagio na Guimo (nunca por ID) e dispara a
 * conversao escolhida, com valor dinamico do negocio ou um valor fixo.
 */
export function GuimoConversionPanel({
  workspaceId,
  integrations,
  canManage,
  provisionAction,
  rotateAction,
  setActiveAction,
  createRuleAction,
  updateRuleAction,
  deleteRuleAction,
}: GuimoConversionPanelProps) {
  const router = useRouter();
  const integration = integrations[0] ?? null;
  const [connectOpen, setConnectOpen] = useState(false);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [oneTimeWebhook, setOneTimeWebhook] =
    useState<GuimoOneTimeWebhook | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    setPending("connect");
    setNotice(null);
    const result = await provisionAction(new FormData(form));
    applyResult(result);

    if (result.ok && result.oneTimeWebhook) {
      form.reset();
      setOneTimeWebhook(result.oneTimeWebhook);
      setCopiedUrl(false);
      setConnectOpen(false);
      router.refresh();
    }

    setPending(null);
  }

  async function handleRotate() {
    if (pending || !integration) return;
    if (
      !window.confirm("Gerar uma nova URL invalida a URL atual. Continuar?")
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("integrationId", integration.id);

    setPending("rotate");
    setNotice(null);
    const result = await rotateAction(formData);
    applyResult(result);

    if (result.ok && result.oneTimeWebhook) {
      setOneTimeWebhook(result.oneTimeWebhook);
      setCopiedUrl(false);
      router.refresh();
    }

    setPending(null);
  }

  async function toggleConnectionActive() {
    if (pending || !integration) return;
    const activating = integration.status === "paused";
    if (
      !activating &&
      !window.confirm(
        "Pausar o gatilho Guimo? Novas movimentacoes de estagio param de gerar conversoes ate retomar.",
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("integrationId", integration.id);
    formData.set("active", activating ? "true" : "false");

    setPending("active");
    setNotice(null);
    const result = await setActiveAction(formData);
    applyResult(result);
    if (result.ok) router.refresh();
    setPending(null);
  }

  function applyResult(
    result: GuimoActionResult | GuimoRuleActionResult | GuimoConversionRuleActionResult,
  ) {
    setNotice({ tone: result.ok ? "success" : "error", message: result.message });
  }

  async function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !integration) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("workspaceId", workspaceId);
    formData.set("integrationId", integration.id);

    setPending("create-rule");
    setNotice(null);
    const result = await createRuleAction(formData);
    applyResult(result);

    if (result.ok) {
      form.reset();
      setCreateRuleOpen(false);
      router.refresh();
    }

    setPending(null);
  }

  async function copyUrl() {
    if (!oneTimeWebhook) return;
    try {
      await navigator.clipboard.writeText(
        oneTimeWebhook.webhookUrl ?? oneTimeWebhook.webhookPath,
      );
      setCopiedUrl(true);
    } catch {
      setNotice({
        tone: "error",
        message: "Nao foi possivel copiar automaticamente. Selecione a URL.",
      });
    }
  }

  return (
    <section className="provider-conversion-panel guimo-conversion-panel">
      <header className="provider-conversion-heading">
        <div>
          <span className="eyebrow">Movimentacao no CRM</span>
          <h3>Guimo CRM</h3>
          <p className="muted">
            Gatilho opcional: dispare conversoes quando um negocio muda de
            estagio na Guimo. So aparece ativo para quem conectar.
          </p>
        </div>
        <div className="provider-conversion-heading-actions">
          <span
            className={`event-chip ${integration ? guimoStatusTone(integration.status) : "neutral"}`}
          >
            {integration ? guimoStatusLabel(integration.status) : "Nao conectado"}
          </span>
          {canManage && !integration ? (
            <button
              className="button"
              type="button"
              onClick={() => setConnectOpen((current) => !current)}
              aria-expanded={connectOpen}
            >
              {connectOpen ? (
                <X size={15} aria-hidden="true" />
              ) : (
                <Plus size={15} aria-hidden="true" />
              )}
              {connectOpen ? "Fechar" : "Gerar URL do webhook"}
            </button>
          ) : null}
          {canManage && integration ? (
            <button
              className="button"
              type="button"
              onClick={() => setCreateRuleOpen((current) => !current)}
              aria-expanded={createRuleOpen}
            >
              {createRuleOpen ? (
                <X size={15} aria-hidden="true" />
              ) : (
                <Plus size={15} aria-hidden="true" />
              )}
              {createRuleOpen ? "Fechar" : "Nova regra"}
            </button>
          ) : null}
        </div>
      </header>

      {oneTimeWebhook ? (
        <div className="provider-conversion-secret-group">
          <div
            className="provider-conversion-secret"
            data-presentation-sensitive-action="true"
          >
            <div>
              <span className="micro-label">URL exibida uma unica vez</span>
              <strong>Webhook Guimo</strong>
            </div>
            <input
              readOnly
              value={oneTimeWebhook.webhookUrl ?? oneTimeWebhook.webhookPath}
              aria-label="URL do webhook Guimo"
              data-presentation-sensitive-field="true"
            />
            <button className="button" type="button" onClick={copyUrl}>
              {copiedUrl ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Copy size={15} aria-hidden="true" />
              )}
              {copiedUrl ? "Copiada" : "Copiar URL"}
            </button>
            <button
              className="icon-button"
              type="button"
              title="Ocultar"
              aria-label="Ocultar URL"
              onClick={() => setOneTimeWebhook(null)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <p className="action-note">
            Cole essa URL completa na configuracao de webhook da Guimo. Nao ha
            header, token ou segredo adicional para configurar la — a
            autenticacao ja vai embutida na URL.
          </p>
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

      {!integration ? (
        <>
          <div className="provider-conversion-empty">
            <Database size={18} aria-hidden="true" />
            <span>
              Nenhuma conexao Guimo ativa. Ative para liberar o gatilho de
              movimentacao de estagio.
            </span>
          </div>
          {connectOpen && canManage ? (
            <form className="provider-conversion-builder" onSubmit={handleConnect}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <p className="action-note">
                Gere a URL do webhook e cole exatamente essa URL na
                configuracao de webhook da Guimo (a Guimo so permite
                configurar uma URL de destino, sem headers). Nao ha
                Authorization, X-API-Key ou token separado para informar —
                a autenticacao ja vai embutida na URL gerada.
              </p>

              <div className="provider-conversion-builder-footer">
                <button
                  className="button primary"
                  type="submit"
                  disabled={pending === "connect"}
                >
                  <Check size={15} aria-hidden="true" />
                  {pending === "connect" ? "Gerando..." : "Gerar URL do webhook"}
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : (
        <div className="provider-conversion-rule-list">
          {createRuleOpen && canManage ? (
            <GuimoRuleForm
              pending={pending === "create-rule"}
              onSubmit={handleCreateRule}
            />
          ) : null}

          {integration.rules.length === 0 ? (
            <div className="provider-conversion-empty">
              <Database size={18} aria-hidden="true" />
              <span>
                Nenhuma regra cadastrada ainda. Crie uma regra para cada
                estagio da Guimo que deve disparar uma conversao.
              </span>
            </div>
          ) : (
            integration.rules.map((rule) => (
              <GuimoRuleListItem
                key={rule.id}
                workspaceId={workspaceId}
                integrationId={integration.id}
                rule={rule}
                canManage={canManage}
                pending={pending}
                setPending={setPending}
                updateRuleAction={updateRuleAction}
                deleteRuleAction={deleteRuleAction}
                onResult={applyResult}
                onRefresh={() => router.refresh()}
              />
            ))
          )}

          {canManage ? (
            <div className="provider-conversion-rule-actions guimo-connection-actions">
              <button
                className="button subtle"
                type="button"
                disabled={Boolean(pending)}
                onClick={() => void toggleConnectionActive()}
              >
                {integration.status === "paused" ? (
                  <Play size={15} aria-hidden="true" />
                ) : (
                  <Pause size={15} aria-hidden="true" />
                )}
                {integration.status === "paused"
                  ? "Retomar conexao"
                  : "Pausar conexao"}
              </button>
              <button
                className="button subtle"
                type="button"
                disabled={Boolean(pending)}
                onClick={() => void handleRotate()}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {pending === "rotate" ? "Gerando..." : "Gerar nova URL"}
              </button>
            </div>
          ) : null}
          <p className="action-note">
            Atualizada em {formatDateTime(integration.updatedAt)}. Remover a
            conexao ainda nao e suportado nesta versao — pause em vez disso.
          </p>
        </div>
      )}
    </section>
  );
}

function eventLabel(eventName: ConversionEventNameDto): string {
  return conversionEventDisplayLabels[eventName];
}

function GuimoRuleForm({
  pending,
  onSubmit,
  initial,
}: {
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  initial?: GuimoConversionRuleDto;
}) {
  const [stageName, setStageName] = useState(initial?.stageName ?? "");
  const [eventName, setEventName] = useState<ConversionEventNameDto>(
    initial?.eventName ?? "QualifiedLead",
  );
  const [valueMode, setValueMode] = useState<"dynamic" | "fixed">(
    initial?.valueMode ?? "dynamic",
  );
  const [fixedValueAmount, setFixedValueAmount] = useState(
    initial?.fixedValueCents != null
      ? (initial.fixedValueCents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const carriesValue = conversionEventCarriesValue(eventName);

  /**
   * Some conversions (ex.: Lead qualificado) never carry a monetary value.
   * Switching into one of those drops the stale value mode/amount from state
   * so they cannot leak into the payload; switching back starts from the
   * "dynamic" default, same as a brand-new rule.
   */
  function selectEventName(next: ConversionEventNameDto) {
    setEventName(next);
    if (!conversionEventCarriesValue(next)) {
      setValueMode("dynamic");
      setFixedValueAmount("");
    }
  }

  return (
    <form className="provider-conversion-builder" onSubmit={onSubmit}>
      <div className="provider-conversion-base-fields provider-conversion-base-fields-2col">
        <label>
          <span className="field-label">Nome do estagio na Guimo</span>
          <input
            name="stageName"
            value={stageName}
            onChange={(event) => setStageName(event.target.value)}
            placeholder="Ex.: Lead Qualificado"
            disabled={pending}
            required
          />
        </label>
        <label>
          <span className="field-label">Conversao disparada</span>
          <select
            name="eventName"
            value={eventName}
            onChange={(event) =>
              selectEventName(event.target.value as ConversionEventNameDto)
            }
            disabled={pending}
          >
            {conversionEventOptions.map((option) => (
              <option key={option} value={option}>
                {eventLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="action-note">
        O casamento e feito pelo nome do estagio, nao pelo ID.
      </p>

      {carriesValue ? (
        <>
          <fieldset className="provider-conversion-value-modes">
            <legend className="field-label">Valor</legend>
            <div>
              <label>
                <input
                  type="radio"
                  name="valueMode"
                  value="dynamic"
                  checked={valueMode === "dynamic"}
                  onChange={() => setValueMode("dynamic")}
                  disabled={pending}
                />
                <span>Valor dinamico do negocio (Guimo)</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="valueMode"
                  value="fixed"
                  checked={valueMode === "fixed"}
                  onChange={() => setValueMode("fixed")}
                  disabled={pending}
                />
                <span>Valor fixo</span>
              </label>
            </div>
          </fieldset>

          {valueMode === "fixed" ? (
            <div className="provider-conversion-base-fields">
              <label>
                <span className="field-label">Valor fixo (R$)</span>
                <input
                  name="fixedValueAmount"
                  value={fixedValueAmount}
                  onChange={(event) => setFixedValueAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="Ex.: 199,90"
                  disabled={pending}
                  required
                />
              </label>
            </div>
          ) : null}
        </>
      ) : (
        // No value UI for events that never carry a monetary value: submit an
        // explicit "dynamic" so edits clear any stale fixed value server-side
        // instead of silently keeping it (updateGuimoConversionRuleAction only
        // nulls fixedValueCents when it sees valueMode="dynamic").
        <input type="hidden" name="valueMode" value="dynamic" />
      )}

      <div className="provider-conversion-builder-footer">
        <span className="action-note">
          A regra so vale para o estagio informado; crie quantas regras forem
          necessarias.
        </span>
        <button className="button primary" type="submit" disabled={pending}>
          <Check size={15} aria-hidden="true" />
          {pending ? "Salvando..." : initial ? "Salvar regra" : "Criar regra"}
        </button>
      </div>
    </form>
  );
}

function GuimoRuleListItem({
  workspaceId,
  integrationId,
  rule,
  canManage,
  pending,
  setPending,
  updateRuleAction,
  deleteRuleAction,
  onResult,
  onRefresh,
}: {
  workspaceId: string;
  integrationId: string;
  rule: GuimoConversionRuleDto;
  canManage: boolean;
  pending: string | null;
  setPending: (value: string | null) => void;
  updateRuleAction: ConversionRuleAction;
  deleteRuleAction: ConversionRuleAction;
  onResult: (result: GuimoConversionRuleActionResult) => void;
  onRefresh: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const editKey = `edit-rule-${rule.id}`;
  const toggleKey = `toggle-rule-${rule.id}`;
  const deleteKey = `delete-rule-${rule.id}`;

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("workspaceId", workspaceId);
    formData.set("integrationId", integrationId);
    formData.set("ruleId", rule.id);

    setPending(editKey);
    const result = await updateRuleAction(formData);
    onResult(result);
    if (result.ok) {
      setEditOpen(false);
      onRefresh();
    }
    setPending(null);
  }

  async function toggleActive() {
    if (pending) return;

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("integrationId", integrationId);
    formData.set("ruleId", rule.id);
    formData.set("active", rule.active ? "false" : "true");

    setPending(toggleKey);
    const result = await updateRuleAction(formData);
    onResult(result);
    if (result.ok) onRefresh();
    setPending(null);
  }

  async function removeRule() {
    if (pending) return;
    if (
      !window.confirm(
        `Remover a regra do estagio "${rule.stageName}"? Essa acao nao pode ser desfeita.`,
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("integrationId", integrationId);
    formData.set("ruleId", rule.id);

    setPending(deleteKey);
    const result = await deleteRuleAction(formData);
    onResult(result);
    if (result.ok) onRefresh();
    setPending(null);
  }

  return (
    <article className="provider-conversion-rule">
      <div className="provider-conversion-rule-main">
        <div className="provider-conversion-rule-icon">
          <Database size={17} aria-hidden="true" />
        </div>
        <div className="provider-conversion-rule-copy">
          <div className="provider-conversion-rule-title">
            <strong>{rule.stageName}</strong>
            <span className="event-chip neutral">{eventLabel(rule.eventName)}</span>
            <span className={`event-chip ${rule.active ? "success" : "warn"}`}>
              {rule.active ? "Ativa" : "Pausada"}
            </span>
          </div>
          <span>Estagio na Guimo: {rule.stageName}</span>
          <small>
            {rule.valueMode === "fixed"
              ? `Valor fixo: ${moneyLabel(rule.fixedValueCents)}`
              : "Valor dinamico do negocio (Guimo)"}
          </small>
        </div>
      </div>

      {canManage ? (
        <div className="provider-conversion-rule-actions">
          <button
            className="icon-button"
            type="button"
            title={rule.active ? "Pausar regra" : "Retomar regra"}
            aria-label={
              rule.active
                ? `Pausar regra de ${rule.stageName}`
                : `Retomar regra de ${rule.stageName}`
            }
            disabled={Boolean(pending)}
            onClick={() => void toggleActive()}
          >
            {rule.active ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </button>
          <button
            className="icon-button danger"
            type="button"
            title="Remover regra"
            aria-label={`Remover regra de ${rule.stageName}`}
            disabled={Boolean(pending)}
            onClick={() => void removeRule()}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {canManage ? (
        <details
          className="provider-conversion-rule-scope"
          open={editOpen}
          onToggle={(event) => setEditOpen(event.currentTarget.open)}
        >
          <summary>
            <span>Editar regra</span>
            <strong>
              <Pencil size={13} aria-hidden="true" /> {rule.stageName}
            </strong>
          </summary>
          <GuimoRuleForm
            pending={pending === editKey}
            onSubmit={handleEditSubmit}
            initial={rule}
          />
        </details>
      ) : null}
    </article>
  );
}

function moneyLabel(valueCents: number | null): string {
  if (valueCents == null) {
    return "Valor nao informado";
  }

  return (valueCents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponivel";

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: displayTimeZone,
  });
}
