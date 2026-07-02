import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  DiagnosticSourceDto,
  DiagnosticEventCreateDto,
  DiagnosticEventDetailDto,
  DiagnosticEventDto,
  DiagnosticEventListQueryDto,
  DiagnosticWebhookLogDto,
  DiagnosticWebhookLogListQueryDto,
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
  action: string;
  resultStatus: string;
  createdAt: Date;
  beforeSummary?: unknown;
  afterSummary?: unknown;
};

type JobAttemptRecord = {
  id: string;
  jobName: string;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  summaryPayload?: unknown;
};

export type WebhookLogInput = {
  workspaceId?: string;
  source: DiagnosticSourceDto;
  eventType: string;
  externalEventId?: string;
  idempotencyKey?: string;
  summaryPayload?: Record<string, unknown>;
};

export type WebhookLogResult = {
  webhookLogId: string;
  diagnosticEventId: string;
  status: "received" | "duplicate";
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

    const [auditLogs, jobAttempts] = await Promise.all([
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
      this.prisma.jobAttempt.findMany({
        where: {
          relatedEntityType: "DiagnosticEvent",
          relatedEntityId: event.id
        },
        orderBy: {
          createdAt: "asc"
        },
        take: 20
      }) as Promise<JobAttemptRecord[]>
    ]);

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
