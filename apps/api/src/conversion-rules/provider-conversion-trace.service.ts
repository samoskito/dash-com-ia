import {
  providerConversionDecisionSchema,
  type ProviderConversionDecisionDto,
} from "@wpptrack/shared";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

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
}
