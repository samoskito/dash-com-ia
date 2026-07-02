import { describe, expect, it, vi } from "vitest";
import { DiagnosticsService } from "../src/diagnostics/diagnostics.service";

function createHarness() {
  const events: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const jobAttempts: Array<Record<string, unknown>> = [];
  const webhookLogs: Array<Record<string, unknown>> = [];
  const diagnosticsQueueService = {
    enqueueRetry: vi.fn(async (payload: Record<string, unknown>) => ({
      diagnosticEventId: payload.diagnosticEventId,
      jobId: "bull_job_1",
      status: "queued"
    }))
  };
  const prisma = {
    webhookLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const webhookLog = {
          id: `webhook_${webhookLogs.length + 1}`,
          receivedAt: new Date("2026-07-02T02:59:00.000Z"),
          ...data
        };
        webhookLogs.push(webhookLog);
        return webhookLog;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        webhookLogs.find((webhookLog) => webhookLog.id === where.id) ?? null
    },
    diagnosticEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const event = {
          id: `diag_${events.length + 1}`,
          occurredAt: data.occurredAt ?? new Date("2026-07-02T03:00:00.000Z"),
          createdAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        events.push(event);
        return event;
      },
      findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        events
          .filter((event) =>
            Object.entries(where).every(([key, value]) => event[key] === value)
          )
          .slice(0, take),
      findUnique: async ({ where }: { where: { id: string } }) =>
        events.find((event) => event.id === where.id) ?? null
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const auditLog = {
          id: `audit_${auditLogs.length + 1}`,
          createdAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        auditLogs.push(auditLog);
        return auditLog;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        auditLogs.filter((auditLog) =>
          Object.entries(where).every(([key, value]) => auditLog[key] === value)
        )
    },
    jobAttempt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const jobAttempt = {
          id: `job_attempt_${jobAttempts.length + 1}`,
          createdAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        jobAttempts.push(jobAttempt);
        return jobAttempt;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        jobAttempts.filter((jobAttempt) =>
          Object.entries(where).every(([key, value]) => jobAttempt[key] === value)
        )
    }
  };

  return {
    auditLogs,
    events,
    jobAttempts,
    webhookLogs,
    service: new DiagnosticsService(prisma as never),
    serviceWithQueue: new DiagnosticsService(
      prisma as never,
      diagnosticsQueueService as never
    ),
    diagnosticsQueueService
  };
}

describe("diagnostics service", () => {
  it("records diagnostic events with sensitive payload fields redacted", async () => {
    const { events, service } = createHarness();

    const event = await service.recordEvent({
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      severity: "error",
      status: "error",
      title: "Meta recusou evento",
      message: "Parametro currency ausente",
      errorCode: "MISSING_CURRENCY",
      summaryPayload: {
        authorization: "Bearer secret",
        nested: {
          refreshToken: "secret-refresh",
          currency: null
        }
      }
    });

    expect(event.errorCode).toBe("MISSING_CURRENCY");
    expect(events[0]?.summaryPayload).toEqual({
      authorization: "[redacted]",
      nested: {
        refreshToken: "[redacted]",
        currency: null
      }
    });
  });

  it("queues an audited retry without calling external providers", async () => {
    const { auditLogs, events, jobAttempts, service } = createHarness();
    await service.recordEvent({
      workspaceId: "workspace_1",
      source: "uazapi",
      eventType: "conversion_trigger",
      severity: "warning",
      status: "error",
      title: "Conversao nao enviada",
      message: "Regra por etiqueta falhou",
      leadId: "lead_1",
      jobId: "job_original",
      summaryPayload: {
        label: "Venda fechada"
      }
    });

    const retry = await service.retryEvent("diag_1", {
      reason: "Cliente relatou conversao ausente"
    });

    expect(retry).toEqual({
      ok: true,
      status: "queued",
      diagnosticEventId: "diag_1",
      auditLogId: "audit_1",
      jobAttemptId: "job_attempt_1"
    });
    expect(auditLogs[0]).toMatchObject({
      workspaceId: "workspace_1",
      actorType: "platform",
      action: "diagnostic.retry_requested",
      targetType: "DiagnosticEvent",
      targetId: "diag_1",
      reason: "Cliente relatou conversao ausente",
      resultStatus: "queued"
    });
    expect(jobAttempts[0]).toMatchObject({
      workspaceId: "workspace_1",
      queueName: "diagnostics.retry",
      jobName: "retry-diagnostic-event",
      attemptNumber: 1,
      status: "queued",
      source: "uazapi",
      relatedEntityType: "DiagnosticEvent",
      relatedEntityId: "diag_1"
    });
    expect(jobAttempts[0]?.summaryPayload).toMatchObject({
      diagnosticEventId: "diag_1",
      originalEventType: "conversion_trigger",
      originalStatus: "error"
    });
    expect(events).toHaveLength(1);
  });

  it("enqueues diagnostic retry jobs with conversion event context when available", async () => {
    const { diagnosticsQueueService, events, serviceWithQueue } = createHarness();
    await serviceWithQueue.recordEvent({
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      severity: "error",
      status: "error",
      title: "Meta recusou evento",
      message: "Parametro currency ausente",
      occurredAt: "2026-07-02T03:00:00.000Z"
    });
    events[0] = {
      ...events[0],
      conversionEventLogId: "conversion_1"
    };

    await serviceWithQueue.retryEvent("diag_1", {
      reason: "Cliente relatou conversao ausente"
    });

    expect(diagnosticsQueueService.enqueueRetry).toHaveBeenCalledWith({
      diagnosticEventId: "diag_1",
      workspaceId: "workspace_1",
      source: "meta",
      message: "Parametro currency ausente",
      occurredAt: "2026-07-02T03:00:00.000Z",
      conversionEventLogId: "conversion_1",
      retryReason: "Cliente relatou conversao ausente"
    });
  });

  it("lists events using normalized filters", async () => {
    const { service } = createHarness();
    await service.recordEvent({
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      severity: "error",
      status: "error",
      title: "Erro Meta",
      message: "Falha"
    });
    await service.recordEvent({
      workspaceId: "workspace_2",
      source: "asaas",
      eventType: "payment",
      severity: "info",
      status: "success",
      title: "Pagamento aprovado",
      message: "OK"
    });

    const events = await service.listEvents({
      workspaceId: "workspace_1",
      source: "meta",
      limit: 10
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe("meta");
  });

  it("returns an operational timeline for webhook, event, retry audit and job attempts", async () => {
    const { service } = createHarness();

    const webhook = await service.recordWebhookLog({
      workspaceId: "workspace_1",
      source: "uazapi",
      eventType: "message.label_added",
      externalEventId: "uazapi_event_1",
      summaryPayload: {
        label: "Venda fechada"
      }
    });

    await service.retryEvent(webhook.diagnosticEventId, {
      reason: "Cliente relatou conversao ausente"
    });

    const detail = await service.getEvent(webhook.diagnosticEventId);

    expect(detail.timeline.map((item) => item.kind)).toEqual([
      "webhook_log",
      "diagnostic_event",
      "audit_log",
      "job_attempt"
    ]);
    expect(detail.timeline[0]).toMatchObject({
      id: webhook.webhookLogId,
      label: "Webhook uazapi recebido",
      status: "received"
    });
    expect(detail.timeline[2]).toMatchObject({
      label: "diagnostic.retry_requested",
      status: "queued"
    });
  });
});
