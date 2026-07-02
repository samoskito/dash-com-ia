import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  DiagnosticSourceDto,
  DiagnosticEventCreateDto,
  DiagnosticEventDetailDto,
  DiagnosticEventDto,
  DiagnosticEventListQueryDto,
  DiagnosticRetryInputDto,
  DiagnosticRetryResultDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

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
  status: "received";
};

@Injectable()
export class DiagnosticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

    return this.toDetailDto(event);
  }

  async recordWebhookLog(input: WebhookLogInput): Promise<WebhookLogResult> {
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
    const where: Record<string, unknown> = {};

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

    const events = (await this.prisma.diagnosticEvent.findMany({
      where,
      orderBy: {
        occurredAt: "desc"
      },
      take: query.limit
    })) as DiagnosticEventRecord[];

    return events.map((event) => this.toDto(event));
  }

  async getEvent(id: string): Promise<DiagnosticEventDetailDto> {
    const event = (await this.prisma.diagnosticEvent.findUnique({
      where: { id }
    })) as DiagnosticEventRecord | null;

    if (!event) {
      throw new NotFoundException("Evento diagnostico nao encontrado");
    }

    return this.toDetailDto(event);
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

  private toDetailDto(event: DiagnosticEventRecord): DiagnosticEventDetailDto {
    return {
      ...this.toDto(event),
      summaryPayload:
        event.summaryPayload &&
        typeof event.summaryPayload === "object" &&
        !Array.isArray(event.summaryPayload)
          ? (event.summaryPayload as Record<string, unknown>)
          : null
    };
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
