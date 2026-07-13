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

function parseMoneyToCents(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function productItems(productName: string, valueCents: number | null) {
  if (!productName) {
    return null;
  }

  const id = productName
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
    const configuration = await serverApiFetch<FunnelConfigurationDto>(
      "/conversion-rules/funnel"
    );

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
      (instance) =>
        instance.provider === "uazapi" && instance.billingStatus === "active"
    );
    const configuredTimeout = Number(
      process.env.WPPTRACK_WEB_PROVIDER_STATUS_TIMEOUT_MS ?? 2000
    );
    const timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 2000;
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

  const name = String(formData.get("name") ?? "").trim();
  const triggerType = String(formData.get("triggerType") ?? "keyword");
  const triggerValue = String(formData.get("triggerValue") ?? "").trim();
  const matchMode = String(formData.get("matchMode") ?? "contains");
  const eventName = String(formData.get("eventName") ?? "LeadSubmitted");
  const productName = String(formData.get("productName") ?? "").trim();
  const defaultValueCents = parseMoneyToCents(formData.get("defaultValue"));
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "BRL")
    .trim()
    .toUpperCase();

  if (!name || !triggerValue) {
    return settingsActionState("error", "Informe o nome e o gatilho da regra.");
  }

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
        defaultCurrency: defaultValueCents === null ? null : defaultCurrency,
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
    position:
      Number(formData.get(`stagePosition:${eventName}`) ?? index + 1) || index + 1,
    visible: formData.get(`stageVisible:${eventName}`) === "on",
    defaultValueCents: parseMoneyToCents(
      formData.get(`stageValue:${eventName}`)
    ),
    defaultCurrency: String(
      formData.get(`stageCurrency:${eventName}`) ?? "BRL"
    )
      .trim()
      .toUpperCase(),
    defaultContentName:
      String(formData.get(`stageProduct:${eventName}`) ?? "").trim() || null
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
  const funnelLabelByEvent = new Map(
    funnelStages.map((stage) => [stage.eventName, stage.label])
  );
  const canManageConversionRules = Boolean(
    workspace?.permissions.canManageIntegrations
  );
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
          <p>Empresa, membros, papeis, palavras-chave, etiquetas e mapeamento de eventos.</p>
        </div>
        <div className="header-actions">
          <span className={`status-chip${workspaceSettings.state === "error" || conversionRules.state === "error" || funnelConfiguration.state === "error" ? " warn" : ""}`}>
            {workspaceSettings.state === "error" || conversionRules.state === "error" || funnelConfiguration.state === "error" ? "API indisponivel" : "API conectada"}
          </span>
        </div>
      </header>

      <div className="config-grid">
        <article className="config-card">
          <span className="micro-label">Workspace</span>
          <strong>{workspace?.name ?? "Workspace indisponivel"}</strong>
          <p className="muted">
            {workspace
              ? `Slug ${workspace.slug} com papel ${workspace.role}.`
              : "Confira a API antes de alterar dados da empresa."}
          </p>
          <form className="control-row" action={updateWorkspaceProfile}>
            <label>
              Nome publico
              <input
                defaultValue={workspace?.name ?? ""}
                name="workspaceName"
              />
            </label>
            <label>
              Permissao atual
              <select defaultValue={workspace?.role ?? "member"}>
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="member">member</option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={!workspace?.permissions.canInviteMembers}
              type="submit"
            >
              Salvar workspace
            </button>
          </form>
        </article>

        <article className="config-card">
          <span className="micro-label">Conta</span>
          <strong>{accountUser?.email ?? "Conta indisponivel"}</strong>
          <p className="muted">
            {accountSettings.state === "error"
              ? "Nao foi possivel carregar os dados da conta."
              : accountUser?.emailVerifiedAt
                ? "Email verificado"
                : "Email pendente"}
          </p>
          <form className="control-row" action={requestEmailVerification}>
            <label>
              Provedor
              <input
                readOnly
                value={accountUser?.authProvider ?? "indisponivel"}
              />
            </label>
            <label>
              Status
              <input
                readOnly
                value={accountUser?.emailVerifiedAt ? "Email verificado" : "Email pendente"}
              />
            </label>
            <button
              className="button primary"
              disabled={!accountUser || Boolean(accountUser.emailVerifiedAt)}
              type="submit"
            >
              Enviar verificacao
            </button>
          </form>
        </article>

        <article className="config-card">
          <span className="micro-label">Membros</span>
          <strong>
            {workspaceSettings.state === "error"
              ? "Membros indisponiveis"
              : `${members.length} usuario${members.length === 1 ? "" : "s"} ativo${members.length === 1 ? "" : "s"}`}
          </strong>
          <p className="muted">Convites e papeis separados para donos, administradores e operadores.</p>
          {members.length > 0 ? (
            <div className="settings-list">
              {members.map((member) => (
                <div className="quality-card" key={member.id}>
                  <span>
                    <strong>{member.name ?? member.email}</strong>
                    <span>{member.email}</span>
                  </span>
                  <span>{member.role}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              {workspaceSettings.state === "error"
                ? "Nao foi possivel carregar membros."
                : "Nenhum membro retornado pela API."}
            </p>
          )}
        </article>

        <article className="config-card">
          <span className="micro-label">Convites</span>
          <strong>Convidar membro</strong>
          <p className="muted">O convite e criado no backend e nao concede papel owner diretamente.</p>
          <form className="control-row" action={createWorkspaceInvite}>
            <label>
              Email do convidado
              <input name="email" type="email" placeholder="pessoa@empresa.com" />
            </label>
            <label>
              Papel
              <select name="role" defaultValue="member">
                <option value="member">member</option>
                <option value="admin">admin</option>
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
          {invites.length > 0 ? (
            <div className="settings-list">
              {invites.map((invite) => (
                <div className="quality-card" key={invite.id}>
                  <span>
                    <strong>{invite.email}</strong>
                    <span>expira em {shortDate(invite.expiresAt)}</span>
                  </span>
                  <span>{invite.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              {workspaceSettings.state === "error"
                ? "Nao foi possivel carregar convites."
                : "Nenhum convite pendente retornado pela API."}
            </p>
          )}
        </article>
      </div>

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
          <BackofficeActionForm
            action={saveFunnelConfiguration}
            className="funnel-config-form"
          >
            <div className="funnel-config-list">
              {funnelStages.map((stage) => (
                <div className="funnel-config-row" key={stage.eventName}>
                  <input type="hidden" name="stageEventName" value={stage.eventName} />
                  <label className="funnel-order-field">
                    <span>Ordem</span>
                    <input
                      aria-label={`Ordem de ${stage.label}`}
                      defaultValue={stage.position}
                      min={1}
                      name={`stagePosition:${stage.eventName}`}
                      type="number"
                    />
                  </label>
                  <label className="funnel-label-field">
                    <span>Nome exibido</span>
                    <input
                      aria-label={`Nome exibido de ${stage.eventName}`}
                      defaultValue={stage.label}
                      maxLength={80}
                      name={`stageLabel:${stage.eventName}`}
                    />
                    <small className="funnel-event-code">{stage.eventName}</small>
                  </label>
                  <label className="funnel-product-field">
                    <span>Produto ou servico</span>
                    <input
                      defaultValue={stage.defaultContentName ?? ""}
                      name={`stageProduct:${stage.eventName}`}
                      placeholder="Opcional"
                    />
                  </label>
                  <label className="funnel-value-field">
                    <span>Valor medio</span>
                    <input
                      defaultValue={moneyInputValue(stage.defaultValueCents)}
                      inputMode="decimal"
                      name={`stageValue:${stage.eventName}`}
                      placeholder="0,00"
                    />
                  </label>
                  <label className="funnel-currency-field">
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
                  <label className="funnel-visible-field">
                    <input
                      defaultChecked={stage.visible}
                      name={`stageVisible:${stage.eventName}`}
                      type="checkbox"
                    />
                    <span>Exibir</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="form-command-row">
              <span>Ordem, nomes e valores passam a valer para os novos eventos.</span>
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
        <h2>Gatilhos do WhatsApp viram eventos Meta</h2>
        <p className="muted">
          Relacione cada palavra ou etiqueta a um evento e, quando fizer sentido,
          ao produto e valor usados na conversao.
        </p>
        {canManageConversionRules ? (
          <>
            <BackofficeActionForm
              action={createConversionRule}
              className="conversion-rule-create-form"
              resetOnSuccess
            >
              <label>
                <span>Nome da regra</span>
                <input name="name" placeholder="Ex.: Venda confirmada" />
              </label>
              <label>
                <span>Origem</span>
                <select name="triggerType" defaultValue="keyword">
                  <option value="keyword">Palavra-chave</option>
                  <option value="whatsapp_label">Etiqueta WhatsApp</option>
                </select>
              </label>
              <label>
                <span>Gatilho</span>
                <input
                  name="triggerValue"
                  placeholder="Texto ou etiqueta"
                  list={whatsappLabels.length ? "whatsapp-label-options" : undefined}
                />
              </label>
              {whatsappLabels.length ? (
                <datalist id="whatsapp-label-options">
                  {whatsappLabels.map((label) => (
                    <option key={label} value={label} />
                  ))}
                </datalist>
              ) : null}
              <label>
                <span>Comparacao</span>
                <select name="matchMode" defaultValue="contains">
                  <option value="contains">Contem</option>
                  <option value="exact">Igual a</option>
                </select>
              </label>
              <label>
                <span>Evento Meta</span>
                <select name="eventName" defaultValue="LeadSubmitted">
                  {supportedConversionEventNames.map((eventName) => (
                    <option key={eventName} value={eventName}>
                      {eventDisplayLabel(eventName)} ({eventName})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Produto ou servico</span>
                <input name="productName" placeholder="Ex.: Consultoria" />
              </label>
              <label>
                <span>Valor da conversao</span>
                <input
                  inputMode="decimal"
                  name="defaultValue"
                  placeholder="0,00"
                />
              </label>
              <label>
                <span>Moeda</span>
                <select name="defaultCurrency" defaultValue="BRL">
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
              <div className="conversion-rule-create-command">
                <PendingSubmitButton
                  className="button primary"
                  label="Criar regra"
                  pendingLabel="Criando regra..."
                />
              </div>
            </BackofficeActionForm>
            <p className="muted">
              {whatsappLabels.length
                ? `Etiquetas disponiveis: ${whatsappLabels.join(", ")}`
                : whatsappLabelSuggestions.state === "error"
                  ? "Etiquetas do WhatsApp indisponiveis agora; o gatilho ainda pode ser digitado."
                  : "Nenhuma etiqueta foi carregada para as instancias ativas."}
            </p>
          </>
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
                    <td><strong>{rule.name}</strong><span>{triggerLabel(rule)}</span></td>
                    <td><strong>{rule.triggerValue}</strong><span>{matchLabel(rule)}</span></td>
                    <td>
                      <strong>
                        {funnelLabelByEvent.get(rule.eventName) ??
                          eventDisplayLabel(rule.eventName)}
                      </strong>
                      <span>{rule.eventName}</span>
                    </td>
                    <td>
                      <strong>{rule.defaultContentName ?? "Sem produto"}</strong>
                      <span>{moneyLabel(rule.defaultValueCents, rule.defaultCurrency)}</span>
                    </td>
                    <td>
                      <span className={`event-chip${rule.active ? "" : " warn"}`}>
                        {rule.active ? "ativo" : "pausado"}
                      </span>
                    </td>
                    <td>
                      {canManageConversionRules ? (
                        <div className="rule-action-stack">
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
