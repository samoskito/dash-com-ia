import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  DiagnosticAuditLogDto,
  DiagnosticAuditLogListQueryDto,
  DiagnosticConversionEventLogDto,
  DiagnosticConversionEventLogListQueryDto,
  DiagnosticSourceDto,
  DiagnosticEventCreateDto,
  DiagnosticEventDetailDto,
  DiagnosticEventDto,
  DiagnosticEventListQueryDto,
  DiagnosticIntegrationLogDto,
  DiagnosticIntegrationLogListQueryDto,
  DiagnosticJobAttemptDto,
  DiagnosticJobAttemptListQueryDto,
  DiagnosticWebhookLogDto,
  DiagnosticWebhookLogListQueryDto,
  DiagnosticWebhookPayloadDto,
  DiagnosticTimelineItemDto,
  DiagnosticRetryInputDto,
  DiagnosticRetryResultDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { DiagnosticsQueueService } from "../common/queue/diagnostics-queue.service";

const sensitiveKeyPattern =
  /(authorization|cookie|secret|token|api.?key|refresh|password)/i;

type DiagnosticEventRecord = {
  id: string;
  workspaceId: string | null;
  source: DiagnosticEventDto["source"];
  eventType: string;
  severity: DiagnosticEventDto["severity"];
  status: string;
  occurredAt: Date;
  title: string;
  message: string;
  leadId: string | null;
  phoneHash: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  jobId: string | null;
  errorCode: string | null;
  summaryPayload?: unknown;
  webhookLogId?: string | null;
  integrationLogId?: string | null;
  conversionEventLogId?: string | null;
  jobAttemptId?: string | null;
};

type WebhookLogRecord = {
  id: string;
  workspaceId: string | null;
  source: DiagnosticSourceDto;
  eventType: string;
  externalEventId: string | null;
  status: string;
  receivedAt: Date;
  processedAt: Date | null;
  leadId: string | null;
  phoneHash: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  jobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  summaryPayload?: unknown;
};

type AuditLogRecord = {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  actorType: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  sourceIp: string | null;
  resultStatus: string;
  createdAt: Date;
  beforeSummary?: unknown;
  afterSummary?: unknown;
};

type JobAttemptRecord = {
  id: string;
  workspaceId: string | null;
  queueName: string;
  jobId: string;
  jobName: string;
  attemptNumber: number;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  nextRetryAt: Date | null;
  source: DiagnosticSourceDto;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  summaryPayload?: unknown;
};

type IntegrationLogRecord = {
  id: string;
  workspaceId: string | null;
  source: DiagnosticSourceDto;
  operation: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  httpStatus: number | null;
  providerRequestId: string | null;
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
  leadId: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  jobId: string | null;
};

type ConversionEventLogRecord = {
  id: string;
  workspaceId: string | null;
  leadId: string | null;
  phoneHash: string | null;
  sourceTrigger: string;
  eventName: string;
  status: string;
  pixelId: string | null;
  metaAccountId: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  attributionStatus: string | null;
  dedupeKey: string | null;
  sentAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  jobId: string | null;
  createdAt: Date;
};

export type WebhookLogInput = {
  workspaceId?: string;
  source: DiagnosticSourceDto;
  eventType: string;
  externalEventId?: string;
  idempotencyKey?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  summaryPayload?: Record<string, unknown>;
};

export type WebhookLogResult = {
  webhookLogId: string;
  diagnosticEventId: string;
  status: "received" | "duplicate";
};

type DiagnosticActorContext = {
  actorUserId: string | null;
  sourceIp?: string | null;
};

@Injectable()
export class DiagnosticsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(DiagnosticsQueueService)
    private readonly diagnosticsQueueService?: DiagnosticsQueueService
  ) {}

  async recordEvent(
    input: DiagnosticEventCreateDto
  ): Promise<DiagnosticEventDetailDto> {
    const event = (await this.prisma.diagnosticEvent.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        source: input.source,
        eventType: input.eventType,
        severity: input.severity,
        status: input.status,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        title: input.title,
        message: input.message,
        leadId: input.leadId ?? null,
        phoneHash: input.phoneHash ?? null,
        campaignId: input.campaignId ?? null,
        adSetId: input.adSetId ?? null,
        adId: input.adId ?? null,
        jobId: input.jobId ?? null,
        errorCode: input.errorCode ?? null,
        summaryPayload: input.summaryPayload
          ? (this.redactSensitive(
              input.summaryPayload
            ) as Prisma.InputJsonValue)
          : undefined
      }
    })) as DiagnosticEventRecord;

    return this.toDetailDto(event, [this.eventTimelineItem(event)]);
  }

  async recordWebhookLog(input: WebhookLogInput): Promise<WebhookLogResult> {
    if (input.idempotencyKey) {
      const existing = (await this.prisma.webhookLog.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      })) as WebhookLogRecord | null;

      if (existing) {
        const existingEvents = (await this.prisma.diagnosticEvent.findMany({
          where: { webhookLogId: existing.id },
          orderBy: { occurredAt: "asc" },
          take: 1
        })) as DiagnosticEventRecord[];

        return {
          webhookLogId: existing.id,
          diagnosticEventId: existingEvents[0]?.id ?? existing.id,
          status: "duplicate"
        };
      }
    }

    const webhook = await this.prisma.webhookLog.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        source: input.source,
        eventType: input.eventType,
        externalEventId: input.externalEventId ?? null,
        campaignId: input.campaignId ?? null,
        adSetId: input.adSetId ?? null,
        adId: input.adId ?? null,
        status: "received",
        idempotencyKey: input.idempotencyKey ?? null,
        summaryPayload: input.summaryPayload
          ? (this.redactSensitive(
              input.summaryPayload
            ) as Prisma.InputJsonValue)
          : undefined
      }
    });
    const event = await this.prisma.diagnosticEvent.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        source: input.source,
        eventType: input.eventType,
        severity: "info",
        status: "received",
        title: `Webhook ${input.source} recebido`,
        message: `Evento ${input.eventType} recebido para processamento`,
        campaignId: input.campaignId ?? null,
        adSetId: input.adSetId ?? null,
        adId: input.adId ?? null,
        webhookLogId: webhook.id,
        summaryPayload: input.summaryPayload
          ? (this.redactSensitive(
              input.summaryPayload
            ) as Prisma.InputJsonValue)
          : undefined
      }
    });

    return {
      webhookLogId: webhook.id,
      diagnosticEventId: event.id,
      status: "received"
    };
  }

  async listEvents(
    query: DiagnosticEventListQueryDto
  ): Promise<DiagnosticEventDto[]> {
    const where: Prisma.DiagnosticEventWhereInput = {};

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.eventType) {
      where.eventType = query.eventType;
    }

    if (query.since || query.until) {
      where.occurredAt = {
        ...(query.since ? { gte: new Date(query.since) } : {}),
        ...(query.until ? { lte: new Date(query.until) } : {})
      };
    }

    if (query.leadId) {
      where.leadId = query.leadId;
    }

    if (query.phoneHash) {
      where.phoneHash = query.phoneHash;
    }

    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }

    if (query.adSetId) {
      where.adSetId = query.adSetId;
    }

    if (query.adId) {
      where.adId = query.adId;
    }

    if (query.errorCode) {
      where.errorCode = query.errorCode;
    }

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { message: { contains: query.q, mode: "insensitive" } },
        { eventType: { contains: query.q, mode: "insensitive" } },
        { status: { contains: query.q, mode: "insensitive" } },
        { errorCode: { contains: query.q, mode: "insensitive" } }
      ];
    }

    const events = (await this.prisma.diagnosticEvent.findMany({
      where,
      orderBy: {
        occurredAt: "desc"
      },
      take: query.limit
    })) as DiagnosticEventRecord[];

    return events.map((event) => this.toDto(event));
  }

  async listWebhookLogs(
    query: DiagnosticWebhookLogListQueryDto
  ): Promise<DiagnosticWebhookLogDto[]> {
    const where: Prisma.WebhookLogWhereInput = {};

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.eventType) {
      where.eventType = query.eventType;
    }

    if (query.since || query.until) {
      where.receivedAt = {
        ...(query.since ? { gte: new Date(query.since) } : {}),
        ...(query.until ? { lte: new Date(query.until) } : {})
      };
    }

    if (query.leadId) {
      where.leadId = query.leadId;
    }

    if (query.phoneHash) {
      where.phoneHash = query.phoneHash;
    }

    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }

    if (query.adSetId) {
      where.adSetId = query.adSetId;
    }

    if (query.adId) {
      where.adId = query.adId;
    }

    if (query.errorCode) {
      where.errorCode = query.errorCode;
    }

    if (query.q) {
      where.OR = [
        { eventType: { contains: query.q, mode: "insensitive" } },
        { status: { contains: query.q, mode: "insensitive" } },
        { externalEventId: { contains: query.q, mode: "insensitive" } },
        { errorCode: { contains: query.q, mode: "insensitive" } },
        { errorMessage: { contains: query.q, mode: "insensitive" } }
      ];
    }

    const webhooks = (await this.prisma.webhookLog.findMany({
      where,
      orderBy: {
        receivedAt: "desc"
      },
      take: query.limit
    })) as WebhookLogRecord[];

    return webhooks.map((webhook) => this.toWebhookLogDto(webhook));
  }

  async getWebhookPayload(
    id: string,
    actor: DiagnosticActorContext
  ): Promise<DiagnosticWebhookPayloadDto> {
    const webhook = (await this.prisma.webhookLog.findUnique({
      where: { id }
    })) as WebhookLogRecord | null;

    if (!webhook) {
      throw new NotFoundException("Webhook nao encontrado");
    }

    const payload = this.toWebhookPayloadDto(webhook);

    await this.prisma.auditLog.create({
      data: {
        workspaceId: webhook.workspaceId,
        actorUserId: actor.actorUserId,
        actorType: "platform_operator",
        action: "diagnostic.webhook_payload_viewed",
        targetType: "WebhookLog",
        targetId: webhook.id,
        sourceIp: actor.sourceIp ?? null,
        resultStatus: "success",
        beforeSummary: undefined,
        afterSummary: this.redactSensitive({
          source: webhook.source,
          eventType: webhook.eventType,
          externalEventId: webhook.externalEventId,
          payloadKind: payload.payloadKind,
          payloadAvailable: payload.payloadAvailable
        }) as Prisma.InputJsonValue
      }
    });

    return payload;
  }

  async listJobAttempts(
    query: DiagnosticJobAttemptListQueryDto
  ): Promise<DiagnosticJobAttemptDto[]> {
    const where: Prisma.JobAttemptWhereInput = {};

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.queueName) {
      where.queueName = query.queueName;
    }

    if (query.jobName) {
      where.jobName = query.jobName;
    }

    if (query.since || query.until) {
      where.createdAt = {
        ...(query.since ? { gte: new Date(query.since) } : {}),
        ...(query.until ? { lte: new Date(query.until) } : {})
      };
    }

    if (query.q) {
      where.OR = [
        { queueName: { contains: query.q, mode: "insensitive" } },
        { jobName: { contains: query.q, mode: "insensitive" } },
        { jobId: { contains: query.q, mode: "insensitive" } },
        { status: { contains: query.q, mode: "insensitive" } },
        { errorCode: { contains: query.q, mode: "insensitive" } },
        { errorMessage: { contains: query.q, mode: "insensitive" } }
      ];
    }

    const attempts = (await this.prisma.jobAttempt.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      take: query.limit
    })) as JobAttemptRecord[];

    return attempts.map((attempt) => this.toJobAttemptDto(attempt));
  }

  async listIntegrationLogs(
    query: DiagnosticIntegrationLogListQueryDto
  ): Promise<DiagnosticIntegrationLogDto[]> {
    const where: Prisma.IntegrationLogWhereInput = {};

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.operation) {
      where.operation = query.operation;
    }

    if (query.since || query.until) {
      where.startedAt = {
        ...(query.since ? { gte: new Date(query.since) } : {}),
        ...(query.until ? { lte: new Date(query.until) } : {})
      };
    }

    if (query.leadId) {
      where.leadId = query.leadId;
    }

    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }

    if (query.adSetId) {
      where.adSetId = query.adSetId;
    }

    if (query.adId) {
      where.adId = query.adId;
    }

    if (query.jobId) {
      where.jobId = query.jobId;
    }

    if (query.providerErrorCode) {
      where.providerErrorCode = query.providerErrorCode;
    }

    if (query.q) {
      where.OR = [
        { operation: { contains: query.q, mode: "insensitive" } },
        { status: { contains: query.q, mode: "insensitive" } },
        { providerRequestId: { contains: query.q, mode: "insensitive" } },
        { providerErrorCode: { contains: query.q, mode: "insensitive" } },
        { providerErrorMessage: { contains: query.q, mode: "insensitive" } }
      ];
    }

    const logs = (await this.prisma.integrationLog.findMany({
      where,
      orderBy: {
        startedAt: "desc"
      },
      take: query.limit
    })) as IntegrationLogRecord[];

    return logs.map((log) => this.toIntegrationLogDto(log));
  }

  async listConversionEventLogs(
    query: DiagnosticConversionEventLogListQueryDto
  ): Promise<DiagnosticConversionEventLogDto[]> {
    const where: Prisma.ConversionEventLogWhereInput = {};

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.eventName) {
      where.eventName = query.eventName;
    }

    if (query.sourceTrigger) {
      where.sourceTrigger = query.sourceTrigger;
    }

    if (query.pixelId) {
      where.pixelId = query.pixelId;
    }

    if (query.since || query.until) {
      where.createdAt = {
        ...(query.since ? { gte: new Date(query.since) } : {}),
        ...(query.until ? { lte: new Date(query.until) } : {})
      };
    }

    if (query.leadId) {
      where.leadId = query.leadId;
    }

    if (query.phoneHash) {
      where.phoneHash = query.phoneHash;
    }

    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }

    if (query.adSetId) {
      where.adSetId = query.adSetId;
    }

    if (query.adId) {
      where.adId = query.adId;
    }

    if (query.errorCode) {
      where.errorCode = query.errorCode;
    }

    if (query.q) {
      where.OR = [
        { eventName: { contains: query.q, mode: "insensitive" } },
        { status: { contains: query.q, mode: "insensitive" } },
        { sourceTrigger: { contains: query.q, mode: "insensitive" } },
        { errorCode: { contains: query.q, mode: "insensitive" } },
        { errorMessage: { contains: query.q, mode: "insensitive" } }
      ];
    }

    const logs = (await this.prisma.conversionEventLog.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      take: query.limit
    })) as ConversionEventLogRecord[];

    return logs.map((log) => this.toConversionEventLogDto(log));
  }

  async listAuditLogs(
    query: DiagnosticAuditLogListQueryDto
  ): Promise<DiagnosticAuditLogDto[]> {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }

    if (query.actorUserId) {
      where.actorUserId = query.actorUserId;
    }

    if (query.actorType) {
      where.actorType = query.actorType;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.targetType) {
      where.targetType = query.targetType;
    }

    if (query.targetId) {
      where.targetId = query.targetId;
    }

    if (query.resultStatus) {
      where.resultStatus = query.resultStatus;
    }

    if (query.since || query.until) {
      where.createdAt = {
        ...(query.since ? { gte: new Date(query.since) } : {}),
        ...(query.until ? { lte: new Date(query.until) } : {})
      };
    }

    if (query.q) {
      where.OR = [
        { action: { contains: query.q, mode: "insensitive" } },
        { actorType: { contains: query.q, mode: "insensitive" } },
        { targetType: { contains: query.q, mode: "insensitive" } },
        { targetId: { contains: query.q, mode: "insensitive" } },
        { resultStatus: { contains: query.q, mode: "insensitive" } },
        { reason: { contains: query.q, mode: "insensitive" } }
      ];
    }

    const logs = (await this.prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      take: query.limit
    })) as AuditLogRecord[];

    return logs.map((log) => this.toAuditLogDto(log));
  }

  async getEvent(id: string): Promise<DiagnosticEventDetailDto> {
    const event = (await this.prisma.diagnosticEvent.findUnique({
      where: { id }
    })) as DiagnosticEventRecord | null;

    if (!event) {
      throw new NotFoundException("Evento diagnostico nao encontrado");
    }

    return this.toDetailDto(event, await this.buildTimeline(event));
  }

  async retryEvent(
    id: string,
    input: DiagnosticRetryInputDto
  ): Promise<DiagnosticRetryResultDto> {
    const event = (await this.prisma.diagnosticEvent.findUnique({
      where: { id }
    })) as DiagnosticEventRecord | null;

    if (!event) {
      throw new NotFoundException("Evento diagnostico nao encontrado");
    }

    const auditLog = await this.prisma.auditLog.create({
      data: {
        workspaceId: event.workspaceId,
        actorType: "platform",
        action: "diagnostic.retry_requested",
        targetType: "DiagnosticEvent",
        targetId: event.id,
        reason: input.reason,
        resultStatus: "queued",
        beforeSummary: this.redactSensitive({
          status: event.status,
          source: event.source,
          eventType: event.eventType,
          jobId: event.jobId,
          errorCode: event.errorCode
        }) as Prisma.InputJsonValue,
        afterSummary: {
          retryStatus: "queued"
        }
      }
    });

    const jobAttempt = await this.prisma.jobAttempt.create({
      data: {
        workspaceId: event.workspaceId,
        queueName: "diagnostics.retry",
        jobId: `diagnostic-retry-${event.id}-${Date.now()}`,
        jobName: "retry-diagnostic-event",
        attemptNumber: 1,
        status: "queued",
        scheduledAt: new Date(),
        source: event.source,
        relatedEntityType: "DiagnosticEvent",
        relatedEntityId: event.id,
        errorCode: event.errorCode,
        summaryPayload: this.redactSensitive({
          diagnosticEventId: event.id,
          originalEventType: event.eventType,
          originalStatus: event.status,
          originalJobId: event.jobId,
          retryReason: input.reason
        }) as Prisma.InputJsonValue
      }
    });

    await this.diagnosticsQueueService?.enqueueRetry({
      diagnosticEventId: event.id,
      workspaceId: event.workspaceId ?? "platform",
      source: event.source,
      message: event.message,
      occurredAt: event.occurredAt.toISOString(),
      conversionEventLogId: event.conversionEventLogId ?? undefined,
      retryReason: input.reason
    });

    return {
      ok: true,
      status: "queued",
      diagnosticEventId: event.id,
      auditLogId: auditLog.id,
      jobAttemptId: jobAttempt.id
    };
  }

  private toDto(event: DiagnosticEventRecord): DiagnosticEventDto {
    return {
      id: event.id,
      workspaceId: event.workspaceId,
      source: event.source,
      eventType: event.eventType,
      severity: event.severity,
      status: event.status,
      occurredAt: event.occurredAt.toISOString(),
      title: event.title,
      message: event.message,
      leadId: event.leadId,
      phoneHash: event.phoneHash,
      campaignId: event.campaignId,
      adSetId: event.adSetId,
      adId: event.adId,
      jobId: event.jobId,
      errorCode: event.errorCode
    };
  }

  private toWebhookLogDto(webhook: WebhookLogRecord): DiagnosticWebhookLogDto {
    return {
      id: webhook.id,
      workspaceId: webhook.workspaceId,
      source: webhook.source,
      eventType: webhook.eventType,
      externalEventId: webhook.externalEventId,
      status: webhook.status,
      receivedAt: webhook.receivedAt.toISOString(),
      processedAt: webhook.processedAt?.toISOString() ?? null,
      leadId: webhook.leadId,
      phoneHash: webhook.phoneHash,
      campaignId: webhook.campaignId,
      adSetId: webhook.adSetId,
      adId: webhook.adId,
      jobId: webhook.jobId,
      errorCode: webhook.errorCode,
      errorMessage: webhook.errorMessage
    };
  }

  private toWebhookPayloadDto(
    webhook: WebhookLogRecord
  ): DiagnosticWebhookPayloadDto {
    const payload = this.payloadRecord(webhook.summaryPayload);

    return {
      id: webhook.id,
      workspaceId: webhook.workspaceId,
      source: webhook.source,
      eventType: webhook.eventType,
      externalEventId: webhook.externalEventId,
      status: webhook.status,
      receivedAt: webhook.receivedAt.toISOString(),
      payloadKind: "summary",
      payloadAvailable: payload !== null,
      payload
    };
  }

  private toJobAttemptDto(attempt: JobAttemptRecord): DiagnosticJobAttemptDto {
    return {
      id: attempt.id,
      workspaceId: attempt.workspaceId,
      queueName: attempt.queueName,
      jobId: attempt.jobId,
      jobName: attempt.jobName,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      scheduledAt: attempt.scheduledAt?.toISOString() ?? null,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      finishedAt: attempt.finishedAt?.toISOString() ?? null,
      nextRetryAt: attempt.nextRetryAt?.toISOString() ?? null,
      source: attempt.source,
      relatedEntityType: attempt.relatedEntityType,
      relatedEntityId: attempt.relatedEntityId,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
      createdAt: attempt.createdAt.toISOString()
    };
  }

  private toIntegrationLogDto(
    log: IntegrationLogRecord
  ): DiagnosticIntegrationLogDto {
    return {
      id: log.id,
      workspaceId: log.workspaceId,
      source: log.source,
      operation: log.operation,
      status: log.status,
      startedAt: log.startedAt.toISOString(),
      finishedAt: log.finishedAt?.toISOString() ?? null,
      durationMs: log.durationMs,
      httpStatus: log.httpStatus,
      providerRequestId: log.providerRequestId,
      providerErrorCode: log.providerErrorCode,
      providerErrorMessage: log.providerErrorMessage,
      leadId: log.leadId,
      campaignId: log.campaignId,
      adSetId: log.adSetId,
      adId: log.adId,
      jobId: log.jobId
    };
  }

  private toConversionEventLogDto(
    log: ConversionEventLogRecord
  ): DiagnosticConversionEventLogDto {
    return {
      id: log.id,
      workspaceId: log.workspaceId,
      leadId: log.leadId,
      phoneHash: log.phoneHash,
      sourceTrigger: log.sourceTrigger,
      eventName: log.eventName,
      status: log.status,
      pixelId: log.pixelId,
      metaAccountId: log.metaAccountId,
      campaignId: log.campaignId,
      adSetId: log.adSetId,
      adId: log.adId,
      attributionStatus: log.attributionStatus,
      dedupeKey: log.dedupeKey,
      sentAt: log.sentAt?.toISOString() ?? null,
      errorCode: log.errorCode,
      errorMessage: log.errorMessage,
      jobId: log.jobId,
      createdAt: log.createdAt.toISOString()
    };
  }

  private toAuditLogDto(log: AuditLogRecord): DiagnosticAuditLogDto {
    return {
      id: log.id,
      workspaceId: log.workspaceId,
      actorUserId: log.actorUserId,
      actorType: log.actorType,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      reason: log.reason,
      sourceIp: log.sourceIp,
      resultStatus: log.resultStatus,
      createdAt: log.createdAt.toISOString(),
      beforeSummary: this.payloadRecord(log.beforeSummary),
      afterSummary: this.payloadRecord(log.afterSummary)
    };
  }

  private toDetailDto(
    event: DiagnosticEventRecord,
    timeline: DiagnosticTimelineItemDto[]
  ): DiagnosticEventDetailDto {
    return {
      ...this.toDto(event),
      summaryPayload:
        event.summaryPayload &&
        typeof event.summaryPayload === "object" &&
        !Array.isArray(event.summaryPayload)
          ? (event.summaryPayload as Record<string, unknown>)
          : null,
      timeline
    };
  }

  private async buildTimeline(
    event: DiagnosticEventRecord
  ): Promise<DiagnosticTimelineItemDto[]> {
    const items: DiagnosticTimelineItemDto[] = [this.eventTimelineItem(event)];

    if (event.webhookLogId) {
      const webhook = (await this.prisma.webhookLog.findUnique({
        where: { id: event.webhookLogId }
      })) as WebhookLogRecord | null;

      if (webhook) {
        items.push({
          id: webhook.id,
          kind: "webhook_log",
          label: `Webhook ${webhook.source} recebido`,
          status: webhook.status,
          occurredAt: webhook.receivedAt.toISOString(),
          summaryPayload: this.payloadRecord(webhook.summaryPayload)
        });
      }
    }

    if (event.conversionEventLogId) {
      const conversionEvent = (await this.prisma.conversionEventLog.findUnique({
        where: { id: event.conversionEventLogId }
      })) as ConversionEventLogRecord | null;

      if (conversionEvent) {
        items.push({
          id: conversionEvent.id,
          kind: "conversion_event_log",
          label: `Conversao ${conversionEvent.eventName}`,
          status: conversionEvent.status,
          occurredAt: (
            conversionEvent.sentAt ?? conversionEvent.createdAt
          ).toISOString(),
          summaryPayload: this.payloadRecord({
            sourceTrigger: conversionEvent.sourceTrigger,
            pixelId: conversionEvent.pixelId,
            metaAccountId: conversionEvent.metaAccountId,
            campaignId: conversionEvent.campaignId,
            adSetId: conversionEvent.adSetId,
            adId: conversionEvent.adId,
            attributionStatus: conversionEvent.attributionStatus,
            dedupeKey: conversionEvent.dedupeKey,
            errorCode: conversionEvent.errorCode,
            errorMessage: conversionEvent.errorMessage,
            jobId: conversionEvent.jobId
          })
        });
      }
    }

    if (event.integrationLogId) {
      const integration = (await this.prisma.integrationLog.findUnique({
        where: { id: event.integrationLogId }
      })) as IntegrationLogRecord | null;

      if (integration) {
        items.push({
          id: integration.id,
          kind: "integration_log",
          label: `${integration.source} ${integration.operation}`,
          status: integration.status,
          occurredAt: (
            integration.finishedAt ?? integration.startedAt
          ).toISOString(),
          summaryPayload: this.payloadRecord({
            httpStatus: integration.httpStatus,
            providerRequestId: integration.providerRequestId,
            providerErrorCode: integration.providerErrorCode,
            providerErrorMessage: integration.providerErrorMessage,
            durationMs: integration.durationMs,
            campaignId: integration.campaignId,
            adSetId: integration.adSetId,
            adId: integration.adId,
            jobId: integration.jobId
          })
        });
      }
    }

    const jobAttemptWhereInputs: Prisma.JobAttemptWhereInput[] = [
      {
        relatedEntityType: "DiagnosticEvent",
        relatedEntityId: event.id
      }
    ];

    if (event.conversionEventLogId) {
      jobAttemptWhereInputs.push({
        relatedEntityType: "ConversionEventLog",
        relatedEntityId: event.conversionEventLogId
      });
    }

    const [auditLogs, jobAttemptGroups] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          targetType: "DiagnosticEvent",
          targetId: event.id
        },
        orderBy: {
          createdAt: "asc"
        },
        take: 20
      }) as Promise<AuditLogRecord[]>,
      Promise.all(
        jobAttemptWhereInputs.map(
          (where) =>
            this.prisma.jobAttempt.findMany({
              where,
              orderBy: {
                createdAt: "asc"
              },
              take: 20
            }) as Promise<JobAttemptRecord[]>
        )
      )
    ]);
    const jobAttempts = Array.from(
      new Map(
        jobAttemptGroups.flat().map((jobAttempt) => [jobAttempt.id, jobAttempt])
      ).values()
    );

    for (const auditLog of auditLogs) {
      items.push({
        id: auditLog.id,
        kind: "audit_log",
        label: auditLog.action,
        status: auditLog.resultStatus,
        occurredAt: auditLog.createdAt.toISOString(),
        summaryPayload: this.payloadRecord({
          before: auditLog.beforeSummary,
          after: auditLog.afterSummary
        })
      });
    }

    for (const jobAttempt of jobAttempts) {
      items.push({
        id: jobAttempt.id,
        kind: "job_attempt",
        label: jobAttempt.jobName,
        status: jobAttempt.status,
        occurredAt: (
          jobAttempt.finishedAt ??
          jobAttempt.startedAt ??
          jobAttempt.scheduledAt ??
          jobAttempt.createdAt
        ).toISOString(),
        summaryPayload: this.payloadRecord(jobAttempt.summaryPayload)
      });
    }

    return items.sort(
      (left, right) =>
        new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
    );
  }

  private eventTimelineItem(
    event: DiagnosticEventRecord
  ): DiagnosticTimelineItemDto {
    return {
      id: event.id,
      kind: "diagnostic_event",
      label: event.title,
      status: event.status,
      occurredAt: event.occurredAt.toISOString(),
      summaryPayload: this.payloadRecord(event.summaryPayload)
    };
  }

  private payloadRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private redactSensitive(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitive(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, innerValue]) => [
          key,
          sensitiveKeyPattern.test(key)
            ? "[redacted]"
            : this.redactSensitive(innerValue)
        ])
      );
    }

    return value;
  }
}
