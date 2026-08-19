import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { LeadsService } from "../leads/leads.service";
import { PrismaService } from "../common/prisma/prisma.service";

export type XmaxProductionAccount = {
  id: string;
  workspaceId: string;
  shadowMode: boolean;
  capiSendEnabled: boolean;
  purchaseValueCents: number | null;
  purchaseCurrency: string;
  defaultCountryCode: string;
};

export type XmaxProductionInput = {
  account: XmaxProductionAccount;
  contactId: string;
  eventName: "QualifiedLead" | "Purchase";
  phoneNormalized: string;
  phoneHash: string;
  contactName?: string | null;
  tagIds: string[];
};

export type XmaxProductionResult = {
  attempted: boolean;
  leadId?: string;
  conversionEventLogId?: string;
  deliveryStatus?: string;
  queued?: boolean;
  reasonCode?: string;
};

/**
 * X2 production path (only when shadowMode=false AND capiSendEnabled=true):
 * 1. Upsert Lead by phoneHash (source=xmax)
 * 2. Reuse existing CTWA attribution (adId+ctwaClid) from the lead when present
 * 3. recordExternalConversion (QualifiedLead / Purchase)
 * 4. Enqueue CAPI only if deliveryStatus === ready_to_send
 *
 * Without prior CTWA on the lead, Meta CAPI stays pending_meta_context
 * (platform still requires adId+ctwaClid for business_messaging).
 */
@Injectable()
export class XmaxProductionService {
  private readonly logger = new Logger(XmaxProductionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LeadsService) private readonly leads: LeadsService,
    @Inject(ConversionEventsService)
    private readonly conversions: ConversionEventsService,
    @Inject(ConversionEventsQueueService)
    private readonly conversionQueue: ConversionEventsQueueService,
  ) {}

  isProductionEnabled(account: XmaxProductionAccount): boolean {
    return account.shadowMode === false && account.capiSendEnabled === true;
  }

  async emit(input: XmaxProductionInput): Promise<XmaxProductionResult> {
    if (!this.isProductionEnabled(input.account)) {
      return { attempted: false, reasonCode: "shadow_only" };
    }

    if (!input.phoneHash || !input.phoneNormalized) {
      return { attempted: true, reasonCode: "missing_phone" };
    }

    const existingLead = await this.prisma.lead.findUnique({
      where: {
        workspaceId_phoneHash: {
          workspaceId: input.account.workspaceId,
          phoneHash: input.phoneHash,
        },
      },
      select: {
        id: true,
        adId: true,
        adSetId: true,
        campaignId: true,
        ctwaClid: true,
      },
    });

    const lead = await this.leads.upsertFromWhatsappWebhook({
      workspaceId: input.account.workspaceId,
      name: input.contactName ?? undefined,
      phone: input.phoneNormalized,
      phoneHash: input.phoneHash,
      source: "xmax",
      preserveExistingSource: true,
      preserveEarliestFirstMessageAt: true,
      recordMessageTimestamps: false,
      campaignId: existingLead?.campaignId ?? undefined,
      adSetId: existingLead?.adSetId ?? undefined,
      adId: existingLead?.adId ?? undefined,
      ctwaClid: existingLead?.ctwaClid ?? undefined,
      occurredAt: new Date(),
    });

    if (!lead) {
      this.logger.warn("xmax_production_lead_failed");
      return { attempted: true, reasonCode: "lead_upsert_failed" };
    }

    const adId = existingLead?.adId ?? null;
    const adSetId = existingLead?.adSetId ?? null;
    const campaignId = existingLead?.campaignId ?? null;
    const ctwaClid = existingLead?.ctwaClid ?? null;
    const hasAttribution = Boolean(adId && ctwaClid);

    const valueCents =
      input.eventName === "Purchase"
        ? (input.account.purchaseValueCents ?? null)
        : null;
    const currency =
      input.eventName === "Purchase"
        ? input.account.purchaseCurrency || "BRL"
        : null;

    const dedupeKey = [
      "xmax",
      input.account.id,
      input.contactId,
      input.eventName,
    ].join(":");
    const eventId = createHash("sha256").update(dedupeKey).digest("hex");

    const conversion = await this.conversions.recordExternalConversion({
      workspaceId: input.account.workspaceId,
      externalConnectorId: null,
      sourceEventId: `${input.account.id}:${input.contactId}:${input.eventName}`,
      sourceTrigger: "xmax_tag",
      eventName: input.eventName,
      eventId,
      dedupeKey,
      leadId: lead.id,
      phoneHash: input.phoneHash,
      businessSource: hasAttribution ? "paid" : "organic",
      campaignId,
      adSetId,
      adId,
      ctwaClid,
      valueCents,
      valueSource:
        input.eventName === "Purchase" && valueCents != null
          ? "configured_average"
          : null,
      currency,
      eventOccurredAt: new Date(),
      sourcePayload: {
        provider: "xmax",
        accountId: input.account.id,
        contactId: input.contactId,
        tagIds: input.tagIds,
        hasAttribution,
      },
    });

    let queued = false;
    if (conversion.deliveryStatus === "ready_to_send") {
      await this.conversionQueue.enqueueSend(
        conversion.conversionEventLogId,
        input.account.workspaceId,
      );
      queued = true;
    }

    return {
      attempted: true,
      leadId: lead.id,
      conversionEventLogId: conversion.conversionEventLogId,
      deliveryStatus: conversion.deliveryStatus,
      queued,
      reasonCode: queued
        ? "production_queued"
        : `production_${conversion.deliveryStatus}`,
    };
  }
}
