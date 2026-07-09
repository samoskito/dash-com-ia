import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ConversionRuleDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MetaTokenEncryptionService } from "../integrations/meta/meta-token-encryption.service";
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
  pageId: string | null;
  eventName: string;
  status: string;
  phoneHash: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  dedupeKey: string | null;
};

type MetaIntegrationCapiTokenRecord = {
  encryptedAccessToken: string | null;
  tokenIv: string | null;
  tokenTag: string | null;
  capiAccessTokenEncrypted: string | null;
  capiTokenIv: string | null;
  capiTokenTag: string | null;
};

type MetaConversionDestinationRecord = {
  pixelId: string;
  pageId: string;
};

type ResolvedConversionDestination = {
  pixelId: string | null;
  pageId: string | null;
};

export type SendReadyEventResult = {
  conversionEventLogId: string;
  workspaceId: string | null;
  status: "not_configured" | "sent" | "error" | "skipped";
};

@Injectable()
export class ConversionEventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MetaCapiAdapter) private readonly metaCapiAdapter: MetaCapiAdapter,
    private readonly metaTokenEncryption: MetaTokenEncryptionService
  ) {}

  async recordRuleMatches(
    input: RecordRuleMatchesInput
  ): Promise<RecordRuleMatchesResult> {
    const created: string[] = [];
    const duplicates: string[] = [];

    for (const rule of input.rules) {
      const status = input.adId ? "ready_to_send" : "pending_meta_context";
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
        workspaceId: null,
        status: "skipped"
      };
    }

    const startedAt = new Date();
    const accessToken = await this.getWorkspaceCapiAccessToken(log.workspaceId);
    const destination = await this.getWorkspaceConversionDestination(log.workspaceId);
    const resolvedDestination = {
      pixelId: destination?.pixelId ?? log.pixelId,
      pageId: destination?.pageId ?? null
    };
    const result = await this.metaCapiAdapter.sendEvent({
      accessToken,
      pixelId: resolvedDestination.pixelId,
      pageId: resolvedDestination.pageId,
      eventName: log.eventName,
      dedupeKey: log.dedupeKey,
      phoneHash: log.phoneHash,
      adId: log.adId
    });
    const integrationLogId = await this.recordMetaCapiIntegrationLog(
      log,
      startedAt,
      result,
      resolvedDestination
    );

    await this.prisma.conversionEventLog.update({
      where: { id: log.id },
      data: {
        status: result.status,
        sentAt: result.status === "sent" ? new Date() : null,
        pixelId: resolvedDestination.pixelId,
        pageId: resolvedDestination.pageId,
        providerResponseSummary:
          result.responseSummary ? result.responseSummary as Prisma.InputJsonValue : Prisma.JsonNull,
        errorMessage: result.errorMessage
      }
    });
    await this.recordMetaCapiDiagnosticEvent(
      log,
      result,
      integrationLogId,
      resolvedDestination
    );

    return {
      conversionEventLogId: log.id,
      workspaceId: log.workspaceId,
      status: result.status
    };
  }

  private async getWorkspaceCapiAccessToken(
    workspaceId: string | null
  ): Promise<string | null> {
    if (!workspaceId) {
      return null;
    }

    const connection = (await this.prisma.metaIntegration.findUnique({
      where: { workspaceId },
      select: {
        encryptedAccessToken: true,
        tokenIv: true,
        tokenTag: true,
        capiAccessTokenEncrypted: true,
        capiTokenIv: true,
        capiTokenTag: true
      }
    })) as MetaIntegrationCapiTokenRecord | null;

    if (!connection) {
      return null;
    }

    const encryptedAccessToken =
      connection.capiAccessTokenEncrypted ?? connection.encryptedAccessToken;
    const tokenIv = connection.capiTokenIv ?? connection.tokenIv;
    const tokenTag = connection.capiTokenTag ?? connection.tokenTag;

    if (!encryptedAccessToken || !tokenIv || !tokenTag) {
      return null;
    }

    try {
      return this.metaTokenEncryption.decrypt({
        encryptedAccessToken,
        tokenIv,
        tokenTag
      });
    } catch {
      return null;
    }
  }

  private async getWorkspaceConversionDestination(
    workspaceId: string | null
  ): Promise<MetaConversionDestinationRecord | null> {
    if (!workspaceId) {
      return null;
    }

    return (await this.prisma.metaConversionDestination.findUnique({
      where: { workspaceId },
      select: {
        pixelId: true,
        pageId: true
      }
    })) as MetaConversionDestinationRecord | null;
  }

  private async recordMetaCapiIntegrationLog(
    log: ConversionEventLogRecord,
    startedAt: Date,
    result: {
      status: SendReadyEventResult["status"];
      responseSummary: unknown;
      errorMessage: string | null;
    },
    destination: ResolvedConversionDestination
  ): Promise<string | null> {
    const finishedAt = new Date();
    const status =
      result.status === "sent"
        ? "success"
        : result.status === "not_configured"
          ? "blocked"
          : "error";

    try {
      const integrationLog = await this.prisma.integrationLog.create({
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
            pixelId: destination.pixelId,
            pageId: destination.pageId,
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
      return integrationLog.id;
    } catch {
      return null;
    }
  }

  private async recordMetaCapiDiagnosticEvent(
    log: ConversionEventLogRecord,
    result: {
      status: SendReadyEventResult["status"];
      errorMessage: string | null;
    },
    integrationLogId: string | null,
    destination: ResolvedConversionDestination
  ): Promise<void> {
    if (result.status === "sent" || result.status === "skipped") {
      return;
    }

    const isBlocked = result.status === "not_configured";

    try {
      await this.prisma.diagnosticEvent.create({
        data: {
          workspaceId: log.workspaceId,
          source: "meta",
          eventType: "meta.capi.send_event",
          severity: isBlocked ? "warning" : "error",
          status: isBlocked ? "blocked" : "error",
          title: isBlocked
            ? "Envio Meta CAPI bloqueado por configuracao"
            : "Falha no envio Meta CAPI",
          message:
            result.errorMessage ??
            (isBlocked
              ? "Pixel ou token Meta CAPI nao configurado."
              : "O envio do evento para a Meta falhou."),
          leadId: log.leadId,
          phoneHash: log.phoneHash,
          campaignId: log.campaignId,
          adSetId: log.adSetId,
          adId: log.adId,
          jobId: log.id,
          errorCode: isBlocked ? "MetaCapiNotConfigured" : "MetaCapiSendError",
          integrationLogId,
          conversionEventLogId: log.id,
          summaryPayload: {
            conversionEventLogId: log.id,
            eventName: log.eventName,
            pixelId: destination.pixelId,
            pageId: destination.pageId,
            status: result.status,
            errorMessage: result.errorMessage
          } as Prisma.InputJsonValue
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
