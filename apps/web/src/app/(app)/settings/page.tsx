import type {
  ConversionEventNameDto,
  ConversionRuleDto,
  CurrentWorkspaceDto,
  FunnelConfigurationDto,
  WhatsappInstanceSummaryDto,
  WhatsappLabelDto,
  WorkspaceInviteDto,
  WorkspaceMemberDto
} from "@wpptrack/shared";
import { conversionEventDisplayLabels } from "@wpptrack/shared";
import { revalidatePath } from "next/cache";
import {
  BackofficeActionForm,
  type BackofficeActionState
} from "../../../components/backoffice-action-form";
import { ConversionRuleBuilder } from "../../../components/conversion-rule-builder";
import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { displayTimeZone } from "../../../lib/date-time";
import { serverApiFetch } from "../../../lib/server-api";
import { getCurrentWorkspace } from "../../../lib/current-workspace";

type AccountUserDto = {
  id: string;
  email: string;
  name: string | null;
  authProvider: string;
  emailVerifiedAt: string | null;
};

type AccountSettingsResult = {
  user: AccountUserDto | null;
  state: "real" | "error";
};

type ConversionRulesResult = {
  rules: ConversionRuleDto[];
  state: "real" | "empty" | "error";
};

type FunnelConfigurationResult = {
  configuration: FunnelConfigurationDto;
  state: "real" | "error";
};

type WorkspaceSettingsResult = {
  workspace: CurrentWorkspaceDto | null;
  members: WorkspaceMemberDto[];
  invites: WorkspaceInviteDto[];
  state: "real" | "empty" | "error";
};

type WhatsappLabelSuggestionsResult = {
  labels: string[];
  state: "real" | "empty" | "error";
};

const supportedConversionEventNames = [
  "LeadSubmitted",
  "QualifiedLead",
  "OrderShipped",
  "OrderDelivered",
  "OrderCanceled",
  "OrderReturned",
  "RatingProvided",
  "ReviewProvided",
  "ViewContent",
  "AddToCart",
  "CartAbandoned",
  "InitiateCheckout",
  "Purchase",
  "OrderCreated"
] as const;

const eventsWithCommercialValue = new Set<ConversionEventNameDto>(["Purchase", "OrderCreated"]);

function settingsActionState(
  status: BackofficeActionState["status"],
  message: string
): BackofficeActionState {
  return {
    status,
    message,
    nonce: Date.now()
  };
}

function eventDisplayLabel(eventName: ConversionEventNameDto): string {
  return conversionEventDisplayLabels[eventName];
}

function eventSupportsCommercialValue(eventName: string): boolean {
  return eventsWithCommercialValue.has(eventName as ConversionEventNameDto);
}

function workspaceRoleLabel(role: WorkspaceMemberDto["role"]): string {
  if (role === "owner") {
    return "Responsavel da conta";
  }

  if (role === "admin") {
    return "Administrador";
  }

  return "Analista";
}

function workspaceRoleDescription(role: WorkspaceMemberDto["role"]): string {
  if (role === "owner") {
    return "Equipe, integracoes e cobranca";
  }

  if (role === "admin") {
    return "Equipe e integracoes";
  }

  return "Leads e relatorios";
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function parseMoneyToCents(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function productItems(productName: string, valueCents: number | null) {
  if (!productName) {
    return null;
  }

  const id =
    productName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "produto";

  return [
    {
      id,
      quantity: 1,
      ...(valueCents === null ? {} : { item_price: valueCents / 100 })
    }
  ];
}

function moneyInputValue(valueCents: number | null | undefined): string {
  return valueCents == null ? "" : (valueCents / 100).toFixed(2).replace(".", ",");
}

function moneyLabel(valueCents: number | null | undefined, currency?: string | null): string {
  if (valueCents == null) {
    return "Valor nao informado";
  }

  return (valueCents / 100).toLocaleString("pt-BR", {
    currency: currency ?? "BRL",
    style: "currency"
  });
}

async function getAccountSettings(): Promise<AccountSettingsResult> {
  try {
    const account = await serverApiFetch<{ user: AccountUserDto }>("/auth/me");

    return {
      user: account.user,
      state: "real"
    };
  } catch {
    return {
      user: null,
      state: "error"
    };
  }
}

async function getConversionRules(): Promise<ConversionRulesResult> {
  try {
    const rules = await serverApiFetch<ConversionRuleDto[]>("/conversion-rules");

    return {
      rules,
      state: rules.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      rules: [],
      state: "error"
    };
  }
}

async function getFunnelConfiguration(): Promise<FunnelConfigurationResult> {
  try {
    const configuration = await serverApiFetch<FunnelConfigurationDto>("/conversion-rules/funnel");

    return {
      configuration,
      state: "real"
    };
  } catch {
    return {
      configuration: { stages: [] },
      state: "error"
    };
  }
}

async function getWorkspaceSettings(): Promise<WorkspaceSettingsResult> {
  try {
    const [workspace, members, invites] = await Promise.all([
      getCurrentWorkspace(),
      serverApiFetch<WorkspaceMemberDto[]>("/workspaces/current/members"),
      serverApiFetch<WorkspaceInviteDto[]>("/workspaces/current/invites")
    ]);

    return {
      workspace,
      members,
      invites,
      state: members.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      workspace: null,
      members: [],
      invites: [],
      state: "error"
    };
  }
}

async function getWhatsappLabelSuggestions(): Promise<WhatsappLabelSuggestionsResult> {
  try {
    const instances = await serverApiFetch<WhatsappInstanceSummaryDto[]>(
      "/integrations/whatsapp/instances"
    );
    const activeUazapiInstances = instances.filter(
      (instance) => instance.provider === "uazapi" && instance.billingStatus === "active"
    );
    const configuredTimeout = Number(process.env.WPPTRACK_WEB_PROVIDER_STATUS_TIMEOUT_MS ?? 2000);
    const timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 2000;
    const labelLists = await Promise.all(
      activeUazapiInstances.map(async (instance) => {
        try {
          return await serverApiFetch<WhatsappLabelDto[]>(
            `/integrations/whatsapp/instances/${instance.id}/labels`,
            { signal: AbortSignal.timeout(timeoutMs) }
          );
        } catch {
          return [];
        }
      })
    );
    const labels = Array.from(
      new Set(
        labelLists
          .flat()
          .map((label) => label.name.trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, "pt-BR"));

    return {
      labels,
      state: labels.length > 0 ? "real" : "empty"
    };
  } catch {
    return {
      labels: [],
      state: "error"
    };
  }
}

function triggerLabel(rule: Pick<ConversionRuleDto, "triggerType">): string {
  return rule.triggerType === "keyword" ? "Palavra-chave" : "Etiqueta WhatsApp";
}

function matchLabel(rule: Pick<ConversionRuleDto, "matchMode" | "triggerValue">): string {
  const mode = rule.matchMode === "exact" ? "igual a" : "contem";
  return `${mode}: ${rule.triggerValue}`;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: displayTimeZone,
    year: "numeric"
  });
}

async function createConversionRule(
  _previousState: BackofficeActionState,
  formData: FormData
): Promise<BackofficeActionState> {
  "use server";

  const requestedName = String(formData.get("name") ?? "").trim();
  const triggerType = String(formData.get("triggerType") ?? "keyword");
  const triggerValue = String(formData.get("triggerValue") ?? "").trim();
  const matchMode = String(formData.get("matchMode") ?? "contains");
  const requestedEventName = String(formData.get("eventName") ?? "LeadSubmitted");
  const eventName = supportedConversionEventNames.includes(
    requestedEventName as (typeof supportedConversionEventNames)[number]
  )
    ? (requestedEventName as ConversionEventNameDto)
    : "LeadSubmitted";
  const acceptsCommercialValue = eventSupportsCommercialValue(eventName);
  const productName = acceptsCommercialValue
    ? String(formData.get("productName") ?? "").trim()
    : "";
  const defaultValueCents = acceptsCommercialValue
    ? parseMoneyToCents(formData.get("defaultValue"))
    : null;
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "BRL")
    .trim()
    .toUpperCase();

  if (!triggerValue) {
    return settingsActionState("error", "Informe a palavra, frase ou etiqueta do gatilho.");
  }

  const name = requestedName || `${eventDisplayLabel(eventName)} por ${triggerValue}`.slice(0, 120);

  try {
    await serverApiFetch("/conversion-rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        triggerType,
        triggerValue,
        matchMode,
        eventName,
        pixelId: null,
        defaultValueCents,
        defaultCurrency:
          acceptsCommercialValue && defaultValueCents !== null ? defaultCurrency : null,
        defaultContentName: productName || null,
        defaultItems: productItems(productName, defaultValueCents),
        active: true
      })
    });
    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/reports");

    return settingsActionState("success", "Regra de conversao criada.");
  } catch {
    return settingsActionState("error", "Nao foi possivel criar a regra.");
  }
}

async function updateConversionRuleDetails(
  _previousState: BackofficeActionState,
  formData: FormData
): Promise<BackofficeActionState> {
  "use server";

  const ruleId = String(formData.get("ruleId") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const defaultValueCents = parseMoneyToCents(formData.get("defaultValue"));
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "BRL")
    .trim()
    .toUpperCase();

  if (!ruleId) {
    return settingsActionState("error", "Regra de conversao nao identificada.");
  }

  try {
    await serverApiFetch(`/conversion-rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        defaultValueCents,
        defaultCurrency: defaultValueCents === null ? null : defaultCurrency,
        defaultContentName: productName || null,
        defaultItems: productItems(productName, defaultValueCents)
      })
    });
    revalidatePath("/settings");

    return settingsActionState("success", "Produto e valor atualizados.");
  } catch {
    return settingsActionState("error", "Nao foi possivel atualizar a regra.");
  }
}

async function saveFunnelConfiguration(
  _previousState: BackofficeActionState,
  formData: FormData
): Promise<BackofficeActionState> {
  "use server";

  const eventNames = formData
    .getAll("stageEventName")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (eventNames.length === 0) {
    return settingsActionState("error", "Nenhuma etapa de funil foi encontrada.");
  }

  const stages = eventNames.map((eventName, index) => ({
    eventName,
    label: String(formData.get(`stageLabel:${eventName}`) ?? "").trim(),
    position: Number(formData.get(`stagePosition:${eventName}`) ?? index + 1) || index + 1,
    visible: formData.get(`stageVisible:${eventName}`) === "on",
    defaultValueCents: eventSupportsCommercialValue(eventName)
      ? parseMoneyToCents(formData.get(`stageValue:${eventName}`))
      : null,
    defaultCurrency: eventSupportsCommercialValue(eventName)
      ? String(formData.get(`stageCurrency:${eventName}`) ?? "BRL")
          .trim()
          .toUpperCase()
      : null,
    defaultContentName: eventSupportsCommercialValue(eventName)
      ? String(formData.get(`stageProduct:${eventName}`) ?? "").trim() || null
      : null
  }));

  try {
    await serverApiFetch("/conversion-rules/funnel", {
      method: "PUT",
      body: JSON.stringify({ stages })
    });
    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/reports");
    revalidatePath("/events");

    return settingsActionState("success", "Jornada do funil atualizada.");
  } catch {
    return settingsActionState("error", "Nao foi possivel salvar o funil.");
  }
}

async function createWorkspaceInvite(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "member");

  if (!email) {
    return;
  }

  try {
    await serverApiFetch("/workspaces/current/invites", {
      method: "POST",
      body: JSON.stringify({ email, role })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

async function updateWorkspaceProfile(formData: FormData) {
  "use server";

  const name = String(formData.get("workspaceName") ?? "").trim();

  if (!name) {
    return;
  }

  try {
    await serverApiFetch("/workspaces/current", {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

async function updateConversionRuleStatus(formData: FormData) {
  "use server";

  const ruleId = String(formData.get("ruleId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!ruleId) {
    return;
  }

  try {
    await serverApiFetch(`/conversion-rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({ active })
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

async function requestEmailVerification() {
  "use server";

  try {
    await serverApiFetch("/auth/email/verification/start", {
      method: "POST"
    });
    revalidatePath("/settings");
  } catch {
    return;
  }
}

export default async function SettingsPage() {
  const [
    workspaceSettings,
    conversionRules,
    funnelConfiguration,
    accountSettings,
    whatsappLabelSuggestions
  ] = await Promise.all([
    getWorkspaceSettings(),
    getConversionRules(),
    getFunnelConfiguration(),
    getAccountSettings(),
    getWhatsappLabelSuggestions()
  ]);
  const { rules } = conversionRules;
  const { workspace, members, invites } = workspaceSettings;
  const accountUser = accountSettings.user;
  const whatsappLabels = whatsappLabelSuggestions.labels;
  const funnelStages = funnelConfiguration.configuration.stages;
  const funnelLabelByEvent = new Map(funnelStages.map((stage) => [stage.eventName, stage.label]));
  const canManageConversionRules = Boolean(workspace?.permissions.canManageIntegrations);
  const isPlatformSupport = workspace?.accessMode === "platform_support";
  const currentAccessLabel = isPlatformSupport
    ? "Suporte da plataforma"
    : workspace
      ? workspaceRoleLabel(workspace.role)
      : "Acesso indisponivel";
  const currentAccessDescription = isPlatformSupport
    ? "Acesso interno ao workspace do cliente"
    : workspace
      ? workspaceRoleDescription(workspace.role)
      : "Nao foi possivel consultar as permissoes";
  const conversionRuleBuilderEvents = supportedConversionEventNames.map((eventName) => ({
    label: eventDisplayLabel(eventName),
    supportsValue: eventSupportsCommercialValue(eventName),
    value: eventName
  }));
  const emptyTitle =
    conversionRules.state === "error"
      ? "Nao foi possivel carregar regras"
      : "Nenhuma regra configurada";
  const emptyDescription =
    conversionRules.state === "error"
      ? "Confira a API antes de alterar mapeamentos de evento."
      : "Crie uma regra por palavra-chave ou etiqueta para iniciar o envio de eventos.";

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h1>Workspace e regras</h1>
          <p>Conta, equipe, jornada e gatilhos de conversao do workspace.</p>
        </div>
        <div className="header-actions">
          <span
            className={`status-chip${workspaceSettings.state === "error" || conversionRules.state === "error" || funnelConfiguration.state === "error" ? " warn" : ""}`}
          >
            {workspaceSettings.state === "error" ||
            conversionRules.state === "error" ||
            funnelConfiguration.state === "error"
              ? "API indisponivel"
              : "API conectada"}
          </span>
        </div>
      </header>

      <section className="surface-panel settings-profile-panel">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Conta e workspace</span>
            <h2>Identidade e acesso</h2>
          </div>
          <span className={`status-chip${isPlatformSupport ? " neutral" : ""}`}>
            {currentAccessLabel}
          </span>
        </div>
        <div className="settings-profile-grid">
          <div className="workspace-profile-section">
            <div className="settings-section-heading">
              <span className="micro-label">Workspace</span>
              <strong>{workspace?.name ?? "Workspace indisponivel"}</strong>
              <small>{workspace ? workspace.slug : "Dados indisponiveis"}</small>
            </div>
            <form className="workspace-name-form" action={updateWorkspaceProfile}>
              <label>
                <span>Nome publico</span>
                <input defaultValue={workspace?.name ?? ""} name="workspaceName" />
              </label>
              <button
                className="button primary"
                disabled={!workspace?.permissions.canInviteMembers}
                type="submit"
              >
                Salvar nome
              </button>
            </form>
            <div className="access-summary">
              <span>{currentAccessLabel}</span>
              <small>{currentAccessDescription}</small>
            </div>
          </div>

          <div className="account-profile-section">
            <div className="account-identity">
              <span className="member-avatar" aria-hidden="true">
                {accountUser ? initials(accountUser.name, accountUser.email) : "--"}
              </span>
              <span>
                <strong>{accountUser?.name ?? "Conta do usuario"}</strong>
                <small>{accountUser?.email ?? "Conta indisponivel"}</small>
              </span>
            </div>
            <dl className="account-facts">
              <div>
                <dt>Acesso</dt>
                <dd>
                  {accountUser?.authProvider === "email"
                    ? "Email e senha"
                    : (accountUser?.authProvider ?? "Indisponivel")}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{accountUser?.emailVerifiedAt ? "Email verificado" : "Email pendente"}</dd>
              </div>
            </dl>
            {!accountUser?.emailVerifiedAt ? (
              <form action={requestEmailVerification}>
                <button className="button" disabled={!accountUser} type="submit">
                  Enviar verificacao
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <section className="surface-panel team-settings-panel">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Equipe</span>
            <h2>Membros e acessos</h2>
            <p className="muted">
              {workspaceSettings.state === "error"
                ? "Nao foi possivel carregar a equipe."
                : `${members.length} usuario${members.length === 1 ? "" : "s"} ativo${members.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="team-settings-layout">
          <div className="member-list" aria-label="Membros do workspace">
            {members.length > 0 ? (
              members.map((member) => (
                <div className="member-row" key={member.id}>
                  <span className="member-avatar" aria-hidden="true">
                    {initials(member.name, member.email)}
                  </span>
                  <span className="member-identity">
                    <strong>{member.name ?? "Usuario sem nome"}</strong>
                    <small>{member.email}</small>
                  </span>
                  <span className="member-role">
                    <strong>{workspaceRoleLabel(member.role)}</strong>
                    <small>{workspaceRoleDescription(member.role)}</small>
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">Nenhum membro retornado pela API.</p>
            )}
          </div>

          <aside className="invite-panel">
            <div>
              <span className="micro-label">Novo acesso</span>
              <strong>Convidar membro</strong>
            </div>
            <form className="invite-form" action={createWorkspaceInvite}>
              <label>
                <span>Email</span>
                <input name="email" type="email" placeholder="pessoa@empresa.com" />
              </label>
              <label>
                <span>Nivel de acesso</span>
                <select name="role" defaultValue="member">
                  <option value="member">Analista</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <button
                className="button primary"
                disabled={!workspace?.permissions.canInviteMembers}
                type="submit"
              >
                Enviar convite
              </button>
            </form>
            <div className="pending-invites">
              <span className="micro-label">Pendentes</span>
              {invites.length > 0 ? (
                invites.map((invite) => (
                  <div key={invite.id}>
                    <span>
                      <strong>{invite.email}</strong>
                      <small>Expira em {shortDate(invite.expiresAt)}</small>
                    </span>
                    <span className="status-chip neutral">{workspaceRoleLabel(invite.role)}</span>
                  </div>
                ))
              ) : (
                <small>Nenhum convite pendente</small>
              )}
            </div>
          </aside>
        </div>
      </section>

      <div className="surface-panel funnel-settings-panel">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Jornada do funil</span>
            <h2>Etapas exibidas nos indicadores</h2>
            <p className="muted">
              Defina a ordem e o nome que o cliente ve em Visao geral e Relatorios.
            </p>
          </div>
          <span className={`status-chip${funnelConfiguration.state === "error" ? " warn" : ""}`}>
            {funnelConfiguration.state === "error"
              ? "Configuracao indisponivel"
              : `${funnelStages.filter((stage) => stage.visible).length} etapas visiveis`}
          </span>
        </div>
        {canManageConversionRules && funnelStages.length > 0 ? (
          <BackofficeActionForm action={saveFunnelConfiguration} className="funnel-config-form">
            <div className="funnel-config-list">
              {funnelStages.map((stage) => (
                <div className="funnel-stage-row" key={stage.eventName}>
                  <input type="hidden" name="stageEventName" value={stage.eventName} />
                  <label className="funnel-stage-order">
                    <span>Etapa</span>
                    <input
                      aria-label={`Ordem de ${stage.label}`}
                      defaultValue={stage.position}
                      min={1}
                      name={`stagePosition:${stage.eventName}`}
                      type="number"
                    />
                  </label>
                  <label className="funnel-stage-name">
                    <span>Nome exibido</span>
                    <input
                      aria-label={`Nome exibido de ${stage.eventName}`}
                      defaultValue={stage.label}
                      maxLength={80}
                      name={`stageLabel:${stage.eventName}`}
                    />
                    <small className="funnel-event-code">{stage.eventName}</small>
                  </label>
                  {eventSupportsCommercialValue(stage.eventName) ? (
                    <div className="funnel-commercial-fields">
                      <label>
                        <span>Produto ou servico</span>
                        <input
                          defaultValue={stage.defaultContentName ?? ""}
                          name={`stageProduct:${stage.eventName}`}
                          placeholder="Opcional"
                        />
                      </label>
                      <label>
                        <span>Valor medio</span>
                        <input
                          defaultValue={moneyInputValue(stage.defaultValueCents)}
                          inputMode="decimal"
                          name={`stageValue:${stage.eventName}`}
                          placeholder="0,00"
                        />
                      </label>
                      <label>
                        <span>Moeda</span>
                        <select
                          defaultValue={stage.defaultCurrency ?? "BRL"}
                          name={`stageCurrency:${stage.eventName}`}
                        >
                          <option value="BRL">BRL</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </label>
                    </div>
                  ) : (
                    <span className="funnel-stage-type">Evento de relacionamento</span>
                  )}
                  <label className="funnel-stage-visible">
                    <input
                      defaultChecked={stage.visible}
                      name={`stageVisible:${stage.eventName}`}
                      type="checkbox"
                    />
                    <span>Visivel</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="form-command-row">
              <span>As alteracoes atualizam os indicadores do workspace.</span>
              <PendingSubmitButton
                className="button primary"
                label="Salvar jornada"
                pendingLabel="Salvando jornada..."
              />
            </div>
          </BackofficeActionForm>
        ) : (
          <p className="muted">
            {canManageConversionRules
              ? "Nao foi possivel carregar as etapas do funil."
              : "Sem permissao para editar a jornada."}
          </p>
        )}
      </div>

      <div className="surface-panel conversion-rules-panel">
        <span className="eyebrow">Mapeamento de eventos</span>
        <h2>Gatilhos do WhatsApp</h2>
        <p className="muted">
          Defina o que precisa acontecer na conversa e qual evento sera registrado.
        </p>
        {canManageConversionRules ? (
          <ConversionRuleBuilder
            action={createConversionRule}
            events={conversionRuleBuilderEvents}
            whatsappLabels={whatsappLabels}
            whatsappLabelsState={whatsappLabelSuggestions.state}
          />
        ) : (
          <p className="muted">Sem permissao para editar regras</p>
        )}
        <div className="table-wrap conversion-rules-table">
          <table>
            <thead>
              <tr>
                <th>Regra</th>
                <th>Gatilho</th>
                <th>Evento Meta</th>
                <th>Produto / valor</th>
                <th>Status</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {rules.length > 0 ? (
                rules.map((rule) => (
                  <tr key={rule.id}>
                    <td data-label="Regra">
                      <strong>{rule.name}</strong>
                      <span>{triggerLabel(rule)}</span>
                    </td>
                    <td data-label="Gatilho">
                      <strong>{rule.triggerValue}</strong>
                      <span>{matchLabel(rule)}</span>
                    </td>
                    <td data-label="Evento">
                      <strong>
                        {funnelLabelByEvent.get(rule.eventName) ??
                          eventDisplayLabel(rule.eventName)}
                      </strong>
                      <span>{rule.eventName}</span>
                    </td>
                    <td data-label="Produto / valor">
                      {eventSupportsCommercialValue(rule.eventName) ? (
                        <>
                          <strong>{rule.defaultContentName ?? "Sem produto"}</strong>
                          <span>{moneyLabel(rule.defaultValueCents, rule.defaultCurrency)}</span>
                        </>
                      ) : (
                        <span>Nao se aplica</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <span className={`event-chip${rule.active ? "" : " warn"}`}>
                        {rule.active ? "ativo" : "pausado"}
                      </span>
                    </td>
                    <td data-label="Acao">
                      {canManageConversionRules ? (
                        <div className="rule-action-stack">
                          {eventSupportsCommercialValue(rule.eventName) ? (
                            <details className="rule-edit-details">
                              <summary className="button">Editar valor</summary>
                              <BackofficeActionForm
                                action={updateConversionRuleDetails}
                                className="rule-edit-form"
                              >
                                <input type="hidden" name="ruleId" value={rule.id} />
                                <label>
                                  <span>Produto ou servico</span>
                                  <input
                                    defaultValue={rule.defaultContentName ?? ""}
                                    name="productName"
                                    placeholder="Produto ou servico"
                                  />
                                </label>
                                <label>
                                  <span>Valor</span>
                                  <input
                                    defaultValue={moneyInputValue(rule.defaultValueCents)}
                                    inputMode="decimal"
                                    name="defaultValue"
                                    placeholder="0,00"
                                  />
                                </label>
                                <label>
                                  <span>Moeda</span>
                                  <select
                                    defaultValue={rule.defaultCurrency ?? "BRL"}
                                    name="defaultCurrency"
                                  >
                                    <option value="BRL">BRL</option>
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                  </select>
                                </label>
                                <PendingSubmitButton
                                  className="button primary"
                                  label="Salvar valor"
                                  pendingLabel="Salvando..."
                                />
                              </BackofficeActionForm>
                            </details>
                          ) : null}
                          <form action={updateConversionRuleStatus}>
                            <input type="hidden" name="ruleId" value={rule.id} />
                            <input type="hidden" name="active" value={String(!rule.active)} />
                            <button className="button" type="submit">
                              {rule.active ? "Pausar" : "Ativar"}
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="event-chip warn">sem permissao</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <strong>{emptyTitle}</strong>
                    <span>{emptyDescription}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
