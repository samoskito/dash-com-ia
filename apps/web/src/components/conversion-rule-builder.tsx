"use client";

import { useCallback, useState } from "react";
import {
  BackofficeActionForm,
  type BackofficeActionState,
  type BackofficeFormAction
} from "./backoffice-action-form";
import { PendingSubmitButton } from "./pending-submit-button";

type TriggerMode = "keyword_contains" | "keyword_exact" | "whatsapp_label";

type ConversionRuleBuilderEvent = {
  label: string;
  supportsValue: boolean;
  value: string;
};

type ConversionRuleBuilderProps = {
  action: BackofficeFormAction;
  events: readonly ConversionRuleBuilderEvent[];
  whatsappLabels: string[];
  whatsappLabelsState: "real" | "empty" | "error";
};

export function ConversionRuleBuilder({
  action,
  events,
  whatsappLabels,
  whatsappLabelsState
}: ConversionRuleBuilderProps) {
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("keyword_contains");
  const [eventName, setEventName] = useState("LeadSubmitted");
  const selectedEvent = events.find((event) => event.value === eventName) ?? events[0];
  const usesWhatsappLabel = triggerMode === "whatsapp_label";
  const matchMode = triggerMode === "keyword_exact" ? "exact" : "contains";

  const handleSuccess = useCallback((_state: BackofficeActionState) => {
    setTriggerMode("keyword_contains");
    setEventName("LeadSubmitted");
  }, []);

  return (
    <BackofficeActionForm
      action={action}
      className="conversion-rule-builder"
      onSuccess={handleSuccess}
      resetOnSuccess
    >
      <input
        name="triggerType"
        type="hidden"
        value={usesWhatsappLabel ? "whatsapp_label" : "keyword"}
      />
      <input name="matchMode" type="hidden" value={matchMode} />

      <div className="rule-builder-step">
        <span className="rule-builder-index" aria-hidden="true">
          1
        </span>
        <div className="rule-builder-step-content">
          <div className="rule-builder-step-heading">
            <span className="micro-label">Quando</span>
            <strong>Defina o gatilho recebido no WhatsApp</strong>
          </div>
          <div className="rule-builder-fields trigger-fields">
            <label>
              <span>Tipo de gatilho</span>
              <select
                aria-label="Tipo de gatilho"
                value={triggerMode}
                onChange={(event) => setTriggerMode(event.target.value as TriggerMode)}
              >
                <option value="keyword_contains">Mensagem contem palavra ou frase</option>
                <option value="keyword_exact">Mensagem e exatamente igual</option>
                <option value="whatsapp_label">Etiqueta e aplicada</option>
              </select>
            </label>
            <label>
              <span>{usesWhatsappLabel ? "Etiqueta" : "Palavra ou frase"}</span>
              <input
                key={triggerMode}
                list={
                  usesWhatsappLabel && whatsappLabels.length ? "whatsapp-label-options" : undefined
                }
                name="triggerValue"
                placeholder={usesWhatsappLabel ? "Ex.: Venda fechada" : "Ex.: proposta"}
                required
              />
            </label>
          </div>
          <p className="rule-builder-hint">
            {triggerMode === "keyword_contains"
              ? 'Exemplo: "proposta" tambem reconhece "quero receber uma proposta hoje", sem diferenciar maiusculas.'
              : triggerMode === "keyword_exact"
                ? "Use quando a mensagem inteira precisar ser igual ao texto informado."
                : whatsappLabels.length
                  ? `${whatsappLabels.length} etiqueta${whatsappLabels.length === 1 ? "" : "s"} disponivel${whatsappLabels.length === 1 ? "" : "is"} para selecionar.`
                  : whatsappLabelsState === "error"
                    ? "As etiquetas nao puderam ser carregadas agora, mas ainda podem ser digitadas."
                    : "Digite o nome exato da etiqueta aplicada no WhatsApp."}
          </p>
          {whatsappLabels.length ? (
            <datalist id="whatsapp-label-options">
              {whatsappLabels.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          ) : null}
        </div>
      </div>

      <div className="rule-builder-step">
        <span className="rule-builder-index" aria-hidden="true">
          2
        </span>
        <div className="rule-builder-step-content">
          <div className="rule-builder-step-heading">
            <span className="micro-label">Entao</span>
            <strong>Escolha o evento que sera registrado</strong>
          </div>
          <div
            className={`rule-builder-fields${selectedEvent?.supportsValue ? " commercial" : ""}`}
          >
            <label>
              <span>Evento</span>
              <select
                name="eventName"
                value={eventName}
                onChange={(event) => setEventName(event.target.value)}
              >
                {events.map((event) => (
                  <option key={event.value} value={event.value}>
                    {event.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedEvent?.supportsValue ? (
              <>
                <label>
                  <span>Produto ou servico</span>
                  <input name="productName" placeholder="Ex.: Consultoria" />
                </label>
                <label>
                  <span>Valor da conversao</span>
                  <input inputMode="decimal" name="defaultValue" placeholder="0,00" />
                </label>
                <label>
                  <span>Moeda</span>
                  <select name="defaultCurrency" defaultValue="BRL">
                    <option value="BRL">BRL</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rule-builder-command">
        <details className="rule-name-details">
          <summary>Nome interno opcional</summary>
          <label>
            <span>Nome da regra</span>
            <input name="name" placeholder="Gerado automaticamente se ficar vazio" />
          </label>
        </details>
        <PendingSubmitButton
          className="button primary"
          label="Criar gatilho"
          pendingLabel="Criando gatilho..."
        />
      </div>
    </BackofficeActionForm>
  );
}
