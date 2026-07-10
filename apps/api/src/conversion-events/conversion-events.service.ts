import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  ConversionEventCustomDataDto,
  ConversionEventNameDto,
  ConversionEventTestInputDto,
  ConversionRuleDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MetaTokenEncryptionService } from "../integrations/meta/meta-token-encryption.service";
import {
  MetaCapiAdapter,
  type MetaCapiSendEventErrorCode
} from "./meta-capi.adapter";
import { isConversionEventRequiringValue } from "./conversion-event-registry";

export type RecordRuleMatchesInput = {
  workspaceId: string;
  rules: ConversionRuleDto[];
  leadId?: string;
  phoneHash?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  ctwaClid?: string;
  valueCents?: number | null;
  currency?: string | null;
  contentName?: string | null;
  customData?: ConversionEventCustomDataDto;
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
  eventId: string | null;
  eventName: ConversionEventNameDto;
  status: string;
  phoneHash: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  ctwaClid: string | null;
  dedupeKey: string | null;
  customData: Prisma.JsonValue | null;
  valueCents: number | null;
  currency: string | null;
  contentName: string | null;
  errorCode: string | null;
};

type InitialStatus = {
  status: "pending_meta_context" | "pending_value" | "ready_to_send";
  errorCode: "MissingAdId" | "MissingCtwaClid" | "EventValueMissing" | null;
  errorMessage: string | null;
};

type RecordAutomaticLeadSubmittedInput = {
  workspaceId: string;
  leadId?: string;
  phoneHash?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  ctwaClid?: string;
};

export type SendManualTestEventInput = ConversionEventTestInputDto;

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

type SendReadyEventOptions = {
  testEventCode?: string;
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
      const dedupeKey = this.buildDedupeKey(input, rule);
      const existing = (await this.prisma.conversionEventLog.findUnique({
        where: { dedupeKey }
      })) as ConversionEventLogRecord | null;

      if (existing) {
        duplicates.push(existing.id);
        continue;
      }

      const valueCents = input.valueCents ?? rule.defaultValueCents ?? null;
      const initialStatus = this.resolveInitialStatus({
        eventName: rule.eventName,
        adId: input.adId,
        ctwaClid: input.ctwaClid,
        valueCents
      });
      const customData =
        input.customData !== undefined
          ? (input.customData as Prisma.InputJsonValue)
          : rule.defaultItems
            ? ({ contents: rule.defaultItems } as Prisma.InputJsonValue)
            : Prisma.JsonNull;
      const log = await this.prisma.conversionEventLog.create({
        data: {
          workspaceId: input.workspaceId,
          leadId: input.leadId ?? null,
          phoneHash: input.phoneHash ?? null,
          sourceTrigger: rule.triggerType,
          eventName: rule.eventName,
          status: initialStatus.status,
          pixelId: rule.pixelId,
          eventId: dedupeKey,
          campaignId: input.campaignId ?? null,
          adSetId: input.adSetId ?? null,
          adId: input.adId ?? null,
          ctwaClid: input.ctwaClid ?? null,
          attributionStatus: input.adId ? "attributed" : "missing_ad_id",
          dedupeKey,
          valueCents,
          currency: input.currency ?? rule.defaultCurrency ?? null,
          contentName: input.contentName ?? rule.defaultContentName ?? null,
          customData,
          errorCode: initialStatus.errorCode,
          errorMessage: initialStatus.errorMessage
        }
      });

      created.push(log.id);
    }

    return { created, duplicates };
  }

  async recordAutomaticLeadSubmitted(
    input: RecordAutomaticLeadSubmittedInput
  ): Promise<RecordRuleMatchesResult> {
    const subject = input.leadId ?? input.phoneHash ?? "unknown";
    const dedupeKey = [
      input.workspaceId,
      subject,
      "auto_lead",
      "LeadSubmitted",
      input.adId ?? "missing_ad"
    ].join(":");
    const existing = (await this.prisma.conversionEventLog.findUnique({
      where: { dedupeKey }
    })) as ConversionEventLogRecord | null;

    if (existing) {
      return { created: [], duplicates: [existing.id] };
    }

    const initialStatus = this.resolveInitialStatus({
      eventName: "LeadSubmitted",
      adId: input.adId,
      ctwaClid: input.ctwaClid,
      valueCents: null
    });
    const log = await this.prisma.conversionEventLog.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId ?? null,
        phoneHash: input.phoneHash ?? null,
        sourceTrigger: "auto_lead",
        eventName: "LeadSubmitted",
        status: initialStatus.status,
        pixelId: null,
        eventId: dedupeKey,
        campaignId: input.campaignId ?? null,
        adSetId: input.adSetId ?? null,
        adId: input.adId ?? null,
        ctwaClid: input.ctwaClid ?? null,
        attributionStatus: input.adId ? "attributed" : "missing_ad_id",
        dedupeKey,
        valueCents: null,
        currency: null,
        contentName: null,
        customData: Prisma.JsonNull,
        errorCode: initialStatus.errorCode,
        errorMessage: initialStatus.errorMessage
      }
    });

    return { created: [log.id], duplicates: [] };
  }

  async listReadyLogIds(logIds: string[]): Promise<string[]> {
    if (logIds.length === 0) {
      return [];
    }

    const logs = (await this.prisma.conversionEventLog.findMany({
      where: {
        id: { in: logIds },
        status: "ready_to_send"
      },
      select: { id: true }
    })) as Array<{ id: string }>;

    return logs.map((log) => log.id);
  }

  async sendManualTestEvent(
    input: SendManualTestEventInput
  ): Promise<SendReadyEventResult> {
    const subject = input.leadId ?? input.phoneHash ?? "unknown";
    const dedupeKey = [
      input.workspaceId,
      subject,
      "manual_test",
      input.eventName,
      input.adId ?? "missing_ad",
      Date.now(),
      randomUUID()
    ].join(":");
    const initialStatus = this.resolveInitialStatus({
      eventName: input.eventName,
      adId: input.adId,
      ctwaClid: input.ctwaClid,
      valueCents: input.valueCents ?? null
    });
    const log = await this.prisma.conversionEventLog.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId ?? null,
        phoneHash: input.phoneHash,
        sourceTrigger: "manual_test",
        eventName: input.eventName,
        status: initialStatus.status,
        pixelId: null,
        eventId: dedupeKey,
        campaignId: null,
        adSetId: null,
        adId: input.adId ?? null,
        ctwaClid: input.ctwaClid ?? null,
        attributionStatus: "manual_test",
        dedupeKey,
        valueCents: input.valueCents ?? null,
        currency: input.currency ?? null,
        contentName: input.contentName ?? null,
        customData: Prisma.JsonNull,
        errorCode: initialStatus.errorCode,
        errorMessage: initialStatus.errorMessage
      }
    });

    if (initialStatus.status !== "ready_to_send") {
      return {
        conversionEventLogId: log.id,
        workspaceId: input.workspaceId,
        status: "not_configured"
      };
    }

    return this.sendReadyEvent(log.id, { testEventCode: input.testEventCode });
  }

  async sendReadyEvent(
    logId: string,
    options: SendReadyEventOptions = {}
  ): Promise<SendReadyEventResult> {
    const log = (await this.prisma.conversionEventLog.findUnique({
      where: { id: logId }
    })) as ConversionEventLogRecord | null;

    const eventId = log?.eventId ?? log?.dedupeKey ?? null;
    if (!log || log.status !== "ready_to_send" || !eventId) {
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
      dedupeKey: eventId,
      phoneHash: log.phoneHash,
      adId: log.adId,
      ctwaClid: log.ctwaClid,
      valueCents: log.valueCents,
      currency: log.currency,
      contentName: log.contentName,
      customData: log.customData as ConversionEventCustomDataDto | null,
      testEventCode: options.testEventCode ?? null
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
        errorCode: result.errorCode,
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
      errorCode: MetaCapiSendEventErrorCode;
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
          providerErrorCode: result.errorCode,
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
            eventId: log.eventId,
            dedupeKey: log.dedupeKey,
            phoneHash: log.phoneHash,
            adId: log.adId,
            ctwaClid: log.ctwaClid,
            valueCents: log.valueCents,
            currency: log.currency,
            contentName: log.contentName,
            errorCode: result.errorCode
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
      errorCode: MetaCapiSendEventErrorCode;
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
          errorCode:
            result.errorCode ??
            (isBlocked ? "MetaCapiNotConfigured" : "MetaCapiSendError"),
          integrationLogId,
          conversionEventLogId: log.id,
          summaryPayload: {
            conversionEventLogId: log.id,
            eventName: log.eventName,
            pixelId: destination.pixelId,
            pageId: destination.pageId,
            eventId: log.eventId,
            status: result.status,
            errorCode: result.errorCode,
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

  private resolveInitialStatus(input: {
    eventName: ConversionEventNameDto;
    adId?: string | null;
    ctwaClid?: string | null;
    valueCents?: number | null;
  }): InitialStatus {
    if (!input.adId) {
      return {
        status: "pending_meta_context",
        errorCode: "MissingAdId",
        errorMessage: "Meta CAPI ad id not available"
      };
    }

    if (!input.ctwaClid) {
      return {
        status: "pending_meta_context",
        errorCode: "MissingCtwaClid",
        errorMessage: "Meta CAPI ctwa_clid not available"
      };
    }

    if (
      isConversionEventRequiringValue(input.eventName) &&
      input.valueCents == null
    ) {
      return {
        status: "pending_value",
        errorCode: "EventValueMissing",
        errorMessage: "Conversion event value is required"
      };
    }

    return {
      status: "ready_to_send",
      errorCode: null,
      errorMessage: null
    };
  }
}
