import type {
  BackofficeInboundWebhookDeliveryDto,
  BackofficeInboundWebhookDeliverySummaryDto,
  BackofficeInboundWebhookOperationsScopeDto,
  BackofficeProviderConversionRolloutDto,
  ConversionEventNameDto,
  DiagnosticWebhookLogDto,
  InboundWebhookDeliveryPurposeDto,
  InboundWebhookDeliveryStatusDto,
  InboundWebhookEventClassificationDto,
  ProviderConversionDecisionCodeDto,
} from "@wpptrack/shared";
import {
  conversionEventDisplayLabel,
  conversionEventNameSchema,
  providerConversionDecisionCodeSchema,
} from "@wpptrack/shared";
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileJson,
  GitCompareArrows,
  History,
  Inbox,
  LifeBuoy,
  Radio,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Waypoints,
} from "lucide-react";
import { BackofficeActionForm } from "../../../../components/backoffice-action-form";
import { BackofficeNavigation } from "../../../../components/backoffice-navigation";
import { InboundParserRecoveryButton } from "../../../../components/inbound-parser-recovery-button";
import { InboundProviderConversionRecoveryButton } from "../../../../components/inbound-provider-conversion-recovery-button";
import { formatDateTime } from "../../../../lib/date-time";
import { serverApiFetch } from "../../../../lib/server-api";
import {
  reprocessInboundParserAction,
  reprocessInboundProviderConversionsAction,
  updateProviderConversionEngineModeAction,
} from "./actions";

type InboundWebhookSearchParams = Record<string, string | string[] | undefined>;

type DeliveryFilters = {
  channelId?: string;
  classification?: string;
  connectionId?: string;
  eventType?: string;
  provider?: string;
  purpose?: InboundWebhookDeliveryPurposeDto;
  q?: string;
  receivedFrom?: string;
  receivedUntil?: string;
  status?: string;
  workspaceId?: string;
};

type DeliveryResult = {
  data: BackofficeInboundWebhookDeliveryDto[];
  hasNextPage: boolean;
  state: "real" | "empty" | "error";
};

type DeliverySummaryResult = {
  data: BackofficeInboundWebhookDeliverySummaryDto | null;
  state: "real" | "error";
};

type DirectDeliveryResult = {
  data: DiagnosticWebhookLogDto[];
  hasNextPage: boolean;
  state: "real" | "empty" | "error";
};

type OperationsScopeResult = {
  data: BackofficeInboundWebhookOperationsScopeDto | null;
  state: "real" | "error";
};

type ProviderConversionRolloutResult = {
  data: BackofficeProviderConversionRolloutDto | null;
  state: "real" | "error";
};

type ShadowComparisonFilters = {
  comparisonResult: "all" | "matches" | "mismatches";
  createdFrom?: string;
  createdUntil?: string;
  decisionCode?: ProviderConversionDecisionCodeDto;
  decisionPresence: "all" | "with_decision" | "without_decision";
  eventName?: ConversionEventNameDto;
};

type QuickFilterKey =
  | "all"
  | "automation"
  | "awaiting_parser"
  | "ctwa_pending"
  | "ctwa_routed"
  | "failed"
  | "no_ctwa";

const deliveryPageSize = 50;
const shadowComparisonPageSize = 20;

const deliveryStatuses: Array<{
  label: string;
  value: InboundWebhookDeliveryStatusDto;
}> = [
  { value: "pending", label: "Pendente" },
  { value: "queued", label: "Na fila" },
  { value: "processing", label: "Processando" },
  { value: "processed", label: "Processado" },
  { value: "failed", label: "Falhou" },
];

const eventClassifications: Array<{
  label: string;
  value: InboundWebhookEventClassificationDto;
}> = [
  { value: "eligible_route_resolved", label: "CTWA roteado" },
  { value: "eligible_route_unresolved", label: "CTWA pendente" },
  { value: "ignored_no_ctwa", label: "Sem CTWA" },
  { value: "ignored_outbound", label: "Mensagem de saida" },
  { value: "ignored_private", label: "Mensagem privada" },
  { value: "ignored_untracked_lead", label: "Fora da base paga" },
  { value: "unsupported_event", label: "Evento nao suportado" },
  { value: "invalid_payload", label: "Payload invalido" },
];

function asStringParam(
  value: string | string[] | undefined,
): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;

  return resolved?.trim() || undefined;
}

function deliveryScopeParams(filters: DeliveryFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.workspaceId) {
    params.set("workspaceId", filters.workspaceId);
  }

  if (filters.connectionId) {
    params.set("connectionId", filters.connectionId);
  }

  if (filters.channelId) {
    params.set("channelId", filters.channelId);
  }

  if (filters.provider) {
    params.set("provider", filters.provider);
  }

  if (filters.purpose) {
    params.set("purpose", filters.purpose);
  }

  if (filters.receivedFrom) {
    params.set("receivedFrom", filters.receivedFrom);
  }

  if (filters.receivedUntil) {
    params.set("receivedUntil", filters.receivedUntil);
  }

  return params;
}

function deliveryFilterParams(filters: DeliveryFilters): URLSearchParams {
  const params = deliveryScopeParams(filters);

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.classification) {
    params.set("classification", filters.classification);
  }

  if (filters.eventType) {
    params.set("eventType", filters.eventType);
  }

  if (filters.q) {
    params.set("q", filters.q);
  }

  return params;
}

function directConnectionId(workspaceId: string): string {
  return `nod-api:${workspaceId}`;
}

function directConnectionWorkspaceId(value?: string): string | undefined {
  const prefix = "nod-api:";

  return value?.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}

function toDiagnosticDateTime(
  value: string | undefined,
  includeFullMinute: boolean,
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    const suffix = includeFullMinute ? ":59.999-03:00" : ":00.000-03:00";

    return new Date(`${value}${suffix}`).toISOString();
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function conversionTraceHref(filters: DeliveryFilters): string {
  const params = deliveryScopeParams(filters);
  const query = params.toString();

  return `/backoffice/inbound-webhooks/conversions${query ? `?${query}` : ""}`;
}

async function getOperationsScope(): Promise<OperationsScopeResult> {
  try {
    const data =
      await serverApiFetch<BackofficeInboundWebhookOperationsScopeDto>(
        "/backoffice/inbound-webhooks/scope",
      );

    return { data, state: "real" };
  } catch {
    return { data: null, state: "error" };
  }
}

async function getProviderConversionRollout(
  channelId: string,
  filters: ShadowComparisonFilters,
  page: number,
): Promise<ProviderConversionRolloutResult> {
  try {
    const params = new URLSearchParams({
      comparisonResult: filters.comparisonResult,
      decisionPresence: filters.decisionPresence,
      limit: String(shadowComparisonPageSize),
      offset: String((page - 1) * shadowComparisonPageSize),
    });

    if (filters.eventName) {
      params.set("eventName", filters.eventName);
    }

    if (filters.decisionCode) {
      params.set("decisionCode", filters.decisionCode);
    }

    if (filters.createdFrom) {
      params.set("createdFrom", filters.createdFrom);
    }

    if (filters.createdUntil) {
      params.set("createdUntil", filters.createdUntil);
    }

    const data = await serverApiFetch<BackofficeProviderConversionRolloutDto>(
      `/backoffice/inbound-webhooks/conversion-rollout/channels/${encodeURIComponent(channelId)}?${params.toString()}`,
    );

    return { data, state: "real" };
  } catch {
    return { data: null, state: "error" };
  }
}

async function getDeliveries(
  filters: DeliveryFilters,
  page: number,
): Promise<DeliveryResult> {
  try {
    const params = deliveryFilterParams(filters);
    params.set("limit", String(deliveryPageSize + 1));
    params.set("offset", String((page - 1) * deliveryPageSize));

    const deliveries = await serverApiFetch<
      BackofficeInboundWebhookDeliveryDto[]
    >(`/backoffice/inbound-webhooks/deliveries?${params.toString()}`);
    const visibleDeliveries = deliveries.slice(0, deliveryPageSize);

    return {
      data: visibleDeliveries,
      hasNextPage: deliveries.length > deliveryPageSize,
      state: visibleDeliveries.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      hasNextPage: false,
      state: "error",
    };
  }
}

async function getDirectDeliveries(
  filters: DeliveryFilters,
  workspaceId: string,
  whatsappInstanceId: string | undefined,
  page: number,
): Promise<DirectDeliveryResult> {
  try {
    const params = new URLSearchParams({
      workspaceId,
      source: "uazapi",
      limit: String(deliveryPageSize + 1),
      offset: String((page - 1) * deliveryPageSize),
    });
    const since = toDiagnosticDateTime(filters.receivedFrom, false);
    const until = toDiagnosticDateTime(filters.receivedUntil, true);

    if (whatsappInstanceId) {
      params.set("whatsappInstanceId", whatsappInstanceId);
    }

    if (filters.status) {
      params.set("status", filters.status);
    }

    if (filters.eventType) {
      params.set("eventType", filters.eventType);
    }

    if (filters.q) {
      params.set("q", filters.q);
    }

    if (since) {
      params.set("since", since);
    }

    if (until) {
      params.set("until", until);
    }

    const logs = await serverApiFetch<DiagnosticWebhookLogDto[]>(
      `/backoffice/diagnostics/webhooks?${params.toString()}`,
    );
    const visibleLogs = logs.slice(0, deliveryPageSize);

    return {
      data: visibleLogs,
      hasNextPage: logs.length > deliveryPageSize,
      state: visibleLogs.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      hasNextPage: false,
      state: "error",
    };
  }
}

async function getDeliverySummary(
  filters: DeliveryFilters,
): Promise<DeliverySummaryResult> {
  try {
    const params = deliveryScopeParams(filters);
    const query = params.toString();
    const suffix = query ? `?${query}` : "";
    const summary =
      await serverApiFetch<BackofficeInboundWebhookDeliverySummaryDto>(
        `/backoffice/inbound-webhooks/summary${suffix}`,
      );

    return {
      data: summary,
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "error",
    };
  }
}

function quickFilterHref(
  filters: DeliveryFilters,
  quickFilter: QuickFilterKey,
): string {
  const params = deliveryScopeParams(filters);

  if (quickFilter === "automation") {
    params.set("purpose", "conversion_automation");
  } else {
    params.delete("purpose");
  }

  if (quickFilter === "ctwa_pending") {
    params.set("classification", "eligible_route_unresolved");
  } else if (quickFilter === "ctwa_routed") {
    params.set("classification", "eligible_route_resolved");
  } else if (quickFilter === "awaiting_parser") {
    params.set("classification", "unsupported_event");
  } else if (quickFilter === "no_ctwa") {
    params.set("classification", "ignored_no_ctwa");
  } else if (quickFilter === "failed") {
    params.set("status", "failed");
  }

  const query = params.toString();

  return `/backoffice/inbound-webhooks${query ? `?${query}` : ""}`;
}

function deliveryPageHref(filters: DeliveryFilters, page: number): string {
  const params = deliveryFilterParams(filters);

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return `/backoffice/inbound-webhooks${query ? `?${query}` : ""}`;
}

function shadowComparisonHref(
  deliveryFilters: DeliveryFilters,
  shadowFilters: ShadowComparisonFilters,
  shadowPage: number,
  deliveryPage: number,
): string {
  const params = deliveryFilterParams(deliveryFilters);

  if (deliveryPage > 1) {
    params.set("page", String(deliveryPage));
  }

  if (shadowFilters.comparisonResult !== "all") {
    params.set("shadowResult", shadowFilters.comparisonResult);
  }

  if (shadowFilters.decisionPresence !== "all") {
    params.set("shadowDecision", shadowFilters.decisionPresence);
  }

  if (shadowFilters.eventName) {
    params.set("shadowEvent", shadowFilters.eventName);
  }

  if (shadowFilters.decisionCode) {
    params.set("shadowCode", shadowFilters.decisionCode);
  }

  if (shadowFilters.createdFrom) {
    params.set("shadowFrom", shadowFilters.createdFrom);
  }

  if (shadowFilters.createdUntil) {
    params.set("shadowUntil", shadowFilters.createdUntil);
  }

  if (shadowPage > 1) {
    params.set("shadowPage", String(shadowPage));
  }

  const query = params.toString();

  return `/backoffice/inbound-webhooks${query ? `?${query}` : ""}`;
}

function pageParam(value: string | string[] | undefined): number {
  const parsed = Number(asStringParam(value));

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 2_001);
}

function shadowComparisonResultParam(
  value: string | string[] | undefined,
): ShadowComparisonFilters["comparisonResult"] {
  const resolved = asStringParam(value);

  return resolved === "matches" || resolved === "mismatches" ? resolved : "all";
}

function shadowDecisionPresenceParam(
  value: string | string[] | undefined,
): ShadowComparisonFilters["decisionPresence"] {
  const resolved = asStringParam(value);

  return resolved === "with_decision" || resolved === "without_decision"
    ? resolved
    : "all";
}

function shadowEventNameParam(
  value: string | string[] | undefined,
): ConversionEventNameDto | undefined {
  const parsed = conversionEventNameSchema.safeParse(asStringParam(value));

  return parsed.success ? parsed.data : undefined;
}

function shadowDecisionCodeParam(
  value: string | string[] | undefined,
): ProviderConversionDecisionCodeDto | undefined {
  const parsed = providerConversionDecisionCodeSchema.safeParse(
    asStringParam(value),
  );

  return parsed.success ? parsed.data : undefined;
}

function classificationLabel(
  classification: InboundWebhookEventClassificationDto | null,
): string {
  if (!classification) {
    return "Aguardando classificacao";
  }

  return (
    eventClassifications.find((candidate) => candidate.value === classification)
      ?.label ?? classification
  );
}

function statusLabel(status: InboundWebhookDeliveryStatusDto): string {
  return (
    deliveryStatuses.find((candidate) => candidate.value === status)?.label ??
    status
  );
}

function classificationDescription(
  classification: InboundWebhookEventClassificationDto | null,
): string {
  switch (classification) {
    case "eligible_route_unresolved":
      return "CTWA encontrado; falta associar o canal a estrutura Meta.";
    case "eligible_route_resolved":
      return "CTWA encontrado e rota Meta identificada.";
    case "ignored_no_ctwa":
      return "Mensagem recebida sem identificacao de anuncio.";
    case "ignored_outbound":
      return "Mensagem enviada pela equipe; nao conta como nova conversa.";
    case "ignored_private":
      return "Evento privado preservado apenas para observacao.";
    case "ignored_untracked_lead":
      return "Contato nao encontrado na base paga; preservado apenas para auditoria interna.";
    case "unsupported_event":
      return "O parser ainda nao reconhece este tipo de evento.";
    case "invalid_payload":
      return "O formato recebido precisa ser analisado.";
    default:
      return "A entrega ainda esta sendo processada.";
  }
}

function deliveryPurposeLabel(
  purpose: InboundWebhookDeliveryPurposeDto,
): string {
  return purpose === "conversion_automation"
    ? "Automacao de conversao"
    : "Mensagem WhatsApp";
}

function deliveryResultLabel(
  delivery: BackofficeInboundWebhookDeliveryDto,
): string {
  return delivery.purpose === "conversion_automation"
    ? "Callback preservado"
    : classificationLabel(delivery.classification);
}

function deliveryResultDescription(
  delivery: BackofficeInboundWebhookDeliveryDto,
): string {
  return delivery.purpose === "conversion_automation"
    ? "Payload da automacao retido para validar e certificar o parser."
    : classificationDescription(delivery.classification);
}

function payloadLabel(delivery: BackofficeInboundWebhookDeliveryDto): string {
  if (delivery.payloadAvailable) {
    return "Payload disponivel";
  }

  return new Date(delivery.payloadExpiresAt).getTime() <= Date.now()
    ? "Payload expirado"
    : "Payload removido";
}

function activeQuickFilter(filters: DeliveryFilters): QuickFilterKey | null {
  if (filters.purpose === "conversion_automation") {
    return "automation";
  }

  if (filters.status === "failed") {
    return "failed";
  }

  if (filters.classification === "eligible_route_unresolved") {
    return "ctwa_pending";
  }

  if (filters.classification === "eligible_route_resolved") {
    return "ctwa_routed";
  }

  if (filters.classification === "ignored_no_ctwa") {
    return "no_ctwa";
  }

  if (filters.classification === "unsupported_event") {
    return "awaiting_parser";
  }

  if (filters.status || filters.classification) {
    return null;
  }

  return "all";
}

function deliveryTone(
  delivery: BackofficeInboundWebhookDeliveryDto,
): "bad" | "good" | "neutral" | "warn" {
  if (
    delivery.status === "failed" ||
    delivery.classification === "invalid_payload"
  ) {
    return "bad";
  }

  if (delivery.classification === "eligible_route_unresolved") {
    return "warn";
  }

  if (delivery.classification === "eligible_route_resolved") {
    return "good";
  }

  return "neutral";
}

function engineModeLabel(mode: "legacy" | "shadow" | "canonical"): string {
  if (mode === "legacy") return "Legado";
  if (mode === "shadow") return "Comparacao shadow";
  return "Canonico";
}

function shadowMismatchLabel(code: string | null): string {
  switch (code) {
    case "applicability_mismatch":
      return "Aplicabilidade diferente";
    case "decision_code_mismatch":
      return "Decisao diferente";
    case "lead_resolution_mismatch":
      return "Atribuicao diferente";
    case "conversion_payload_mismatch":
      return "Valor ou itens diferentes";
    case "reason_code_mismatch":
      return "Motivo diferente";
    case "occurrence_mismatch":
      return "Ocorrencia diferente";
    default:
      return code ?? "Sem divergencia";
  }
}

function shadowDecisionCodeLabel(
  code: ProviderConversionDecisionCodeDto,
): string {
  switch (code) {
    case "eligible":
      return "Elegivel";
    case "review_required":
      return "Requer revisao";
    case "ignored_empty_template":
      return "Template vazio ignorado";
    case "ignored_untracked_lead":
      return "Lead fora da base paga";
    case "duplicate":
      return "Duplicado";
  }
}

export default async function InboundWebhookDeliveriesPage({
  searchParams,
}: {
  searchParams?: Promise<InboundWebhookSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters: DeliveryFilters = {
    workspaceId: asStringParam(resolvedSearchParams.workspaceId),
    connectionId: asStringParam(resolvedSearchParams.connectionId),
    channelId: asStringParam(resolvedSearchParams.channelId),
    provider: asStringParam(resolvedSearchParams.provider),
    purpose: asStringParam(resolvedSearchParams.purpose) as
      InboundWebhookDeliveryPurposeDto | undefined,
    receivedFrom: asStringParam(resolvedSearchParams.receivedFrom),
    receivedUntil: asStringParam(resolvedSearchParams.receivedUntil),
    status: asStringParam(resolvedSearchParams.status),
    classification: asStringParam(resolvedSearchParams.classification),
    eventType: asStringParam(resolvedSearchParams.eventType),
    q: asStringParam(resolvedSearchParams.q),
  };
  const shadowFilters: ShadowComparisonFilters = {
    comparisonResult: shadowComparisonResultParam(
      resolvedSearchParams.shadowResult,
    ),
    decisionPresence: shadowDecisionPresenceParam(
      resolvedSearchParams.shadowDecision,
    ),
    decisionCode: shadowDecisionCodeParam(resolvedSearchParams.shadowCode),
    eventName: shadowEventNameParam(resolvedSearchParams.shadowEvent),
    createdFrom: asStringParam(resolvedSearchParams.shadowFrom),
    createdUntil: asStringParam(resolvedSearchParams.shadowUntil),
  };
  const page = pageParam(resolvedSearchParams.page);
  const shadowPage = pageParam(resolvedSearchParams.shadowPage);
  const scopeResult = await getOperationsScope();
  const scope = scopeResult.data?.workspaces ?? [];
  const connectionEntries = scope.flatMap((workspace) =>
    workspace.connections.map((connection) => ({ workspace, connection })),
  );
  const directInstanceEntries = scope.flatMap((workspace) =>
    workspace.directInstances.map((instance) => ({ workspace, instance })),
  );
  const requestedDirectWorkspaceId = directConnectionWorkspaceId(
    filters.connectionId,
  );
  const selectedWorkspace =
    scope.find((workspace) => workspace.id === filters.workspaceId) ??
    scope.find((workspace) => workspace.id === requestedDirectWorkspaceId) ??
    directInstanceEntries.find(
      ({ instance }) => instance.id === filters.channelId,
    )?.workspace;
  const selectedDirectInstanceEntry = directInstanceEntries.find(
    ({ instance }) => instance.id === filters.channelId,
  );
  const selectedConnectionEntry =
    connectionEntries.find(
      ({ connection }) => connection.id === filters.connectionId,
    ) ??
    connectionEntries.find(({ connection }) =>
      connection.channels.some((channel) => channel.id === filters.channelId),
    );
  const selectedConnection = selectedConnectionEntry?.connection;
  const selectedDirectInstance = selectedDirectInstanceEntry?.instance;
  const activeWorkspace =
    selectedWorkspace ??
    selectedConnectionEntry?.workspace ??
    selectedDirectInstanceEntry?.workspace;
  const isDirectScope = Boolean(
    selectedDirectInstance ||
    requestedDirectWorkspaceId ||
    (selectedWorkspace &&
      selectedWorkspace.connections.length === 0 &&
      selectedWorkspace.directInstances.length > 0),
  );
  const connectionOptions = selectedWorkspace
    ? selectedWorkspace.connections.map((connection) => ({
        workspace: selectedWorkspace,
        connection,
      }))
    : connectionEntries;
  const directConnectionOptions = selectedWorkspace
    ? selectedWorkspace.directInstances.length > 0
      ? [selectedWorkspace]
      : []
    : scope.filter((workspace) => workspace.directInstances.length > 0);
  const channelOptions = isDirectScope
    ? []
    : selectedConnection
      ? selectedConnection.channels.map((channel) => ({
          workspace: selectedConnectionEntry!.workspace,
          connection: selectedConnection,
          channel,
        }))
      : connectionOptions.flatMap(({ workspace, connection }) =>
          connection.channels.map((channel) => ({
            workspace,
            connection,
            channel,
          })),
        );
  const directInstanceOptions = selectedConnection
    ? []
    : selectedWorkspace
      ? selectedWorkspace.directInstances.map((instance) => ({
          workspace: selectedWorkspace,
          instance,
        }))
      : directInstanceEntries;
  const selectedChannel = channelOptions.find(
    ({ channel }) => channel.id === filters.channelId,
  )?.channel;
  let result: DeliveryResult = {
    data: [],
    hasNextPage: false,
    state: "empty",
  };
  let summaryResult: DeliverySummaryResult = {
    data: null,
    state: "real",
  };

  if (!isDirectScope) {
    [result, summaryResult] = await Promise.all([
      getDeliveries(filters, page),
      getDeliverySummary(filters),
    ]);
  }

  const directResult =
    isDirectScope && activeWorkspace
      ? await getDirectDeliveries(
          filters,
          activeWorkspace.id,
          selectedDirectInstance?.id,
          page,
        )
      : ({
          data: [],
          hasNextPage: false,
          state: "empty",
        } satisfies DirectDeliveryResult);
  const deliveries = result.data;
  const directDeliveries = directResult.data;
  const rolloutResult = selectedChannel
    ? await getProviderConversionRollout(
        selectedChannel.id,
        shadowFilters,
        shadowPage,
      )
    : null;
  const rollout = rolloutResult?.data ?? null;
  const quickFilter = activeQuickFilter(filters);
  const hasAdvancedFilters = Boolean(
    filters.provider ||
    filters.eventType ||
    filters.q ||
    filters.receivedFrom ||
    filters.receivedUntil ||
    filters.purpose === "message_observation" ||
    quickFilter === null,
  );
  const totals = summaryResult.data;
  const quickFilters: Array<{
    count: number | null;
    href: string;
    key: QuickFilterKey;
    label: string;
  }> = [
    {
      key: "all",
      label: "Todos eventos",
      count: totals?.all ?? null,
      href: quickFilterHref(filters, "all"),
    },
    {
      key: "automation",
      label: "Automacoes",
      count: totals?.automationCallbacks ?? null,
      href: quickFilterHref(filters, "automation"),
    },
    {
      key: "awaiting_parser",
      label: "Aguardando parser",
      count: totals?.awaitingParser ?? null,
      href: quickFilterHref(filters, "awaiting_parser"),
    },
    {
      key: "ctwa_pending",
      label: "CTWA pendente",
      count: totals?.ctwaPending ?? null,
      href: quickFilterHref(filters, "ctwa_pending"),
    },
    {
      key: "ctwa_routed",
      label: "CTWA roteado",
      count: totals?.ctwaRouted ?? null,
      href: quickFilterHref(filters, "ctwa_routed"),
    },
    {
      key: "no_ctwa",
      label: "Sem CTWA",
      count: totals?.noCtwa ?? null,
      href: quickFilterHref(filters, "no_ctwa"),
    },
    {
      key: "failed",
      label: "Falhas de entrega",
      count: totals?.failed ?? null,
      href: quickFilterHref(filters, "failed"),
    },
  ];
  const deliveryHeading = isDirectScope
    ? selectedDirectInstance
      ? `Entregas de ${selectedDirectInstance.displayName}`
      : "Entregas da NOD API"
    : quickFilter === null
      ? "Resultados filtrados"
      : quickFilter === "all"
        ? "Ultimas entregas"
        : quickFilter === "automation"
          ? "Callbacks de automacao"
          : quickFilters.find((filter) => filter.key === quickFilter)?.label;
  const activeTotal =
    quickFilter === "all"
      ? totals?.all
      : quickFilter === "automation"
        ? totals?.automationCallbacks
        : quickFilter === "awaiting_parser"
          ? totals?.awaitingParser
          : quickFilter === "ctwa_pending"
            ? totals?.ctwaPending
            : quickFilter === "ctwa_routed"
              ? totals?.ctwaRouted
              : quickFilter === "no_ctwa"
                ? totals?.noCtwa
                : quickFilter === "failed"
                  ? totals?.failed
                  : undefined;
  const shadowScopeParams = deliveryFilterParams(filters);
  if (page > 1) {
    shadowScopeParams.set("page", String(page));
  }
  const shadowPreservedParams = Array.from(shadowScopeParams.entries());
  const shadowTotalPages = rollout
    ? Math.max(
        1,
        Math.ceil(rollout.pagination.total / rollout.pagination.limit),
      )
    : 1;
  const shadowCurrentPage = rollout
    ? Math.floor(rollout.pagination.offset / rollout.pagination.limit) + 1
    : shadowPage;
  const emptyShadowFilters: ShadowComparisonFilters = {
    comparisonResult: "all",
    decisionPresence: "all",
  };

  return (
    <section className="page-stack standalone-page inbound-deliveries-page">
      <BackofficeNavigation active="webhooks" />

      <header className="page-header">
        <div>
          <span className="eyebrow">Observacao de provedores</span>
          <h1>Entregas do WhatsApp</h1>
          <p>
            Encontre o evento recente, confirme o CTWA e abra o payload
            recebido.
          </p>
        </div>
        <span className="status-chip neutral">Auditoria e recuperacao</span>
      </header>

      <nav
        className="conversion-trace-view-switch"
        aria-label="Tipo de auditoria"
      >
        <a
          className="active"
          href="/backoffice/inbound-webhooks"
          aria-current="page"
        >
          <FileJson aria-hidden="true" size={17} strokeWidth={2} />
          Entregas e payloads
        </a>
        <a href={conversionTraceHref(filters)}>
          <Waypoints aria-hidden="true" size={17} strokeWidth={2} />
          Conversoes
        </a>
      </nav>

      <section
        className="inbound-operator-scope"
        aria-labelledby="operator-scope-title"
      >
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Navegacao operacional</span>
            <h2 id="operator-scope-title">Cliente, conexao e canal</h2>
            <p>
              Escolha o contexto pelo nome para auditar callbacks, CTWAs e
              operacoes de recuperacao.
            </p>
          </div>
          {activeWorkspace ? (
            <span className="event-chip neutral">
              {activeWorkspace.name}
              {selectedConnection ? ` / ${selectedConnection.displayName}` : ""}
              {selectedChannel ? ` / ${selectedChannel.displayName}` : ""}
              {isDirectScope ? " / NOD API" : ""}
              {selectedDirectInstance
                ? ` / ${selectedDirectInstance.displayName}`
                : ""}
            </span>
          ) : null}
        </div>

        {scopeResult.state === "error" ? (
          <div className="inbound-scope-error">
            <AlertTriangle aria-hidden="true" size={18} strokeWidth={2} />
            Nao foi possivel carregar os nomes dos clientes. Os filtros tecnicos
            continuam protegidos.
          </div>
        ) : (
          <form
            action="/backoffice/inbound-webhooks"
            className="inbound-scope-form"
          >
            {filters.receivedFrom ? (
              <input
                type="hidden"
                name="receivedFrom"
                value={filters.receivedFrom}
              />
            ) : null}
            {filters.receivedUntil ? (
              <input
                type="hidden"
                name="receivedUntil"
                value={filters.receivedUntil}
              />
            ) : null}
            <label>
              <span>
                <Building2 aria-hidden="true" size={15} strokeWidth={2} />
                Workspace
              </span>
              <select
                className="filter-control"
                name="workspaceId"
                defaultValue={activeWorkspace?.id ?? ""}
              >
                <option value="">Todos os clientes</option>
                {scope.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>
                <Radio aria-hidden="true" size={15} strokeWidth={2} />
                Conexao
              </span>
              <select
                className="filter-control"
                name="connectionId"
                defaultValue={
                  selectedConnection?.id ??
                  (isDirectScope && activeWorkspace
                    ? directConnectionId(activeWorkspace.id)
                    : "")
                }
              >
                <option value="">Todas as conexoes</option>
                {connectionOptions.map(({ workspace, connection }) => (
                  <option key={connection.id} value={connection.id}>
                    {selectedWorkspace ? "" : `${workspace.name} / `}
                    {connection.displayName}
                  </option>
                ))}
                {directConnectionOptions.map((workspace) => (
                  <option
                    key={directConnectionId(workspace.id)}
                    value={directConnectionId(workspace.id)}
                  >
                    {selectedWorkspace ? "" : `${workspace.name} / `}
                    NOD API por QR code
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>
                <Radio aria-hidden="true" size={15} strokeWidth={2} />
                Canal WhatsApp
              </span>
              <select
                className="filter-control"
                name="channelId"
                defaultValue={
                  selectedChannel?.id ?? selectedDirectInstance?.id ?? ""
                }
              >
                <option value="">Todos os canais</option>
                {channelOptions.map(({ workspace, connection, channel }) => (
                  <option key={channel.id} value={channel.id}>
                    {selectedConnection
                      ? ""
                      : `${workspace.name} / ${connection.displayName} / `}
                    {channel.displayName} / {channel.connectedPhone}
                  </option>
                ))}
                {directInstanceOptions.map(({ workspace, instance }) => (
                  <option key={instance.id} value={instance.id}>
                    {isDirectScope
                      ? ""
                      : `${workspace.name} / NOD API por QR code / `}
                    {instance.displayName}
                    {instance.connectedPhone
                      ? ` / ${instance.connectedPhone}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <button className="button" type="submit">
              Abrir escopo
            </button>
            <a className="button ghost" href="/backoffice/inbound-webhooks">
              Limpar
            </a>
          </form>
        )}

        {selectedConnection ? (
          <div className="inbound-scope-actions">
            <span>
              <strong>{selectedConnection.displayName}</strong>
              <small>
                {selectedConnection.status === "production"
                  ? "Envio automatico ativo"
                  : "Conexao fora da producao automatica"}
              </small>
            </span>
            <a
              className="button ghost compact-button"
              href={`/backoffice/inbound-webhooks/replay/${selectedConnection.id}`}
            >
              <History aria-hidden="true" size={16} strokeWidth={2} />
              Replay historico
            </a>
            {selectedConnection.status === "production" ? (
              <a
                className="button ghost compact-button"
                href={`/backoffice/inbound-webhooks/recovery/${selectedConnection.id}${
                  selectedChannel ? `?channelId=${selectedChannel.id}` : ""
                }`}
              >
                <LifeBuoy aria-hidden="true" size={16} strokeWidth={2} />
                Recuperar producao
              </a>
            ) : null}
          </div>
        ) : isDirectScope && activeWorkspace ? (
          <div className="inbound-scope-actions">
            <span>
              <strong>
                {selectedDirectInstance?.displayName ?? "NOD API por QR code"}
              </strong>
              <small>
                {selectedDirectInstance?.connectedPhone ??
                  "Todas as instancias deste cliente"}{" "}
                - auditoria de payload ativa
              </small>
            </span>
            <span className="event-chip good">Recebimento protegido</span>
          </div>
        ) : null}
      </section>

      {selectedChannel ? (
        <section
          className="provider-engine-rollout"
          aria-labelledby="provider-engine-rollout-title"
        >
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Rollout protegido</span>
              <h2 id="provider-engine-rollout-title">
                Motor de conversao deste canal
              </h2>
              <p>
                Compare o comportamento novo sem duplicar eventos e promova
                somente depois de revisar as divergencias.
              </p>
            </div>
            {rollout ? (
              <span
                className={`status-chip ${
                  rollout.channel.mode === "canonical"
                    ? "good"
                    : rollout.channel.mode === "shadow"
                      ? "warn"
                      : "neutral"
                }`}
              >
                {engineModeLabel(rollout.channel.mode)}
              </span>
            ) : null}
          </div>

          {rolloutResult?.state === "error" || !rollout ? (
            <div className="inbound-scope-error">
              <AlertTriangle aria-hidden="true" size={18} strokeWidth={2} />
              Nao foi possivel carregar a auditoria shadow deste canal.
            </div>
          ) : (
            <>
              <div className="provider-engine-metrics">
                <span>
                  <small>Comparacoes</small>
                  <strong>{rollout.counts.comparisons}</strong>
                </span>
                <span>
                  <small>Coincidem</small>
                  <strong>{rollout.counts.matches}</strong>
                </span>
                <span>
                  <small>Divergem</small>
                  <strong>{rollout.counts.mismatches}</strong>
                </span>
                <span>
                  <small>Ultima amostra</small>
                  <strong>
                    {rollout.latestComparisonAt
                      ? formatDateTime(rollout.latestComparisonAt)
                      : "Ainda sem amostra"}
                  </strong>
                </span>
              </div>

              <div className="provider-engine-guidance">
                <GitCompareArrows
                  aria-hidden="true"
                  size={20}
                  strokeWidth={2}
                />
                <span>
                  <strong>
                    {rollout.channel.mode === "legacy"
                      ? "O motor legado continua decidindo."
                      : rollout.channel.mode === "shadow"
                        ? "O legado decide; o canonico apenas compara."
                        : "O motor canonico decide as novas ocorrencias."}
                  </strong>
                  <small>
                    Trocar o modo nao reavalia payloads antigos nem reenvia
                    eventos ja materializados.
                  </small>
                </span>
              </div>

              {rollout.mismatchReasons.length > 0 ? (
                <div className="provider-engine-mismatch-list">
                  {rollout.mismatchReasons.map((reason) => (
                    <span className="event-chip warn" key={reason.code}>
                      {shadowMismatchLabel(reason.code)}: {reason.count}
                    </span>
                  ))}
                </div>
              ) : null}

              <BackofficeActionForm
                action={updateProviderConversionEngineModeAction}
                className="provider-engine-mode-form"
              >
                <input
                  type="hidden"
                  name="channelId"
                  value={rollout.channel.id}
                />
                <input
                  type="hidden"
                  name="acknowledgedComparisonCount"
                  value={rollout.counts.comparisons}
                />
                <input
                  type="hidden"
                  name="acknowledgedMismatchCount"
                  value={rollout.counts.mismatches}
                />
                <label>
                  <span>Proximo modo</span>
                  <select
                    className="filter-control"
                    name="mode"
                    defaultValue={rollout.channel.mode}
                  >
                    <option value="legacy">Legado</option>
                    <option value="shadow">Comparacao shadow</option>
                    <option
                      value="canonical"
                      disabled={!rollout.canActivateCanonical}
                    >
                      Canonico
                    </option>
                  </select>
                </label>
                <label>
                  <span>Confirmar nome do canal</span>
                  <input
                    className="input-field"
                    name="confirmation"
                    placeholder={rollout.channel.displayName}
                    autoComplete="off"
                    required
                  />
                </label>
                <button className="button" type="submit">
                  <ShieldCheck aria-hidden="true" size={17} strokeWidth={2} />
                  Aplicar modo
                </button>
                {rollout.canonicalBlocker ? (
                  <small className="provider-engine-blocker">
                    {rollout.canonicalBlocker}
                  </small>
                ) : null}
              </BackofficeActionForm>

              <div className="provider-engine-comparison-table">
                <div className="section-heading-row compact">
                  <div>
                    <span className="eyebrow">Historico pesquisavel</span>
                    <h3>Decisoes comparadas</h3>
                  </div>
                  <div className="provider-engine-filter-counts">
                    <span className="event-chip neutral">
                      {rollout.filteredCounts.comparisons} no filtro
                    </span>
                    <span className="event-chip good">
                      {rollout.filteredCounts.matches} coincidem
                    </span>
                    <span className="event-chip warn">
                      {rollout.filteredCounts.mismatches} divergem
                    </span>
                  </div>
                </div>

                <form
                  className="provider-engine-comparison-filters"
                  method="get"
                >
                  {shadowPreservedParams.map(([name, value]) => (
                    <input
                      key={`${name}:${value}`}
                      type="hidden"
                      name={name}
                      value={value}
                    />
                  ))}
                  <label>
                    <span>Presenca</span>
                    <select
                      className="filter-control"
                      name="shadowDecision"
                      defaultValue={shadowFilters.decisionPresence}
                    >
                      <option value="all">Todas</option>
                      <option value="with_decision">Com decisao</option>
                      <option value="without_decision">Sem decisao</option>
                    </select>
                  </label>
                  <label>
                    <span>Decisao</span>
                    <select
                      className="filter-control"
                      name="shadowCode"
                      defaultValue={shadowFilters.decisionCode ?? ""}
                    >
                      <option value="">Todas as decisoes</option>
                      {providerConversionDecisionCodeSchema.options.map(
                        (decisionCode) => (
                          <option key={decisionCode} value={decisionCode}>
                            {shadowDecisionCodeLabel(decisionCode)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Resultado</span>
                    <select
                      className="filter-control"
                      name="shadowResult"
                      defaultValue={shadowFilters.comparisonResult}
                    >
                      <option value="all">Todos</option>
                      <option value="matches">Coincidem</option>
                      <option value="mismatches">Divergem</option>
                    </select>
                  </label>
                  <label>
                    <span>Evento</span>
                    <select
                      className="filter-control"
                      name="shadowEvent"
                      defaultValue={shadowFilters.eventName ?? ""}
                    >
                      <option value="">Todos os eventos</option>
                      {conversionEventNameSchema.options.map((eventName) => (
                        <option key={eventName} value={eventName}>
                          {conversionEventDisplayLabel(eventName)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Inicio</span>
                    <input
                      className="input-field"
                      type="datetime-local"
                      name="shadowFrom"
                      defaultValue={shadowFilters.createdFrom ?? ""}
                    />
                  </label>
                  <label>
                    <span>Fim</span>
                    <input
                      className="input-field"
                      type="datetime-local"
                      name="shadowUntil"
                      defaultValue={shadowFilters.createdUntil ?? ""}
                    />
                  </label>
                  <div className="provider-engine-comparison-filter-actions">
                    <button className="button compact-button" type="submit">
                      <SlidersHorizontal
                        aria-hidden="true"
                        size={16}
                        strokeWidth={2}
                      />
                      Aplicar filtros
                    </button>
                    <a
                      className="button ghost compact-button"
                      href={shadowComparisonHref(
                        filters,
                        emptyShadowFilters,
                        1,
                        page,
                      )}
                    >
                      Limpar
                    </a>
                  </div>
                </form>

                {rollout.comparisons.length > 0 ? (
                  <div className="table-shell">
                    <table>
                      <thead>
                        <tr>
                          <th>Horario / evento</th>
                          <th>Resultado</th>
                          <th>Legado</th>
                          <th>Canonico</th>
                          <th>Entrega</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rollout.comparisons.map((comparison) => (
                          <tr key={comparison.id}>
                            <td>
                              <strong>
                                {formatDateTime(comparison.createdAt)}
                              </strong>
                              <small>
                                {conversionEventDisplayLabel(
                                  comparison.eventName,
                                )}
                              </small>
                            </td>
                            <td>
                              <span
                                className={`event-chip ${
                                  comparison.matches ? "good" : "warn"
                                }`}
                              >
                                {comparison.matches
                                  ? "Coincide"
                                  : shadowMismatchLabel(
                                      comparison.mismatchCode,
                                    )}
                              </span>
                            </td>
                            <td>
                              <strong>
                                {comparison.legacy.decisionCode ??
                                  "Sem decisao"}
                              </strong>
                              <small>
                                {comparison.legacy.reasonCode ??
                                  "Nao aplicavel"}
                              </small>
                            </td>
                            <td>
                              <strong>
                                {comparison.canonical.decisionCode ??
                                  "Sem decisao"}
                              </strong>
                              <small>
                                {comparison.canonical.reasonCode ??
                                  "Nao aplicavel"}
                              </small>
                            </td>
                            <td>
                              <a
                                className="button ghost compact-button"
                                href={`/backoffice/inbound-webhooks/${comparison.sourceDeliveryId}/payload`}
                              >
                                <Eye
                                  aria-hidden="true"
                                  size={15}
                                  strokeWidth={2}
                                />
                                Payload
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="provider-engine-comparison-empty">
                    <Inbox aria-hidden="true" size={20} strokeWidth={2} />
                    <span>
                      <strong>Nenhuma comparacao neste filtro</strong>
                      <small>
                        Ajuste o evento, a decisao ou o intervalo de horario.
                      </small>
                    </span>
                  </div>
                )}

                <nav
                  className="provider-engine-comparison-pagination"
                  aria-label="Paginacao das decisoes comparadas"
                >
                  <span>
                    Pagina {shadowCurrentPage} de {shadowTotalPages}
                  </span>
                  <div>
                    {rollout.pagination.hasPrevious ? (
                      <a
                        className="button ghost compact-button"
                        href={shadowComparisonHref(
                          filters,
                          shadowFilters,
                          Math.max(1, shadowCurrentPage - 1),
                          page,
                        )}
                      >
                        <ChevronLeft
                          aria-hidden="true"
                          size={16}
                          strokeWidth={2}
                        />
                        Anterior
                      </a>
                    ) : null}
                    {rollout.pagination.hasNext ? (
                      <a
                        className="button ghost compact-button"
                        href={shadowComparisonHref(
                          filters,
                          shadowFilters,
                          shadowCurrentPage + 1,
                          page,
                        )}
                      >
                        Proxima
                        <ChevronRight
                          aria-hidden="true"
                          size={16}
                          strokeWidth={2}
                        />
                      </a>
                    ) : null}
                  </div>
                </nav>
              </div>
            </>
          )}
        </section>
      ) : null}

      {!isDirectScope && (totals?.ctwaPending ?? 0) > 0 ? (
        <div className="inbound-attention-banner">
          <span className="inbound-attention-icon" aria-hidden="true">
            <AlertTriangle size={18} strokeWidth={2} />
          </span>
          <span>
            <strong>
              {totals?.ctwaPending} CTWA aguardando validacao do payload
            </strong>
            <span>
              O evento foi reconhecido e ainda nao possui rota Meta associada.
            </span>
          </span>
          <a
            className="button compact-button"
            href={quickFilterHref(filters, "ctwa_pending")}
          >
            Ver agora
          </a>
        </div>
      ) : null}

      {!isDirectScope ? (
        <nav className="inbound-quick-filters" aria-label="Filtros rapidos">
          {quickFilters.map((filter) => (
            <a
              className={`inbound-quick-filter${
                quickFilter === filter.key ? " active" : ""
              }`}
              href={filter.href}
              aria-current={quickFilter === filter.key ? "page" : undefined}
              key={filter.key}
            >
              <span>{filter.label}</span>
              <strong>{filter.count ?? "--"}</strong>
            </a>
          ))}
        </nav>
      ) : null}

      <details className="inbound-advanced-filters" open={hasAdvancedFilters}>
        <summary>
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2} />
          <span>Filtros avancados</span>
          {hasAdvancedFilters ? <strong>Ativos</strong> : null}
        </summary>
        <form
          className="filter-bar inbound-backoffice-filter"
          action="/backoffice/inbound-webhooks"
        >
          {filters.workspaceId ? (
            <input
              type="hidden"
              name="workspaceId"
              value={filters.workspaceId}
            />
          ) : null}
          {filters.connectionId ? (
            <input
              type="hidden"
              name="connectionId"
              value={filters.connectionId}
            />
          ) : null}
          {filters.channelId ? (
            <input type="hidden" name="channelId" value={filters.channelId} />
          ) : null}
          <label className="filter-field">
            <span>Recebido a partir de</span>
            <input
              type="datetime-local"
              name="receivedFrom"
              defaultValue={filters.receivedFrom ?? ""}
              step="60"
            />
          </label>
          <label className="filter-field">
            <span>Recebido ate</span>
            <input
              type="datetime-local"
              name="receivedUntil"
              defaultValue={filters.receivedUntil ?? ""}
              step="60"
              title="O minuto selecionado e incluido por completo"
            />
          </label>
          {isDirectScope ? (
            <>
              <label className="filter-field">
                <span>Evento ou identificador</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={filters.q ?? ""}
                  placeholder="Mensagem, evento ou ID"
                />
              </label>
              <label className="filter-field">
                <span>Tipo de evento</span>
                <input
                  type="text"
                  name="eventType"
                  defaultValue={filters.eventType ?? ""}
                  placeholder="Ex.: messages"
                />
              </label>
            </>
          ) : (
            <>
              <label className="filter-field">
                <span>Plataforma</span>
                <select name="provider" defaultValue={filters.provider ?? ""}>
                  <option value="">Todas</option>
                  <option value="umbler">Umbler</option>
                  <option value="gupshup">Gupshup</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Tipo de entrada</span>
                <select name="purpose" defaultValue={filters.purpose ?? ""}>
                  <option value="">Todos</option>
                  <option value="message_observation">
                    Mensagens WhatsApp
                  </option>
                  <option value="conversion_automation">
                    Automacoes de conversao
                  </option>
                </select>
              </label>
            </>
          )}
          <label className="filter-field">
            <span>Status</span>
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">Todos</option>
              {isDirectScope ? (
                <>
                  <option value="received">Recebido</option>
                  <option value="processed">Processado</option>
                  <option value="failed">Falhou</option>
                </>
              ) : (
                deliveryStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))
              )}
            </select>
          </label>
          {!isDirectScope ? (
            <label className="filter-field">
              <span>Classificacao</span>
              <select
                name="classification"
                defaultValue={filters.classification ?? ""}
              >
                <option value="">Todas</option>
                {eventClassifications.map((classification) => (
                  <option
                    key={classification.value}
                    value={classification.value}
                  >
                    {classification.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="button" type="submit">
            Aplicar
          </button>
          <a className="button ghost" href="/backoffice/inbound-webhooks">
            Limpar
          </a>
        </form>
      </details>

      <section className="inbound-delivery-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Historico recente</span>
            <h2>{deliveryHeading}</h2>
          </div>
          <span className="event-chip neutral">
            {isDirectScope
              ? `${directDeliveries.length} entrega(s) exibida(s)`
              : activeTotal === undefined
                ? `${deliveries.length} entrega(s) exibida(s)`
                : `${deliveries.length} entrega(s) / ${activeTotal} ${
                    quickFilter === "automation" ? "callback(s)" : "evento(s)"
                  }`}
          </span>
        </div>

        {(isDirectScope ? directResult.state : result.state) === "error" ? (
          <div className="inbound-empty-state">
            <AlertTriangle aria-hidden="true" size={20} />
            <div>
              <strong>Nao foi possivel carregar as entregas</strong>
              <p>
                Confirme a sessao de platform owner e tente novamente. Nenhum
                detalhe sensivel foi exibido.
              </p>
            </div>
          </div>
        ) : (isDirectScope ? directResult.state : result.state) === "empty" ? (
          <div className="inbound-empty-state">
            <Inbox aria-hidden="true" size={20} />
            <div>
              <strong>Nenhuma entrega recebida</strong>
              <p>O primeiro evento da plataforma aparecera aqui.</p>
            </div>
          </div>
        ) : (isDirectScope ? directDeliveries : deliveries).length === 0 ? (
          <div className="inbound-empty-state">
            <SlidersHorizontal aria-hidden="true" size={20} />
            <div>
              <strong>Nenhuma entrega neste filtro</strong>
              <p>Escolha outra categoria ou limpe os filtros avancados.</p>
            </div>
          </div>
        ) : (
          <div className="inbound-delivery-list" role="list">
            {isDirectScope
              ? directDeliveries.map((delivery) => {
                  const instance =
                    directInstanceEntries.find(
                      ({ instance: candidate }) =>
                        candidate.id === delivery.whatsappInstanceId,
                    )?.instance ?? selectedDirectInstance;
                  const tone = delivery.errorCode ? "bad" : "good";

                  return (
                    <article
                      className={`inbound-delivery-row ${tone}`}
                      key={delivery.id}
                      role="listitem"
                    >
                      <div className="inbound-delivery-when">
                        <span className="micro-label">Recebido</span>
                        <strong>{formatDateTime(delivery.receivedAt)}</strong>
                        <span>
                          {delivery.processedAt
                            ? `Processado em ${formatDateTime(
                                delivery.processedAt,
                              )}`
                            : "Recebimento registrado"}
                        </span>
                      </div>

                      <div className="inbound-delivery-source">
                        <span className="micro-label">Cliente / instancia</span>
                        <strong>{activeWorkspace?.name ?? "Workspace"}</strong>
                        <span>{instance?.displayName ?? "NOD API"}</span>
                        <small>
                          {instance?.connectedPhone ??
                            "Registro anterior ao rastreamento por instancia"}
                        </small>
                        <span>NOD API por QR code</span>
                      </div>

                      <div className="inbound-delivery-result">
                        <span className="micro-label">Evento</span>
                        <strong>{delivery.eventType}</strong>
                        <span>
                          {delivery.externalEventId
                            ? `ID externo: ${delivery.externalEventId}`
                            : "Sem identificador externo"}
                        </span>
                      </div>

                      <div className="inbound-delivery-payload">
                        <span className="micro-label">Auditoria</span>
                        <strong>
                          {delivery.payloadAvailable
                            ? "Payload disponivel"
                            : "Payload indisponivel"}
                        </strong>
                        <span>
                          {delivery.errorMessage ??
                            delivery.errorCode ??
                            `Status: ${delivery.status}`}
                        </span>
                      </div>

                      <div className="inbound-delivery-actions">
                        <a
                          className="button ghost compact-button inbound-payload-link"
                          href={`/backoffice/webhooks/${delivery.id}/payload`}
                        >
                          <Eye aria-hidden="true" size={16} strokeWidth={2} />
                          Ver payload
                        </a>
                        <span className="event-chip neutral">
                          Somente auditoria
                        </span>
                      </div>
                    </article>
                  );
                })
              : deliveries.map((delivery) => {
                  const tone = deliveryTone(delivery);
                  const deliveryConnection = connectionEntries.find(
                    ({ connection }) => connection.id === delivery.connectionId,
                  )?.connection;
                  const channelSummary = delivery.channels.length
                    ? delivery.channels
                        .map(
                          (channel) =>
                            `${channel.displayName} / ${channel.connectedPhone}`,
                        )
                        .join(", ")
                    : "Callback sem canal normalizado";
                  const parserRecoveryAvailable =
                    delivery.provider === "gupshup" &&
                    delivery.purpose === "message_observation" &&
                    delivery.status === "processed" &&
                    delivery.classification === "unsupported_event" &&
                    delivery.parserReleaseStatus !== "retired" &&
                    delivery.eventCount === 0;

                  return (
                    <article
                      className={`inbound-delivery-row ${tone}`}
                      key={delivery.id}
                      role="listitem"
                    >
                      <div className="inbound-delivery-when">
                        <span className="micro-label">Recebido</span>
                        <strong>
                          {formatDateTime(delivery.lastReceivedAt)}
                        </strong>
                        <span>{delivery.attemptCount} tentativa(s)</span>
                      </div>

                      <div className="inbound-delivery-source">
                        <span className="micro-label">Cliente / conexao</span>
                        <strong>{delivery.workspaceName}</strong>
                        <span>{delivery.connectionName}</span>
                        <small>{channelSummary}</small>
                        <span>
                          {deliveryPurposeLabel(delivery.purpose)} /{" "}
                          {delivery.providerEventType ?? "Tipo nao informado"}
                        </span>
                      </div>

                      <div className="inbound-delivery-result">
                        <span className="micro-label">Resultado</span>
                        <strong>{deliveryResultLabel(delivery)}</strong>
                        <span>{deliveryResultDescription(delivery)}</span>
                      </div>

                      <div className="inbound-delivery-payload">
                        <span className="micro-label">Auditoria</span>
                        <strong>{payloadLabel(delivery)}</strong>
                        <span>
                          {statusLabel(delivery.status)} - {delivery.eventCount}{" "}
                          evento(s)
                        </span>
                      </div>

                      <div className="inbound-delivery-actions">
                        <a
                          className="button ghost compact-button inbound-payload-link"
                          href={`/backoffice/inbound-webhooks/${delivery.id}/payload`}
                        >
                          <Eye aria-hidden="true" size={16} strokeWidth={2} />
                          Ver payload
                        </a>
                        {delivery.purpose === "message_observation" &&
                        delivery.status === "processed" ? (
                          <>
                            {parserRecoveryAvailable &&
                            delivery.payloadAvailable ? (
                              <BackofficeActionForm
                                action={reprocessInboundParserAction}
                                className="inbound-inline-action-form"
                              >
                                <input
                                  name="deliveryId"
                                  type="hidden"
                                  value={delivery.id}
                                />
                                <InboundParserRecoveryButton />
                              </BackofficeActionForm>
                            ) : parserRecoveryAvailable ? (
                              <span className="event-chip warn">
                                Payload expirado
                              </span>
                            ) : (
                              <>
                                {delivery.providerConversionsObservedAt ? (
                                  <span
                                    className="event-chip good"
                                    title={`Conversoes lidas em ${formatDateTime(
                                      delivery.providerConversionsObservedAt,
                                    )}`}
                                  >
                                    Conversoes lidas
                                  </span>
                                ) : null}
                                {delivery.payloadAvailable ? (
                                  <BackofficeActionForm
                                    action={
                                      reprocessInboundProviderConversionsAction
                                    }
                                    className="inbound-inline-action-form"
                                  >
                                    <input
                                      name="deliveryId"
                                      type="hidden"
                                      value={delivery.id}
                                    />
                                    <InboundProviderConversionRecoveryButton />
                                  </BackofficeActionForm>
                                ) : (
                                  <span className="event-chip warn">
                                    Payload expirado
                                  </span>
                                )}
                              </>
                            )}
                          </>
                        ) : null}
                        {delivery.classification ===
                          "eligible_route_resolved" ||
                        delivery.classification ===
                          "eligible_route_unresolved" ? (
                          <a
                            className="button ghost compact-button inbound-replay-link"
                            href={`/backoffice/inbound-webhooks/replay/${delivery.connectionId}`}
                          >
                            <RotateCcw
                              aria-hidden="true"
                              size={16}
                              strokeWidth={2}
                            />
                            Replay historico
                          </a>
                        ) : null}
                        {deliveryConnection?.status === "production" &&
                        (delivery.classification ===
                          "eligible_route_resolved" ||
                          delivery.classification ===
                            "eligible_route_unresolved") ? (
                          <a
                            className="button ghost compact-button inbound-replay-link"
                            href={`/backoffice/inbound-webhooks/recovery/${delivery.connectionId}${
                              delivery.channels.length === 1
                                ? `?channelId=${delivery.channels[0].id}`
                                : ""
                            }`}
                          >
                            <LifeBuoy
                              aria-hidden="true"
                              size={16}
                              strokeWidth={2}
                            />
                            Recuperar producao
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
          </div>
        )}
      </section>

      {(isDirectScope ? directResult.state : result.state) !== "error" &&
      (page > 1 ||
        (isDirectScope ? directResult.hasNextPage : result.hasNextPage)) ? (
        <nav
          className="report-pagination"
          aria-label="Paginacao das entregas do WhatsApp"
        >
          <span>
            Pagina {page} - {deliveryPageSize} entregas por pagina
          </span>
          <div>
            {page > 1 ? (
              <a
                className="button ghost"
                href={deliveryPageHref(filters, page - 1)}
              >
                <ChevronLeft aria-hidden="true" size={16} strokeWidth={2} />
                Anterior
              </a>
            ) : (
              <span className="button ghost disabled">
                <ChevronLeft aria-hidden="true" size={16} strokeWidth={2} />
                Anterior
              </span>
            )}
            {(isDirectScope ? directResult.hasNextPage : result.hasNextPage) ? (
              <a
                className="button ghost"
                href={deliveryPageHref(filters, page + 1)}
              >
                Proxima
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
              </a>
            ) : (
              <span className="button ghost disabled">
                Proxima
                <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
