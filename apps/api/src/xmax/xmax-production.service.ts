import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
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

export type XmaxPaidLead = {
  id: string;
  adId: string;
  adSetId: string | null;
  campaignId: string | null;
  ctwaClid: string;
};

export type XmaxPaidLeadLookup =
  | { ok: true; lead: XmaxPaidLead }
  | { ok: false; reasonCode: "no_paid_lead" | "lead_missing_attribution" };

/**
 * X2 production path (only when shadowMode=false AND capiSendEnabled=true):
 * Paid-only gate (C2):
 * 1. Require an **existing** lead in the workspace with adId + ctwaClid
 * 2. Never create/upsert leads from XMAX tags (no organic / pre-system ghosts)
 * 3. recordExternalConversion with reused CTWA attribution
 * 4. Enqueue CAPI only if deliveryStatus === ready_to_send
 */
@Injectable()
export class XmaxProductionService {
  private readonly logger = new Logger(XmaxProductionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConversionEventsService)
    private readonly conversions: ConversionEventsService,
    @Inject(ConversionEventsQueueService)
    private readonly conversionQueue: ConversionEventsQueueService,
  ) {}

  isProductionEnabled(account: XmaxProductionAccount): boolean {
    return account.shadowMode === false && account.capiSendEnabled === true;
  }

  /**
   * Shared precheck for ingest (before semantic dedup) and emit.
   * Requires both adId and ctwaClid — platform CAPI cannot send without them.
   */
  async findPaidLead(
    workspaceId: string,
    phoneHash: string,
  ): Promise<XmaxPaidLeadLookup> {
    if (!phoneHash) {
      return { ok: false, reasonCode: "no_paid_lead" };
    }

    const existingLead = await this.prisma.lead.findUnique({
      where: {
        workspaceId_phoneHash: {
          workspaceId,
          phoneHash,
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

    if (!existingLead) {
      return { ok: false, reasonCode: "no_paid_lead" };
    }

    const adId = existingLead.adId?.trim() || null;
    const ctwaClid = existingLead.ctwaClid?.trim() || null;
    if (!adId || !ctwaClid) {
      return { ok: false, reasonCode: "lead_missing_attribution" };
    }

    return {
      ok: true,
      lead: {
        id: existingLead.id,
        adId,
        adSetId: existingLead.adSetId ?? null,
        campaignId: existingLead.campaignId ?? null,
        ctwaClid,
      },
    };
  }

  async emit(input: XmaxProductionInput): Promise<XmaxProductionResult> {
    if (!this.isProductionEnabled(input.account)) {
      return { attempted: false, reasonCode: "shadow_only" };
    }

    if (!input.phoneHash || !input.phoneNormalized) {
      return { attempted: true, reasonCode: "missing_phone" };
    }

    const paid = await this.findPaidLead(
      input.account.workspaceId,
      input.phoneHash,
    );
    if (!paid.ok) {
      return { attempted: true, reasonCode: paid.reasonCode };
    }

    const lead = paid.lead;
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
      businessSource: "paid",
      campaignId: lead.campaignId,
      adSetId: lead.adSetId,
      adId: lead.adId,
      ctwaClid: lead.ctwaClid,
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
        hasAttribution: true,
        paidOnlyGate: true,
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
