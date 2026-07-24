import {
  type BackofficeProviderConversionTraceItemDto,
  type BackofficeProviderConversionTraceListDto,
  type BackofficeProviderConversionTraceQueryDto,
  type BackofficeProviderConversionTraceStateDto,
  conversionEventNameSchema,
  providerConversionDecisionCodeSchema,
  providerConversionDecisionSchema,
  type ProviderConversionDecisionDto,
} from "@wpptrack/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { dateTimeRangeInTimezone } from "../common/date-time/timezone-range";
import { PrismaService } from "../common/prisma/prisma.service";

const backofficeTimezone = "America/Sao_Paulo";

export type ProviderConversionTraceVersion = {
  decisionId: string;
  decisionVersion: number;
  evaluationKey: string;
  decisionFingerprint: string;
  supersedesDecisionId: string | null;
  createdAt: Date;
  decision: ProviderConversionDecisionDto;
  delivery: {
    id: string;
    status: string;
    classification: string | null;
    firstReceivedAt: Date;
    lastReceivedAt: Date;
  };
  technicalExecution: {
    id: string;
    status: string;
    reasonCode: string | null;
    conversionEventLogId: string | null;
    attemptCount: number;
    lastAttemptedAt: Date | null;
    processedAt: Date | null;
  } | null;
  purchaseReview: {
    id: string;
    status: string;
    classificationCode: string;
    reasonCode: string | null;
    conversionEventLogId: string | null;
    decidedAt: Date | null;
  } | null;
};

export type ProviderConversionOccurrenceTrace = {
  workspaceId: string;
  providerRuleId: string;
  occurrenceKey: string;
  latestDecisionId: string | null;
  versions: ProviderConversionTraceVersion[];
};

@Injectable()
export class ProviderConversionTraceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listLatestTraces(
    query: BackofficeProviderConversionTraceQueryDto,
  ): Promise<BackofficeProviderConversionTraceListDto> {
    const receivedAt = dateTimeRangeInTimezone(
      query.receivedFrom,
      query.receivedUntil,
      backofficeTimezone,
    );
    const where: Prisma.ProviderConversionDecisionAuditWhereInput = {
      supersededBy: { none: {} },
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.deliveryId ? { sourceDeliveryId: query.deliveryId } : {}),
      ...(query.providerRuleId
        ? { providerRuleId: query.providerRuleId }
        : {}),
      ...(query.eventName ? { eventName: query.eventName } : {}),
      ...(query.decisionCode ? { decisionCode: query.decisionCode } : {}),
      sourceDelivery: {
        ...(query.connectionId ? { connectionId: query.connectionId } : {}),
        ...(Object.keys(receivedAt).length > 0
          ? { lastReceivedAt: receivedAt }
          : {}),
      },
    };
    const records =
      await this.prisma.providerConversionDecisionAudit.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          decisionVersion: true,
          occurrenceKey: true,
          decisionCode: true,
          reasonCode: true,
          eventName: true,
          occurredAt: true,
          createdAt: true,
          engineVersion: true,
          parserVersion: true,
          valueCents: true,
          currency: true,
          sourceDelivery: {
            select: {
              id: true,
              purpose: true,
              status: true,
              classification: true,
              firstReceivedAt: true,
              lastReceivedAt: true,
              payloadExpiresAt: true,
              encryptionKeyVersion: true,
              workspace: {
                select: {
                  id: true,
                  name: true,
                },
              },
              connection: {
                select: {
                  id: true,
                  displayName: true,
                  provider: true,
                },
              },
            },
          },
          channel: {
            select: {
              id: true,
              channelName: true,
              connectedPhone: true,
            },
          },
          providerRule: {
            select: {
              id: true,
              mode: true,
              conversionRule: {
                select: {
                  name: true,
                  eventName: true,
                },
              },
            },
          },
          providerExecution: {
            select: {
              id: true,
              status: true,
              reasonCode: true,
              conversionEventLogId: true,
              normalizedResult: true,
              attemptCount: true,
              lastAttemptedAt: true,
              processedAt: true,
            },
          },
          purchaseReview: {
            select: {
              id: true,
              status: true,
              classificationCode: true,
              reasonCode: true,
              conversionEventLogId: true,
              decidedAt: true,
            },
          },
        },
      });

    const conversionEventLogIds = Array.from(
      new Set(
        records.flatMap((record) => {
          const ids = [
            record.providerExecution?.conversionEventLogId,
            record.purchaseReview?.conversionEventLogId,
          ];

          return ids.filter((id): id is string => Boolean(id));
        }),
      ),
    );
    const conversionEventLogs =
      conversionEventLogIds.length === 0
        ? []
        : await this.prisma.conversionEventLog.findMany({
            where: {
              id: { in: conversionEventLogIds },
            },
            select: {
              id: true,
              status: true,
              eventName: true,
              sentAt: true,
              pixelId: true,
              pageId: true,
              eventId: true,
              errorCode: true,
              errorMessage: true,
              providerRequestPayload: true,
              providerResponseSummary: true,
            },
          });
    const conversionEventLogById = new Map(
      conversionEventLogs.map((log) => [log.id, log]),
    );
    const now = new Date();
    const allItems: BackofficeProviderConversionTraceItemDto[] = records.map(
      (record) => {
      const conversionEventLogId =
        record.providerExecution?.conversionEventLogId ??
        record.purchaseReview?.conversionEventLogId ??
        null;
      const conversionEventLog = conversionEventLogId
        ? (conversionEventLogById.get(conversionEventLogId) ?? null)
        : null;
      const state = this.operationalState({
        decisionCode: record.decisionCode,
        executionStatus: record.providerExecution?.status ?? null,
        normalizedResult: record.providerExecution?.normalizedResult ?? null,
        metaStatus: conversionEventLog?.status ?? null,
        metaErrorCode: conversionEventLog?.errorCode ?? null,
      });
      const payloadAvailable = Boolean(
        record.sourceDelivery.payloadExpiresAt.getTime() > now.getTime() &&
          record.sourceDelivery.encryptionKeyVersion,
      );

      return {
        decisionId: record.id,
        decisionVersion: record.decisionVersion,
        occurrenceKey: record.occurrenceKey,
        occurredAt: record.occurredAt.toISOString(),
        createdAt: record.createdAt.toISOString(),
        workspace: record.sourceDelivery.workspace,
        connection: {
          id: record.sourceDelivery.connection.id,
          name: record.sourceDelivery.connection.displayName,
          provider: record.sourceDelivery.connection.provider,
        },
        channel: record.channel
          ? {
              id: record.channel.id,
              name:
                record.channel.channelName?.trim() ||
                record.channel.connectedPhone,
              connectedPhone: record.channel.connectedPhone,
            }
          : null,
        rule: {
          id: record.providerRule.id,
          name: record.providerRule.conversionRule.name,
          eventName: conversionEventNameSchema.parse(
            record.providerRule.conversionRule.eventName,
          ),
          mode: record.providerRule.mode,
        },
        decision: {
          code: providerConversionDecisionCodeSchema.parse(
            record.decisionCode,
          ),
          reasonCode: record.reasonCode,
          engineVersion: record.engineVersion,
          parserVersion: record.parserVersion,
          valueCents: record.valueCents,
          currency: record.currency,
        },
        delivery: {
          id: record.sourceDelivery.id,
          purpose: record.sourceDelivery.purpose,
          status: record.sourceDelivery.status,
          classification: record.sourceDelivery.classification,
          firstReceivedAt: record.sourceDelivery.firstReceivedAt.toISOString(),
          lastReceivedAt: record.sourceDelivery.lastReceivedAt.toISOString(),
          payloadAvailable,
          payloadExpiresAt:
            record.sourceDelivery.payloadExpiresAt.toISOString(),
        },
        review: record.purchaseReview
          ? {
              id: record.purchaseReview.id,
              status: record.purchaseReview.status,
              classificationCode: record.purchaseReview.classificationCode,
              reasonCode: record.purchaseReview.reasonCode,
              decidedAt:
                record.purchaseReview.decidedAt?.toISOString() ?? null,
            }
          : null,
        execution: record.providerExecution
          ? {
              id: record.providerExecution.id,
              status: record.providerExecution.status,
              reasonCode: record.providerExecution.reasonCode,
              conversionEventLogId:
                record.providerExecution.conversionEventLogId,
              attemptCount: record.providerExecution.attemptCount,
              lastAttemptedAt:
                record.providerExecution.lastAttemptedAt?.toISOString() ?? null,
              processedAt:
                record.providerExecution.processedAt?.toISOString() ?? null,
            }
          : null,
        meta: conversionEventLog
          ? {
              id: conversionEventLog.id,
              status: conversionEventLog.status,
              eventName: conversionEventNameSchema.parse(
                conversionEventLog.eventName,
              ),
              sentAt: conversionEventLog.sentAt?.toISOString() ?? null,
              pixelId: conversionEventLog.pixelId,
              pageId: conversionEventLog.pageId,
              eventId: conversionEventLog.eventId,
              errorCode: conversionEventLog.errorCode,
              errorMessage: conversionEventLog.errorMessage,
              requestPayload:
                this.jsonValue(conversionEventLog.providerRequestPayload),
              responseSummary: this.jsonValue(
                conversionEventLog.providerResponseSummary,
              ),
            }
          : null,
        state,
        retryable:
          state === "failed_retryable" && conversionEventLog !== null,
        reevaluable:
          payloadAvailable &&
          record.sourceDelivery.status === "processed" &&
          ["message_observation", "conversion_automation"].includes(
            record.sourceDelivery.purpose,
          ) &&
          record.decisionCode !== "eligible" &&
          record.decisionCode !== "duplicate",
      } satisfies BackofficeProviderConversionTraceItemDto;
      },
    );
    const filteredItems = query.state
      ? allItems.filter((item) => item.state === query.state)
      : allItems;
    const items = filteredItems.slice(
      query.offset,
      query.offset + query.limit,
    );

    return {
      items,
      total: filteredItems.length,
      summary: this.summary(filteredItems),
      facets: {
        rules: Array.from(
          new Map(
            allItems.map((item) => [
              item.rule.id,
              {
                id: item.rule.id,
                name: item.rule.name,
                eventName: item.rule.eventName,
              },
            ]),
          ).values(),
        ).sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
      },
    };
  }

  async getOccurrenceTrace(input: {
    workspaceId: string;
    providerRuleId: string;
    occurrenceKey: string;
  }): Promise<ProviderConversionOccurrenceTrace> {
    const records = await this.prisma.providerConversionDecisionAudit.findMany({
      where: {
        workspaceId: input.workspaceId,
        providerRuleId: input.providerRuleId,
        occurrenceKey: input.occurrenceKey,
      },
      orderBy: {
        decisionVersion: "asc",
      },
      select: {
        id: true,
        decisionVersion: true,
        evaluationKey: true,
        decisionFingerprint: true,
        supersedesDecisionId: true,
        decisionJson: true,
        createdAt: true,
        sourceDelivery: {
          select: {
            id: true,
            status: true,
            classification: true,
            firstReceivedAt: true,
            lastReceivedAt: true,
          },
        },
        providerExecution: {
          select: {
            id: true,
            status: true,
            reasonCode: true,
            conversionEventLogId: true,
            attemptCount: true,
            lastAttemptedAt: true,
            processedAt: true,
          },
        },
        purchaseReview: {
          select: {
            id: true,
            status: true,
            classificationCode: true,
            reasonCode: true,
            conversionEventLogId: true,
            decidedAt: true,
          },
        },
      },
    });

    const versions: ProviderConversionTraceVersion[] = records.map(
      (record) => ({
        decisionId: record.id,
        decisionVersion: record.decisionVersion,
        evaluationKey: record.evaluationKey,
        decisionFingerprint: record.decisionFingerprint,
        supersedesDecisionId: record.supersedesDecisionId,
        createdAt: record.createdAt,
        decision: providerConversionDecisionSchema.parse(record.decisionJson),
        delivery: {
          ...record.sourceDelivery,
          classification: record.sourceDelivery.classification ?? null,
        },
        technicalExecution: record.providerExecution
          ? {
              ...record.providerExecution,
              reasonCode: record.providerExecution.reasonCode ?? null,
              conversionEventLogId:
                record.providerExecution.conversionEventLogId ?? null,
              lastAttemptedAt: record.providerExecution.lastAttemptedAt ?? null,
              processedAt: record.providerExecution.processedAt ?? null,
            }
          : null,
        purchaseReview: record.purchaseReview
          ? {
              ...record.purchaseReview,
              reasonCode: record.purchaseReview.reasonCode ?? null,
              conversionEventLogId:
                record.purchaseReview.conversionEventLogId ?? null,
              decidedAt: record.purchaseReview.decidedAt ?? null,
            }
          : null,
      }),
    );

    return {
      workspaceId: input.workspaceId,
      providerRuleId: input.providerRuleId,
      occurrenceKey: input.occurrenceKey,
      latestDecisionId: versions.at(-1)?.decisionId ?? null,
      versions,
    };
  }

  private operationalState(input: {
    decisionCode: string;
    executionStatus: string | null;
    normalizedResult: Prisma.JsonValue | null;
    metaStatus: string | null;
    metaErrorCode: string | null;
  }): BackofficeProviderConversionTraceStateDto {
    if (input.metaStatus === "sent") return "sent";
    if (input.metaStatus === "ready_to_send") return "queued";
    if (
      input.metaStatus === "not_configured" ||
      input.metaStatus === "pending_meta_context" ||
      input.metaStatus === "pending_value"
    ) {
      return "blocked_configuration";
    }
    if (input.metaStatus === "error") {
      if (input.metaErrorCode === "MetaCapiNetworkError") {
        return "failed_retryable";
      }

      if (
        input.metaErrorCode === "MissingMetaDestination" ||
        input.metaErrorCode === "MetaCapiNotConfigured"
      ) {
        return "blocked_configuration";
      }

      return "failed_permanent";
    }
    if (
      input.metaStatus === "not_eligible" ||
      input.metaStatus === "imported" ||
      input.metaStatus === "skipped"
    ) {
      return "internal_outcome";
    }
    if (input.metaStatus === "shadow_observed") return "observed";

    const technicalDelivery = this.technicalDelivery(input.normalizedResult);
    if (technicalDelivery) return technicalDelivery;

    if (input.executionStatus === "duplicate") return "duplicate";
    if (input.executionStatus === "blocked") return "blocked_configuration";
    if (input.executionStatus === "failed") return "failed_permanent";
    if (
      input.executionStatus === "eligible" ||
      input.executionStatus === "materialized"
    ) {
      return "queued";
    }
    if (input.executionStatus === "observed") return "observed";

    if (
      input.decisionCode === "ignored_empty_template" ||
      input.decisionCode === "ignored_untracked_lead"
    ) {
      return "internal_outcome";
    }
    if (input.decisionCode === "review_required") return "review_required";
    if (input.decisionCode === "duplicate") return "duplicate";

    return "observed";
  }

  private technicalDelivery(
    value: Prisma.JsonValue | null,
  ): BackofficeProviderConversionTraceStateDto | null {
    const normalized = this.jsonObject(value);
    const technical = this.jsonObject(
      (normalized?.technicalDelivery ?? null) as Prisma.JsonValue | null,
    );
    const state = technical?.state;

    return state === "observed" ||
      state === "queued" ||
      state === "sent" ||
      state === "blocked_configuration" ||
      state === "failed_retryable" ||
      state === "failed_permanent"
      ? state
      : null;
  }

  private summary(
    items: BackofficeProviderConversionTraceItemDto[],
  ): BackofficeProviderConversionTraceListDto["summary"] {
    const count = (state: BackofficeProviderConversionTraceStateDto) =>
      items.filter((item) => item.state === state).length;

    return {
      all: items.length,
      internalOutcome: count("internal_outcome"),
      reviewRequired: count("review_required"),
      observed: count("observed"),
      queued: count("queued"),
      sent: count("sent"),
      duplicate: count("duplicate"),
      blockedConfiguration: count("blocked_configuration"),
      failedRetryable: count("failed_retryable"),
      failedPermanent: count("failed_permanent"),
    };
  }

  private jsonObject(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private jsonValue(value: Prisma.JsonValue | null): unknown | null {
    return value === null ? null : value;
  }
}
