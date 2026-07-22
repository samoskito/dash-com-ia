import type {
  ClientOwnerAccessResendResultDto,
  ConversionEventNameDto,
  ConversionRuleDto,
  CurrentWorkspaceDto,
  FunnelConfigurationDto,
  InboundWebhookChannelDto,
  InboundWebhookConnectionDto,
  ProviderConversionRuleDto,
  WhatsappInstanceSummaryDto,
  WhatsappLabelDto,
  WorkspaceInviteDto,
  WorkspaceMemberDto,
} from "@wpptrack/shared";
import { conversionEventDisplayLabels } from "@wpptrack/shared";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  Building2,
  ChevronDown,
  ShieldCheck,
  UserPlus,
  UsersRound,
  Workflow,
  Zap,
} from "lucide-react";
import {
  BackofficeActionForm,
  type BackofficeActionState,
} from "../../../components/backoffice-action-form";
import { ConversionRuleBuilder } from "../../../components/conversion-rule-builder";
import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { PresentationMask } from "../../../components/presentation-mask";
import { TeamActionButton } from "../../../components/team-action-button";
import { displayTimeZone } from "../../../lib/date-time";
import { serverApiFetch } from "../../../lib/server-api";
import { getCurrentWorkspace } from "../../../lib/current-workspace";
import { ProviderConversionRulePanel } from "../integrations/provider-conversion-rule-panel";
import {
  adaptProviderConversionRuleAction,
  createProviderConversionRuleAction,
  removeProviderConversionRuleAction,
  rotateProviderConversionRuleEndpointAction,
  testProviderCatalogMessageAction,
  updateProviderConversionRuleAction,
} from "../integrations/provider-conversion-rule-actions";
import {
  LegacyRuleAdaptForm,
  type LegacyRuleAdaptConnection,
} from "./legacy-rule-adapt-form";

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

type ProviderConversionSettingsResult = {
  connections: LegacyRuleAdaptConnection[];
  rules: ProviderConversionRuleDto[];
  enabled: boolean;
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
  "OrderCreated",
] as const;

const eventsWithCommercialValue = new Set<ConversionEventNameDto>([
  "Purchase",
  "OrderCreated",
]);

function settingsActionState(
  status: BackofficeActionState["status"],
  message: string,
): BackofficeActionState {
  return {
    status,
    message,
    nonce: Date.now(),
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
    return "Owner";
  }

  if (role === "admin") {
    return "Administrador";
  }

  return "Analista";
}

function workspaceRoleDescription(
  role: WorkspaceMemberDto["role"],
  canManageMembers = false,
): string {
  if (role === "owner") {
    return "Equipe, integracoes e cobranca";
  }

  if (role === "admin") {
    return canManageMembers
      ? "Operacao, integracoes e gestao da equipe"
      : "Operacao e integracoes";
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

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : null;
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
      ...(valueCents === null ? {} : { item_price: valueCents / 100 }),
    },
  ];
}

function moneyInputValue(valueCents: number | null | undefined): string {
  return valueCents == null
    ? ""
    : (valueCents / 100).toFixed(2).replace(".", ",");
}

function moneyLabel(
  valueCents: number | null | undefined,
  currency?: string | null,
): string {
  if (valueCents == null) {
    return "Valor nao informado";
  }

  return (valueCents / 100).toLocaleString("pt-BR", {
    currency: currency ?? "BRL",
    style: "currency",
  });
}

async function getAccountSettings(): Promise<AccountSettingsResult> {
  try {
    const account = await serverApiFetch<{ user: AccountUserDto }>("/auth/me");

    return {
      user: account.user,
      state: "real",
    };
  } catch {
    return {
      user: null,
      state: "error",
    };
  }
}

async function getConversionRules(): Promise<ConversionRulesResult> {
  try {
    const rules =
      await serverApiFetch<ConversionRuleDto[]>("/conversion-rules");

    return {
      rules,
      state: rules.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      rules: [],
      state: "error",
    };
  }
}

async function getProviderConversionSettings(): Promise<ProviderConversionSettingsResult> {
  try {
    const connections = await serverApiFetch<InboundWebhookConnectionDto[]>(
      "/integrations/inbound-webhooks",
    );
    const umblerConnections = connections.filter(
      (connection) => connection.provider === "umbler",
    );
    const [providerRulesResult, channelResults] = await Promise.all([
      serverApiFetch<ProviderConversionRuleDto[]>(
        "/conversion-rules/providers",
      ).then(
        (rules) => ({ ok: true as const, rules }),
        () => ({ ok: false as const, rules: [] }),
      ),
      Promise.allSettled(
        umblerConnections.map((connection) =>
          serverApiFetch<InboundWebhookChannelDto[]>(
            `/integrations/inbound-webhooks/${encodeURIComponent(connection.id)}/channels`,
          ),
        ),
      ),
    ]);
    const providerRules = providerRulesResult.rules;
    const scopedConnections = umblerConnections.map((connection, index) => ({
      connection,
      channels:
        channelResults[index]?.status === "fulfilled"
          ? channelResults[index].value
          : [],
    }));
    const hasError =
      !providerRulesResult.ok ||
      channelResults.some((result) => result.status === "rejected");

    return {
      connections: scopedConnections,
      rules: providerRules,
      enabled: providerRulesResult.ok,
      state: hasError
        ? "error"
        : scopedConnections.length > 0
          ? "real"
          : "empty",
    };
  } catch {
    return {
      connections: [],
      rules: [],
      enabled: false,
      state: "error",
    };
  }
}

async function getFunnelConfiguration(): Promise<FunnelConfigurationResult> {
  try {
    const configuration = await serverApiFetch<FunnelConfigurationDto>(
      "/conversion-rules/funnel",
    );

    return {
      configuration,
      state: "real",
    };
  } catch {
    return {
      configuration: { stages: [] },
      state: "error",
    };
  }
}

async function getWorkspaceSettings(): Promise<WorkspaceSettingsResult> {
  try {
    const [workspace, members, invites] = await Promise.all([
      getCurrentWorkspace(),
      serverApiFetch<WorkspaceMemberDto[]>("/workspaces/current/members"),
      serverApiFetch<WorkspaceInviteDto[]>("/workspaces/current/invites"),
    ]);

    return {
      workspace,
      members,
      invites,
      state: members.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      workspace: null,
      members: [],
      invites: [],
      state: "error",
    };
  }
}

async function getWhatsappLabelSuggestions(): Promise<WhatsappLabelSuggestionsResult> {
  try {
    const instances = await serverApiFetch<WhatsappInstanceSummaryDto[]>(
      "/integrations/whatsapp/instances",
    );
    const activeUazapiInstances = instances.filter(
      (instance) =>
        instance.provider === "uazapi" && instance.billingStatus === "active",
    );
    const configuredTimeout = Number(
      process.env.WPPTRACK_WEB_PROVIDER_STATUS_TIMEOUT_MS ?? 2000,
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
            { signal: AbortSignal.timeout(timeoutMs) },
          );
        } catch {
          return [];
        }
      }),
    );
    const labels = Array.from(
      new Set(
        labelLists
          .flat()
          .map((label) => label.name.trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "pt-BR"));

    return {
      labels,
      state: labels.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      labels: [],
      state: "error",
    };
  }
}

function triggerLabel(rule: Pick<ConversionRuleDto, "triggerType">): string {
  return rule.triggerType === "keyword" ? "Palavra-chave" : "Etiqueta WhatsApp";
}

function matchLabel(
  rule: Pick<ConversionRuleDto, "matchMode" | "triggerValue">,
): string {
  const mode = rule.matchMode === "exact" ? "igual a" : "contem";
  return `${mode}: ${rule.triggerValue}`;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: displayTimeZone,
    year: "numeric",
  });
}

function inviteStatusLabel(status: WorkspaceInviteDto["status"]): string {
  if (status === "sent") {
    return "Enviado";
  }

  if (status === "failed") {
    return "Falha no envio";
  }

  if (status === "accepted") {
    return "Aceito";
  }

  if (status === "revoked") {
    return "Revogado";
  }

  if (status === "expired") {
    return "Expirado";
  }

  return "Pendente";
}

async function createConversionRule(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const requestedName = String(formData.get("name") ?? "").trim();
  const triggerType = String(formData.get("triggerType") ?? "keyword");
  const triggerValue = String(formData.get("triggerValue") ?? "").trim();
  const matchMode = String(formData.get("matchMode") ?? "contains");
  const requestedEventName = String(
    formData.get("eventName") ?? "LeadSubmitted",
  );
  const eventName = supportedConversionEventNames.includes(
    requestedEventName as (typeof supportedConversionEventNames)[number],
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
    return settingsActionState(
      "error",
      "Informe a palavra, frase ou etiqueta do gatilho.",
    );
  }

  const name =
    requestedName ||
    `${eventDisplayLabel(eventName)} por ${triggerValue}`.slice(0, 120);

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
          acceptsCommercialValue && defaultValueCents !== null
            ? defaultCurrency
            : null,
        defaultContentName: productName || null,
        defaultItems: productItems(productName, defaultValueCents),
        active: true,
      }),
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
  formData: FormData,
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
        defaultItems: productItems(productName, defaultValueCents),
      }),
    });
    revalidatePath("/settings");

    return settingsActionState("success", "Produto e valor atualizados.");
  } catch {
    return settingsActionState("error", "Nao foi possivel atualizar a regra.");
  }
}

async function saveFunnelConfiguration(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const eventNames = formData
    .getAll("stageEventName")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (eventNames.length === 0) {
    return settingsActionState(
      "error",
      "Nenhuma etapa de funil foi encontrada.",
    );
  }

  const stages = eventNames.map((eventName, index) => ({
    eventName,
    label: String(formData.get(`stageLabel:${eventName}`) ?? "").trim(),
    position:
      Number(formData.get(`stagePosition:${eventName}`) ?? index + 1) ||
      index + 1,
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
      : null,
  }));

  try {
    await serverApiFetch("/conversion-rules/funnel", {
      method: "PUT",
      body: JSON.stringify({ stages }),
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

async function createWorkspaceInvite(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "member");

  if (!email) {
    return settingsActionState("error", "Informe o email do novo membro.");
  }

  try {
    await serverApiFetch("/workspaces/current/invites", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    revalidatePath("/settings");
    return settingsActionState("success", "Convite criado para a equipe.");
  } catch {
    return settingsActionState("error", "Nao foi possivel criar o convite.");
  }
}

async function updateWorkspaceMemberRole(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const memberId = String(formData.get("memberId") ?? "").trim();
  const role = String(formData.get("role") ?? "member");

  if (!memberId) {
    return settingsActionState("error", "Membro nao identificado.");
  }

  try {
    await serverApiFetch(`/workspaces/current/members/${memberId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    revalidatePath("/settings");
    return settingsActionState("success", "Nivel de acesso atualizado.");
  } catch {
    return settingsActionState("error", "Nao foi possivel alterar o acesso.");
  }
}

async function updateWorkspaceMemberManager(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const memberId = String(formData.get("memberId") ?? "").trim();
  const canManageMembers = formData.get("canManageMembers") === "on";

  if (!memberId) {
    return settingsActionState("error", "Membro nao identificado.");
  }

  try {
    await serverApiFetch(
      `/workspaces/current/members/${memberId}/member-manager`,
      {
        method: "PATCH",
        body: JSON.stringify({ canManageMembers }),
      },
    );
    revalidatePath("/settings");
    return settingsActionState("success", "Gestao da equipe atualizada.");
  } catch {
    return settingsActionState(
      "error",
      "Nao foi possivel alterar a gestao da equipe.",
    );
  }
}

async function removeWorkspaceMember(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const memberId = String(formData.get("memberId") ?? "").trim();

  if (!memberId) {
    return settingsActionState("error", "Membro nao identificado.");
  }

  try {
    await serverApiFetch(`/workspaces/current/members/${memberId}`, {
      method: "DELETE",
    });
    revalidatePath("/settings");
    return settingsActionState("success", "Membro removido do workspace.");
  } catch {
    return settingsActionState("error", "Nao foi possivel remover o membro.");
  }
}

async function resendWorkspaceInvite(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const inviteId = String(formData.get("inviteId") ?? "").trim();

  if (!inviteId) {
    return settingsActionState("error", "Convite nao identificado.");
  }

  try {
    await serverApiFetch(`/workspaces/current/invites/${inviteId}/resend`, {
      method: "POST",
    });
    revalidatePath("/settings");
    return settingsActionState("success", "Convite renovado.");
  } catch {
    return settingsActionState("error", "Nao foi possivel renovar o convite.");
  }
}

async function revokeWorkspaceInvite(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const inviteId = String(formData.get("inviteId") ?? "").trim();

  if (!inviteId) {
    return settingsActionState("error", "Convite nao identificado.");
  }

  try {
    await serverApiFetch(`/workspaces/current/invites/${inviteId}`, {
      method: "DELETE",
    });
    revalidatePath("/settings");
    return settingsActionState("success", "Convite revogado.");
  } catch {
    return settingsActionState("error", "Nao foi possivel revogar o convite.");
  }
}

async function resendWorkspaceOwnerAccess(
  _previousState: BackofficeActionState,
  formData: FormData,
): Promise<BackofficeActionState> {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim();

  if (!workspaceId || !ownerUserId) {
    return settingsActionState(
      "error",
      "Responsavel da conta nao identificado.",
    );
  }

  try {
    const result = await serverApiFetch<ClientOwnerAccessResendResultDto>(
      `/backoffice/workspaces/${encodeURIComponent(workspaceId)}/owners/${encodeURIComponent(ownerUserId)}/access-email`,
      { method: "POST" },
    );
    revalidatePath("/settings");

    if (result.access.delivery === "email_queued") {
      return settingsActionState(
        "success",
        result.access.mode === "activation"
          ? "Novo link para criar a senha foi enviado."
          : "Email com o acesso ao workspace foi enviado.",
      );
    }

    return settingsActionState(
      "error",
      result.access.delivery === "not_configured"
        ? "O envio de email nao esta configurado."
        : "Nao foi possivel enfileirar o email de acesso.",
    );
  } catch {
    return settingsActionState(
      "error",
      "Nao foi possivel reenviar o email de acesso.",
    );
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
      body: JSON.stringify({ name }),
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
      body: JSON.stringify({ active }),
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
      method: "POST",
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
    providerConversionSettings,
    funnelConfiguration,
    accountSettings,
    whatsappLabelSuggestions,
  ] = await Promise.all([
    getWorkspaceSettings(),
    getConversionRules(),
    getProviderConversionSettings(),
    getFunnelConfiguration(),
    getAccountSettings(),
    getWhatsappLabelSuggestions(),
  ]);
  const { rules } = conversionRules;
  const providerRules = providerConversionSettings.rules;
  const providerRuleIds = new Set(
    providerRules.map((rule) => rule.conversionRule.id),
  );
  const legacyRules = rules.filter(
    (rule) =>
      !providerRuleIds.has(rule.id) &&
      ["keyword", "whatsapp_label"].includes(rule.triggerType),
  );
  const umblerConnections = providerConversionSettings.connections;
  const { workspace, members, invites } = workspaceSettings;
  const accountUser = accountSettings.user;
  const whatsappLabels = whatsappLabelSuggestions.labels;
  const funnelStages = funnelConfiguration.configuration.stages;
  const funnelLabelByEvent = new Map(
    funnelStages.map((stage) => [stage.eventName, stage.label]),
  );
  const canManageConversionRules = Boolean(
    workspace?.permissions.canManageIntegrations,
  );
  const isPlatformSupport = workspace?.accessMode === "platform_support";
  const isPlatformOwnerSupport = Boolean(
    isPlatformSupport && workspace?.platformRole === "platform_owner",
  );
  const canManageTeam = Boolean(
    workspace?.permissions.canManageMembers &&
    (!isPlatformSupport || isPlatformOwnerSupport),
  );
  const canGrantMemberManager = Boolean(
    workspace?.permissions.canGrantMemberManager &&
    (!isPlatformSupport || isPlatformOwnerSupport),
  );
  const pendingInviteCount = invites.filter((invite) =>
    ["pending", "sent", "failed"].includes(invite.status),
  ).length;
  const visibleFunnelStageCount = funnelStages.filter(
    (stage) => stage.visible,
  ).length;
  const activeConversionRuleCount = rules.filter((rule) => rule.active).length;
  const triggerRulesHaveError =
    conversionRules.state === "error" ||
    providerConversionSettings.state === "error";
  const currentAccessLabel = isPlatformSupport
    ? "Suporte da plataforma"
    : workspace
      ? workspaceRoleLabel(workspace.role)
      : "Acesso indisponivel";
  const currentAccessDescription = isPlatformSupport
    ? "Acesso interno ao workspace do cliente"
    : workspace
      ? workspaceRoleDescription(
          workspace.role,
          workspace.permissions.canManageMembers,
        )
      : "Nao foi possivel consultar as permissoes";
  const conversionRuleBuilderEvents = supportedConversionEventNames.map(
    (eventName) => ({
      label: eventDisplayLabel(eventName),
      supportsValue: eventSupportsCommercialValue(eventName),
      value: eventName,
    }),
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
    <section className="page-stack page-standard settings-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h1>Central de configuracoes</h1>
          <p>
            Identidade, equipe e automacoes organizadas por responsabilidade.
          </p>
        </div>
        <div className="header-actions">
          <span
            className={`status-chip${workspaceSettings.state === "error" || triggerRulesHaveError || funnelConfiguration.state === "error" ? " warn" : ""}`}
          >
            {workspaceSettings.state === "error" ||
            triggerRulesHaveError ||
            funnelConfiguration.state === "error"
              ? "API indisponivel"
              : "API conectada"}
          </span>
        </div>
      </header>

      <section
        className="settings-overview"
        aria-labelledby="settings-overview-title"
      >
        <div className="settings-overview-heading">
          <div>
            <span className="eyebrow">Estado do workspace</span>
            <h2 id="settings-overview-title">Mapa das configuracoes</h2>
          </div>
          <span
            className={`status-chip${workspaceSettings.state === "error" ? " warn" : ""}`}
          >
            {workspaceSettings.state === "error"
              ? "Dados indisponiveis"
              : "Acessos protegidos"}
          </span>
        </div>
        <div className="settings-overview-grid">
          <article>
            <span className="settings-overview-icon account" aria-hidden="true">
              <ShieldCheck size={19} />
            </span>
            <span>
              <small>Acesso atual</small>
              <strong>{currentAccessLabel}</strong>
              <span>{currentAccessDescription}</span>
            </span>
          </article>
          <article>
            <span className="settings-overview-icon team" aria-hidden="true">
              <UsersRound size={19} />
            </span>
            <span>
              <small>Equipe</small>
              <strong>
                {members.length} membro{members.length === 1 ? "" : "s"}
              </strong>
              <span>
                {canManageTeam ? "Gestao disponivel" : "Somente leitura"}
              </span>
            </span>
          </article>
          <article>
            <span className="settings-overview-icon invite" aria-hidden="true">
              <UserPlus size={19} />
            </span>
            <span>
              <small>Convites</small>
              <strong>
                {pendingInviteCount} pendente
                {pendingInviteCount === 1 ? "" : "s"}
              </strong>
              <span>Envio e reenvio por email</span>
            </span>
          </article>
          <article>
            <span
              className="settings-overview-icon automation"
              aria-hidden="true"
            >
              <Zap size={19} />
            </span>
            <span>
              <small>Conversoes</small>
              <strong>
                {activeConversionRuleCount} gatilho
                {activeConversionRuleCount === 1 ? "" : "s"} ativo
                {activeConversionRuleCount === 1 ? "" : "s"}
              </strong>
              <span>{visibleFunnelStageCount} etapas visiveis</span>
            </span>
          </article>
        </div>
      </section>

      <nav
        className="settings-domain-nav"
        aria-label="Atalhos das configuracoes"
      >
        <a href="#configuracao-conta">
          <Building2 size={16} aria-hidden="true" />
          Conta
        </a>
        <a href="#configuracao-equipe">
          <UsersRound size={16} aria-hidden="true" />
          Equipe
        </a>
        <a href="#configuracao-conversoes">
          <Workflow size={16} aria-hidden="true" />
          Conversoes
        </a>
      </nav>

      <section
        className="settings-domain-section settings-account-domain"
        id="configuracao-conta"
        aria-labelledby="settings-account-title"
      >
        <div className="settings-domain-heading">
          <span className="settings-domain-number" aria-hidden="true">
            01
          </span>
          <div>
            <span className="eyebrow">Conta e workspace</span>
            <h2 id="settings-account-title">Identidade e acesso</h2>
            <p>
              Confira a identidade publica do workspace e o acesso da conta
              atual.
            </p>
          </div>
          <span className={`status-chip${isPlatformSupport ? " neutral" : ""}`}>
            {currentAccessLabel}
          </span>
        </div>

        <div className="surface-panel settings-profile-panel">
          <div className="settings-profile-grid">
            <div className="workspace-profile-section">
              <div className="settings-section-heading">
                <span className="micro-label">Workspace</span>
                <strong>
                  <PresentationMask placeholder="Workspace demonstrativo">
                    {workspace?.name ?? "Workspace indisponivel"}
                  </PresentationMask>
                </strong>
                <small>
                  <PresentationMask placeholder="workspace-demonstrativo">
                    {workspace ? workspace.slug : "Dados indisponiveis"}
                  </PresentationMask>
                </small>
              </div>
              <form
                className="workspace-name-form"
                action={updateWorkspaceProfile}
                data-presentation-sensitive-action="true"
              >
                <label>
                  <span>Nome publico</span>
                  <input
                    defaultValue={workspace?.name ?? ""}
                    name="workspaceName"
                    data-presentation-sensitive-field="true"
                  />
                </label>
                <button
                  className="button primary"
                  disabled={!workspace?.permissions.canManageWorkspaceSettings}
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
                  <PresentationMask placeholder="--">
                    {accountUser
                      ? initials(accountUser.name, accountUser.email)
                      : "--"}
                  </PresentationMask>
                </span>
                <span>
                  <strong>
                    <PresentationMask placeholder="Usuario oculto">
                      {accountUser?.name ?? "Conta do usuario"}
                    </PresentationMask>
                  </strong>
                  <small>
                    <PresentationMask placeholder="usuario@exemplo.com">
                      {accountUser?.email ?? "Conta indisponivel"}
                    </PresentationMask>
                  </small>
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
                  <dd>
                    {accountUser?.emailVerifiedAt
                      ? "Email verificado"
                      : "Email pendente"}
                  </dd>
                </div>
              </dl>
              {!accountUser?.emailVerifiedAt ? (
                <form
                  action={requestEmailVerification}
                  data-presentation-sensitive-action="true"
                >
                  <button
                    className="button"
                    disabled={!accountUser}
                    type="submit"
                  >
                    Enviar verificacao
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section
        className="settings-domain-section settings-team-domain"
        id="configuracao-equipe"
        aria-labelledby="settings-team-title"
      >
        <div className="settings-domain-heading">
          <span className="settings-domain-number" aria-hidden="true">
            02
          </span>
          <div>
            <span className="eyebrow">Equipe</span>
            <h2 id="settings-team-title">Membros e acessos</h2>
            <p>
              {workspaceSettings.state === "error"
                ? "Nao foi possivel carregar a equipe."
                : `${members.length} usuario${members.length === 1 ? "" : "s"} ativo${members.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <span className={`status-chip${canManageTeam ? "" : " neutral"}`}>
            {canManageTeam ? "Gestao da equipe" : "Somente leitura"}
          </span>
        </div>

        <div className="surface-panel team-settings-panel">
          <div className="team-settings-layout">
            <div className="member-list" aria-label="Membros do workspace">
              {members.length > 0 ? (
                members.map((member) => {
                  const isSelf = member.userId === accountUser?.id;
                  const canManageTarget =
                    canManageTeam &&
                    member.role !== "owner" &&
                    (canGrantMemberManager ||
                      !member.canManageMembers ||
                      isSelf);

                  return (
                    <div className="member-row" key={member.id}>
                      <span className="member-avatar" aria-hidden="true">
                        <PresentationMask placeholder="--">
                          {initials(member.name, member.email)}
                        </PresentationMask>
                      </span>
                      <span className="member-identity">
                        <strong>
                          <PresentationMask placeholder="Usuario oculto">
                            {member.name ?? "Usuario sem nome"}
                          </PresentationMask>
                        </strong>
                        <small>
                          <PresentationMask placeholder="usuario@exemplo.com">
                            {member.email}
                          </PresentationMask>
                        </small>
                      </span>
                      <span className="member-role">
                        <strong>{workspaceRoleLabel(member.role)}</strong>
                        <small>
                          {workspaceRoleDescription(
                            member.role,
                            member.canManageMembers,
                          )}
                        </small>
                        {member.canManageMembers ? (
                          <span className="member-manager-label">
                            Gerencia equipe
                          </span>
                        ) : null}
                      </span>
                      {canManageTarget ? (
                        <div
                          className="member-controls"
                          data-presentation-sensitive-action="true"
                        >
                          <BackofficeActionForm
                            action={updateWorkspaceMemberRole}
                            className="member-role-form"
                          >
                            <input
                              name="memberId"
                              type="hidden"
                              value={member.id}
                            />
                            <label>
                              <span className="sr-only">
                                Nivel de acesso de {member.email}
                              </span>
                              <select
                                aria-label={`Nivel de acesso de ${member.email}`}
                                defaultValue={member.role}
                                name="role"
                              >
                                <option value="member">Analista</option>
                                <option value="admin">Administrador</option>
                              </select>
                            </label>
                            <TeamActionButton
                              kind="save"
                              label={`Salvar nivel de ${member.email}`}
                            />
                          </BackofficeActionForm>
                          {canGrantMemberManager && member.role === "admin" ? (
                            <BackofficeActionForm
                              action={updateWorkspaceMemberManager}
                              className="member-manager-form"
                            >
                              <input
                                name="memberId"
                                type="hidden"
                                value={member.id}
                              />
                              <label className="member-manager-toggle">
                                <input
                                  defaultChecked={member.canManageMembers}
                                  name="canManageMembers"
                                  type="checkbox"
                                />
                                <span>Gerenciar equipe</span>
                              </label>
                              <TeamActionButton
                                kind="shield"
                                label={`Salvar gestao de equipe de ${member.email}`}
                              />
                            </BackofficeActionForm>
                          ) : null}
                          <BackofficeActionForm
                            action={removeWorkspaceMember}
                            className="member-remove-form"
                          >
                            <input
                              name="memberId"
                              type="hidden"
                              value={member.id}
                            />
                            <TeamActionButton
                              confirmMessage={`Remover ${member.email} deste workspace?`}
                              danger
                              kind="remove"
                              label={`Remover ${member.email}`}
                            />
                          </BackofficeActionForm>
                        </div>
                      ) : null}
                      {isPlatformOwnerSupport && member.role === "owner" ? (
                        <div
                          className="member-controls member-owner-controls"
                          data-presentation-sensitive-action="true"
                        >
                          <BackofficeActionForm
                            action={resendWorkspaceOwnerAccess}
                          >
                            <input
                              name="workspaceId"
                              type="hidden"
                              value={workspace?.id ?? ""}
                            />
                            <input
                              name="ownerUserId"
                              type="hidden"
                              value={member.userId}
                            />
                            <PendingSubmitButton
                              className="button ghost compact-button"
                              label="Reenviar e-mail de acesso"
                              pendingLabel="Enviando..."
                            />
                          </BackofficeActionForm>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="muted">Nenhum membro retornado pela API.</p>
              )}
            </div>

            <aside className="invite-panel">
              <div>
                <span className="micro-label">Novo acesso</span>
                <strong>Convidar membro</strong>
              </div>
              {canManageTeam ? (
                <div data-presentation-sensitive-action="true">
                  <BackofficeActionForm
                    action={createWorkspaceInvite}
                    className="invite-form"
                    resetOnSuccess
                  >
                    <label>
                      <span>Email</span>
                      <input
                        name="email"
                        type="email"
                        placeholder="pessoa@empresa.com"
                        data-presentation-sensitive-field="true"
                      />
                    </label>
                    <label>
                      <span>Nivel de acesso</span>
                      <select name="role" defaultValue="member">
                        <option value="member">Analista</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </label>
                    <button className="button primary" type="submit">
                      <UserPlus aria-hidden="true" size={16} strokeWidth={2} />
                      Enviar convite
                    </button>
                  </BackofficeActionForm>
                </div>
              ) : (
                <p className="muted">
                  Apenas gestores da equipe podem convidar.
                </p>
              )}
              <div className="pending-invites">
                <span className="micro-label">Convites</span>
                {invites.length > 0 ? (
                  invites.map((invite) => (
                    <div key={invite.id}>
                      <span>
                        <strong>
                          <PresentationMask placeholder="usuario@exemplo.com">
                            {invite.email}
                          </PresentationMask>
                        </strong>
                        <small>
                          {inviteStatusLabel(invite.status)} |{" "}
                          {workspaceRoleLabel(invite.role)}
                          {["pending", "sent", "failed"].includes(invite.status)
                            ? ` | expira em ${shortDate(invite.expiresAt)}`
                            : ""}
                        </small>
                      </span>
                      {canManageTeam && invite.status !== "accepted" ? (
                        <div
                          className="invite-actions"
                          data-presentation-sensitive-action="true"
                        >
                          <BackofficeActionForm action={resendWorkspaceInvite}>
                            <input
                              name="inviteId"
                              type="hidden"
                              value={invite.id}
                            />
                            <PendingSubmitButton
                              className="button ghost compact-button"
                              label="Reenviar"
                              pendingLabel="Enviando..."
                            />
                          </BackofficeActionForm>
                          {["pending", "sent", "failed"].includes(
                            invite.status,
                          ) ? (
                            <BackofficeActionForm
                              action={revokeWorkspaceInvite}
                            >
                              <input
                                name="inviteId"
                                type="hidden"
                                value={invite.id}
                              />
                              <TeamActionButton
                                confirmMessage={`Revogar o convite de ${invite.email}?`}
                                danger
                                kind="revoke"
                                label={`Revogar convite de ${invite.email}`}
                              />
                            </BackofficeActionForm>
                          ) : null}
                        </div>
                      ) : (
                        <span className="status-chip neutral">
                          {inviteStatusLabel(invite.status)}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <small>Nenhum convite registrado</small>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section
        className="settings-domain-section settings-conversion-domain"
        id="configuracao-conversoes"
        aria-labelledby="settings-conversion-title"
      >
        <div className="settings-domain-heading">
          <span className="settings-domain-number" aria-hidden="true">
            03
          </span>
          <div>
            <span className="eyebrow">Conversoes</span>
            <h2 id="settings-conversion-title">Jornada e gatilhos</h2>
            <p>
              Controle a leitura do funil e os eventos reconhecidos nas
              conversas.
            </p>
          </div>
          <span className="status-chip">
            {activeConversionRuleCount} gatilho
            {activeConversionRuleCount === 1 ? "" : "s"} ativo
            {activeConversionRuleCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="settings-automation-list">
          <details
            className="surface-panel settings-automation-details funnel-settings-panel"
            open={funnelConfiguration.state === "error"}
          >
            <summary>
              <span className="settings-automation-icon" aria-hidden="true">
                <Workflow size={19} />
              </span>
              <span className="settings-automation-copy">
                <span className="eyebrow">Jornada do funil</span>
                <strong>Etapas exibidas nos indicadores</strong>
                <small>
                  Defina a ordem e o nome que o cliente ve em Visao geral e
                  Relatorios.
                </small>
              </span>
              <span
                className={`status-chip${funnelConfiguration.state === "error" ? " warn" : ""}`}
              >
                {funnelConfiguration.state === "error"
                  ? "Configuracao indisponivel"
                  : `${visibleFunnelStageCount} etapas visiveis`}
              </span>
              <span className="settings-automation-action">
                Configurar
                <ChevronDown size={16} aria-hidden="true" />
              </span>
            </summary>
            <div className="settings-automation-body">
              {canManageConversionRules && funnelStages.length > 0 ? (
                <BackofficeActionForm
                  action={saveFunnelConfiguration}
                  className="funnel-config-form"
                >
                  <div className="funnel-config-list">
                    {funnelStages.map((stage) => (
                      <div className="funnel-stage-row" key={stage.eventName}>
                        <input
                          type="hidden"
                          name="stageEventName"
                          value={stage.eventName}
                        />
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
                          <small className="funnel-event-code">
                            {stage.eventName}
                          </small>
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
                                defaultValue={moneyInputValue(
                                  stage.defaultValueCents,
                                )}
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
                          <span className="funnel-stage-type">
                            Evento de relacionamento
                          </span>
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
                    <span>
                      As alteracoes atualizam os indicadores do workspace.
                    </span>
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
          </details>

          <details
            id="whatsapp-triggers"
            className="surface-panel settings-automation-details conversion-rules-panel"
            open
          >
            <summary>
              <span
                className="settings-automation-icon rules"
                aria-hidden="true"
              >
                <Zap size={19} />
              </span>
              <span className="settings-automation-copy">
                <span className="eyebrow">Mapeamento de eventos</span>
                <strong>Gatilhos do WhatsApp</strong>
                <small>
                  Defina o que precisa acontecer na conversa e qual evento sera
                  registrado.
                </small>
              </span>
              <span
                className={`status-chip${triggerRulesHaveError ? " warn" : ""}`}
              >
                {triggerRulesHaveError
                  ? "Regras indisponiveis"
                  : `${activeConversionRuleCount}/${rules.length} ativos`}
              </span>
              <span className="settings-automation-action">
                Configurar
                <ChevronDown size={16} aria-hidden="true" />
              </span>
            </summary>
            <div className="settings-automation-body trigger-center-body">
              <section className="trigger-source-section">
                <header className="trigger-center-section-heading">
                  <div>
                    <span className="eyebrow">Origens conectadas</span>
                    <h3>Regras por conexao e canal</h3>
                    <p className="muted">
                      Escolha a origem Umbler e limite cada gatilho aos canais
                      que realmente devem gerar conversoes.
                    </p>
                  </div>
                  <Link className="button" href="/integrations">
                    Gerenciar conexoes
                  </Link>
                </header>

                {umblerConnections.length > 0 ? (
                  <div className="trigger-source-list">
                    {umblerConnections.map(({ connection, channels }) => {
                      const connectionRules = providerRules.filter(
                        (rule) => rule.connectionId === connection.id,
                      );

                      return (
                        <details
                          className="trigger-source-details"
                          key={connection.id}
                          open={umblerConnections.length === 1}
                        >
                          <summary>
                            <span className="trigger-source-identity">
                              <span className="micro-label">Umbler Talk</span>
                              <strong>{connection.displayName}</strong>
                              <small>
                                {channels.length} canal(is) descoberto(s)
                              </small>
                            </span>
                            <span className="status-chip">
                              {connectionRules.length} gatilho(s)
                            </span>
                            <ChevronDown size={16} aria-hidden="true" />
                          </summary>
                          <div className="trigger-source-body">
                            <ProviderConversionRulePanel
                              connectionId={connection.id}
                              channels={channels}
                              rules={connectionRules}
                              enabled={providerConversionSettings.enabled}
                              canManage={canManageConversionRules}
                              createAction={createProviderConversionRuleAction}
                              updateAction={updateProviderConversionRuleAction}
                              rotateEndpointAction={
                                rotateProviderConversionRuleEndpointAction
                              }
                              removeAction={removeProviderConversionRuleAction}
                              testMessageAction={
                                testProviderCatalogMessageAction
                              }
                            />
                          </div>
                        </details>
                      );
                    })}
                  </div>
                ) : (
                  <div className="trigger-source-empty">
                    <strong>Nenhuma conexao Umbler disponivel</strong>
                    <span>
                      Crie a conexao em Integracoes; depois os canais aparecerao
                      aqui para configurar os gatilhos.
                    </span>
                    <Link className="button" href="/integrations">
                      Abrir Integracoes
                    </Link>
                  </div>
                )}
              </section>

              <section className="legacy-trigger-section">
                <header className="trigger-center-section-heading">
                  <div>
                    <span className="eyebrow">Compatibilidade</span>
                    <h3>WhatsApp direto e regras anteriores</h3>
                    <p className="muted">
                      Regras sem conexao ou canal permanecem aqui ate serem
                      adaptadas para uma origem Umbler.
                    </p>
                  </div>
                  <span className="status-chip">
                    {legacyRules.length} regra(s)
                  </span>
                </header>

                {canManageConversionRules ? (
                  <details
                    className="legacy-trigger-create"
                    open={
                      umblerConnections.length === 0 && legacyRules.length === 0
                    }
                  >
                    <summary>
                      <span>Criar regra para WhatsApp direto</span>
                      <ChevronDown size={16} aria-hidden="true" />
                    </summary>
                    <p className="muted">
                      Use apenas para fontes diretas que nao passam pelas
                      conexoes Umbler acima.
                    </p>
                    <ConversionRuleBuilder
                      action={createConversionRule}
                      events={conversionRuleBuilderEvents}
                      whatsappLabels={whatsappLabels}
                      whatsappLabelsState={whatsappLabelSuggestions.state}
                    />
                  </details>
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
                      {legacyRules.length > 0 ? (
                        legacyRules.map((rule) => (
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
                                  <strong>
                                    {rule.defaultContentName ?? "Sem produto"}
                                  </strong>
                                  <span>
                                    {moneyLabel(
                                      rule.defaultValueCents,
                                      rule.defaultCurrency,
                                    )}
                                  </span>
                                </>
                              ) : (
                                <span>Nao se aplica</span>
                              )}
                            </td>
                            <td data-label="Status">
                              <span
                                className={`event-chip${rule.active ? "" : " warn"}`}
                              >
                                {rule.active ? "ativo" : "pausado"}
                              </span>
                            </td>
                            <td data-label="Acao">
                              {canManageConversionRules ? (
                                <div className="rule-action-stack">
                                  {rule.triggerType === "keyword" &&
                                  rule.eventName === "Purchase" &&
                                  rule.defaultValueCents != null &&
                                  rule.defaultValueCents > 0 &&
                                  rule.defaultCurrency &&
                                  umblerConnections.length > 0 ? (
                                    <LegacyRuleAdaptForm
                                      action={adaptProviderConversionRuleAction}
                                      connections={umblerConnections}
                                      rule={rule}
                                    />
                                  ) : null}
                                  {eventSupportsCommercialValue(
                                    rule.eventName,
                                  ) ? (
                                    <details className="rule-edit-details">
                                      <summary className="button">
                                        Editar valor
                                      </summary>
                                      <BackofficeActionForm
                                        action={updateConversionRuleDetails}
                                        className="rule-edit-form"
                                      >
                                        <input
                                          type="hidden"
                                          name="ruleId"
                                          value={rule.id}
                                        />
                                        <label>
                                          <span>Produto ou servico</span>
                                          <input
                                            defaultValue={
                                              rule.defaultContentName ?? ""
                                            }
                                            name="productName"
                                            placeholder="Produto ou servico"
                                          />
                                        </label>
                                        <label>
                                          <span>Valor</span>
                                          <input
                                            defaultValue={moneyInputValue(
                                              rule.defaultValueCents,
                                            )}
                                            inputMode="decimal"
                                            name="defaultValue"
                                            placeholder="0,00"
                                          />
                                        </label>
                                        <label>
                                          <span>Moeda</span>
                                          <select
                                            defaultValue={
                                              rule.defaultCurrency ?? "BRL"
                                            }
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
                                    <input
                                      type="hidden"
                                      name="ruleId"
                                      value={rule.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="active"
                                      value={String(!rule.active)}
                                    />
                                    <button className="button" type="submit">
                                      {rule.active ? "Pausar" : "Ativar"}
                                    </button>
                                  </form>
                                </div>
                              ) : (
                                <span className="event-chip warn">
                                  sem permissao
                                </span>
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
              </section>
            </div>
          </details>
        </div>
      </section>
    </section>
  );
}
