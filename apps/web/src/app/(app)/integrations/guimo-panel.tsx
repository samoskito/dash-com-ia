"use client";

import type { GuimoIntegrationDto } from "@wpptrack/shared";
import { Check, Copy, Plus, RefreshCw, Webhook, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { displayTimeZone } from "../../../lib/date-time";
import type { GuimoActionResult, GuimoOneTimeWebhook } from "./guimo-actions";

type GuimoAction = (formData: FormData) => Promise<GuimoActionResult>;

export type GuimoPanelProps = {
  workspaceId: string;
  integrations: GuimoIntegrationDto[];
  canManage: boolean;
  provisionAction: GuimoAction;
  rotateAction: GuimoAction;
};

type PanelNotice = {
  tone: "success" | "error";
  message: string;
};

export function guimoStatusLabel(status: GuimoIntegrationDto["status"]): string {
  return status === "active" ? "Ativa" : "Bloqueada";
}

export function GuimoPanel({
  workspaceId,
  integrations,
  canManage,
  provisionAction,
  rotateAction,
}: GuimoPanelProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(integrations.length === 0);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const [oneTimeWebhook, setOneTimeWebhook] =
    useState<GuimoOneTimeWebhook | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pendingAction) {
      return;
    }

    const form = event.currentTarget;
    setPendingAction("create");
    setNotice(null);
    const result = await provisionAction(new FormData(form));
    applyResult(result);

    if (result.ok && result.oneTimeWebhook) {
      form.reset();
      setOneTimeWebhook(result.oneTimeWebhook);
      setCopiedToken(false);
      setCopiedUrl(false);
      setCreateOpen(false);
      router.refresh();
    }

    setPendingAction(null);
  }

  async function handleRotate(integrationId: string) {
    if (pendingAction) {
      return;
    }

    if (
      !window.confirm(
        "Gerar um novo token invalida o token atual. Continuar?",
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("integrationId", integrationId);

    setPendingAction(`rotate-${integrationId}`);
    setNotice(null);
    const result = await rotateAction(formData);
    applyResult(result);

    if (result.ok && result.oneTimeWebhook) {
      setOneTimeWebhook(result.oneTimeWebhook);
      setCopiedToken(false);
      setCopiedUrl(false);
      router.refresh();
    }

    setPendingAction(null);
  }

  function applyResult(result: GuimoActionResult) {
    setNotice({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
  }

  async function copyToken() {
    if (!oneTimeWebhook) {
      return;
    }

    try {
      await navigator.clipboard.writeText(oneTimeWebhook.webhookToken);
      setCopiedToken(true);
      setNotice({ tone: "success", message: "Token copiado." });
    } catch {
      setNotice({
        tone: "error",
        message: "Nao foi possivel copiar automaticamente. Selecione o token.",
      });
    }
  }

  async function copyUrl() {
    if (!oneTimeWebhook) {
      return;
    }

    const value = oneTimeWebhook.webhookUrl ?? oneTimeWebhook.webhookPath;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedUrl(true);
      setNotice({ tone: "success", message: "URL copiada." });
    } catch {
      setNotice({
        tone: "error",
        message: "Nao foi possivel copiar automaticamente. Selecione a URL.",
      });
    }
  }

  return (
    <section className="surface-panel guimo-panel">
      <div className="inbound-webhook-heading">
        <div>
          <span className="eyebrow">Movimentacoes de funil (CRM)</span>
          <h2>Guimo CRM</h2>
          <p className="muted">
            Receba movimentacoes de estagio do Guimo e converta leads
            qualificados e vendas automaticamente.
          </p>
        </div>
        {canManage ? (
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
            {createOpen ? "Fechar" : "Nova integracao Guimo"}
          </button>
        ) : (
          <span className="status-chip">
            Apenas o owner do workspace pode gerenciar
          </span>
        )}
      </div>

      {createOpen && canManage ? (
        <form className="guimo-integration-form" onSubmit={handleCreate}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <label>
            <span className="field-label">Estagio qualificado - ID</span>
            <input
              name="qualifiedStageId"
              placeholder="Ex.: 123"
              disabled={pendingAction === "create"}
            />
          </label>
          <label>
            <span className="field-label">Estagio qualificado - nome</span>
            <input
              name="qualifiedStageName"
              placeholder="Ex.: Lead Qualificado"
              disabled={pendingAction === "create"}
            />
          </label>
          <label>
            <span className="field-label">Estagio de compra - ID</span>
            <input
              name="purchaseStageId"
              placeholder="Ex.: 456"
              disabled={pendingAction === "create"}
            />
          </label>
          <label>
            <span className="field-label">Estagio de compra - nome</span>
            <input
              name="purchaseStageName"
              placeholder="Ex.: Venda Fechada"
              disabled={pendingAction === "create"}
            />
          </label>
          <label>
            <span className="field-label">Moeda da compra</span>
            <input
              name="purchaseCurrency"
              defaultValue="BRL"
              maxLength={10}
              disabled={pendingAction === "create"}
            />
          </label>
          <label>
            <span className="field-label">Unidade do valor</span>
            <select
              name="purchaseValueUnit"
              defaultValue="cents"
              disabled={pendingAction === "create"}
            >
              <option value="major">Valor cheio (Ex.: 199.90)</option>
              <option value="cents">Centavos (Ex.: 19990)</option>
            </select>
          </label>
          <label>
            <span className="field-label">CRM - Authorization</span>
            <input
              type="password"
              name="crmAuthorization"
              placeholder="Bearer ..."
              autoComplete="off"
              disabled={pendingAction === "create"}
            />
          </label>
          <label>
            <span className="field-label">CRM - X-API-Key</span>
            <input
              type="password"
              name="crmApiKey"
              placeholder="Chave de API"
              autoComplete="off"
              disabled={pendingAction === "create"}
            />
          </label>
          <button
            className="button primary"
            type="submit"
            disabled={pendingAction === "create"}
          >
            <Webhook size={16} aria-hidden="true" />
            {pendingAction === "create" ? "Provisionando..." : "Provisionar integracao"}
          </button>
        </form>
      ) : null}

      {oneTimeWebhook ? (
        <div className="inbound-webhook-secret guimo-webhook-secret">
          <div>
            <span className="micro-label">Mostrados uma unica vez</span>
            <strong>Anote o token e a URL agora</strong>
          </div>
          <input
            readOnly
            value={oneTimeWebhook.webhookToken}
            aria-label="Token privado do webhook Guimo"
          />
          <button className="button" type="button" onClick={copyToken}>
            {copiedToken ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copiedToken ? "Copiado" : "Copiar token"}
          </button>
          <input
            readOnly
            value={oneTimeWebhook.webhookUrl ?? oneTimeWebhook.webhookPath}
            aria-label="URL do webhook Guimo"
          />
          <button className="button" type="button" onClick={copyUrl}>
            {copiedUrl ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copiedUrl ? "Copiada" : "Copiar URL"}
          </button>
          <button
            className="icon-button"
            type="button"
            title="Ocultar"
            aria-label="Ocultar token e URL"
            onClick={() => setOneTimeWebhook(null)}
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

      <div className="guimo-setup-instructions">
        <span className="micro-label">Como configurar no Guimo/n8n</span>
        <p className="muted">
          Aponte o webhook do Guimo (ou o fluxo n8n responsavel) para a URL da
          integracao e envie o header{" "}
          <code>x-wpptrack-webhook-token</code> com o token gerado nesta tela.
        </p>
      </div>

      <div className="guimo-integration-list">
        {integrations.length === 0 ? (
          <div className="inbound-empty-state">
            <Webhook size={20} aria-hidden="true" />
            <div>
              <strong>Nenhuma integracao Guimo configurada</strong>
              <p className="muted">
                Provisione uma integracao para receber o primeiro evento de
                teste.
              </p>
            </div>
          </div>
        ) : (
          integrations.map((integration) => {
            const rotatePending =
              pendingAction === `rotate-${integration.id}`;

            return (
              <details className="inbound-connection" key={integration.id}>
                <summary>
                  <div className="inbound-connection-identity">
                    <span
                      className={`status-dot ${integration.status === "active" ? "active" : ""}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{guimoStatusLabel(integration.status)}</strong>
                      <span>
                        {integration.qualifiedStageName ??
                          integration.qualifiedStageId ??
                          "Estagio qualificado nao configurado"}
                      </span>
                    </div>
                  </div>
                  <div className="inbound-connection-health">
                    <span>
                      {integration.hasCrmHeaders
                        ? "Credenciais CRM configuradas"
                        : "Credenciais CRM pendentes"}
                    </span>
                    <span>Atualizada em {formatDateTime(integration.updatedAt)}</span>
                  </div>
                </summary>
                <div className="inbound-connection-body">
                  <div className="guimo-integration-detail">
                    <DetailField
                      label="Estagio qualificado"
                      value={integration.qualifiedStageName ?? integration.qualifiedStageId}
                    />
                    <DetailField
                      label="Estagio de compra"
                      value={integration.purchaseStageName ?? integration.purchaseStageId}
                    />
                    <DetailField
                      label="Moeda"
                      value={integration.purchaseCurrency}
                    />
                    <DetailField
                      label="Unidade do valor"
                      value={integration.purchaseValueUnit}
                    />
                  </div>

                  {canManage ? (
                    <div className="inbound-connection-actions">
                      <button
                        className="button"
                        type="button"
                        disabled={rotatePending}
                        onClick={() => void handleRotate(integration.id)}
                      >
                        <RefreshCw size={15} aria-hidden="true" />
                        {rotatePending ? "Girando..." : "Girar novo token"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })
        )}
      </div>
    </section>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="guimo-detail-field">
      <span>{label}</span>
      <strong>{value ?? "Nao configurado"}</strong>
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Data indisponivel";
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: displayTimeZone,
  });
}
