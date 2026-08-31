import { Injectable, NotFoundException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type GuimoIntegration, type GuimoWebhookEvent } from "@prisma/client";
import type { GuimoIntegrationDto, GuimoIntegrationListDto, GuimoIntegrationProvisionResultDto, GuimoIntegrationRotateWebhookTokenResultDto } from "@wpptrack/shared";
import { hashNormalizedPhone, normalizePhoneIdentityWithCountry } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { GuimoAdapter, GuimoAdapterError } from "./guimo.adapter";
import { matchesGuimoStage, parseGuimoV1StageMovement } from "./guimo-webhook.parser";
import { GuimoWebhookQueueService } from "./guimo-webhook-queue.service";
import { GuimoWebhookRateLimitService } from "./guimo-webhook-rate-limit.service";
import { parseGuimoCrmHeaders } from "./guimo.schema";

type Headers = Record<string, string>;
type ConfigureInput = { qualifiedStageId?: string; qualifiedStageName?: string; purchaseStageId?: string; purchaseStageName?: string; purchaseCurrency?: string; purchaseValueUnit?: "major" | "cents"; crmHeaders?: Headers };
type GuimoIntegrationSafeRecord = Pick<GuimoIntegration, "id" | "status" | "webhookVersion" | "qualifiedStageId" | "qualifiedStageName" | "purchaseStageId" | "purchaseStageName" | "purchaseCurrency" | "purchaseValueUnit" | "crmHeadersEncrypted" | "crmHeadersIv" | "crmHeadersTag" | "createdAt" | "updatedAt">;

@Injectable()
export class GuimoService {
  constructor(private readonly prisma: PrismaService, private readonly queue: GuimoWebhookQueueService, private readonly conversionQueue: ConversionEventsQueueService, private readonly adapter: GuimoAdapter, private readonly conversions: ConversionEventsService, private readonly rateLimit: GuimoWebhookRateLimitService) {}

  async list(workspaceId: string): Promise<GuimoIntegrationListDto> {
    const integrations = await this.prisma.guimoIntegration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, webhookVersion: true, qualifiedStageId: true, qualifiedStageName: true, purchaseStageId: true, purchaseStageName: true, purchaseCurrency: true, purchaseValueUnit: true, crmHeadersEncrypted: true, crmHeadersIv: true, crmHeadersTag: true, createdAt: true, updatedAt: true },
    });
    return integrations.map((integration) => this.toDto(integration));
  }

  async provision(workspaceId: string, actorUserId: string, input: ConfigureInput): Promise<GuimoIntegrationProvisionResultDto> {
    const token = randomBytes(32).toString("base64url");
    const crmHeaders = parseGuimoCrmHeaders(input.crmHeaders);
    const encrypted = crmHeaders && this.key() ? this.encryptHeaders(crmHeaders) : null;
    const stagesValid = this.hasStage(input.qualifiedStageId, input.qualifiedStageName) || this.hasStage(input.purchaseStageId, input.purchaseStageName);
    const status = stagesValid && encrypted ? "active" : "blocked";
    const integration = await this.prisma.guimoIntegration.create({ data: { workspaceId, status, webhookSecretHash: this.hash(token), qualifiedStageId: this.clean(input.qualifiedStageId), qualifiedStageName: this.clean(input.qualifiedStageName), purchaseStageId: this.clean(input.purchaseStageId), purchaseStageName: this.clean(input.purchaseStageName), purchaseCurrency: this.clean(input.purchaseCurrency), purchaseValueUnit: input.purchaseValueUnit ?? null, ...(encrypted ?? {}) } });
    await this.prisma.auditLog.create({ data: { workspaceId, actorUserId, actorType: "user", action: "guimo.integration_provisioned", targetType: "GuimoIntegration", targetId: integration.id, resultStatus: status === "active" ? "success" : "blocked", afterSummary: { status, hasCrmHeaders: Boolean(encrypted), qualifiedConfigured: this.hasStage(input.qualifiedStageId, input.qualifiedStageName), purchaseConfigured: this.hasStage(input.purchaseStageId, input.purchaseStageName), purchaseValueUnit: input.purchaseValueUnit ?? null } } });
    return { id: integration.id, status: status as "active" | "blocked", webhookVersion: integration.webhookVersion, webhookToken: token, ...this.webhookLocation(integration.id) };
  }

  async rotateWebhookToken(workspaceId: string, integrationId: string, actorUserId: string): Promise<GuimoIntegrationRotateWebhookTokenResultDto> {
    const current = await this.prisma.guimoIntegration.findFirst({ where: { id: integrationId, workspaceId } });
    if (!current) throw new NotFoundException("Integracao Guimo nao encontrada");
    const webhookToken = randomBytes(32).toString("base64url");
    const integration = await this.prisma.guimoIntegration.update({ where: { id: current.id }, data: { webhookSecretHash: this.hash(webhookToken) } });
    await this.prisma.auditLog.create({ data: { workspaceId, actorUserId, actorType: "user", action: "guimo.webhook_token_rotated", targetType: "GuimoIntegration", targetId: integration.id, resultStatus: "success", afterSummary: { status: integration.status, webhookTokenRotated: true } } });
    return { id: integration.id, status: integration.status as "active" | "blocked", webhookVersion: integration.webhookVersion, webhookToken, ...this.webhookLocation(integration.id) };
  }

  async receive(integrationId: string, token: unknown, body: unknown) {
    const integration = await this.prisma.guimoIntegration.findUnique({ where: { id: integrationId } });
    if (!integration) throw new NotFoundException("Webhook nao encontrado");
    await this.rateLimit.assertAllowed(integration);
    if (!this.matchesToken(token, integration.webhookSecretHash)) {
      await this.rateLimit.recordBadToken(integration);
      throw new NotFoundException("Webhook nao encontrado");
    }
    const movement = parseGuimoV1StageMovement(body);
    if (!movement) return this.recordDiscard(integration, "invalid_payload");
    // Guimo v1 has no native movement id. This is intentionally scoped to the
    // integration, but cannot distinguish a legitimate later same-stage re-entry.
    const dedupeKey = ["guimo", integration.workspaceId, integration.id, movement.negotiationId, movement.contactId, movement.newStage.id].join(":");
    let event: GuimoWebhookEvent;
    try {
      event = await this.prisma.guimoWebhookEvent.create({ data: { workspaceId: integration.workspaceId, integrationId: integration.id, dedupeKey, negotiationId: movement.negotiationId, contactId: movement.contactId, stageId: movement.newStage.id, stageName: movement.newStage.name, previousStageId: movement.previousStage?.id, previousStageName: movement.previousStage?.name } });
    } catch (error) {
      if (this.unique(error)) return this.recoverDuplicate(integration, dedupeKey, movement.newStage.id, movement.negotiationId, movement.contactId);
      throw error;
    }
    await this.enqueueDurably(event, integration, "accepted", movement.newStage.id);
    return { status: "accepted" as const };
  }

  async process(eventId: string, workspaceId: string) {
    const event = await this.prisma.guimoWebhookEvent.findFirst({ where: { id: eventId, workspaceId }, include: { integration: true } });
    if (!event) throw new NotFoundException("Evento Guimo nao encontrado");
    const integration = event.integration;
    if (integration.status !== "active") return this.complete(event, "blocked", "integration_blocked");
    const eventType = this.resolveEventType(integration, event);
    if (!eventType) return this.complete(event, "ignored", "stage_not_configured");
    const headers = this.decryptHeaders(integration);
    if (!headers) return this.complete(event, "blocked", "crm_credentials_not_configured");
    try {
      const contact = await this.adapter.getContact(event.contactId, headers);
      const normalizedPhone = normalizePhoneIdentityWithCountry(contact.phone);
      const phoneHash = hashNormalizedPhone(normalizedPhone);
      if (!phoneHash) return this.complete(event, "blocked", "contact_phone_missing_or_invalid");
      const lead = await this.prisma.lead.findFirst({ where: { workspaceId, phoneHash } });
      if (!lead) return this.complete(event, "blocked", "workspace_lead_not_found");
      let valueCents: number | null = null; let currency: string | null = null;
      if (eventType === "Purchase") {
        const negotiation = await this.adapter.getNegotiation(event.negotiationId, headers);
        if (!(negotiation.value && negotiation.value > 0)) return this.complete(event, "blocked", "purchase_value_not_positive");
        if (!integration.purchaseCurrency || !integration.purchaseValueUnit) return this.complete(event, "blocked", "purchase_currency_or_unit_not_configured");
        valueCents = integration.purchaseValueUnit === "major" ? Math.round(negotiation.value * 100) : Math.round(negotiation.value);
        if (!Number.isSafeInteger(valueCents) || valueCents <= 0) return this.complete(event, "blocked", "purchase_value_invalid");
        currency = integration.purchaseCurrency;
      }
      const conversion = await this.conversions.recordExternalConversion({ workspaceId, sourceEventId: event.id, sourceTrigger: "guimo_stage", eventName: eventType, eventId: event.dedupeKey, dedupeKey: `${event.dedupeKey}:${eventType}`, leadId: lead.id, phoneHash, businessSource: "paid", campaignId: lead.campaignId, adSetId: lead.adSetId, adId: lead.adId, ctwaClid: lead.ctwaClid, valueCents, valueSource: valueCents == null ? null : "actual", currency, eventOccurredAt: event.createdAt, sourcePayload: { provider: "guimo", stageId: event.stageId, negotiationId: event.negotiationId, contactId: event.contactId } });
      if (conversion.deliveryStatus === "ready_to_send") await this.queueConversion(conversion.conversionEventLogId, workspaceId);
      return this.complete(event, "processed", null, eventType);
    } catch (error) {
      const code = error instanceof GuimoAdapterError ? error.code : "processing_failed";
      await this.integrationFailure(event, code);
      throw error;
    }
  }
  private async queueConversion(id: string, workspaceId: string) { await this.conversionQueue.enqueueSend(id, workspaceId); }
  private async recoverDuplicate(integration: GuimoIntegration, dedupeKey: string, stageId: string, negotiationId: string, contactId: string) {
    const event = await this.prisma.guimoWebhookEvent.findUnique({ where: { dedupeKey } });
    if (!event || event.integrationId !== integration.id) throw new Error("Guimo dedupe recovery failed");
    if (event.status === "processed" || (event.status === "queued" && event.jobId)) return { status: "duplicate" as const };
    await this.enqueueDurably(event, integration, "recovered", stageId, negotiationId, contactId);
    return { status: "accepted" as const };
  }
  private async enqueueDurably(event: GuimoWebhookEvent, integration: GuimoIntegration, logStatus: "accepted" | "recovered", stageId: string, negotiationId?: string, contactId?: string) {
    let jobId: string;
    try {
      jobId = await this.queue.enqueue(event.id, integration.workspaceId);
      await this.prisma.guimoWebhookEvent.update({ where: { id: event.id }, data: { jobId, status: "queued", errorCode: null } });
    } catch (error) {
      await this.prisma.guimoWebhookEvent.update({ where: { id: event.id }, data: { status: "failed", errorCode: "enqueue_failed", jobId: null } });
      await this.logWebhook(integration.workspaceId, event.dedupeKey, "failed", { stageId, errorCode: "enqueue_failed" });
      throw error;
    }
    await this.logWebhook(integration.workspaceId, event.dedupeKey, logStatus, { stageId, negotiationId, contactId, jobId });
  }
  private resolveEventType(i: GuimoIntegration, e: GuimoWebhookEvent): "QualifiedLead" | "Purchase" | null { const received = { id: e.stageId, name: e.stageName }; const previous = e.previousStageId && e.previousStageName ? { id: e.previousStageId, name: e.previousStageName } : null; if (matchesGuimoStage({ id: i.qualifiedStageId, name: i.qualifiedStageName }, received, previous)) return "QualifiedLead"; if (matchesGuimoStage({ id: i.purchaseStageId, name: i.purchaseStageName }, received, previous)) return "Purchase"; return null; }
  private async complete(event: GuimoWebhookEvent, status: string, errorCode: string | null, eventType?: string) { await this.prisma.guimoWebhookEvent.update({ where: { id: event.id }, data: { status, errorCode, eventType: eventType ?? null, processedAt: new Date() } }); await this.logWebhook(event.workspaceId, event.dedupeKey, status, { stageId: event.stageId, eventType: eventType ?? null, errorCode }); return { status, errorCode }; }
  private async recordDiscard(i: GuimoIntegration, errorCode: string) { await this.logWebhook(i.workspaceId, null, "discarded", { errorCode }); return { status: "discarded" as const }; }
  private async logWebhook(workspaceId: string, _key: string | null, status: string, summary: Record<string, unknown>) { await this.prisma.webhookLog.create({ data: { workspaceId, source: "guimo", eventType: "guimo.stage_movement", status, summaryPayload: summary as Prisma.InputJsonValue } }); }
  private async integrationFailure(event: GuimoWebhookEvent, code: string) { const log = await this.prisma.integrationLog.create({ data: { workspaceId: event.workspaceId, source: "guimo", operation: "guimo.crm_enrichment", status: "failed", providerErrorCode: code, requestSummary: { eventId: event.id }, responseSummary: { redacted: true } } }); await this.prisma.guimoWebhookEvent.update({ where: { id: event.id }, data: { status: "failed", errorCode: code } }); await this.prisma.diagnosticEvent.create({ data: { workspaceId: event.workspaceId, source: "guimo", eventType: "guimo.crm_enrichment_failed", severity: "error", status: "failed", title: "Falha ao enriquecer evento Guimo", message: "A integracao Guimo falhou sem registrar dados sensiveis.", errorCode: code, integrationLogId: log.id, summaryPayload: { eventId: event.id, redacted: true } } }); }
  private hasStage(id?: string, name?: string) { return Boolean(this.clean(id) || this.clean(name)); } private clean(v?: string) { return v?.trim() || null; } private hash(v: string) { return createHash("sha256").update(v).digest("hex"); } private matchesToken(token: unknown, hash: string) { if (typeof token !== "string" || !token) return false; const a = Buffer.from(this.hash(token)); const b = Buffer.from(hash); return a.length === b.length && timingSafeEqual(a, b); } private unique(e: unknown) { return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"; }
  private toDto(integration: GuimoIntegrationSafeRecord): GuimoIntegrationDto { return { id: integration.id, status: integration.status as "active" | "blocked", webhookVersion: integration.webhookVersion, qualifiedStageId: integration.qualifiedStageId, qualifiedStageName: integration.qualifiedStageName, purchaseStageId: integration.purchaseStageId, purchaseStageName: integration.purchaseStageName, purchaseCurrency: integration.purchaseCurrency, purchaseValueUnit: integration.purchaseValueUnit as "major" | "cents" | null, hasCrmHeaders: Boolean(integration.crmHeadersEncrypted && integration.crmHeadersIv && integration.crmHeadersTag), createdAt: integration.createdAt.toISOString(), updatedAt: integration.updatedAt.toISOString() }; }
  private webhookLocation(integrationId: string) { const webhookPath = `/webhooks/guimo/v1/${encodeURIComponent(integrationId)}`; const apiPublicUrl = process.env.API_PUBLIC_URL?.trim(); if (!apiPublicUrl) return { webhookPath, webhookUrl: null }; try { return { webhookPath, webhookUrl: new URL(webhookPath, apiPublicUrl).toString() }; } catch { return { webhookPath, webhookUrl: null }; } }
  private key(): Buffer | null { const value = process.env.GUIMO_CRM_ENCRYPTION_KEY?.trim(); if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null; const key = Buffer.from(value, "base64"); return key.length === 32 && key.toString("base64") === value ? key : null; }
  private encryptHeaders(headers: Headers) { const key = this.key(); if (!key) throw new Error("Guimo CRM encryption key is invalid"); const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(this.headersAad()); const encrypted = Buffer.concat([cipher.update(JSON.stringify(headers), "utf8"), cipher.final()]); return { crmHeadersEncrypted: encrypted.toString("base64"), crmHeadersIv: iv.toString("base64"), crmHeadersTag: cipher.getAuthTag().toString("base64") }; }
  private decryptHeaders(i: GuimoIntegration): Headers | null { const key = this.key(); if (!i.crmHeadersEncrypted || !i.crmHeadersIv || !i.crmHeadersTag || !key) return null; try { const decipher = createDecipheriv("aes-256-gcm", key, this.base64(i.crmHeadersIv, 12)); decipher.setAAD(this.headersAad()); decipher.setAuthTag(this.base64(i.crmHeadersTag, 16)); const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(this.base64(i.crmHeadersEncrypted)), decipher.final()]).toString("utf8")); return parseGuimoCrmHeaders(parsed); } catch { return null; } }
  private headersAad() { return Buffer.from("wpptrack:guimo-crm-headers:v1", "utf8"); }
  private base64(value: string, length?: number) { const decoded = Buffer.from(value, "base64"); if (decoded.toString("base64") !== value || (length !== undefined && decoded.length !== length)) throw new Error("Invalid Guimo encrypted header material"); return decoded; }
}
