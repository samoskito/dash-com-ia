import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  canonicalTrackingEventTypeSchema,
  conversionValueSourceSchema,
  type CanonicalTrackingEventTypeDto,
  type ConversionValueSourceDto
} from "@wpptrack/shared";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { LeadsService } from "../leads/leads.service";
import {
  buildExternalEventIdentity,
  ExternalEventIdentityError
} from "./external-event-policy";
import type { ExternalEventRow } from "./external-mysql.adapter";

export type ExternalEventConnectorContext = {
  id: string;
  workspaceId: string;
  provider: string;
  timezone: string;
  shadowMode: boolean;
  capiSendEnabled: boolean;
  purchaseAverageValueCents: number | null;
  defaultCurrency: string | null;
};

export type ExternalEventIngestionResult = {
  externalRowId: string;
  status: "imported" | "duplicate" | "rejected";
  leadId: string | null;
  conversionEventLogId: string | null;
  queued: boolean;
  errorCode: string | null;
};

export type ExternalEventIngestionOptions = {
  deliveryStatus?: "imported";
  updateLeadStatus?: boolean;
};

type LeadAttribution = {
  id: string;
  phoneHash: string;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  ctwaClid: string | null;
};

@Injectable()
export class ExternalEventIngestionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LeadsService) private readonly leadsService: LeadsService,
    @Inject(ConversionEventsService)
    private readonly conversionEventsService: ConversionEventsService,
    @Inject(ConversionEventsQueueService)
    private readonly conversionQueue: ConversionEventsQueueService
  ) {}

  async ingest(
    connector: ExternalEventConnectorContext,
    row: ExternalEventRow,
    options: ExternalEventIngestionOptions = {}
  ): Promise<ExternalEventIngestionResult> {
    const sourceRowKey = [
      "external-row",
      connector.id,
      "events",
      row.externalRowId
    ].join(":");
    const previous = await this.prisma.externalIngestionRecord.findUnique({
      where: { dedupeKey: sourceRowKey },
      select: {
        id: true,
        status: true,
        leadId: true,
        conversionEventLogId: true,
        duplicateCount: true
      }
    });

    if (previous) {
      const queued = await this.retryPendingDelivery(connector, previous);
      await this.prisma.externalIngestionRecord.update({
        where: { id: previous.id },
        data: {
          duplicateCount: Math.max(previous.duplicateCount, row.duplicateCount),
          lastReceivedAt: new Date(),
          ...(queued ? { status: "imported", errorCode: null, errorMessage: null } : {})
        }
      });

      return {
        externalRowId: row.externalRowId,
        status: "duplicate",
        leadId: previous.leadId,
        conversionEventLogId: previous.conversionEventLogId,
        queued,
        errorCode: null
      };
    }

    try {
      return await this.ingestNew(connector, row, sourceRowKey, options);
    } catch (error) {
      const errorCode = this.errorCode(error);
      await this.recordRejected(connector, row, sourceRowKey, errorCode);

      return {
        externalRowId: row.externalRowId,
        status: "rejected",
        leadId: null,
        conversionEventLogId: null,
        queued: false,
        errorCode
      };
    }
  }

  private async ingestNew(
    connector: ExternalEventConnectorContext,
    row: ExternalEventRow,
    sourceRowKey: string,
    options: ExternalEventIngestionOptions
  ): Promise<ExternalEventIngestionResult> {
    const eventType = canonicalTrackingEventTypeSchema.parse(row.eventType);
    const occurredAt = this.parseExternalDate(row.occurredAt);
    const leadReference = await this.leadsService.upsertFromWhatsappWebhook({
      workspaceId: connector.workspaceId,
      phone: row.phone,
      source: "external_mysql",
      preserveExistingSource: true,
      campaignId: row.campaignId ?? undefined,
      adSetId: row.adSetId ?? undefined,
      adId: row.adId ?? undefined,
      ctwaClid: row.ctwaClid ?? undefined,
      ctwaSourceUrl: row.sourceUrl ?? undefined,
      occurredAt,
      recordMessageTimestamps: eventType === "conversation_started"
    });

    if (!leadReference) {
      throw new Error("ExternalLeadPhoneMissing");
    }

    const lead = (await this.prisma.lead.findUnique({
      where: { id: leadReference.id },
      select: {
        id: true,
        phoneHash: true,
        campaignId: true,
        adSetId: true,
        adId: true,
        ctwaClid: true
      }
    })) as LeadAttribution | null;

    if (!lead) {
      throw new Error("ExternalLeadNotFoundAfterUpsert");
    }

    const identity = buildExternalEventIdentity({
      connectorId: connector.id,
      connectorProvider: row.provider,
      eventType,
      leadIdentity: lead.phoneHash,
      occurredAt,
      timezone: connector.timezone,
      externalEventId: row.externalEventId,
      transactionId: row.transactionId
    });
    const value = this.resolveValue(connector, row, eventType);
    const conversion = await this.conversionEventsService.recordExternalConversion({
      workspaceId: connector.workspaceId,
      externalConnectorId: connector.id,
      sourceEventId: row.externalEventId ?? row.externalRowId,
      sourceTrigger: `external_mysql:${row.provider}`,
      eventName: this.conversionEventName(eventType),
      eventId: identity.eventId,
      dedupeKey: identity.dedupeKey,
      leadId: lead.id,
      phoneHash: lead.phoneHash,
      businessSource: lead.adId || lead.ctwaClid ? "paid" : "organic",
      campaignId: row.campaignId ?? lead.campaignId,
      adSetId: row.adSetId ?? lead.adSetId,
      adId: row.adId ?? lead.adId,
      ctwaClid: row.ctwaClid ?? lead.ctwaClid,
      valueCents: value.valueCents,
      valueSource: value.valueSource,
      currency: value.currency,
      eventOccurredAt: occurredAt,
      ...(options.deliveryStatus
        ? { deliveryStatus: options.deliveryStatus }
        : {})
    });
    const ingestionStatus = conversion.status === "duplicate" ? "duplicate" : "imported";
    const record = await this.prisma.externalIngestionRecord.create({
      data: {
        workspaceId: connector.workspaceId,
        connectorId: connector.id,
        stream: "events",
        externalRowId: row.externalRowId,
        dedupeKey: sourceRowKey,
        eventType,
        status: ingestionStatus,
        occurredAt,
        leadId: lead.id,
        conversionEventLogId: conversion.conversionEventLogId,
        duplicateCount: row.duplicateCount,
        summaryPayload: {
          sourceEventName: row.sourceEventName,
          externalLeadId: row.externalLeadId,
          providerDedupeKey: row.dedupeKey,
          internalDedupeKey: identity.dedupeKey,
          identityPolicy: identity.policy,
          eventLocalDate: identity.localDate,
          valueSource: value.valueSource
        } as Prisma.InputJsonValue
      }
    });

    if (options.updateLeadStatus !== false) {
      await this.updateLeadStatus(lead.id, eventType);
    }
    let queued = false;

    if (
      conversion.status === "created" &&
      conversion.deliveryStatus === "ready_to_send" &&
      connector.capiSendEnabled &&
      !connector.shadowMode
    ) {
      try {
        await this.conversionQueue.enqueueSend(conversion.conversionEventLogId);
        queued = true;
      } catch (error) {
        await this.prisma.externalIngestionRecord.update({
          where: { id: record.id },
          data: {
            status: "pending_delivery",
            errorCode: "ExternalCapiQueueFailed",
            errorMessage: this.safeErrorMessage(error)
          }
        });

        return {
          externalRowId: row.externalRowId,
          status: ingestionStatus,
          leadId: lead.id,
          conversionEventLogId: conversion.conversionEventLogId,
          queued: false,
          errorCode: "ExternalCapiQueueFailed"
        };
      }
    }

    return {
      externalRowId: row.externalRowId,
      status: ingestionStatus,
      leadId: lead.id,
      conversionEventLogId: conversion.conversionEventLogId,
      queued,
      errorCode: null
    };
  }

  private resolveValue(
    connector: ExternalEventConnectorContext,
    row: ExternalEventRow,
    eventType: CanonicalTrackingEventTypeDto
  ): {
    valueCents: number | null;
    valueSource: ConversionValueSourceDto | null;
    currency: string | null;
  } {
    if (eventType !== "purchase") {
      return { valueCents: null, valueSource: null, currency: null };
    }

    if (row.valueCents !== null && row.valueCents > 0) {
      const parsedSource = conversionValueSourceSchema.safeParse(row.valueSource);
      return {
        valueCents: row.valueCents,
        valueSource: parsedSource.success ? parsedSource.data : "actual",
        currency: row.currency ?? connector.defaultCurrency
      };
    }

    return {
      valueCents: connector.purchaseAverageValueCents,
      valueSource:
        connector.purchaseAverageValueCents === null
          ? null
          : "configured_average",
      currency: connector.defaultCurrency
    };
  }

  private conversionEventName(
    eventType: CanonicalTrackingEventTypeDto
  ): "LeadSubmitted" | "QualifiedLead" | "Purchase" {
    switch (eventType) {
      case "conversation_started":
        return "LeadSubmitted";
      case "qualified_lead":
        return "QualifiedLead";
      case "purchase":
        return "Purchase";
    }
  }

  private async updateLeadStatus(
    leadId: string,
    eventType: CanonicalTrackingEventTypeDto
  ): Promise<void> {
    if (eventType === "conversation_started") {
      return;
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: eventType === "purchase" ? "converted" : "qualified" }
    });
  }

  private async retryPendingDelivery(
    connector: ExternalEventConnectorContext,
    record: {
      status: string;
      conversionEventLogId: string | null;
    }
  ): Promise<boolean> {
    if (
      record.status !== "pending_delivery" ||
      !record.conversionEventLogId ||
      connector.shadowMode ||
      !connector.capiSendEnabled
    ) {
      return false;
    }

    await this.conversionQueue.enqueueSend(record.conversionEventLogId);
    return true;
  }

  private async recordRejected(
    connector: ExternalEventConnectorContext,
    row: ExternalEventRow,
    sourceRowKey: string,
    errorCode: string
  ): Promise<void> {
    try {
      await this.prisma.externalIngestionRecord.upsert({
        where: { dedupeKey: sourceRowKey },
        create: {
          workspaceId: connector.workspaceId,
          connectorId: connector.id,
          stream: "events",
          externalRowId: row.externalRowId,
          dedupeKey: sourceRowKey,
          eventType: row.eventType,
          status: "rejected",
          occurredAt: this.tryParseExternalDate(row.occurredAt),
          duplicateCount: row.duplicateCount,
          errorCode,
          errorMessage: this.safeErrorMessage(errorCode),
          summaryPayload: {
            sourceEventName: row.sourceEventName,
            externalLeadId: row.externalLeadId
          } as Prisma.InputJsonValue
        },
        update: {
          status: "rejected",
          lastReceivedAt: new Date(),
          duplicateCount: row.duplicateCount,
          errorCode,
          errorMessage: this.safeErrorMessage(errorCode)
        }
      });
    } catch {
      return;
    }
  }

  private parseExternalDate(value: string): Date {
    const parsed = this.tryParseExternalDate(value);

    if (!parsed) {
      throw new Error("ExternalEventOccurredAtInvalid");
    }

    return parsed;
  }

  private tryParseExternalDate(value: string): Date | null {
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
      value
    )
      ? `${value.replace(" ", "T")}Z`
      : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private errorCode(error: unknown): string {
    if (error instanceof ExternalEventIdentityError) {
      return error.code;
    }

    if (error instanceof Error && /^[A-Za-z][A-Za-z0-9_]+$/.test(error.message)) {
      return error.message.slice(0, 100);
    }

    return "ExternalEventIngestionFailed";
  }

  private safeErrorMessage(error: unknown): string {
    const code = typeof error === "string" ? error : this.errorCode(error);

    switch (code) {
      case "MissingProviderEventIdentity":
        return "O provider nao forneceu uma identidade estavel para o evento";
      case "ExternalEventOccurredAtInvalid":
        return "A data do evento externo e invalida";
      case "ExternalLeadPhoneMissing":
        return "O evento externo nao possui telefone valido";
      case "ExternalCapiQueueFailed":
        return "O evento foi salvo, mas ainda nao entrou na fila Meta";
      default:
        return "O evento externo nao pode ser processado";
    }
  }
}
