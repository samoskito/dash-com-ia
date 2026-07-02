import { describe, expect, it, vi } from "vitest";
import { DiagnosticsService } from "../src/diagnostics/diagnostics.service";

function createHarness() {
  const events: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const jobAttempts: Array<Record<string, unknown>> = [];
  const integrationLogs: Array<Record<string, unknown>> = [];
  const conversionEventLogs: Array<Record<string, unknown>> = [];
  const webhookLogs: Array<Record<string, unknown>> = [];
  const webhookFindManyCalls: Array<Record<string, unknown>> = [];
  const jobAttemptFindManyCalls: Array<Record<string, unknown>> = [];
  const integrationLogFindManyCalls: Array<Record<string, unknown>> = [];
  const conversionEventLogFindManyCalls: Array<Record<string, unknown>> = [];
  const diagnosticFindManyCalls: Array<Record<string, unknown>> = [];
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
      findUnique: async ({ where }: { where: { id?: string; idempotencyKey?: string } }) =>
        webhookLogs.find(
          (webhookLog) =>
            (where.id !== undefined && webhookLog.id === where.id) ||
            (where.idempotencyKey !== undefined &&
              webhookLog.idempotencyKey === where.idempotencyKey)
        ) ?? null,
      findMany: async ({
        where,
        take
      }: {
        where: Record<string, unknown>;
        take: number;
      }) => {
        webhookFindManyCalls.push({ where, take });

        return webhookLogs.slice(0, take);
      }
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
      findMany: async ({
        where,
        take
      }: {
        where: Record<string, unknown>;
        take: number;
      }) => {
        diagnosticFindManyCalls.push({ where, take });

        return events
          .filter((event) =>
            Object.entries(where).every(([key, value]) => event[key] === value)
          )
          .slice(0, take);
      },
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
        ),
      findManyForList: async ({
        where,
        take
      }: {
        where: Record<string, unknown>;
        take: number;
      }) => {
        jobAttemptFindManyCalls.push({ where, take });

        return jobAttempts.slice(0, take);
      }
    },
    integrationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const integrationLog = {
          id: `integration_${integrationLogs.length + 1}`,
          startedAt: new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        integrationLogs.push(integrationLog);
        return integrationLog;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        integrationLogs.find((integrationLog) => integrationLog.id === where.id) ??
        null,
      findMany: async ({
        where,
        take
      }: {
        where: Record<string, unknown>;
        take: number;
      }) => {
        integrationLogFindManyCalls.push({ where, take });

        return integrationLogs.slice(0, take);
      }
    },
    conversionEventLog: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        conversionEventLogs.find(
          (conversionEventLog) => conversionEventLog.id === where.id
        ) ?? null,
      findMany: async ({
        where,
        take
      }: {
        where: Record<string, unknown>;
        take: number;
      }) => {
        conversionEventLogFindManyCalls.push({ where, take });

        return conversionEventLogs.slice(0, take);
      }
    }
  };

  prisma.jobAttempt.findMany = async (args: {
    where: Record<string, unknown>;
    take?: number;
  }) => {
    if (typeof args.take === "number") {
      return prisma.jobAttempt.findManyForList({
        where: args.where,
        take: args.take
      });
    }

    return jobAttempts.filter((jobAttempt) =>
      Object.entries(args.where).every(([key, value]) => jobAttempt[key] === value)
    );
  };

  return {
    auditLogs,
    conversionEventLogFindManyCalls,
    conversionEventLogs,
    diagnosticFindManyCalls,
    events,
    integrationLogFindManyCalls,
    integrationLogs,
    jobAttemptFindManyCalls,
    jobAttempts,
    webhookFindManyCalls,
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

  it("builds operational filters for diagnostic investigations", async () => {
    const { diagnosticFindManyCalls, service } = createHarness();

    await service.listEvents({
      workspaceId: "workspace_1",
      source: "meta",
      status: "error",
      q: "currency",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      errorCode: "MISSING_CURRENCY",
      limit: 25
    });

    expect(diagnosticFindManyCalls[0]?.where).toEqual({
      workspaceId: "workspace_1",
      source: "meta",
      status: "error",
      occurredAt: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-02T23:59:59.000Z")
      },
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      errorCode: "MISSING_CURRENCY",
      OR: [
        { title: { contains: "currency", mode: "insensitive" } },
        { message: { contains: "currency", mode: "insensitive" } },
        { eventType: { contains: "currency", mode: "insensitive" } },
        { status: { contains: "currency", mode: "insensitive" } },
        { errorCode: { contains: "currency", mode: "insensitive" } }
      ]
    });
    expect(diagnosticFindManyCalls[0]?.take).toBe(25);
  });

  it("lists webhook logs with operational filters", async () => {
    const { service, webhookFindManyCalls } = createHarness();
    await service.recordWebhookLog({
      workspaceId: "workspace_1",
      source: "uazapi",
      eventType: "message.received",
      externalEventId: "evt_1",
      summaryPayload: {
        text: "oi"
      }
    });

    const result = await service.listWebhookLogs({
      workspaceId: "workspace_1",
      source: "uazapi",
      status: "received",
      q: "message",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adId: "ad_1",
      limit: 10
    });

    expect(result[0]).toMatchObject({
      id: "webhook_1",
      workspaceId: "workspace_1",
      source: "uazapi",
      eventType: "message.received",
      externalEventId: "evt_1",
      status: "received",
      processedAt: null
    });
    expect(webhookFindManyCalls[0]?.where).toEqual({
      workspaceId: "workspace_1",
      source: "uazapi",
      status: "received",
      receivedAt: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-02T23:59:59.000Z")
      },
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adId: "ad_1",
      OR: [
        { eventType: { contains: "message", mode: "insensitive" } },
        { status: { contains: "message", mode: "insensitive" } },
        { externalEventId: { contains: "message", mode: "insensitive" } },
        { errorCode: { contains: "message", mode: "insensitive" } },
        { errorMessage: { contains: "message", mode: "insensitive" } }
      ]
    });
    expect(webhookFindManyCalls[0]?.take).toBe(10);
  });

  it("lists job attempts with operational filters", async () => {
    const { jobAttemptFindManyCalls, service } = createHarness();
    await service.recordEvent({
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "pixel_event",
      severity: "error",
      status: "error",
      title: "Meta recusou evento",
      message: "Timeout Meta",
      occurredAt: "2026-07-02T03:00:00.000Z"
    });
    await service.retryEvent("diag_1", {
      reason: "Cliente relatou conversao ausente"
    });

    const result = await service.listJobAttempts({
      workspaceId: "workspace_1",
      source: "meta",
      status: "queued",
      queueName: "diagnostics.retry",
      q: "diagnostic",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      limit: 10
    });

    expect(result[0]).toMatchObject({
      id: "job_attempt_1",
      workspaceId: "workspace_1",
      queueName: "diagnostics.retry",
      jobName: "retry-diagnostic-event",
      attemptNumber: 1,
      status: "queued",
      source: "meta"
    });
    expect(jobAttemptFindManyCalls[0]?.where).toEqual({
      workspaceId: "workspace_1",
      source: "meta",
      status: "queued",
      queueName: "diagnostics.retry",
      createdAt: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-02T23:59:59.000Z")
      },
      OR: [
        { queueName: { contains: "diagnostic", mode: "insensitive" } },
        { jobName: { contains: "diagnostic", mode: "insensitive" } },
        { jobId: { contains: "diagnostic", mode: "insensitive" } },
        { status: { contains: "diagnostic", mode: "insensitive" } },
        { errorCode: { contains: "diagnostic", mode: "insensitive" } },
        { errorMessage: { contains: "diagnostic", mode: "insensitive" } }
      ]
    });
    expect(jobAttemptFindManyCalls[0]?.take).toBe(10);
  });

  it("lists integration logs with operational filters", async () => {
    const { integrationLogFindManyCalls, integrationLogs, service } =
      createHarness();
    integrationLogs.push({
      id: "integration_1",
      workspaceId: "workspace_1",
      source: "meta",
      operation: "meta.campaigns.sync",
      status: "error",
      startedAt: new Date("2026-07-02T03:00:00.000Z"),
      finishedAt: new Date("2026-07-02T03:00:02.000Z"),
      durationMs: 2000,
      httpStatus: 500,
      providerRequestId: "fb_req_1",
      providerErrorCode: "META_RATE_LIMIT",
      providerErrorMessage: "Rate limit",
      leadId: null,
      campaignId: "cmp_1",
      adSetId: null,
      adId: null,
      jobId: "bull_job_1"
    });

    const result = await service.listIntegrationLogs({
      workspaceId: "workspace_1",
      source: "meta",
      status: "error",
      operation: "meta.campaigns.sync",
      q: "rate",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      campaignId: "cmp_1",
      jobId: "bull_job_1",
      providerErrorCode: "META_RATE_LIMIT",
      limit: 10
    });

    expect(result[0]).toMatchObject({
      id: "integration_1",
      workspaceId: "workspace_1",
      source: "meta",
      operation: "meta.campaigns.sync",
      status: "error",
      httpStatus: 500,
      providerRequestId: "fb_req_1",
      providerErrorCode: "META_RATE_LIMIT",
      providerErrorMessage: "Rate limit",
      campaignId: "cmp_1",
      jobId: "bull_job_1"
    });
    expect(integrationLogFindManyCalls[0]?.where).toEqual({
      workspaceId: "workspace_1",
      source: "meta",
      status: "error",
      operation: "meta.campaigns.sync",
      startedAt: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-02T23:59:59.000Z")
      },
      campaignId: "cmp_1",
      jobId: "bull_job_1",
      providerErrorCode: "META_RATE_LIMIT",
      OR: [
        { operation: { contains: "rate", mode: "insensitive" } },
        { status: { contains: "rate", mode: "insensitive" } },
        { providerRequestId: { contains: "rate", mode: "insensitive" } },
        { providerErrorCode: { contains: "rate", mode: "insensitive" } },
        { providerErrorMessage: { contains: "rate", mode: "insensitive" } }
      ]
    });
    expect(integrationLogFindManyCalls[0]?.take).toBe(10);
  });

  it("lists conversion event logs with operational filters", async () => {
    const { conversionEventLogFindManyCalls, conversionEventLogs, service } =
      createHarness();
    conversionEventLogs.push({
      id: "conversion_1",
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      sourceTrigger: "keyword",
      eventName: "QualifiedLead",
      status: "error",
      pixelId: "pixel_1",
      metaAccountId: "act_1",
      campaignId: "cmp_1",
      adSetId: null,
      adId: "ad_1",
      attributionStatus: "matched",
      dedupeKey: "dedupe_1",
      sentAt: null,
      errorCode: "META_CONTEXT_MISSING",
      errorMessage: "Contexto Meta ausente",
      jobId: "bull_job_1",
      createdAt: new Date("2026-07-02T03:00:00.000Z")
    });

    const result = await service.listConversionEventLogs({
      workspaceId: "workspace_1",
      status: "error",
      eventName: "QualifiedLead",
      sourceTrigger: "keyword",
      pixelId: "pixel_1",
      q: "context",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adId: "ad_1",
      errorCode: "META_CONTEXT_MISSING",
      limit: 10
    });

    expect(result[0]).toMatchObject({
      id: "conversion_1",
      workspaceId: "workspace_1",
      leadId: "lead_1",
      eventName: "QualifiedLead",
      status: "error",
      pixelId: "pixel_1",
      errorCode: "META_CONTEXT_MISSING",
      jobId: "bull_job_1"
    });
    expect(conversionEventLogFindManyCalls[0]?.where).toEqual({
      workspaceId: "workspace_1",
      status: "error",
      eventName: "QualifiedLead",
      sourceTrigger: "keyword",
      pixelId: "pixel_1",
      createdAt: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-02T23:59:59.000Z")
      },
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adId: "ad_1",
      errorCode: "META_CONTEXT_MISSING",
      OR: [
        { eventName: { contains: "context", mode: "insensitive" } },
        { status: { contains: "context", mode: "insensitive" } },
        { sourceTrigger: { contains: "context", mode: "insensitive" } },
        { errorCode: { contains: "context", mode: "insensitive" } },
        { errorMessage: { contains: "context", mode: "insensitive" } }
      ]
    });
    expect(conversionEventLogFindManyCalls[0]?.take).toBe(10);
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

  it("adds linked integration and conversion logs to the diagnostic timeline", async () => {
    const { conversionEventLogs, events, integrationLogs, service } =
      createHarness();
    integrationLogs.push({
      id: "integration_1",
      workspaceId: "workspace_1",
      source: "meta",
      operation: "capi.events",
      status: "error",
      httpStatus: 400,
      providerRequestId: "fb_req_1",
      providerErrorCode: "META_CONTEXT_MISSING",
      providerErrorMessage: "Contexto Meta ausente",
      durationMs: 832,
      startedAt: new Date("2026-07-02T03:01:00.000Z"),
      finishedAt: new Date("2026-07-02T03:01:02.000Z"),
      leadId: "lead_1",
      campaignId: "cmp_1",
      adSetId: null,
      adId: "ad_1",
      jobId: "bull_job_1"
    });
    conversionEventLogs.push({
      id: "conversion_1",
      workspaceId: "workspace_1",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      sourceTrigger: "keyword",
      eventName: "QualifiedLead",
      status: "error",
      pixelId: "pixel_1",
      metaAccountId: "act_1",
      campaignId: "cmp_1",
      adSetId: null,
      adId: "ad_1",
      attributionStatus: "matched",
      dedupeKey: "dedupe_1",
      sentAt: null,
      errorCode: "META_CONTEXT_MISSING",
      errorMessage: "Contexto Meta ausente",
      jobId: "bull_job_1",
      createdAt: new Date("2026-07-02T03:00:30.000Z")
    });
    events.push({
      id: "diag_1",
      workspaceId: "workspace_1",
      source: "meta",
      eventType: "conversion.send_failed",
      severity: "error",
      status: "error",
      occurredAt: new Date("2026-07-02T03:00:00.000Z"),
      title: "Falha ao enviar conversao",
      message: "Contexto Meta ausente",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adSetId: null,
      adId: "ad_1",
      jobId: "bull_job_1",
      errorCode: "META_CONTEXT_MISSING",
      summaryPayload: null,
      webhookLogId: null,
      integrationLogId: "integration_1",
      conversionEventLogId: "conversion_1",
      createdAt: new Date("2026-07-02T03:00:00.000Z")
    });

    const detail = await service.getEvent("diag_1");

    expect(detail.timeline.map((item) => item.kind)).toEqual([
      "diagnostic_event",
      "conversion_event_log",
      "integration_log"
    ]);
    expect(detail.timeline[1]).toMatchObject({
      id: "conversion_1",
      label: "Conversao QualifiedLead",
      status: "error",
      summaryPayload: {
        sourceTrigger: "keyword",
        pixelId: "pixel_1",
        campaignId: "cmp_1",
        adId: "ad_1",
        errorCode: "META_CONTEXT_MISSING"
      }
    });
    expect(detail.timeline[2]).toMatchObject({
      id: "integration_1",
      label: "meta capi.events",
      status: "error",
      summaryPayload: {
        httpStatus: 400,
        providerRequestId: "fb_req_1",
        providerErrorCode: "META_CONTEXT_MISSING",
        durationMs: 832,
        campaignId: "cmp_1",
        adId: "ad_1"
      }
    });
  });

  it("returns duplicate webhook result without creating another diagnostic event", async () => {
    const { events, service, webhookLogs } = createHarness();

    const first = await service.recordWebhookLog({
      workspaceId: "workspace_1",
      source: "uazapi",
      eventType: "message.received",
      externalEventId: "evt_1",
      idempotencyKey: "uazapi:evt_1"
    });
    const second = await service.recordWebhookLog({
      workspaceId: "workspace_1",
      source: "uazapi",
      eventType: "message.received",
      externalEventId: "evt_1",
      idempotencyKey: "uazapi:evt_1"
    });

    expect(second).toEqual({
      ...first,
      status: "duplicate"
    });
    expect(webhookLogs).toHaveLength(1);
    expect(events).toHaveLength(1);
  });
});
