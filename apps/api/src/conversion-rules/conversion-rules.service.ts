import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  ConversionRuleCreateInputDto,
  ConversionRuleDto,
  ConversionRuleUpdateInputDto,
  ConversionTriggerEvaluationInputDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

type PersistedConversionRule = {
  id: string;
  workspaceId: string;
  name: string;
  triggerType: "keyword" | "whatsapp_label";
  triggerValue: string;
  matchMode: "contains" | "exact";
  eventName: string;
  pixelId: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ConversionRulesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listRules(workspaceId: string): Promise<ConversionRuleDto[]> {
    const rules = await this.prisma.conversionRule.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" }
    });

    return rules.map((rule) => this.toDto(rule));
  }

  async createRule(
    workspaceId: string,
    input: ConversionRuleCreateInputDto,
    actorUserId?: string | null
  ): Promise<ConversionRuleDto> {
    const rule = await this.prisma.conversionRule.create({
      data: {
        workspaceId,
        name: input.name,
        triggerType: input.triggerType,
        triggerValue: input.triggerValue,
        matchMode: input.matchMode,
        eventName: input.eventName,
        pixelId: input.pixelId ?? null,
        active: input.active
      }
    });
    await this.recordRuleAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "conversion_rule.created",
      targetId: rule.id,
      resultStatus: rule.active ? "active" : "inactive",
      afterSummary: this.ruleAuditSummary(rule)
    });

    return this.toDto(rule);
  }

  async updateRule(
    workspaceId: string,
    ruleId: string,
    input: ConversionRuleUpdateInputDto,
    actorUserId?: string | null
  ): Promise<ConversionRuleDto> {
    const rule = await this.prisma.conversionRule.update({
      where: {
        id: ruleId,
        workspaceId
      },
      data: {
        ...input,
        pixelId: input.pixelId === undefined ? undefined : input.pixelId
      }
    });
    await this.recordRuleAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "conversion_rule.updated",
      targetId: rule.id,
      resultStatus: rule.active ? "active" : "inactive",
      afterSummary: this.ruleAuditSummary(rule)
    });

    return this.toDto(rule);
  }

  private async recordRuleAudit(input: {
    workspaceId: string;
    actorUserId: string | null;
    action: string;
    targetId: string;
    resultStatus: string;
    afterSummary: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          actorType: input.actorUserId ? "user" : "system",
          action: input.action,
          targetType: "ConversionRule",
          targetId: input.targetId,
          reason: null,
          sourceIp: null,
          resultStatus: input.resultStatus,
          beforeSummary: undefined,
          afterSummary: input.afterSummary
        }
      });
    } catch {
      return;
    }
  }

  private ruleAuditSummary(rule: PersistedConversionRule): Prisma.InputJsonValue {
    return {
      name: rule.name,
      triggerType: rule.triggerType,
      matchMode: rule.matchMode,
      eventName: rule.eventName,
      pixelConfigured: Boolean(rule.pixelId),
      active: rule.active
    } as Prisma.InputJsonValue;
  }

  async evaluateTriggers(
    workspaceId: string,
    input: ConversionTriggerEvaluationInputDto
  ): Promise<ConversionRuleDto[]> {
    const rules = await this.prisma.conversionRule.findMany({
      where: {
        workspaceId,
        active: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const messageText = (input.messageText ?? "").toLocaleLowerCase("pt-BR");
    const labels = new Set(input.labels.map((label) => label.toLocaleLowerCase("pt-BR")));

    return rules
      .filter((rule) => this.matchesRule(rule, messageText, labels))
      .map((rule) => this.toDto(rule));
  }

  private matchesRule(
    rule: PersistedConversionRule,
    messageText: string,
    labels: Set<string>
  ): boolean {
    const trigger = rule.triggerValue.toLocaleLowerCase("pt-BR");

    if (rule.triggerType === "whatsapp_label") {
      return labels.has(trigger);
    }

    if (rule.matchMode === "exact") {
      return messageText === trigger;
    }

    return messageText.includes(trigger);
  }

  private toDto(rule: PersistedConversionRule): ConversionRuleDto {
    return {
      id: rule.id,
      workspaceId: rule.workspaceId,
      name: rule.name,
      triggerType: rule.triggerType,
      triggerValue: rule.triggerValue,
      matchMode: rule.matchMode,
      eventName: rule.eventName as ConversionRuleDto["eventName"],
      pixelId: rule.pixelId,
      active: rule.active,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString()
    };
  }
}
