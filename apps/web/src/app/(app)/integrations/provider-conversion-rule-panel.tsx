"use client";

import type {
  InboundWebhookChannelDto,
  ProviderConversionRuleDto,
  StructuredCatalogMatchReasonCodeDto,
  StructuredCatalogTestMessageResultDto,
} from "@wpptrack/shared";
import {
  BookOpen,
  Check,
  Copy,
  FlaskConical,
  MessageSquareText,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { PresentationMask } from "../../../components/presentation-mask";
import type {
  ProviderConversionRuleActionResult,
  ProviderConversionRuleOneTimeSecret,
} from "./provider-conversion-rule-actions";

type ProviderRuleAction = (
  formData: FormData,
) => Promise<ProviderConversionRuleActionResult>;

type RuleKind =
  | "qualified_automation"
  | "purchase_automation"
  | "purchase_message"
  | "purchase_catalog";

type CatalogAttributeDraft = {
  id: number;
  label: string;
};

type CatalogVariantDraft = {
  id: number;
  values: string[];
  aliases: string[];
  value: string;
  contentName: string;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

export type ProviderConversionRulePanelProps = {
  connectionId: string;
  channels: InboundWebhookChannelDto[];
  rules: ProviderConversionRuleDto[];
  enabled: boolean;
  canManage: boolean;
  createAction: ProviderRuleAction;
  updateAction: ProviderRuleAction;
  rotateEndpointAction: ProviderRuleAction;
  reprocessLatestAction: ProviderRuleAction;
  removeAction: ProviderRuleAction;
  testMessageAction: ProviderRuleAction;
};

export function ProviderConversionRulePanel({
  connectionId,
  channels,
  rules,
  enabled,
  canManage,
  createAction,
  updateAction,
  rotateEndpointAction,
  reprocessLatestAction,
  removeAction,
  testMessageAction,
}: ProviderConversionRulePanelProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [kind, setKind] = useState<RuleKind>("qualified_automation");
  const [name, setName] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(() =>
    channels.map((channel) => channel.id),
  );
  const [averageValue, setAverageValue] = useState("");
  const [contentName, setContentName] = useState("");
  const [triggerPhrases, setTriggerPhrases] = useState("");
  const [messageAuthorScope, setMessageAuthorScope] = useState<
    "team" | "contact" | "both"
  >("team");
  const [catalogName, setCatalogName] = useState("");
  const [productName, setProductName] = useState("");
  const [attributes, setAttributes] = useState<CatalogAttributeDraft[]>([
    { id: 1, label: "" },
  ]);
  const [variants, setVariants] = useState<CatalogVariantDraft[]>([
    emptyVariant(1, 1),
  ]);
  const [nextAttributeId, setNextAttributeId] = useState(2);
  const [nextVariantId, setNextVariantId] = useState(2);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [oneTimeSecret, setOneTimeSecret] =
    useState<ProviderConversionRuleOneTimeSecret | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) return;

    const payload = buildCreatePayload({
      connectionId,
      kind,
      name,
      selectedChannelIds,
      averageValue,
      contentName,
      triggerPhrases,
      messageAuthorScope,
      catalogName,
      productName,
      attributes,
      variants,
    });

    if (!payload.ok) {
      setNotice({ tone: "error", message: payload.message });
      return;
    }

    const formData = new FormData();
    formData.set("payload", JSON.stringify(payload.value));
    setPending("create");
    setNotice(null);
    const result = await createAction(formData);
    applyResult(result);

    if (result.ok) {
      setCreateOpen(false);
      setName("");
      if (result.oneTimeSecret) {
        setOneTimeSecret(result.oneTimeSecret);
        setCopied(false);
      }
      router.refresh();
    }

    setPending(null);
  }

  async function runRuleAction(
    key: string,
    action: ProviderRuleAction,
    values: Record<string, string>,
  ) {
    if (pending) return;

    const formData = new FormData();
    for (const [field, value] of Object.entries(values)) {
      formData.set(field, value);
    }

    setPending(key);
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

    setPending(null);
  }

  function applyResult(result: ProviderConversionRuleActionResult) {
    setNotice({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
  }

  async function copyWebhookUrl() {
    if (!oneTimeSecret) return;

    try {
      await navigator.clipboard.writeText(oneTimeSecret.webhookUrl);
      setCopied(true);
      setNotice({
        tone: "success",
        message: "URL copiada. Cadastre-a na automacao da Umbler.",
      });
    } catch {
      setNotice({
        tone: "error",
        message: "Nao foi possivel copiar automaticamente. Selecione a URL.",
      });
    }
  }

  function toggleChannel(channelId: string) {
    setSelectedChannelIds((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  }

  function addAttribute() {
    if (attributes.length >= 2) return;

    setAttributes((current) => [
      ...current,
      { id: nextAttributeId, label: "" },
    ]);
    setVariants((current) =>
      current.map((variant) => ({
        ...variant,
        values: [...variant.values, ""],
        aliases: [...variant.aliases, ""],
      })),
    );
    setNextAttributeId((current) => current + 1);
  }

  function removeAttribute(index: number) {
    if (attributes.length <= 1) return;

    setAttributes((current) => current.filter((_, item) => item !== index));
    setVariants((current) =>
      current.map((variant) => ({
        ...variant,
        values: variant.values.filter((_, item) => item !== index),
        aliases: variant.aliases.filter((_, item) => item !== index),
      })),
    );
  }

  function addVariant() {
    setVariants((current) => [
      ...current,
      emptyVariant(nextVariantId, attributes.length),
    ]);
    setNextVariantId((current) => current + 1);
  }

  function updateVariant(
    variantId: number,
    update: (variant: CatalogVariantDraft) => CatalogVariantDraft,
  ) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId ? update(variant) : variant,
      ),
    );
  }

  return (
    <section className="provider-conversion-panel">
      <header className="provider-conversion-heading">
        <div>
          <span className="eyebrow">Eventos de conversao</span>
          <h3>Qualificados e compras</h3>
          <p className="muted">
            Regras independentes por canal, preservadas em observacao antes de
            qualquer envio.
          </p>
        </div>
        <div className="provider-conversion-heading-actions">
          <span className={`event-chip ${enabled ? "success" : "warn"}`}>
            {enabled ? "Observacao disponivel" : "Indisponivel"}
          </span>
          {canManage && enabled && channels.length > 0 ? (
            <button
              className="button"
              type="button"
              onClick={() => setCreateOpen((current) => !current)}
              aria-expanded={createOpen}
            >
              {createOpen ? (
                <X size={15} aria-hidden="true" />
              ) : (
                <Plus size={15} aria-hidden="true" />
              )}
              {createOpen ? "Fechar" : "Nova regra"}
            </button>
          ) : null}
        </div>
      </header>

      {oneTimeSecret ? (
        <div
          className="provider-conversion-secret"
          data-presentation-sensitive-action="true"
        >
          <div>
            <span className="micro-label">URL exibida uma unica vez</span>
            <strong>Webhook da automacao Umbler</strong>
          </div>
          <input
            readOnly
            value={oneTimeSecret.webhookUrl}
            aria-label="URL privada da automacao Umbler"
            data-presentation-sensitive-field="true"
          />
          <button className="button" type="button" onClick={copyWebhookUrl}>
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
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
            <X size={15} aria-hidden="true" />
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

      {createOpen ? (
        <form className="provider-conversion-builder" onSubmit={handleCreate}>
          <div className="provider-conversion-kind" role="radiogroup">
            <RuleKindButton
              active={kind === "qualified_automation"}
              icon={<Tag size={15} aria-hidden="true" />}
              label="Lead qualificado por tag"
              onClick={() => setKind("qualified_automation")}
            />
            <RuleKindButton
              active={kind === "purchase_automation"}
              icon={<ShoppingBag size={15} aria-hidden="true" />}
              label="Compra por tag"
              onClick={() => setKind("purchase_automation")}
            />
            <RuleKindButton
              active={kind === "purchase_catalog"}
              icon={<BookOpen size={15} aria-hidden="true" />}
              label="Compra por catalogo"
              onClick={() => {
                setKind("purchase_catalog");
                setMessageAuthorScope("both");
              }}
            />
            <RuleKindButton
              active={kind === "purchase_message"}
              icon={<MessageSquareText size={15} aria-hidden="true" />}
              label="Compra por mensagem"
              onClick={() => {
                setKind("purchase_message");
                setMessageAuthorScope("team");
              }}
            />
          </div>

          <div className="provider-conversion-base-fields">
            <label>
              <span className="field-label">Nome da regra</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={120}
                placeholder="Ex.: Compra confirmada"
                required
              />
            </label>
            {["purchase_automation", "purchase_message"].includes(kind) ? (
              <>
                <label>
                  <span className="field-label">Valor medio (R$)</span>
                  <input
                    value={averageValue}
                    onChange={(event) => setAverageValue(event.target.value)}
                    inputMode="decimal"
                    placeholder="Ex.: 299,90"
                    required
                  />
                </label>
                <label>
                  <span className="field-label">Produto</span>
                  <input
                    value={contentName}
                    onChange={(event) => setContentName(event.target.value)}
                    maxLength={180}
                    placeholder="Ex.: Pedido medio"
                  />
                </label>
              </>
            ) : null}
          </div>

          {["purchase_message", "purchase_catalog"].includes(kind) ? (
            <div className="provider-conversion-base-fields">
              <label>
                <span className="field-label">Frases gatilho</span>
                <textarea
                  value={triggerPhrases}
                  onChange={(event) => setTriggerPhrases(event.target.value)}
                  rows={3}
                  maxLength={4_800}
                  placeholder={
                    kind === "purchase_catalog"
                      ? "Uma por linha. Ex.: Dados para confirmar o pedido"
                      : "Uma por linha. Ex.: Aviso de compra"
                  }
                  required
                />
              </label>
              <label>
                <span className="field-label">Quem pode enviar</span>
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
            </div>
          ) : null}

          <ChannelSelector
            channels={channels}
            selectedChannelIds={selectedChannelIds}
            onToggle={toggleChannel}
          />

          {kind === "purchase_catalog" ? (
            <div className="provider-catalog-builder">
              <div className="provider-catalog-meta">
                <label>
                  <span className="field-label">Nome do catalogo</span>
                  <input
                    value={catalogName}
                    onChange={(event) => setCatalogName(event.target.value)}
                    placeholder="Ex.: Produtos vendidos"
                    required
                  />
                </label>
                <label>
                  <span className="field-label">Produto principal</span>
                  <input
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="Ex.: Cama elastica"
                    required
                  />
                </label>
              </div>

              <div className="provider-catalog-section">
                <div className="provider-catalog-section-heading">
                  <div>
                    <span className="micro-label">Campos da mensagem</span>
                    <strong>Atributos</strong>
                  </div>
                  {attributes.length < 2 ? (
                    <button
                      className="button subtle"
                      type="button"
                      onClick={addAttribute}
                    >
                      <Plus size={14} aria-hidden="true" />
                      Adicionar atributo
                    </button>
                  ) : null}
                </div>
                <div className="provider-catalog-attributes">
                  {attributes.map((attribute, index) => (
                    <label key={attribute.id}>
                      <span className="field-label">Atributo {index + 1}</span>
                      <span className="provider-catalog-input-action">
                        <input
                          value={attribute.label}
                          onChange={(event) =>
                            setAttributes((current) =>
                              current.map((item) =>
                                item.id === attribute.id
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder={
                            index === 0 ? "Ex.: Tamanho" : "Ex.: Modelo"
                          }
                          required
                        />
                        {attributes.length > 1 ? (
                          <button
                            className="icon-button danger"
                            type="button"
                            title={`Remover atributo ${index + 1}`}
                            aria-label={`Remover atributo ${index + 1}`}
                            onClick={() => removeAttribute(index)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="provider-catalog-section">
                <div className="provider-catalog-section-heading">
                  <div>
                    <span className="micro-label">
                      Preco fixo por combinacao
                    </span>
                    <strong>Variantes</strong>
                  </div>
                  <button
                    className="button subtle"
                    type="button"
                    onClick={addVariant}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Adicionar variante
                  </button>
                </div>
                <div className="provider-catalog-variants">
                  {variants.map((variant, variantIndex) => (
                    <div className="provider-catalog-variant" key={variant.id}>
                      <span className="provider-catalog-variant-index">
                        {variantIndex + 1}
                      </span>
                      <div
                        className={`provider-catalog-variant-fields attributes-${attributes.length}`}
                      >
                        <div className="provider-catalog-variant-attributes">
                          {attributes.map((attribute, attributeIndex) => (
                            <div
                              className="provider-catalog-variant-attribute"
                              key={attribute.id}
                            >
                              <label>
                                <span className="field-label">
                                  {attribute.label ||
                                    `Atributo ${attributeIndex + 1}`}
                                </span>
                                <input
                                  value={variant.values[attributeIndex] ?? ""}
                                  onChange={(event) =>
                                    updateVariant(variant.id, (current) => ({
                                      ...current,
                                      values: replaceAt(
                                        current.values,
                                        attributeIndex,
                                        event.target.value,
                                      ),
                                    }))
                                  }
                                  placeholder="Valor exato"
                                  required
                                />
                              </label>
                              <label>
                                <span className="field-label">
                                  Outras formas aceitas (opcional)
                                </span>
                                <input
                                  value={variant.aliases[attributeIndex] ?? ""}
                                  onChange={(event) =>
                                    updateVariant(variant.id, (current) => ({
                                      ...current,
                                      aliases: replaceAt(
                                        current.aliases,
                                        attributeIndex,
                                        event.target.value,
                                      ),
                                    }))
                                  }
                                  placeholder="Ex.: abreviacao, outra escrita"
                                  title="Separe por virgulas apenas quando o mesmo valor puder chegar escrito de outra forma."
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                        <div className="provider-catalog-variant-commerce">
                          <label>
                            <span className="field-label">
                              Preco da combinacao (R$)
                            </span>
                            <input
                              value={variant.value}
                              onChange={(event) =>
                                updateVariant(variant.id, (current) => ({
                                  ...current,
                                  value: event.target.value,
                                }))
                              }
                              inputMode="decimal"
                              placeholder="Ex.: 1.597,00"
                              required
                            />
                          </label>
                          <label>
                            <span className="field-label">
                              Nome da variante na Meta (opcional)
                            </span>
                            <input
                              value={variant.contentName}
                              onChange={(event) =>
                                updateVariant(variant.id, (current) => ({
                                  ...current,
                                  contentName: event.target.value,
                                }))
                              }
                              placeholder="Automatico: produto + atributos"
                              title="Se ficar vazio, o nome sera montado automaticamente com o produto e os atributos desta variante."
                            />
                          </label>
                        </div>
                      </div>
                      {variants.length > 1 ? (
                        <button
                          className="icon-button danger"
                          type="button"
                          title={`Remover variante ${variantIndex + 1}`}
                          aria-label={`Remover variante ${variantIndex + 1}`}
                          onClick={() =>
                            setVariants((current) =>
                              current.filter((item) => item.id !== variant.id),
                            )
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="provider-conversion-builder-footer">
            <span className="action-note">
              A nova regra sera criada em modo de observacao.
            </span>
            <button
              className="button primary"
              type="submit"
              disabled={pending === "create"}
            >
              <Check size={15} aria-hidden="true" />
              {pending === "create" ? "Salvando..." : "Criar regra"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="provider-conversion-rule-list">
        {rules.length === 0 ? (
          <div className="provider-conversion-empty">
            <FlaskConical size={18} aria-hidden="true" />
            <span>Nenhuma regra de qualificado ou compra configurada.</span>
          </div>
        ) : (
          rules.map((rule) => {
            const automation =
              rule.conversionRule.triggerType === "provider_automation";
            const active = rule.conversionRule.active;
            const observedCallbackAvailable = Boolean(
              automation &&
              active &&
              rule.mode === "production" &&
              rule.endpoint?.lastDeliveryAt,
            );

            return (
              <article className="provider-conversion-rule" key={rule.id}>
                <div className="provider-conversion-rule-main">
                  <div className="provider-conversion-rule-icon">
                    {rule.conversionRule.eventName === "QualifiedLead" ? (
                      <Tag size={17} aria-hidden="true" />
                    ) : automation ? (
                      <ShoppingBag size={17} aria-hidden="true" />
                    ) : (
                      <BookOpen size={17} aria-hidden="true" />
                    )}
                  </div>
                  <div className="provider-conversion-rule-copy">
                    <div className="provider-conversion-rule-title">
                      <strong>{rule.conversionRule.name}</strong>
                      <span
                        className={`event-chip ${active ? "success" : "warn"}`}
                      >
                        {!active
                          ? "Pausada"
                          : rule.mode === "production"
                            ? "Envio ativo"
                            : "Observando"}
                      </span>
                    </div>
                    <span>
                      {eventLabel(rule)} / {triggerLabel(rule)} /{" "}
                      {rule.channelIds.length} canal(is)
                    </span>
                    <small>
                      {rule.lastExecution
                        ? `Ultimo resultado: ${executionStatusLabel(rule.lastExecution.status)} / ${executionReasonLabel(rule.lastExecution.reasonCode)} / ${formatDateTime(rule.lastExecution.occurredAt)}`
                        : automation
                          ? `Ultimo callback: ${formatDateTime(rule.endpoint?.lastDeliveryAt ?? null)}`
                          : `${rule.catalog?.variants.length ?? 0} variante(s) cadastrada(s)`}
                    </small>
                  </div>
                </div>

                {canManage ? (
                  <div className="provider-conversion-rule-actions">
                    {active ? (
                      <button
                        className="icon-button"
                        type="button"
                        title={
                          rule.mode === "production"
                            ? "Voltar para observacao"
                            : "Ativar envio automatico"
                        }
                        aria-label={
                          rule.mode === "production"
                            ? "Voltar para observacao"
                            : "Ativar envio automatico"
                        }
                        disabled={Boolean(pending)}
                        onClick={() => {
                          const activating = rule.mode !== "production";
                          if (
                            !activating ||
                            window.confirm(
                              `Ativar o envio automatico dos novos eventos de ${eventLabel(rule).toLocaleLowerCase("pt-BR")} reconhecidos por esta regra? O historico anterior permanecera apenas observado.`,
                            )
                          ) {
                            void runRuleAction(
                              `mode-${rule.id}`,
                              updateAction,
                              {
                                ruleId: rule.id,
                                payload: JSON.stringify({
                                  mode: activating
                                    ? "production"
                                    : "observation",
                                }),
                              },
                            );
                          }
                        }}
                      >
                        <Send size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      className="icon-button"
                      type="button"
                      title={active ? "Pausar regra" : "Retomar observacao"}
                      aria-label={
                        active ? "Pausar regra" : "Retomar observacao"
                      }
                      disabled={Boolean(pending)}
                      onClick={() =>
                        void runRuleAction(`active-${rule.id}`, updateAction, {
                          ruleId: rule.id,
                          payload: JSON.stringify({ active: !active }),
                        })
                      }
                    >
                      {active ? (
                        <Pause size={15} aria-hidden="true" />
                      ) : (
                        <Play size={15} aria-hidden="true" />
                      )}
                    </button>
                    {automation ? (
                      <button
                        className="icon-button"
                        type="button"
                        title="Gerar nova URL"
                        aria-label="Gerar nova URL"
                        disabled={Boolean(pending)}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Gerar uma nova URL invalida a URL atual desta automacao. Continuar?",
                            )
                          ) {
                            void runRuleAction(
                              `rotate-${rule.id}`,
                              rotateEndpointAction,
                              { ruleId: rule.id },
                            );
                          }
                        }}
                      >
                        <RefreshCw size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                    {observedCallbackAvailable ? (
                      <button
                        className="icon-button"
                        type="button"
                        title="Reprocessar ultimo callback observado"
                        aria-label="Reprocessar ultimo callback observado"
                        disabled={Boolean(pending)}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Reprocessar somente o ultimo callback observado desta regra e encaminha-lo para a fila normal?",
                            )
                          ) {
                            void runRuleAction(
                              `reprocess-${rule.id}`,
                              reprocessLatestAction,
                              { ruleId: rule.id },
                            );
                          }
                        }}
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      className="icon-button danger"
                      type="button"
                      title="Remover regra"
                      aria-label="Remover regra"
                      disabled={Boolean(pending)}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remover esta regra? O historico observado sera preservado.",
                          )
                        ) {
                          void runRuleAction(
                            `remove-${rule.id}`,
                            removeAction,
                            { ruleId: rule.id },
                          );
                        }
                      }}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}

                <RuleChannelEditor
                  rule={rule}
                  channels={channels}
                  canManage={canManage}
                  updateAction={updateAction}
                  onResult={applyResult}
                />

                {!automation ? (
                  <MessageRuleEditor
                    rule={rule}
                    canManage={canManage}
                    updateAction={updateAction}
                    onResult={applyResult}
                  />
                ) : null}

                {rule.catalog ? (
                  <CatalogRuleDetails
                    rule={rule}
                    canManage={canManage}
                    updateAction={updateAction}
                    testMessageAction={testMessageAction}
                    onResult={applyResult}
                  />
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function MessageRuleEditor({
  rule,
  canManage,
  updateAction,
  onResult,
}: {
  rule: ProviderConversionRuleDto;
  canManage: boolean;
  updateAction: ProviderRuleAction;
  onResult: (result: ProviderConversionRuleActionResult) => void;
}) {
  const router = useRouter();
  const [phrases, setPhrases] = useState(rule.triggerPhrases.join("\n"));
  const [authorScope, setAuthorScope] = useState<"team" | "contact" | "both">(
    rule.messageAuthorScope ?? "team",
  );
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const triggerPhrases = parseTriggerPhrases(phrases);
    if (triggerPhrases.length === 0) {
      onResult({
        ok: false,
        message: "Informe ao menos uma frase gatilho.",
      });
      return;
    }

    const formData = new FormData();
    formData.set("ruleId", rule.id);
    formData.set(
      "payload",
      JSON.stringify({ triggerPhrases, messageAuthorScope: authorScope }),
    );
    setPending(true);
    const result = await updateAction(formData);
    onResult(result);
    if (result.ok) router.refresh();
    setPending(false);
  }

  return (
    <details className="provider-conversion-rule-scope">
      <summary>
        <span>Reconhecimento da mensagem</span>
        <strong>{rule.triggerPhrases.length} frase(s)</strong>
      </summary>
      <form onSubmit={save}>
        <div className="provider-conversion-base-fields">
          <label>
            <span className="field-label">Frases gatilho</span>
            <textarea
              value={phrases}
              onChange={(event) => setPhrases(event.target.value)}
              rows={3}
              maxLength={4_800}
              readOnly={!canManage}
              required
            />
          </label>
          <label>
            <span className="field-label">Quem pode enviar</span>
            <select
              value={authorScope}
              disabled={!canManage}
              onChange={(event) =>
                setAuthorScope(
                  event.target.value as "team" | "contact" | "both",
                )
              }
            >
              <option value="team">Equipe ou bot</option>
              <option value="contact">Somente contato</option>
              <option value="both">Equipe, bot ou contato</option>
            </select>
          </label>
        </div>
        {canManage ? (
          <button className="button subtle" type="submit" disabled={pending}>
            <Check size={14} aria-hidden="true" />
            {pending ? "Salvando..." : "Salvar reconhecimento"}
          </button>
        ) : null}
      </form>
    </details>
  );
}

function RuleKindButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "active" : ""}
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function ChannelSelector({
  channels,
  selectedChannelIds,
  onToggle,
}: {
  channels: InboundWebhookChannelDto[];
  selectedChannelIds: string[];
  onToggle: (channelId: string) => void;
}) {
  return (
    <fieldset className="provider-conversion-channels">
      <legend className="field-label">Canais desta regra</legend>
      <div>
        {channels.map((channel) => (
          <label key={channel.id}>
            <input
              type="checkbox"
              checked={selectedChannelIds.includes(channel.id)}
              onChange={() => onToggle(channel.id)}
            />
            <span>
              <PresentationMask placeholder="Canal oculto">
                {channel.channelName ?? channel.connectedPhone}
              </PresentationMask>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RuleChannelEditor({
  rule,
  channels,
  canManage,
  updateAction,
  onResult,
}: {
  rule: ProviderConversionRuleDto;
  channels: InboundWebhookChannelDto[];
  canManage: boolean;
  updateAction: ProviderRuleAction;
  onResult: (result: ProviderConversionRuleActionResult) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(rule.channelIds);
  const [pending, setPending] = useState(false);

  async function saveChannels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || selected.length === 0) return;

    const formData = new FormData();
    formData.set("ruleId", rule.id);
    formData.set("payload", JSON.stringify({ channelIds: selected }));
    setPending(true);
    const result = await updateAction(formData);
    onResult(result);
    if (result.ok) router.refresh();
    setPending(false);
  }

  return (
    <details className="provider-conversion-rule-scope">
      <summary>
        <span>Canais vinculados</span>
        <strong>{rule.channelIds.length}</strong>
      </summary>
      <form onSubmit={saveChannels}>
        <div className="provider-conversion-scope-options">
          {channels.map((channel) => (
            <label key={channel.id}>
              <input
                type="checkbox"
                checked={selected.includes(channel.id)}
                disabled={!canManage || pending}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(channel.id)
                      ? current.filter((id) => id !== channel.id)
                      : [...current, channel.id],
                  )
                }
              />
              <span>
                <PresentationMask placeholder="Canal oculto">
                  {channel.channelName ?? channel.connectedPhone}
                </PresentationMask>
              </span>
            </label>
          ))}
        </div>
        {canManage ? (
          <button
            className="button subtle"
            type="submit"
            disabled={pending || selected.length === 0}
          >
            <Check size={14} aria-hidden="true" />
            {pending ? "Salvando..." : "Salvar canais"}
          </button>
        ) : null}
      </form>
    </details>
  );
}

function CatalogRuleDetails({
  rule,
  canManage,
  updateAction,
  testMessageAction,
  onResult,
}: {
  rule: ProviderConversionRuleDto;
  canManage: boolean;
  updateAction: ProviderRuleAction;
  testMessageAction: ProviderRuleAction;
  onResult: (result: ProviderConversionRuleActionResult) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [editingAliases, setEditingAliases] = useState(false);
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string[]>>(() =>
    catalogAliasDrafts(rule.catalog),
  );
  const [result, setResult] =
    useState<StructuredCatalogTestMessageResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const catalog = rule.catalog;

  if (!catalog) return null;
  const editableCatalog = catalog;

  async function handleTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("ruleId", rule.id);
    setPending(true);
    setError(null);
    const response = await testMessageAction(formData);
    if (response.ok && response.testResult) {
      setResult(response.testResult);
    } else {
      setResult(null);
      setError(response.message);
    }
    setPending(false);
  }

  async function handleAliasSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData();
    formData.set("ruleId", rule.id);
    formData.set(
      "payload",
      JSON.stringify({
        catalog: {
          name: editableCatalog.name,
          productName: editableCatalog.productName,
          currency: editableCatalog.currency,
          attributes: editableCatalog.attributes.map((attribute) => ({
            key: attribute.key,
            label: attribute.label,
          })),
          variants: editableCatalog.variants.map((variant) => ({
            attributeValues: variant.attributeValues,
            aliases: editableCatalog.attributes.map((_, attributeIndex) =>
              splitAliases(aliasDrafts[variant.id]?.[attributeIndex] ?? ""),
            ),
            valueCents: variant.valueCents,
            contentName: variant.contentName,
          })),
        },
      }),
    );

    setPending(true);
    setError(null);
    const response = await updateAction(formData);
    onResult(response);
    if (response.ok) {
      setEditingAliases(false);
      router.refresh();
    } else {
      setError(response.message);
    }
    setPending(false);
  }

  function resetAliases() {
    setAliasDrafts(catalogAliasDrafts(editableCatalog));
    setEditingAliases(false);
    setError(null);
  }

  return (
    <details className="provider-catalog-details">
      <summary>
        <span>{catalog.name}</span>
        <strong>{catalog.variants.length} variante(s)</strong>
      </summary>
      <div className="provider-catalog-details-body">
        {canManage ? (
          <div className="provider-catalog-alias-heading">
            <div>
              <span className="micro-label">Reconhecimento de escrita</span>
              <span className="muted">
                Cadastre sinonimos sem alterar combinacoes ou precos.
              </span>
            </div>
            {!editingAliases ? (
              <button
                className="button subtle"
                type="button"
                onClick={() => setEditingAliases(true)}
              >
                <Pencil size={14} aria-hidden="true" />
                Editar aliases
              </button>
            ) : null}
          </div>
        ) : null}

        {editingAliases ? (
          <form
            className="provider-catalog-alias-editor"
            onSubmit={handleAliasSave}
          >
            <div className="provider-catalog-alias-list">
              {catalog.variants.map((variant) => (
                <div
                  className={`provider-catalog-alias-row attributes-${catalog.attributes.length}`}
                  key={variant.id}
                >
                  <strong>{variant.attributeValues.join(" / ")}</strong>
                  {catalog.attributes.map((attribute, attributeIndex) => (
                    <label key={attribute.id}>
                      <span className="field-label">
                        Alias de {attribute.label}
                      </span>
                      <input
                        value={aliasDrafts[variant.id]?.[attributeIndex] ?? ""}
                        onChange={(event) =>
                          setAliasDrafts((current) => ({
                            ...current,
                            [variant.id]: replaceAt(
                              current[variant.id] ?? [],
                              attributeIndex,
                              event.target.value,
                            ),
                          }))
                        }
                        placeholder="Opcional, separado por virgulas"
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <span className="action-note">
              Os aliases preservam combinacoes, precos e todo o historico da
              regra.
            </span>
            <div className="provider-catalog-alias-actions">
              <button
                className="button subtle"
                type="button"
                disabled={pending}
                onClick={resetAliases}
              >
                <X size={14} aria-hidden="true" />
                Cancelar
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={pending}
              >
                <Check size={14} aria-hidden="true" />
                {pending ? "Salvando..." : "Salvar aliases"}
              </button>
            </div>
          </form>
        ) : null}

        <div className="provider-catalog-table" role="table">
          <div
            className={`provider-catalog-table-row heading attributes-${catalog.attributes.length}`}
            role="row"
          >
            {catalog.attributes.map((attribute) => (
              <span key={attribute.id}>{attribute.label}</span>
            ))}
            <span>Valor</span>
            <span>Evento</span>
          </div>
          {catalog.variants.map((variant) => (
            <div
              className={`provider-catalog-table-row attributes-${catalog.attributes.length}`}
              role="row"
              key={variant.id}
            >
              {variant.attributeValues.map((value, index) => (
                <strong
                  key={`${variant.id}-${catalog.attributes[index]?.id ?? index}`}
                >
                  {value}
                </strong>
              ))}
              <strong>
                {formatMoney(variant.valueCents, catalog.currency)}
              </strong>
              <span>{variant.contentName ?? catalog.productName}</span>
            </div>
          ))}
        </div>

        <form className="provider-catalog-test" onSubmit={handleTest}>
          <label>
            <span className="field-label">Testar mensagem real</span>
            <textarea
              name="messageText"
              rows={4}
              maxLength={8_192}
              placeholder="Cole a mensagem estruturada recebida da Umbler"
              required
            />
          </label>
          <button className="button" type="submit" disabled={pending}>
            <FlaskConical size={15} aria-hidden="true" />
            {pending ? "Testando..." : "Testar sem enviar"}
          </button>
          {result ? (
            <div
              className={`provider-catalog-test-result ${result.matched ? "success" : "warn"}`}
              role="status"
            >
              <strong>
                {result.matched ? "Variante reconhecida" : "Mensagem bloqueada"}
              </strong>
              <span>{catalogReasonLabel(result.reasonCode)}</span>
              {result.matched && result.parsedValueCents ? (
                <span>
                  {result.contentName} /{" "}
                  {formatMoney(
                    result.parsedValueCents,
                    result.currency ?? "BRL",
                  )}
                </span>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <div className="feedback-banner error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}
        </form>
      </div>
    </details>
  );
}

function catalogAliasDrafts(
  catalog: ProviderConversionRuleDto["catalog"],
): Record<string, string[]> {
  if (!catalog) return {};

  return Object.fromEntries(
    catalog.variants.map((variant) => [
      variant.id,
      catalog.attributes.map((_, index) =>
        (variant.aliases[index] ?? []).join(", "),
      ),
    ]),
  );
}

function buildCreatePayload(input: {
  connectionId: string;
  kind: RuleKind;
  name: string;
  selectedChannelIds: string[];
  averageValue: string;
  contentName: string;
  triggerPhrases: string;
  messageAuthorScope: "team" | "contact" | "both";
  catalogName: string;
  productName: string;
  attributes: CatalogAttributeDraft[];
  variants: CatalogVariantDraft[];
}): { ok: true; value: unknown } | { ok: false; message: string } {
  const name = input.name.trim();
  if (name.length < 2) {
    return { ok: false, message: "Informe um nome para a regra." };
  }
  if (input.selectedChannelIds.length === 0) {
    return { ok: false, message: "Selecione ao menos um canal." };
  }

  const base = {
    name,
    connectionId: input.connectionId,
    channelIds: input.selectedChannelIds,
    mode: "observation" as const,
  };

  if (input.kind === "qualified_automation") {
    return {
      ok: true,
      value: {
        ...base,
        triggerType: "provider_automation",
        eventName: "QualifiedLead",
      },
    };
  }

  if (
    input.kind === "purchase_automation" ||
    input.kind === "purchase_message"
  ) {
    const defaultValueCents = parseMoneyToCents(input.averageValue);
    if (!defaultValueCents) {
      return { ok: false, message: "Informe um valor medio valido." };
    }
    const messagePhrases = parseTriggerPhrases(input.triggerPhrases);
    if (input.kind === "purchase_message" && messagePhrases.length === 0) {
      return {
        ok: false,
        message: "Informe ao menos uma frase gatilho para reconhecer a compra.",
      };
    }

    return {
      ok: true,
      value: {
        ...base,
        triggerType:
          input.kind === "purchase_automation"
            ? "provider_automation"
            : "message_phrase",
        eventName: "Purchase",
        defaultValueCents,
        defaultCurrency: "BRL",
        defaultContentName: input.contentName.trim() || null,
        ...(input.kind === "purchase_message"
          ? {
              triggerPhrases: messagePhrases,
              messageAuthorScope: input.messageAuthorScope,
            }
          : {}),
      },
    };
  }

  const triggerPhrases = parseTriggerPhrases(input.triggerPhrases);
  if (triggerPhrases.length === 0) {
    return {
      ok: false,
      message: "Informe ao menos uma frase gatilho para reconhecer a compra.",
    };
  }

  const labels = input.attributes.map((attribute) => attribute.label.trim());
  if (labels.some((label) => !label)) {
    return { ok: false, message: "Preencha o nome de todos os atributos." };
  }
  const keys = labels.map((label, index) => catalogAttributeKey(label, index));
  if (new Set(keys).size !== keys.length) {
    return {
      ok: false,
      message: "Os atributos precisam ter nomes diferentes.",
    };
  }

  const variants = input.variants.map((variant) => ({
    attributeValues: variant.values.map((value) => value.trim()),
    aliases: variant.aliases.map((aliases) => splitAliases(aliases)),
    valueCents: parseMoneyToCents(variant.value),
    contentName: variant.contentName.trim() || null,
  }));
  if (
    variants.some(
      (variant) =>
        variant.attributeValues.some((value) => !value) || !variant.valueCents,
    )
  ) {
    return {
      ok: false,
      message: "Preencha os atributos e o valor de todas as variantes.",
    };
  }
  if (!input.catalogName.trim() || !input.productName.trim()) {
    return {
      ok: false,
      message: "Informe o nome do catalogo e do produto principal.",
    };
  }

  return {
    ok: true,
    value: {
      ...base,
      triggerType: "structured_catalog",
      eventName: "Purchase",
      triggerPhrases,
      messageAuthorScope: input.messageAuthorScope,
      catalog: {
        name: input.catalogName.trim(),
        productName: input.productName.trim(),
        currency: "BRL",
        attributes: labels.map((label, index) => ({
          key: keys[index],
          label,
        })),
        variants,
      },
    },
  };
}

function parseTriggerPhrases(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/u)
        .map((phrase) => phrase.trim())
        .filter(Boolean),
    ),
  ];
}

function emptyVariant(id: number, attributeCount: number): CatalogVariantDraft {
  return {
    id,
    values: Array.from({ length: attributeCount }, () => ""),
    aliases: Array.from({ length: attributeCount }, () => ""),
    value: "",
    contentName: "",
  };
}

function replaceAt(values: string[], index: number, value: string): string[] {
  return values.map((current, item) => (item === index ? value : current));
}

function splitAliases(value: string): string[] {
  return value
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function catalogAttributeKey(label: string, index: number): string {
  const normalized = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return /^[a-z]/.test(normalized) ? normalized : `atributo_${index + 1}`;
}

export function parseMoneyToCents(value: string): number | null {
  let normalized = value.trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!normalized) return null;

  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = normalized.split(".");
    if (parts.length > 2) {
      const decimal = parts.pop();
      normalized = `${parts.join("")}.${decimal}`;
    }
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function eventLabel(rule: ProviderConversionRuleDto): string {
  return rule.conversionRule.eventName === "QualifiedLead"
    ? "Lead qualificado"
    : "Compra";
}

function triggerLabel(rule: ProviderConversionRuleDto): string {
  if (rule.conversionRule.triggerType === "structured_catalog") {
    return "Mensagem com catalogo";
  }
  if (rule.conversionRule.triggerType === "message_phrase") {
    return "Mensagem com valor medio";
  }
  return "Automacao por tag";
}

function executionStatusLabel(
  status: NonNullable<ProviderConversionRuleDto["lastExecution"]>["status"],
): string {
  const labels = {
    observed: "Observado",
    eligible: "Pronto para envio",
    materialized: "Evento criado",
    duplicate: "Duplicado",
    blocked: "Bloqueado",
    failed: "Falhou",
  } satisfies Record<
    NonNullable<ProviderConversionRuleDto["lastExecution"]>["status"],
    string
  >;

  return labels[status];
}

function executionReasonLabel(reasonCode: string | null): string {
  if (!reasonCode) return "Processado";

  const labels: Record<string, string> = {
    catalog_matched: "Catalogo reconhecido",
    catalog_matched_observation: "Reconhecido em observacao",
    message_matched: "Mensagem reconhecida",
    message_matched_observation: "Reconhecido em observacao",
    automation_matched: "Automacao reconhecida",
    automation_matched_observation: "Reconhecido em observacao",
    automation_manual_reprocess_approved: "Reprocessamento autorizado",
    automation_event_mismatch: "Evento diferente da regra",
    automation_channel_unresolved: "Canal nao localizado",
    automation_paid_lead_missing: "Lead pago nao localizado",
    automation_value_missing: "Valor medio nao configurado",
    before_production_activation: "Historico preservado",
    production_context_invalid: "Configuracao incompleta",
    purchase_within_24h: "Compra repetida em menos de 24h",
    provider_conversion_paid_lead_missing: "Lead pago nao localizado",
    provider_conversion_catalog_mismatch: "Mensagem divergiu do catalogo",
    provider_conversion_payload_unavailable: "Payload nao esta mais disponivel",
    provider_conversion_source_event_mismatch: "Mensagem de origem invalida",
    provider_conversion_value_missing: "Valor medio nao configurado",
    qualified_lead_already_materialized: "Lead ja qualificado anteriormente",
  };

  if (reasonCode.startsWith("provider_conversion_route_")) {
    return "Rota Meta indisponivel";
  }

  return labels[reasonCode] ?? catalogReasonLabelSafe(reasonCode);
}

function catalogReasonLabelSafe(reasonCode: string): string {
  const labels: Record<string, string> = {
    matched: "Catalogo reconhecido",
    rule_inactive: "Regra pausada",
    catalog_inactive: "Catalogo pausado",
    missing_attribute: "Atributo ausente",
    ambiguous_attribute: "Atributo ambiguo",
    unknown_combination: "Combinacao nao cadastrada",
    ambiguous_variant: "Variante ambigua",
    missing_price: "Valor ausente",
    ambiguous_price: "Mais de um valor encontrado",
    price_mismatch: "Valor diferente do catalogo",
    trigger_missing: "Frase gatilho ausente",
    awaiting_data: "Aguardando dados completos",
    incomplete_item: "Produto incompleto",
    invalid_quantity: "Quantidade invalida",
  };

  return labels[reasonCode] ?? "Requer revisao";
}

function catalogReasonLabel(
  reasonCode: StructuredCatalogMatchReasonCodeDto,
): string {
  const labels: Record<StructuredCatalogMatchReasonCodeDto, string> = {
    matched: "Combinacao e preco conferidos.",
    rule_inactive: "A regra esta pausada.",
    catalog_inactive: "O catalogo esta inativo.",
    missing_attribute: "A mensagem nao contem todos os atributos.",
    ambiguous_attribute: "Um atributo apareceu com mais de um valor.",
    unknown_combination: "A combinacao nao existe no catalogo.",
    ambiguous_variant: "Mais de uma variante corresponde a mensagem.",
    missing_price: "Nenhum preco foi encontrado na mensagem.",
    ambiguous_price: "Mais de um preco foi encontrado na mensagem.",
    price_mismatch: "O preco da mensagem difere do catalogo.",
    trigger_missing: "A frase gatilho nao foi encontrada.",
    awaiting_data: "A mensagem ainda nao contem os dados da compra.",
    incomplete_item: "Um produto esta sem tamanho ou modelo.",
    invalid_quantity: "A quantidade informada nao e valida.",
  };

  return labels[reasonCode];
}

function formatMoney(valueCents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(valueCents / 100);
}

function formatDateTime(value: string | null): string {
  if (!value) return "Ainda nao recebido";

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}
