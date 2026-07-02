import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ConversionRuleDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MetaCapiAdapter } from "./meta-capi.adapter";

export type RecordRuleMatchesInput = {
  workspaceId: string;
  rules: ConversionRuleDto[];
  leadId?: string;
  phoneHash?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
};

export type RecordRuleMatchesResult = {
  created: string[];
  duplicates: string[];
};

type ConversionEventLogRecord = {
  id: string;
  workspaceId: string | null;
  leadId: string | null;
  pixelId: string | null;
  eventName: string;
  status: string;
  phoneHash: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  dedupeKey: string | null;
};

export type SendReadyEventResult = {
  conversionEventLogId: string;
  status: "not_configured" | "sent" | "error" | "skipped";
};

@Injectable()
export class ConversionEventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MetaCapiAdapter) private readonly metaCapiAdapter: MetaCapiAdapter
  ) {}

  async recordRuleMatches(
    input: RecordRuleMatchesInput
  ): Promise<RecordRuleMatchesResult> {
    const created: string[] = [];
    const duplicates: string[] = [];

    for (const rule of input.rules) {
      const status = rule.pixelId && input.adId ? "ready_to_send" : "pending_meta_context";
      const dedupeKey = this.buildDedupeKey(input, rule);
      const existing = (await this.prisma.conversionEventLog.findUnique({
        where: { dedupeKey }
      })) as ConversionEventLogRecord | null;

      if (existing) {
        duplicates.push(existing.id);
        continue;
      }

      const log = await this.prisma.conversionEventLog.create({
        data: {
          workspaceId: input.workspaceId,
          leadId: input.leadId ?? null,
          phoneHash: input.phoneHash ?? null,
          sourceTrigger: rule.triggerType,
          eventName: rule.eventName,
          status,
          pixelId: rule.pixelId,
          campaignId: input.campaignId ?? null,
          adSetId: input.adSetId ?? null,
          adId: input.adId ?? null,
          attributionStatus: input.adId ? "attributed" : "missing_ad_id",
          dedupeKey
        }
      });

      created.push(log.id);
    }

    return { created, duplicates };
  }

  async sendReadyEvent(logId: string): Promise<SendReadyEventResult> {
    const log = (await this.prisma.conversionEventLog.findUnique({
      where: { id: logId }
    })) as ConversionEventLogRecord | null;

    if (!log || log.status !== "ready_to_send" || !log.dedupeKey) {
      return {
        conversionEventLogId: logId,
        status: "skipped"
      };
    }

    const startedAt = new Date();
    const result = await this.metaCapiAdapter.sendEvent({
      pixelId: log.pixelId,
      eventName: log.eventName,
      dedupeKey: log.dedupeKey,
      phoneHash: log.phoneHash,
      adId: log.adId
    });
    await this.recordMetaCapiIntegrationLog(log, startedAt, result);

    await this.prisma.conversionEventLog.update({
      where: { id: log.id },
      data: {
        status: result.status,
        sentAt: result.status === "sent" ? new Date() : null,
        providerResponseSummary:
          result.responseSummary ? result.responseSummary as Prisma.InputJsonValue : Prisma.JsonNull,
        errorMessage: result.errorMessage
      }
    });

    return {
      conversionEventLogId: log.id,
      status: result.status
    };
  }

  private async recordMetaCapiIntegrationLog(
    log: ConversionEventLogRecord,
    startedAt: Date,
    result: {
      status: SendReadyEventResult["status"];
      responseSummary: unknown;
      errorMessage: string | null;
    }
  ): Promise<void> {
    const finishedAt = new Date();
    const status =
      result.status === "sent"
        ? "success"
        : result.status === "not_configured"
          ? "blocked"
          : "error";

    try {
      await this.prisma.integrationLog.create({
        data: {
          workspaceId: log.workspaceId,
          source: "meta",
          operation: "meta.capi.send_event",
          status,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          providerRequestId: log.id,
          providerErrorMessage: result.errorMessage,
          leadId: log.leadId,
          campaignId: log.campaignId,
          adSetId: log.adSetId,
          adId: log.adId,
          jobId: log.id,
          requestSummary: {
            conversionEventLogId: log.id,
            eventName: log.eventName,
            pixelId: log.pixelId,
            dedupeKey: log.dedupeKey,
            phoneHash: log.phoneHash,
            adId: log.adId
          } as Prisma.InputJsonValue,
          responseSummary:
            result.responseSummary === null
              ? Prisma.JsonNull
              : (result.responseSummary as Prisma.InputJsonValue)
        }
      });
    } catch {
      return;
    }
  }

  private buildDedupeKey(
    input: RecordRuleMatchesInput,
    rule: ConversionRuleDto
  ): string {
    const subject = input.leadId ?? input.phoneHash ?? "unknown";
    return [
      input.workspaceId,
      subject,
      rule.id,
      rule.eventName,
      input.adId ?? "missing_ad"
    ].join(":");
  }
}
