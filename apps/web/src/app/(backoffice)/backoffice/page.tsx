import type {
  BackofficePaymentChargeDto,
  BackofficeSubscriptionPlanDto,
  BackofficeWhatsappInstanceDto,
  DiagnosticAuditLogDto,
  DiagnosticConversionEventLogDto,
  DiagnosticEventDto,
  DiagnosticIntegrationLogDto,
  DiagnosticJobAttemptDto,
  DiagnosticSummaryDto,
  DiagnosticWebhookLogDto,
  SplitReceiverDto,
  WorkspaceBillingDto,
} from "@wpptrack/shared";
import { Activity, ArrowRight, CreditCard, MessageCircle } from "lucide-react";
import { revalidatePath } from "next/cache";
import {
  BackofficeHealthFilters,
  type BackofficeHealthFilterValues,
} from "../../../components/backoffice-health-filters";
import { BackofficeHome } from "../../../components/backoffice-home";
import { BackofficeNavigation } from "../../../components/backoffice-navigation";
import {
  BackofficeOperationsNavigation,
  FinanceOperationsNavigation,
  HealthOperationsNavigation,
  type FinanceSection,
  type HealthSection,
  type OperationsArea,
} from "../../../components/backoffice-operations-navigation";
import { formatDateTime } from "../../../lib/date-time";
import { serverApiFetch } from "../../../lib/server-api";

type BackofficeSearchParams = Record<string, string | string[] | undefined>;

type DiagnosticFilters = {
  adId?: string;
  adSetId?: string;
  campaignId?: string;
  errorCode?: string;
  eventType?: string;
  leadId?: string;
  phoneHash?: string;
  q?: string;
  severity?: string;
  since?: string;
  source?: string;
  status?: string;
  until?: string;
  workspaceId?: string;
};

type PaymentChargeFilters = {
  status?: string;
  workspaceId?: string;
};

type WebhookLogFilters = Omit<DiagnosticFilters, "severity">;

type JobAttemptFilters = Pick<
  DiagnosticFilters,
  "q" | "since" | "source" | "status" | "until" | "workspaceId"
> & {
  jobName?: string;
  queueName?: string;
};

type IntegrationLogFilters = Omit<
  DiagnosticFilters,
  "severity" | "phoneHash" | "errorCode" | "eventType"
> & {
  jobId?: string;
  operation?: string;
  providerErrorCode?: string;
};

type ConversionEventLogFilters = Omit<
  DiagnosticFilters,
  "severity" | "source" | "eventType"
> & {
  eventName?: string;
  sourceTrigger?: string;
  pixelId?: string;
};

type DiagnosticSummaryFilters = Pick<
  DiagnosticFilters,
  "since" | "until" | "workspaceId"
>;

type AuditLogFilters = Pick<
  DiagnosticFilters,
  "q" | "since" | "status" | "until" | "workspaceId"
> & {
  action?: string;
  actorType?: string;
  targetType?: string;
};

type ResourceResult<T> = {
  data: T;
  state: "real" | "empty" | "error";
};

async function getDiagnosticEvents(
  filters: DiagnosticFilters,
): Promise<ResourceResult<DiagnosticEventDto[]>> {
  try {
    const params = new URLSearchParams({ limit: "25" });

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }

    const events = await serverApiFetch<DiagnosticEventDto[]>(
      `/backoffice/diagnostics/events?${params.toString()}`,
    );

    return {
      data: events,
      state: events.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getDiagnosticSummary(
  filters: DiagnosticSummaryFilters,
): Promise<ResourceResult<DiagnosticSummaryDto | null>> {
  try {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }

    const summary = await serverApiFetch<DiagnosticSummaryDto>(
      `/backoffice/diagnostics/summary?${params.toString()}`,
    );

    return {
      data: summary,
      state: "real",
    };
  } catch {
    return {
      data: null,
      state: "empty",
    };
  }
}

async function getWebhookLogs(
  filters: WebhookLogFilters,
): Promise<ResourceResult<DiagnosticWebhookLogDto[]>> {
  try {
    const params = new URLSearchParams({ limit: "10" });

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }

    const webhooks = await serverApiFetch<DiagnosticWebhookLogDto[]>(
      `/backoffice/diagnostics/webhooks?${params.toString()}`,
    );

    return {
      data: webhooks,
      state: webhooks.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getJobAttempts(
  filters: JobAttemptFilters,
): Promise<ResourceResult<DiagnosticJobAttemptDto[]>> {
  try {
    const params = new URLSearchParams({ limit: "10" });

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }

    const jobs = await serverApiFetch<DiagnosticJobAttemptDto[]>(
      `/backoffice/diagnostics/jobs?${params.toString()}`,
    );

    return {
      data: jobs,
      state: jobs.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getIntegrationLogs(
  filters: IntegrationLogFilters,
): Promise<ResourceResult<DiagnosticIntegrationLogDto[]>> {
  try {
    const params = new URLSearchParams({ limit: "10" });

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }

    const logs = await serverApiFetch<DiagnosticIntegrationLogDto[]>(
      `/backoffice/diagnostics/integrations?${params.toString()}`,
    );

    return {
      data: logs,
      state: logs.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getConversionEventLogs(
  filters: ConversionEventLogFilters,
): Promise<ResourceResult<DiagnosticConversionEventLogDto[]>> {
  try {
    const params = new URLSearchParams({ limit: "10" });

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }

    const logs = await serverApiFetch<DiagnosticConversionEventLogDto[]>(
      `/backoffice/diagnostics/conversions?${params.toString()}`,
    );

    return {
      data: logs,
      state: logs.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getAuditLogs(
  filters: AuditLogFilters,
): Promise<ResourceResult<DiagnosticAuditLogDto[]>> {
  try {
    const params = new URLSearchParams({ limit: "10" });

    if (filters.status) {
      params.set("resultStatus", filters.status);
    }

    for (const [key, value] of Object.entries(filters)) {
      if (value && key !== "status") {
        params.set(key, value);
      }
    }

    const logs = await serverApiFetch<DiagnosticAuditLogDto[]>(
      `/backoffice/diagnostics/audit?${params.toString()}`,
    );

    return {
      data: logs,
      state: logs.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getSplitReceivers(): Promise<
  ResourceResult<SplitReceiverDto[]>
> {
  try {
    const receivers = await serverApiFetch<SplitReceiverDto[]>(
      "/backoffice/split/receivers",
    );

    return {
      data: receivers,
      state: receivers.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getWorkspaceBilling(): Promise<
  ResourceResult<WorkspaceBillingDto[]>
> {
  try {
    const workspaces = await serverApiFetch<WorkspaceBillingDto[]>(
      "/backoffice/workspaces/billing",
    );

    return {
      data: workspaces,
      state: workspaces.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getPaymentCharges(
  filters: PaymentChargeFilters,
): Promise<ResourceResult<BackofficePaymentChargeDto[]>> {
  try {
    const params = new URLSearchParams();

    if (filters.status) {
      params.set("status", filters.status);
    }

    if (filters.workspaceId) {
      params.set("workspaceId", filters.workspaceId);
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const charges = await serverApiFetch<BackofficePaymentChargeDto[]>(
      `/backoffice/billing/charges${suffix}`,
    );

    return {
      data: charges,
      state: charges.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getSubscriptionPlans(): Promise<
  ResourceResult<BackofficeSubscriptionPlanDto[]>
> {
  try {
    const plans = await serverApiFetch<BackofficeSubscriptionPlanDto[]>(
      "/backoffice/billing/plans",
    );

    return {
      data: plans,
      state: plans.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function getBackofficeWhatsappInstances(): Promise<
  ResourceResult<BackofficeWhatsappInstanceDto[]>
> {
  try {
    const instances = await serverApiFetch<BackofficeWhatsappInstanceDto[]>(
      "/backoffice/workspaces/whatsapp-instances",
    );

    return {
      data: instances,
      state: instances.length > 0 ? "real" : "empty",
    };
  } catch {
    return {
      data: [],
      state: "error",
    };
  }
}

async function retryDiagnosticEvent(formData: FormData) {
  "use server";

  const eventId = String(formData.get("eventId") ?? "");

  if (!eventId) {
    return;
  }

  try {
    await serverApiFetch(`/backoffice/diagnostics/events/${eventId}/retry`, {
      method: "POST",
      body: JSON.stringify({
        reason: "Retry solicitado pelo backoffice WppTrack",
      }),
    });
    revalidatePath("/backoffice");
    revalidatePath(`/backoffice/diagnostics/${eventId}`);
  } catch {
    return;
  }
}

async function retryConversionEventLog(formData: FormData) {
  "use server";

  const conversionEventLogId = String(
    formData.get("conversionEventLogId") ?? "",
  );

  if (!conversionEventLogId) {
    return;
  }

  try {
    await serverApiFetch(
      `/backoffice/diagnostics/conversions/${conversionEventLogId}/retry`,
      {
        method: "POST",
        body: JSON.stringify({
          reason:
            "Retry de evento Pixel/CAPI solicitado pelo backoffice WppTrack",
        }),
      },
    );
    revalidatePath("/backoffice");
  } catch {
    return;
  }
}

async function updateWorkspaceBilling(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const rawCustomerId = String(formData.get("asaasCustomerId") ?? "").trim();

  if (!workspaceId) {
    return;
  }

  try {
    await serverApiFetch(`/backoffice/workspaces/${workspaceId}/billing`, {
      method: "PATCH",
      body: JSON.stringify({
        asaasCustomerId: rawCustomerId || null,
      }),
    });
  } catch {
    return;
  }
}

async function updateWorkspaceOperationalStatus(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const operationalStatus = String(formData.get("operationalStatus") ?? "");

  if (
    !workspaceId ||
    (operationalStatus !== "active" && operationalStatus !== "blocked")
  ) {
    return;
  }

  try {
    await serverApiFetch(
      `/backoffice/workspaces/${workspaceId}/operational-status`,
      {
        method: "PATCH",
        body: JSON.stringify({
          operationalStatus,
        }),
      },
    );
    revalidatePath("/backoffice");
  } catch {
    return;
  }
}

async function createSubscriptionPlan(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "0").replace(",", "."));

  if (!name || !slug || !Number.isFinite(price) || price <= 0) {
    return;
  }

  try {
    await serverApiFetch("/backoffice/billing/plans", {
      method: "POST",
      body: JSON.stringify({
        name,
        slug,
        pricePerWhatsappInstanceCents: Math.round(price * 100),
        active: String(formData.get("active") ?? "true") === "true",
      }),
    });
    revalidatePath("/backoffice");
  } catch {
    return;
  }
}

async function updateSubscriptionPlan(formData: FormData) {
  "use server";

  const planId = String(formData.get("planId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "0").replace(",", "."));

  if (!planId || !name || !slug || !Number.isFinite(price) || price <= 0) {
    return;
  }

  try {
    await serverApiFetch(`/backoffice/billing/plans/${planId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        slug,
        pricePerWhatsappInstanceCents: Math.round(price * 100),
        active: String(formData.get("active") ?? "true") === "true",
      }),
    });
    revalidatePath("/backoffice");
  } catch {
    return;
  }
}

async function createSplitReceiver(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const walletId = String(formData.get("walletId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!name || !walletId) {
    return;
  }

  try {
    await serverApiFetch("/backoffice/split/receivers", {
      method: "POST",
      body: JSON.stringify({
        name,
        walletId,
        email: email || null,
        percentageBps: percentageInputToBps(formData.get("percentage")),
        active: String(formData.get("active") ?? "true") === "true",
      }),
    });
    revalidatePath("/backoffice");
  } catch {
    return;
  }
}

async function updateSplitReceiver(formData: FormData) {
  "use server";

  const receiverId = String(formData.get("receiverId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const walletId = String(formData.get("walletId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!receiverId || !name || !walletId) {
    return;
  }

  try {
    await serverApiFetch(`/backoffice/split/receivers/${receiverId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        walletId,
        email: email || null,
        percentageBps: percentageInputToBps(formData.get("percentage")),
        active: String(formData.get("active") ?? "true") === "true",
      }),
    });
    revalidatePath("/backoffice");
  } catch {
    return;
  }
}

function percentFromBps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function moneyFromCents(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  })
    .format(value / 100)
    .replace(/\u00a0/g, " ");
}

function percentageInputToBps(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? "0").replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.min(10000, Math.round(parsed * 100));
}

function asStringParam(
  value: string | string[] | undefined,
): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;

  return resolved?.trim() || undefined;
}

function normalizeDateFilter(
  value: string | undefined,
  boundary: "start" | "end",
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.includes("T")) {
    return value;
  }

  return boundary === "start"
    ? `${value}T00:00:00.000Z`
    : `${value}T23:59:59.000Z`;
}

function normalizeOperationsArea(
  value: string | undefined,
): OperationsArea | undefined {
  return value === "overview" ||
    value === "whatsapp" ||
    value === "finance" ||
    value === "health"
    ? value
    : undefined;
}

function normalizeFinanceSection(value: string | undefined): FinanceSection {
  return value === "charges" ||
    value === "plans" ||
    value === "customers" ||
    value === "receivers"
    ? value
    : "charges";
}

function normalizeHealthSection(value: string | undefined): HealthSection {
  return value === "incidents" ||
    value === "webhooks" ||
    value === "conversions" ||
    value === "integrations" ||
    value === "jobs" ||
    value === "audit"
    ? value
    : "incidents";
}

export default async function BackofficePage({
  searchParams,
}: {
  searchParams?: Promise<BackofficeSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedView = asStringParam(resolvedSearchParams.view);
  const hasLegacyFilters = Object.keys(resolvedSearchParams).some(
    (key) => !["area", "section", "view"].includes(key),
  );

  if (requestedView !== "operations" && !hasLegacyFilters) {
    return <BackofficeHome />;
  }

  const requestedArea = normalizeOperationsArea(
    asStringParam(resolvedSearchParams.area),
  );
  const hasChargeFilters = Boolean(
    asStringParam(resolvedSearchParams.chargeStatus) ||
    asStringParam(resolvedSearchParams.chargeWorkspaceId),
  );
  const activeArea: OperationsArea =
    requestedArea ??
    (hasChargeFilters ? "finance" : hasLegacyFilters ? "health" : "overview");
  const activeFinanceSection = normalizeFinanceSection(
    asStringParam(resolvedSearchParams.section),
  );
  const activeHealthSection = normalizeHealthSection(
    asStringParam(resolvedSearchParams.section),
  );

  const diagnosticFilters: DiagnosticFilters = {
    workspaceId: asStringParam(resolvedSearchParams.workspaceId),
    source: asStringParam(resolvedSearchParams.source),
    status: asStringParam(resolvedSearchParams.status),
    severity: asStringParam(resolvedSearchParams.severity),
    eventType: asStringParam(resolvedSearchParams.eventType),
    q: asStringParam(resolvedSearchParams.q),
    since: normalizeDateFilter(
      asStringParam(resolvedSearchParams.since),
      "start",
    ),
    until: normalizeDateFilter(
      asStringParam(resolvedSearchParams.until),
      "end",
    ),
    leadId: asStringParam(resolvedSearchParams.leadId),
    phoneHash: asStringParam(resolvedSearchParams.phoneHash),
    campaignId: asStringParam(resolvedSearchParams.campaignId),
    adSetId: asStringParam(resolvedSearchParams.adSetId),
    adId: asStringParam(resolvedSearchParams.adId),
    errorCode: asStringParam(resolvedSearchParams.errorCode),
  };
  const paymentChargeFilters: PaymentChargeFilters = {
    status: asStringParam(resolvedSearchParams.chargeStatus),
    workspaceId: asStringParam(resolvedSearchParams.chargeWorkspaceId),
  };
  const webhookLogFilters: WebhookLogFilters = {
    workspaceId: diagnosticFilters.workspaceId,
    source: diagnosticFilters.source,
    status: diagnosticFilters.status,
    eventType: diagnosticFilters.eventType,
    q: diagnosticFilters.q,
    since: diagnosticFilters.since,
    until: diagnosticFilters.until,
    leadId: diagnosticFilters.leadId,
    phoneHash: diagnosticFilters.phoneHash,
    campaignId: diagnosticFilters.campaignId,
    adSetId: diagnosticFilters.adSetId,
    adId: diagnosticFilters.adId,
    errorCode: diagnosticFilters.errorCode,
  };
  const jobAttemptFilters: JobAttemptFilters = {
    workspaceId: diagnosticFilters.workspaceId,
    source: diagnosticFilters.source,
    status: diagnosticFilters.status,
    queueName: asStringParam(resolvedSearchParams.queueName),
    jobName: asStringParam(resolvedSearchParams.jobName),
    q: diagnosticFilters.q,
    since: diagnosticFilters.since,
    until: diagnosticFilters.until,
  };
  const integrationLogFilters: IntegrationLogFilters = {
    workspaceId: diagnosticFilters.workspaceId,
    source: diagnosticFilters.source,
    status: diagnosticFilters.status,
    operation: diagnosticFilters.eventType,
    q: diagnosticFilters.q,
    since: diagnosticFilters.since,
    until: diagnosticFilters.until,
    leadId: diagnosticFilters.leadId,
    campaignId: diagnosticFilters.campaignId,
    adSetId: diagnosticFilters.adSetId,
    adId: diagnosticFilters.adId,
    jobId: asStringParam(resolvedSearchParams.jobId),
    providerErrorCode: diagnosticFilters.errorCode,
  };
  const conversionEventLogFilters: ConversionEventLogFilters = {
    workspaceId: diagnosticFilters.workspaceId,
    status: diagnosticFilters.status,
    eventName: diagnosticFilters.eventType,
    sourceTrigger: asStringParam(resolvedSearchParams.sourceTrigger),
    pixelId: asStringParam(resolvedSearchParams.pixelId),
    q: diagnosticFilters.q,
    since: diagnosticFilters.since,
    until: diagnosticFilters.until,
    leadId: diagnosticFilters.leadId,
    phoneHash: diagnosticFilters.phoneHash,
    campaignId: diagnosticFilters.campaignId,
    adSetId: diagnosticFilters.adSetId,
    adId: diagnosticFilters.adId,
    errorCode: diagnosticFilters.errorCode,
  };
  const diagnosticSummaryFilters: DiagnosticSummaryFilters = {
    workspaceId: diagnosticFilters.workspaceId,
    since: diagnosticFilters.since,
    until: diagnosticFilters.until,
  };
  const auditLogFilters: AuditLogFilters = {
    workspaceId: diagnosticFilters.workspaceId,
    status: diagnosticFilters.status,
    action: diagnosticFilters.eventType,
    actorType: asStringParam(resolvedSearchParams.actorType),
    targetType: asStringParam(resolvedSearchParams.targetType),
    q: diagnosticFilters.q,
    since: diagnosticFilters.since,
    until: diagnosticFilters.until,
  };
  const [
    diagnosticEventsResult,
    workspaceBillingResult,
    splitReceiversResult,
    paymentChargesResult,
    whatsappInstancesResult,
    webhookLogsResult,
    jobAttemptsResult,
    integrationLogsResult,
    conversionEventLogsResult,
    auditLogsResult,
    subscriptionPlansResult,
    diagnosticSummaryResult,
  ] = await Promise.all([
    getDiagnosticEvents(diagnosticFilters),
    getWorkspaceBilling(),
    getSplitReceivers(),
    getPaymentCharges(paymentChargeFilters),
    getBackofficeWhatsappInstances(),
    getWebhookLogs(webhookLogFilters),
    getJobAttempts(jobAttemptFilters),
    getIntegrationLogs(integrationLogFilters),
    getConversionEventLogs(conversionEventLogFilters),
    getAuditLogs(auditLogFilters),
    getSubscriptionPlans(),
    getDiagnosticSummary(diagnosticSummaryFilters),
  ]);
  const diagnosticEvents = diagnosticEventsResult.data;
  const webhookLogs = webhookLogsResult.data;
  const jobAttempts = jobAttemptsResult.data;
  const integrationLogs = integrationLogsResult.data;
  const conversionEventLogs = conversionEventLogsResult.data;
  const auditLogs = auditLogsResult.data;
  const workspaceBilling = workspaceBillingResult.data;
  const splitReceivers = splitReceiversResult.data;
  const paymentCharges = paymentChargesResult.data;
  const whatsappInstances = whatsappInstancesResult.data;
  const subscriptionPlans = subscriptionPlansResult.data;
  const diagnosticSummary = diagnosticSummaryResult.data;
  const healthFilterValues: BackofficeHealthFilterValues = {
    ...diagnosticFilters,
    actorType: auditLogFilters.actorType,
    jobId: integrationLogFilters.jobId,
    jobName: jobAttemptFilters.jobName,
    queueName: jobAttemptFilters.queueName,
    pixelId: conversionEventLogFilters.pixelId,
    sourceTrigger: conversionEventLogFilters.sourceTrigger,
    targetType: auditLogFilters.targetType,
  };
  const commonHealthFilters = {
    q: diagnosticFilters.q,
    status: diagnosticFilters.status,
    workspaceId: diagnosticFilters.workspaceId,
  };
  const activeHealthFilterCount = Object.values(
    activeHealthSection === "incidents"
      ? {
          ...commonHealthFilters,
          adId: diagnosticFilters.adId,
          adSetId: diagnosticFilters.adSetId,
          campaignId: diagnosticFilters.campaignId,
          errorCode: diagnosticFilters.errorCode,
          eventType: diagnosticFilters.eventType,
          leadId: diagnosticFilters.leadId,
          phoneHash: diagnosticFilters.phoneHash,
          severity: diagnosticFilters.severity,
          since: diagnosticFilters.since,
          source: diagnosticFilters.source,
          until: diagnosticFilters.until,
        }
      : activeHealthSection === "webhooks"
        ? webhookLogFilters
        : activeHealthSection === "conversions"
          ? conversionEventLogFilters
          : activeHealthSection === "integrations"
            ? integrationLogFilters
            : activeHealthSection === "jobs"
              ? jobAttemptFilters
              : auditLogFilters,
  ).filter(Boolean).length;
  const activePaymentChargeFilterCount =
    Object.values(paymentChargeFilters).filter(Boolean).length;
  const hasBackofficeError = [
    diagnosticEventsResult.state,
    workspaceBillingResult.state,
    splitReceiversResult.state,
    paymentChargesResult.state,
    whatsappInstancesResult.state,
    subscriptionPlansResult.state,
    webhookLogsResult.state,
    jobAttemptsResult.state,
    integrationLogsResult.state,
    conversionEventLogsResult.state,
    auditLogsResult.state,
  ].includes("error");
  const configuredCustomers = workspaceBilling.filter(
    (workspace) => workspace.asaasCustomerId,
  ).length;
  const activeReceivers = splitReceivers.filter(
    (receiver) => receiver.active,
  ).length;
  const diagnosticFailureTotal = diagnosticSummary
    ? diagnosticSummary.totals.failedWebhooks +
      diagnosticSummary.totals.failedJobs +
      diagnosticSummary.totals.failedIntegrationCalls +
      diagnosticSummary.totals.failedConversionEvents
    : 0;
  const diagnosticStatusLabel =
    diagnosticSummary?.status === "critical"
      ? "Saude critica"
      : diagnosticSummary?.status === "warning"
        ? "Atencao"
        : diagnosticSummary?.status === "healthy"
          ? "Saudavel"
          : null;
  const diagnosticPanelValue = diagnosticSummary
    ? `${diagnosticSummary.totals.diagnosticEvents} eventos / ${diagnosticSummary.totals.webhooks} webhooks / ${diagnosticSummary.totals.jobs} jobs / ${diagnosticSummary.totals.integrationCalls} chamadas / ${diagnosticSummary.totals.conversionEvents} CAPI / ${diagnosticSummary.totals.auditLogs} auditorias`
    : `${diagnosticEvents.length} eventos / ${webhookLogs.length} webhooks / ${jobAttempts.length} jobs / ${integrationLogs.length} chamadas / ${conversionEventLogs.length} CAPI / ${auditLogs.length} auditorias`;
  const diagnosticPanelDescription = diagnosticSummary
    ? `${diagnosticStatusLabel}; ${diagnosticFailureTotal} falhas no periodo.`
    : "Eventos, webhooks, jobs, chamadas externas, conversoes e auditorias reais retornados pela Central de Diagnostico.";
  const pendingCharges = paymentCharges.filter(
    (charge) => charge.status === "pending",
  ).length;
  const operationsOverviewMetrics = [
    {
      detail: "Clientes operacionais",
      label: "Workspaces",
      value:
        workspaceBillingResult.state === "error"
          ? "--"
          : String(workspaceBilling.length),
    },
    {
      detail: "Conexoes cadastradas",
      label: "Instancias WhatsApp",
      value:
        whatsappInstancesResult.state === "error"
          ? "--"
          : String(whatsappInstances.length),
    },
    {
      detail: `${paymentCharges.length} cobranca(s) carregada(s)`,
      label: "Cobrancas pendentes",
      value:
        paymentChargesResult.state === "error" ? "--" : String(pendingCharges),
    },
    {
      detail: `${splitReceivers.length} recebedor(es)`,
      label: "Recebedores ativos",
      value:
        splitReceiversResult.state === "error" ? "--" : String(activeReceivers),
    },
    {
      detail: diagnosticPanelDescription,
      label: "Falhas operacionais",
      value:
        diagnosticEventsResult.state === "error" ||
        webhookLogsResult.state === "error" ||
        jobAttemptsResult.state === "error" ||
        integrationLogsResult.state === "error" ||
        conversionEventLogsResult.state === "error" ||
        auditLogsResult.state === "error"
          ? "--"
          : String(diagnosticFailureTotal),
    },
  ];
  const workspaceEmptyTitle =
    workspaceBillingResult.state === "error"
      ? "Nao foi possivel carregar workspaces"
      : "Nenhum workspace carregado";
  const splitEmptyTitle =
    splitReceiversResult.state === "error"
      ? "Nao foi possivel carregar recebedores"
      : "Nenhum recebedor configurado";
  const diagnosticEmptyTitle =
    diagnosticEventsResult.state === "error"
      ? "Nao foi possivel carregar eventos diagnosticos"
      : "Nenhum evento diagnostico encontrado";
  const diagnosticEmptyDescription =
    diagnosticEventsResult.state === "error"
      ? "Confira permissao de backoffice ou disponibilidade da API."
      : "Quando webhooks, jobs ou integracoes gerarem eventos, eles aparecem aqui.";
  const webhookLogEmptyTitle =
    webhookLogsResult.state === "error"
      ? "Nao foi possivel carregar webhooks"
      : "Nenhum webhook recebido";
  const jobAttemptEmptyTitle =
    jobAttemptsResult.state === "error"
      ? "Nao foi possivel carregar jobs"
      : "Nenhum job operacional encontrado";
  const integrationLogEmptyTitle =
    integrationLogsResult.state === "error"
      ? "Nao foi possivel carregar chamadas externas"
      : "Nenhuma chamada externa encontrada";
  const conversionEventLogEmptyTitle =
    conversionEventLogsResult.state === "error"
      ? "Nao foi possivel carregar eventos Pixel/CAPI"
      : "Nenhum evento Pixel/CAPI encontrado";
  const auditLogEmptyTitle =
    auditLogsResult.state === "error"
      ? "Nao foi possivel carregar auditorias"
      : "Nenhuma auditoria operacional encontrada";
  const paymentChargeEmptyTitle =
    paymentChargesResult.state === "error"
      ? "Nao foi possivel carregar cobrancas"
      : "Nenhuma cobranca encontrada";
  const subscriptionPlanEmptyTitle =
    subscriptionPlansResult.state === "error"
      ? "Nao foi possivel carregar planos"
      : "Nenhum plano configurado";
  const whatsappInstanceEmptyTitle =
    whatsappInstancesResult.state === "error"
      ? "Nao foi possivel carregar instancias WhatsApp"
      : "Nenhuma instancia WhatsApp encontrada";
  const activeAreaCopy =
    activeArea === "whatsapp"
      ? {
          eyebrow: "Operacao WhatsApp",
          title: "Instancias da plataforma",
          description:
            "Acompanhe as instancias criadas nos workspaces e o estado de cobranca de cada conexao.",
        }
      : activeArea === "finance"
        ? {
            eyebrow: "Operacao financeira",
            title: "Financeiro da plataforma",
            description:
              "Trabalhe em uma frente por vez: cobrancas, planos, workspaces ou recebedores.",
          }
        : activeArea === "health"
          ? {
              eyebrow: "Central de diagnostico",
              title: "Saude operacional",
              description:
                "Investigue uma camada por vez com filtros proprios para cada tipo de registro.",
            }
          : {
              eyebrow: "Backoffice interno",
              title: "Operacoes internas",
              description:
                "Escolha uma area de trabalho para consultar a plataforma sem misturar tabelas e filtros.",
            };

  return (
    <section className="page-stack standalone-page backoffice-operations-page">
      <BackofficeNavigation active="operations" />

      <header className="page-header">
        <div>
          <span className="eyebrow">{activeAreaCopy.eyebrow}</span>
          <h1>{activeAreaCopy.title}</h1>
          <p>{activeAreaCopy.description}</p>
        </div>
        <div className="header-actions">
          <a className="button ghost" href="/backoffice">
            Voltar ao inicio
          </a>
          <span className={`status-chip${hasBackofficeError ? " warn" : ""}`}>
            {hasBackofficeError ? "API indisponivel" : "Backoffice conectado"}
          </span>
        </div>
      </header>

      <BackofficeOperationsNavigation activeArea={activeArea} />

      {activeArea === "overview" ? (
        <>
          <section
            className="operations-overview"
            aria-label="Resumo operacional"
          >
            <div className="operations-metric-strip">
              {operationsOverviewMetrics.map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.detail}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="backoffice-command-section">
            <div className="operations-panel-header">
              <div>
                <span className="eyebrow">Areas de trabalho</span>
                <h2>Onde voce precisa atuar?</h2>
                <p>
                  Cada area abre somente os controles e registros relacionados.
                </p>
              </div>
            </div>
            <div className="backoffice-command-list">
              <a
                className="backoffice-command-row"
                href="/backoffice?view=operations&area=whatsapp"
              >
                <span className="backoffice-command-icon" aria-hidden="true">
                  <MessageCircle size={20} strokeWidth={2} />
                </span>
                <span className="backoffice-command-copy">
                  <span className="micro-label">Conexoes</span>
                  <strong>WhatsApp</strong>
                  <span>Instancias, providers e estado de cobranca.</span>
                </span>
                <ArrowRight
                  className="backoffice-command-arrow"
                  aria-hidden="true"
                  size={19}
                  strokeWidth={2}
                />
              </a>
              <a
                className="backoffice-command-row"
                href="/backoffice?view=operations&area=finance&section=charges"
              >
                <span className="backoffice-command-icon" aria-hidden="true">
                  <CreditCard size={20} strokeWidth={2} />
                </span>
                <span className="backoffice-command-copy">
                  <span className="micro-label">Asaas e planos</span>
                  <strong>Financeiro</strong>
                  <span>Cobrancas, planos, customers e recebedores.</span>
                </span>
                <ArrowRight
                  className="backoffice-command-arrow"
                  aria-hidden="true"
                  size={19}
                  strokeWidth={2}
                />
              </a>
              <a
                className="backoffice-command-row"
                href="/backoffice?view=operations&area=health&section=incidents"
              >
                <span className="backoffice-command-icon" aria-hidden="true">
                  <Activity size={20} strokeWidth={2} />
                </span>
                <span className="backoffice-command-copy">
                  <span className="micro-label">Diagnostico</span>
                  <strong>Saude operacional</strong>
                  <span>Incidentes, webhooks, CAPI, jobs e auditoria.</span>
                </span>
                <ArrowRight
                  className="backoffice-command-arrow"
                  aria-hidden="true"
                  size={19}
                  strokeWidth={2}
                />
              </a>
            </div>
          </section>
        </>
      ) : null}

      {activeArea === "whatsapp" ? (
        <div className="surface-panel operations-panel" id="instances">
          <div className="operations-panel-header">
            <div>
              <span className="eyebrow">Instancias WhatsApp</span>
              <h2>Conexoes por workspace</h2>
              <p>Instancias reais cadastradas e seus estados operacionais.</p>
            </div>
            <span className="status-chip">
              {whatsappInstances.length} registro(s)
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Instancia</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>ID provider</th>
                  <th>Atualizada</th>
                </tr>
              </thead>
              <tbody>
                {whatsappInstances.length > 0 ? (
                  whatsappInstances.map((instance) => (
                    <tr key={instance.id}>
                      <td>
                        <strong>{instance.workspaceName}</strong>
                        <span>{instance.workspaceId}</span>
                      </td>
                      <td>
                        <strong>{instance.name}</strong>
                        <span>{instance.id}</span>
                      </td>
                      <td>{instance.provider}</td>
                      <td>
                        <span
                          className={`event-chip${instance.billingStatus === "active" ? "" : " warn"}`}
                        >
                          {instance.billingStatus}
                        </span>
                      </td>
                      <td>{instance.providerInstanceId ?? "nao conectado"}</td>
                      <td>{formatDateTime(instance.updatedAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <strong>{whatsappInstanceEmptyTitle}</strong>
                      <span>
                        Instancias criadas no checkout aparecem aqui para
                        suporte interno.
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeArea === "finance" ? (
        <FinanceOperationsNavigation activeSection={activeFinanceSection} />
      ) : null}

      {activeArea === "finance" && activeFinanceSection === "charges" ? (
        <div className="surface-panel operations-panel" id="billing">
          <div className="operations-panel-header">
            <div>
              <span className="eyebrow">Cobrancas Asaas</span>
              <h2>Cobrancas de instancias WhatsApp</h2>
              <p>Consulte somente as cobrancas criadas pela plataforma.</p>
            </div>
          </div>
          <form
            className="operations-filter-panel compact"
            aria-label="Filtros de cobrancas"
            action="/backoffice"
          >
            <input type="hidden" name="view" value="operations" />
            <input type="hidden" name="area" value="finance" />
            <input type="hidden" name="section" value="charges" />
            <div className="operations-filter-grid">
              <label className="operations-filter-field">
                <span>Status</span>
                <select
                  name="chargeStatus"
                  defaultValue={paymentChargeFilters.status ?? ""}
                >
                  <option value="">Todos</option>
                  <option value="pending">pending</option>
                  <option value="paid">paid</option>
                  <option value="failed">failed</option>
                  <option value="canceled">canceled</option>
                  <option value="expired">expired</option>
                </select>
              </label>
              <label className="operations-filter-field">
                <span>Workspace</span>
                <input
                  name="chargeWorkspaceId"
                  placeholder="ID do workspace"
                  defaultValue={paymentChargeFilters.workspaceId}
                />
              </label>
            </div>
            <div className="operations-filter-actions">
              <button className="button" type="submit">
                Filtrar cobrancas
              </button>
              <a
                className="button ghost"
                href="/backoffice?view=operations&area=finance&section=charges"
              >
                Limpar
              </a>
            </div>
          </form>
          <p className="muted">
            {activePaymentChargeFilterCount > 0
              ? `${activePaymentChargeFilterCount} filtros de cobranca ativos`
              : "Mostrando as ultimas cobrancas criadas pela plataforma."}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Cobranca</th>
                  <th>Instancia</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th>Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {paymentCharges.length > 0 ? (
                  paymentCharges.map((charge) => (
                    <tr key={charge.id}>
                      <td>
                        <strong>{charge.workspaceName}</strong>
                        <span>{charge.workspaceId}</span>
                      </td>
                      <td>
                        <strong>{charge.externalChargeId ?? charge.id}</strong>
                        <span>{charge.description}</span>
                      </td>
                      <td>{charge.whatsappInstanceName ?? "sem instancia"}</td>
                      <td>{moneyFromCents(charge.amountCents)}</td>
                      <td>
                        <span
                          className={`event-chip${charge.status === "paid" ? "" : " warn"}`}
                        >
                          {charge.status}
                        </span>
                      </td>
                      <td>
                        {charge.checkoutUrl ? (
                          <a className="button ghost" href={charge.checkoutUrl}>
                            Abrir cobranca
                          </a>
                        ) : (
                          <span className="muted">sem link</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <strong>{paymentChargeEmptyTitle}</strong>
                      <span>
                        As cobrancas criadas no checkout de instancia aparecem
                        aqui.
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeArea === "finance" && activeFinanceSection === "plans" ? (
        <div className="surface-panel operations-panel">
          <div className="operations-panel-header">
            <div>
              <span className="eyebrow">Planos de assinatura</span>
              <h2>Preco por instancia WhatsApp</h2>
              <p>Cadastre e mantenha os planos cobrados pela plataforma.</p>
            </div>
          </div>
          <form className="inline-form" action={createSubscriptionPlan}>
            <input
              aria-label="Novo plano"
              name="name"
              placeholder="Novo plano"
            />
            <input
              aria-label="Slug do plano"
              name="slug"
              placeholder="slug-do-plano"
            />
            <input
              aria-label="Preco por instancia"
              inputMode="decimal"
              name="price"
              placeholder="Valor por instancia"
            />
            <select name="active" aria-label="Estado do plano">
              <option value="true">ativo</option>
              <option value="false">pausado</option>
            </select>
            <button className="button primary" type="submit">
              Adicionar plano
            </button>
          </form>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plano</th>
                  <th>Slug</th>
                  <th>Valor por instancia</th>
                  <th>Estado</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                {subscriptionPlans.length > 0 ? (
                  subscriptionPlans.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <strong>{plan.name}</strong>
                        <span>{plan.id}</span>
                      </td>
                      <td>{plan.slug}</td>
                      <td>
                        {moneyFromCents(plan.pricePerWhatsappInstanceCents)}
                      </td>
                      <td>
                        <span
                          className={`event-chip${plan.active ? "" : " warn"}`}
                        >
                          {plan.active ? "ativo" : "pausado"}
                        </span>
                      </td>
                      <td>
                        <form
                          className="inline-form"
                          action={updateSubscriptionPlan}
                        >
                          <input type="hidden" name="planId" value={plan.id} />
                          <input
                            aria-label={`Nome do plano ${plan.name}`}
                            className="input-field compact-input"
                            defaultValue={plan.name}
                            name="name"
                          />
                          <input
                            aria-label={`Slug do plano ${plan.name}`}
                            className="input-field compact-input"
                            defaultValue={plan.slug}
                            name="slug"
                          />
                          <input
                            aria-label={`Valor do plano ${plan.name}`}
                            className="input-field compact-input"
                            defaultValue={(
                              plan.pricePerWhatsappInstanceCents / 100
                            ).toFixed(2)}
                            inputMode="decimal"
                            name="price"
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={plan.active ? "false" : "true"}
                          />
                          <button className="button" type="submit">
                            {plan.active ? "Pausar" : "Ativar"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <strong>{subscriptionPlanEmptyTitle}</strong>
                      <span>Planos criados pela plataforma aparecem aqui.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeArea === "finance" && activeFinanceSection === "customers" ? (
        <div className="surface-panel operations-panel">
          <div className="operations-panel-header">
            <div>
              <span className="eyebrow">Workspaces</span>
              <h2>Customers Asaas por workspace</h2>
              <p>Gerencie o customer e o estado operacional de cada cliente.</p>
            </div>
            <span className="status-chip">
              {configuredCustomers}/{workspaceBilling.length} configurado(s)
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Slug</th>
                  <th>Customer Asaas</th>
                  <th>Operacao</th>
                  <th>Assinatura</th>
                  <th>Instancias</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                {workspaceBilling.length > 0 ? (
                  workspaceBilling.map((workspace) => (
                    <tr key={workspace.id}>
                      <td>
                        <strong>{workspace.name}</strong>
                        <span>{workspace.id}</span>
                      </td>
                      <td>{workspace.slug}</td>
                      <td>
                        <form
                          className="inline-form"
                          action={updateWorkspaceBilling}
                        >
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={workspace.id}
                          />
                          <input
                            aria-label={`Customer Asaas de ${workspace.name}`}
                            className="input-field compact-input"
                            defaultValue={workspace.asaasCustomerId ?? ""}
                            name="asaasCustomerId"
                            placeholder="Configurar customer"
                          />
                          <button className="button" type="submit">
                            Salvar
                          </button>
                        </form>
                      </td>
                      <td>
                        <form
                          className="inline-form"
                          action={updateWorkspaceOperationalStatus}
                        >
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={workspace.id}
                          />
                          <input
                            type="hidden"
                            name="operationalStatus"
                            value={
                              workspace.operationalStatus === "blocked"
                                ? "active"
                                : "blocked"
                            }
                          />
                          <span
                            className={`event-chip${
                              workspace.operationalStatus === "active"
                                ? ""
                                : " warn"
                            }`}
                          >
                            {workspace.operationalStatus === "active"
                              ? "ativo"
                              : "bloqueado"}
                          </span>
                          <button className="button ghost" type="submit">
                            {workspace.operationalStatus === "blocked"
                              ? "Desbloquear"
                              : "Bloquear"}
                          </button>
                        </form>
                      </td>
                      <td>
                        <span
                          className={`event-chip${workspace.subscriptionStatus === "active" ? "" : " warn"}`}
                        >
                          {workspace.subscriptionStatus}
                        </span>
                      </td>
                      <td>
                        {workspace.activeInstances} instancia
                        {workspace.activeInstances === 1 ? "" : "s"}
                      </td>
                      <td>
                        <span
                          className={`event-chip${workspace.asaasCustomerId ? "" : " warn"}`}
                        >
                          {workspace.asaasCustomerId
                            ? "configurado"
                            : "pendente"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td>
                      <strong>{workspaceEmptyTitle}</strong>
                      <span>Confira permissao de backoffice</span>
                    </td>
                    <td>-</td>
                    <td>
                      <span className="muted">Configurar customer</span>
                    </td>
                    <td>
                      <span className="event-chip warn">sem status</span>
                    </td>
                    <td>
                      <span className="event-chip warn">sem assinatura</span>
                    </td>
                    <td>0 instancias</td>
                    <td>
                      <span className="event-chip warn">
                        {workspaceBillingResult.state === "error"
                          ? "indisponivel"
                          : "Customer Asaas ausente"}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeArea === "finance" && activeFinanceSection === "receivers" ? (
        <div className="surface-panel operations-panel">
          <div className="operations-panel-header">
            <div>
              <span className="eyebrow">Split Asaas</span>
              <h2>Recebedores da plataforma</h2>
              <p>Cadastre as wallets que participam do split da plataforma.</p>
            </div>
            <span className="status-chip">
              {activeReceivers}/{splitReceivers.length} ativo(s)
            </span>
          </div>
          <form className="inline-form" action={createSplitReceiver}>
            <input
              name="name"
              placeholder="Novo recebedor"
              aria-label="Novo recebedor"
            />
            <input
              name="walletId"
              placeholder="Wallet Asaas"
              aria-label="Wallet Asaas"
            />
            <input
              name="email"
              type="email"
              placeholder="Email opcional"
              aria-label="Email opcional"
            />
            <input
              name="percentage"
              inputMode="decimal"
              placeholder="Percentual"
              aria-label="Percentual do split"
            />
            <select
              name="active"
              defaultValue="true"
              aria-label="Estado do recebedor"
            >
              <option value="true">ativo</option>
              <option value="false">pausado</option>
            </select>
            <button className="button primary" type="submit">
              Adicionar recebedor
            </button>
          </form>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recebedor</th>
                  <th>Wallet</th>
                  <th>Email</th>
                  <th>Percentual</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {splitReceivers.length > 0 ? (
                  splitReceivers.map((receiver) => (
                    <tr key={receiver.id}>
                      <td colSpan={5}>
                        <form
                          className="inline-form"
                          action={updateSplitReceiver}
                        >
                          <input
                            type="hidden"
                            name="receiverId"
                            value={receiver.id}
                          />
                          <input
                            aria-label={`Nome de ${receiver.name}`}
                            defaultValue={receiver.name}
                            name="name"
                          />
                          <input
                            aria-label={`Wallet de ${receiver.name}`}
                            defaultValue={receiver.walletId}
                            name="walletId"
                          />
                          <input
                            aria-label={`Email de ${receiver.name}`}
                            defaultValue={receiver.email ?? ""}
                            name="email"
                            type="email"
                          />
                          <input
                            aria-label={`Percentual de ${receiver.name}`}
                            defaultValue={percentFromBps(
                              receiver.percentageBps,
                            ).replace("%", "")}
                            inputMode="decimal"
                            name="percentage"
                          />
                          <select
                            aria-label={`Estado de ${receiver.name}`}
                            defaultValue={String(receiver.active)}
                            name="active"
                          >
                            <option value="true">ativo</option>
                            <option value="false">pausado</option>
                          </select>
                          <button className="button" type="submit">
                            Salvar recebedor
                          </button>
                          <span>{percentFromBps(receiver.percentageBps)}</span>
                          <span
                            className={`event-chip${receiver.active ? "" : " warn"}`}
                          >
                            {receiver.active ? "ativo" : "pausado"}
                          </span>
                        </form>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <strong>{splitEmptyTitle}</strong>
                      <span>
                        Cadastre recebedores reais antes de validar split de
                        pagamentos.
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeArea === "health" ? (
        <HealthOperationsNavigation activeSection={activeHealthSection} />
      ) : null}

      {activeArea === "health" ? (
        <div className="surface-panel operations-panel" id="diagnostics">
          <div className="operations-panel-header">
            <div>
              <span className="eyebrow">Saude por camada</span>
              <h2>
                {activeHealthSection === "incidents"
                  ? "Incidentes operacionais"
                  : activeHealthSection === "webhooks"
                    ? "Webhooks processados"
                    : activeHealthSection === "conversions"
                      ? "Eventos Pixel e CAPI"
                      : activeHealthSection === "integrations"
                        ? "Chamadas externas"
                        : activeHealthSection === "jobs"
                          ? "Jobs operacionais"
                          : "Auditoria operacional"}
              </h2>
              <p>
                {activeHealthSection === "incidents"
                  ? "Falhas e alertas consolidados pelas camadas da plataforma."
                  : activeHealthSection === "webhooks"
                    ? "Entregas recebidas dos provedores e seu processamento."
                    : activeHealthSection === "conversions"
                      ? "Conversoes geradas, enviadas e disponiveis para reprocessamento."
                      : activeHealthSection === "integrations"
                        ? "Comunicacoes da plataforma com servicos externos."
                        : activeHealthSection === "jobs"
                          ? "Execucoes em fila, tentativas e proximos retries."
                          : "Acoes administrativas e acessos registrados pela plataforma."}
              </p>
            </div>
          </div>
          <BackofficeHealthFilters
            activeCount={activeHealthFilterCount}
            section={activeHealthSection}
            values={healthFilterValues}
          />
          {activeHealthSection === "incidents" && diagnosticSummary ? (
            <>
              <div className="operations-summary-banner">
                <span
                  className={`status-chip${
                    diagnosticSummary.status === "healthy" ? "" : " warn"
                  }`}
                >
                  {diagnosticStatusLabel}
                </span>
                <strong>{diagnosticPanelValue}</strong>
                <span>{diagnosticFailureTotal} falhas no periodo</span>
              </div>
              <div className="operations-health-metrics">
                <div>
                  <span>Contas Meta ativas</span>
                  <strong>
                    {diagnosticSummary.totals.metaReportingAccountsActive}
                  </strong>
                  <small>Disponiveis para sincronizacao</small>
                </div>
                <div>
                  <span>Contas Meta com erro</span>
                  <strong>
                    {diagnosticSummary.totals.metaReportingAccountsError}
                  </strong>
                  <small>Exigem revisao da conexao</small>
                </div>
                <div>
                  <span>Campanhas para revisar</span>
                  <strong>
                    {diagnosticSummary.totals.metaWhatsappNeedsReview}
                  </strong>
                  <small>Classificadas como needs_review</small>
                </div>
                <div>
                  <span>Destino CAPI</span>
                  <strong>
                    {diagnosticSummary.totals
                      .metaConversionDestinationConfigured
                      ? "Configurado"
                      : "Nao configurado"}
                  </strong>
                  <small>Destino Meta do workspace</small>
                </div>
              </div>
            </>
          ) : null}
          {activeHealthSection === "audit" ? (
            <div className="table-wrap operations-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Auditoria operacional</th>
                    <th>Ator</th>
                    <th>Alvo</th>
                    <th>Origem</th>
                    <th>Data</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length > 0 ? (
                    auditLogs.map((audit) => (
                      <tr key={audit.id}>
                        <td>
                          <strong>{audit.action}</strong>
                          <span>{audit.reason ?? audit.id}</span>
                        </td>
                        <td>
                          <strong>{audit.actorType}</strong>
                          <span>{audit.actorUserId ?? "sem usuario"}</span>
                        </td>
                        <td>
                          {audit.targetType}
                          {audit.targetId ? ` / ${audit.targetId}` : ""}
                        </td>
                        <td>
                          {audit.sourceIp ?? audit.workspaceId ?? "plataforma"}
                        </td>
                        <td>{formatDateTime(audit.createdAt)}</td>
                        <td>
                          <span
                            className={`event-chip${audit.resultStatus === "failed" ? " warn" : ""}`}
                          >
                            {audit.resultStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <strong>{auditLogEmptyTitle}</strong>
                        <span>
                          Logins, logouts, retries e acoes administrativas
                          aparecem aqui.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {activeHealthSection === "webhooks" ? (
            <div className="table-wrap operations-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Webhooks recebidos</th>
                    <th>Evento externo</th>
                    <th>Lead</th>
                    <th>Atribuicao</th>
                    <th>Recebido</th>
                    <th>Estado</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {webhookLogs.length > 0 ? (
                    webhookLogs.map((webhook) => (
                      <tr key={webhook.id}>
                        <td>
                          <strong>{webhook.source}</strong>
                          <span>{webhook.eventType}</span>
                        </td>
                        <td>{webhook.externalEventId ?? webhook.id}</td>
                        <td>
                          {webhook.leadId ?? webhook.phoneHash ?? "sem lead"}
                        </td>
                        <td>
                          {webhook.campaignId ?? "sem campanha"}
                          {webhook.adId ? ` / ${webhook.adId}` : ""}
                        </td>
                        <td>{formatDateTime(webhook.receivedAt)}</td>
                        <td>
                          <span
                            className={`event-chip${webhook.errorCode ? " warn" : ""}`}
                          >
                            {webhook.errorCode ?? webhook.status}
                          </span>
                        </td>
                        <td>
                          <a
                            className="button ghost"
                            href={`/backoffice/webhooks/${webhook.id}/payload`}
                          >
                            Payload
                          </a>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>
                        <strong>{webhookLogEmptyTitle}</strong>
                        <span>
                          Webhooks Uazapi, Meta e Asaas recebidos aparecem aqui.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {activeHealthSection === "conversions" ? (
            <div className="table-wrap operations-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Eventos Pixel/CAPI</th>
                    <th>Lead</th>
                    <th>Pixel</th>
                    <th>Atribuicao</th>
                    <th>Enviado</th>
                    <th>Estado</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {conversionEventLogs.length > 0 ? (
                    conversionEventLogs.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.eventName}</strong>
                          <span>{event.sourceTrigger}</span>
                        </td>
                        <td>{event.leadId ?? event.phoneHash ?? "sem lead"}</td>
                        <td>{event.pixelId ?? "sem pixel"}</td>
                        <td>
                          {event.campaignId ?? "sem campanha"}
                          {event.adId ? ` / ${event.adId}` : ""}
                        </td>
                        <td>
                          {event.sentAt
                            ? formatDateTime(event.sentAt)
                            : "nao enviado"}
                        </td>
                        <td>
                          <span
                            className={`event-chip${event.errorCode ? " warn" : ""}`}
                          >
                            {event.errorCode ?? event.status}
                          </span>
                        </td>
                        <td>
                          <form action={retryConversionEventLog}>
                            <input
                              type="hidden"
                              name="conversionEventLogId"
                              value={event.id}
                            />
                            <button className="button" type="submit">
                              Reprocessar Pixel
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>
                        <strong>{conversionEventLogEmptyTitle}</strong>
                        <span>
                          Conversoes geradas por regras aparecem aqui.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {activeHealthSection === "integrations" ? (
            <div className="table-wrap operations-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Chamadas externas</th>
                    <th>Provider</th>
                    <th>Atribuicao</th>
                    <th>Duracao</th>
                    <th>Request</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {integrationLogs.length > 0 ? (
                    integrationLogs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <strong>{log.operation}</strong>
                          <span>{log.workspaceId ?? "plataforma"}</span>
                        </td>
                        <td>
                          <strong>{log.source}</strong>
                          <span>{log.httpStatus ?? "sem http"}</span>
                        </td>
                        <td>
                          {log.campaignId ?? log.leadId ?? "sem atribuicao"}
                          {log.adId ? ` / ${log.adId}` : ""}
                        </td>
                        <td>
                          {log.durationMs !== null
                            ? `${log.durationMs}ms`
                            : "em aberto"}
                        </td>
                        <td>
                          {log.providerRequestId ?? log.jobId ?? "sem id"}
                        </td>
                        <td>
                          <span
                            className={`event-chip${log.providerErrorCode ? " warn" : ""}`}
                          >
                            {log.providerErrorCode ?? log.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <strong>{integrationLogEmptyTitle}</strong>
                        <span>
                          Chamadas Meta, Uazapi e Asaas aparecem aqui.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {activeHealthSection === "jobs" ? (
            <div className="table-wrap operations-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jobs operacionais</th>
                    <th>Fila</th>
                    <th>Entidade</th>
                    <th>Tentativa</th>
                    <th>Proxima acao</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {jobAttempts.length > 0 ? (
                    jobAttempts.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <strong>{job.jobName}</strong>
                          <span>{job.jobId}</span>
                        </td>
                        <td>
                          <strong>{job.queueName}</strong>
                          <span>{job.source}</span>
                        </td>
                        <td>
                          {job.relatedEntityType ?? "sem entidade"}
                          {job.relatedEntityId
                            ? ` / ${job.relatedEntityId}`
                            : ""}
                        </td>
                        <td>{job.attemptNumber}</td>
                        <td>
                          {job.nextRetryAt
                            ? formatDateTime(job.nextRetryAt)
                            : "sem retry agendado"}
                        </td>
                        <td>
                          <span
                            className={`event-chip${job.errorCode ? " warn" : ""}`}
                          >
                            {job.errorCode ?? job.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <strong>{jobAttemptEmptyTitle}</strong>
                        <span>
                          Jobs de retry, conversao e sincronizacao aparecem
                          aqui.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {activeHealthSection === "incidents" ? (
            <div className="table-wrap operations-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Camada</th>
                    <th>Workspaces afetados</th>
                    <th>Ultima falha</th>
                    <th>SLA</th>
                    <th>Estado</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosticEvents.length > 0 ? (
                    diagnosticEvents.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.title}</strong>
                          <span>{event.message}</span>
                        </td>
                        <td>{event.workspaceId ?? "plataforma"}</td>
                        <td>{formatDateTime(event.occurredAt)}</td>
                        <td>{event.source}</td>
                        <td>
                          <span
                            className={`event-chip${event.severity === "error" || event.severity === "critical" ? " warn" : ""}`}
                          >
                            {event.status}
                          </span>
                        </td>
                        <td>
                          <a
                            className="button ghost"
                            href={`/backoffice/diagnostics/${event.id}`}
                          >
                            Detalhes
                          </a>
                          <form action={retryDiagnosticEvent}>
                            <input
                              type="hidden"
                              name="eventId"
                              value={event.id}
                            />
                            <button className="button" type="submit">
                              Reprocessar
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <strong>{diagnosticEmptyTitle}</strong>
                        <span>{diagnosticEmptyDescription}</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
