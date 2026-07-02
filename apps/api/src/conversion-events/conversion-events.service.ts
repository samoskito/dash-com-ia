import { Inject, Injectable } from "@nestjs/common";
import type { ConversionRuleDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

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
};

@Injectable()
export class ConversionEventsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordRuleMatches(
    input: RecordRuleMatchesInput
  ): Promise<RecordRuleMatchesResult> {
    const created: string[] = [];

    for (const rule of input.rules) {
      const status = rule.pixelId && input.adId ? "ready_to_send" : "pending_meta_context";
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
          dedupeKey: this.buildDedupeKey(input, rule)
        }
      });

      created.push(log.id);
    }

    return { created };
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
