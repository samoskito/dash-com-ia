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
  pixelId: string | null;
  eventName: string;
  status: string;
  phoneHash: string | null;
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

    const result = await this.metaCapiAdapter.sendEvent({
      pixelId: log.pixelId,
      eventName: log.eventName,
      dedupeKey: log.dedupeKey,
      phoneHash: log.phoneHash,
      adId: log.adId
    });

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
