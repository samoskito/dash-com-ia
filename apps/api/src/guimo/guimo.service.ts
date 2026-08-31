import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type GuimoIntegration, type GuimoWebhookEvent } from "@prisma/client";
import type { ConversionEventNameDto, GuimoConversionRuleCreateInputDto, GuimoConversionRuleDto, GuimoConversionRuleUpdateInputDto, GuimoIntegrationDto, GuimoIntegrationListDto, GuimoIntegrationProvisionResultDto, GuimoIntegrationRotateWebhookTokenResultDto } from "@wpptrack/shared";
import { hashNormalizedPhone, normalizePhoneIdentityWithCountry } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { GuimoAdapter, GuimoAdapterError } from "./guimo.adapter";
import { matchesGuimoStage, parseGuimoV1StageMovement } from "./guimo-webhook.parser";
import { GuimoWebhookQueueService } from "./guimo-webhook-queue.service";
import { GuimoWebhookRateLimitService } from "./guimo-webhook-rate-limit.service";
import { parseGuimoCrmHeaders } from "./guimo.schema";

type GuimoStatus = "active" | "blocked" | "paused";

type Headers = Record<string, string>;
type ConfigureInput = { qualifiedStageId?: string | null; qualifiedStageName?: string | null; purchaseStageId?: string | null; purchaseStageName?: string | null; purchaseCurrency?: string | null; purchaseValueUnit?: "major" | "cents" | null; crmHeaders?: Headers };
type GuimoRule = { id: string; stageName: string; eventName: string; valueMode: string; fixedValueCents: number | null; active: boolean; createdAt: Date; updatedAt: Date };
type GuimoIntegrationSafeRecord = Pick<GuimoIntegration, "id" | "status" | "webhookVersion" | "qualifiedStageId" | "qualifiedStageName" | "purchaseStageId" | "purchaseStageName" | "purchaseCurrency" | "purchaseValueUnit" | "crmHeadersEncrypted" | "crmHeadersIv" | "crmHeadersTag" | "createdAt" | "updatedAt"> & { rules?: GuimoRule[] };

@Injectable()
export class GuimoService {
  constructor(private readonly prisma: PrismaService, private readonly queue: GuimoWebhookQueueService, private readonly conversionQueue: ConversionEventsQueueService, private readonly adapter: GuimoAdapter, private readonly conversions: ConversionEventsService, private readonly rateLimit: GuimoWebhookRateLimitService) {}

  async list(workspaceId: string): Promise<GuimoIntegrationListDto> {
    const integrations = await this.prisma.guimoIntegration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, webhookVersion: true, qualifiedStageId: true, qualifiedStageName: true, purchaseStageId: true, purchaseStageName: true, purchaseCurrency: true, purchaseValueUnit: true, crmHeadersEncrypted: true, crmHeadersIv: true, crmHeadersTag: true, createdAt: true, updatedAt: true, rules: { orderBy: { createdAt: "asc" } } },
    });
    return integrations.map((integration) => this.toDto(integration));
  }

  async createRule(workspaceId: string, integrationId: string, actorUserId: string, input: GuimoConversionRuleCreateInputDto): Promise<GuimoConversionRuleDto> {
    const integration = await this.prisma.guimoIntegration.findFirst({ where: { id: integrationId, workspaceId }, select: { id: true } });
    if (!integration) throw new NotFoundException("Integracao Guimo nao encontrada");
    const rule = await this.prisma.guimoConversionRule.create({ data: { workspaceId, integrationId: integration.id, stageName: input.stageName.trim(), eventName: input.eventName, valueMode: input.valueMode, fixedValueCents: input.valueMode === "fixed" ? input.fixedValueCents! : null, active: input.active ?? true } });
    await this.auditRule(workspaceId, actorUserId, "guimo.conversion_rule_created", rule.id, rule);
    return this.toRuleDto(rule);
  }

  async updateRule(workspaceId: string, integrationId: string, ruleId: string, actorUserId: string, input: GuimoConversionRuleUpdateInputDto): Promise<GuimoConversionRuleDto> {
    const current = await this.prisma.guimoConversionRule.findFirst({ where: { id: ruleId, integrationId, workspaceId } });
    if (!current) throw new NotFoundException("Regra de conversao Guimo nao encontrada");
    const valueMode = input.valueMode ?? (current.valueMode as "dynamic" | "fixed");
    const fixedValueCents = input.fixedValueCents !== undefined ? input.fixedValueCents : current.fixedValueCents;
    if ((valueMode === "fixed" && (!fixedValueCents || fixedValueCents <= 0)) || (valueMode === "dynamic" && fixedValueCents !== null)) throw new BadRequestException("Configuracao de valor invalida");
    const rule = await this.prisma.guimoConversionRule.update({ where: { id: current.id }, data: { stageName: input.stageName?.trim(), eventName: input.eventName, valueMode, fixedValueCents, active: input.active } });
    await this.auditRule(workspaceId, actorUserId, "guimo.conversion_rule_updated", rule.id, rule);
    return this.toRuleDto(rule);
  }

  async deleteRule(workspaceId: string, integrationId: string, ruleId: string, actorUserId: string) {
    const current = await this.prisma.guimoConversionRule.findFirst({ where: { id: ruleId, integrationId, workspaceId }, select: { id: true } });
    if (!current) throw new NotFoundException("Regra de conversao Guimo nao encontrada");
    await this.prisma.guimoConversionRule.delete({ where: { id: current.id } });
    await this.prisma.auditLog.create({ data: { workspaceId, actorUserId, actorType: "user", action: "guimo.conversion_rule_deleted", targetType: "GuimoConversionRule", targetId: current.id, resultStatus: "success" } });
    return { status: "deleted" as const };
  }

  async provision(workspaceId: string, actorUserId: string, input: ConfigureInput): Promise<GuimoIntegrationProvisionResultDto> {
    const token = randomBytes(32).toString("base64url");
    const crmHeaders = parseGuimoCrmHeaders(input.crmHeaders);
    const encrypted = crmHeaders && this.key() ? this.encryptHeaders(crmHeaders) : null;
    // URL-only contract: the webhook capability (this token, embedded in the
    // returned URL) is the only credential Guimo ever provides, so it alone
    // is enough to activate the integration. CRM headers are optional
    // enrichment; only block when the caller tried to supply them and they
    // could not be encrypted (misconfiguration or invalid headers) so that
    // failure isn't silently swallowed.
    const status = input.crmHeaders !== undefined && !encrypted ? "blocked" : "active";
    const integration = await this.prisma.guimoIntegration.create({ data: { workspaceId, status, webhookSecretHash: this.hash(token), qualifiedStageId: this.clean(input.qualifiedStageId), qualifiedStageName: this.clean(input.qualifiedStageName), purchaseStageId: this.clean(input.purchaseStageId), purchaseStageName: this.clean(input.purchaseStageName), purchaseCurrency: this.clean(input.purchaseCurrency), purchaseValueUnit: input.purchaseValueUnit ?? null, ...(encrypted ?? {}) } });
    await this.prisma.auditLog.create({ data: { workspaceId, actorUserId, actorType: "user", action: "guimo.integration_provisioned", targetType: "GuimoIntegration", targetId: integration.id, resultStatus: status === "active" ? "success" : "blocked", afterSummary: { status, hasCrmHeaders: Boolean(encrypted), qualifiedConfigured: this.hasStage(input.qualifiedStageId, input.qualifiedStageName), purchaseConfigured: this.hasStage(input.purchaseStageId, input.purchaseStageName), purchaseValueUnit: input.purchaseValueUnit ?? null } } });
    return { id: integration.id, status: status as "active" | "blocked", webhookVersion: integration.webhookVersion, ...this.webhookLocation(integration.id, token) };
  }

  async rotateWebhookToken(workspaceId: string, integrationId: string, actorUserId: string): Promise<GuimoIntegrationRotateWebhookTokenResultDto> {
    const current = await this.prisma.guimoIntegration.findFirst({ where: { id: integrationId, workspaceId } });
    if (!current) throw new NotFoundException("Integracao Guimo nao encontrada");
    const webhookToken = randomBytes(32).toString("base64url");
    const integration = await this.prisma.guimoIntegration.update({ where: { id: current.id }, data: { webhookSecretHash: this.hash(webhookToken) } });
    await this.prisma.auditLog.create({ data: { workspaceId, actorUserId, actorType: "user", action: "guimo.webhook_token_rotated", targetType: "GuimoIntegration", targetId: integration.id, resultStatus: "success", afterSummary: { status: integration.status, webhookTokenRotated: true } } });
    return { id: integration.id, status: integration.status as "active" | "blocked", webhookVersion: integration.webhookVersion, ...this.webhookLocation(integration.id, webhookToken) };
  }

  /**
   * Edits an existing integration's stage names/ids, purchase currency/unit and
   * (optionally) CRM credentials. Fields left out of `input` keep their current
   * value; a manually paused integration stays paused until `setActive(true)`.
   */
  async update(workspaceId: string, integrationId: string, actorUserId: string, input: ConfigureInput): Promise<GuimoIntegrationDto> {
    const current = await this.prisma.guimoIntegration.findFirst({ where: { id: integrationId, workspaceId } });
    if (!current) throw new NotFoundException("Integracao Guimo nao encontrada");
    const crmHeaders = input.crmHeaders !== undefined ? parseGuimoCrmHeaders(input.crmHeaders) : undefined;
    const encrypted = input.crmHeaders === undefined ? undefined : crmHeaders && this.key() ? this.encryptHeaders(crmHeaders) : { crmHeadersEncrypted: null, crmHeadersIv: null, crmHeadersTag: null };
    const qualifiedStageId = input.qualifiedStageId !== undefined ? this.clean(input.qualifiedStageId) : current.qualifiedStageId;
    const qualifiedStageName = input.qualifiedStageName !== undefined ? this.clean(input.qualifiedStageName) : current.qualifiedStageName;
    const purchaseStageId = input.purchaseStageId !== undefined ? this.clean(input.purchaseStageId) : current.purchaseStageId;
    const purchaseStageName = input.purchaseStageName !== undefined ? this.clean(input.purchaseStageName) : current.purchaseStageName;
    const purchaseCurrency = input.purchaseCurrency !== undefined ? this.clean(input.purchaseCurrency) : current.purchaseCurrency;
    const purchaseValueUnit = input.purchaseValueUnit !== undefined ? input.purchaseValueUnit : current.purchaseValueUnit;
    const hasCrmHeaders = encrypted !== undefined ? Boolean(encrypted.crmHeadersEncrypted) : this.hasUsableCrmCredentials(current);
    // URL-only contract: CRM headers are optional enrichment, not a
    // requirement to keep the webhook active. Only block when this call
    // itself tried to set CRM headers and they could not be encrypted;
    // editing unrelated fields (or never having had CRM headers) must not
    // downgrade an active integration.
    const status: GuimoStatus = current.status === "paused" ? "paused" : input.crmHeaders !== undefined && !hasCrmHeaders ? "blocked" : "active";
    const integration = await this.prisma.guimoIntegration.update({ where: { id: current.id }, data: { qualifiedStageId, qualifiedStageName, purchaseStageId, purchaseStageName, purchaseCurrency, purchaseValueUnit, status, ...(encrypted ?? {}) } });
    await this.prisma.auditLog.create({ data: { workspaceId, actorUserId, actorType: "user", action: "guimo.integration_updated", targetType: "GuimoIntegration", targetId: integration.id, resultStatus: "success", afterSummary: { status: integration.status, qualifiedConfigured: this.hasStage(qualifiedStageId ?? undefined, qualifiedStageName ?? undefined), purchaseConfigured: this.hasStage(purchaseStageId ?? undefined, purchaseStageName ?? undefined) } } });
    return this.toDto(integration);
  }

  /**
   * Manual pause/resume. Resuming never requires CRM credentials: the
   * webhook capability embedded in the URL is the only thing Guimo actually
   * authenticates with, so resuming always reactivates the integration.
   */
  async setActive(workspaceId: string, integrationId: string, actorUserId: string, active: boolean): Promise<GuimoIntegrationDto> {
    const current = await this.prisma.guimoIntegration.findFirst({ where: { id: integrationId, workspaceId } });
    if (!current) throw new NotFoundException("Integracao Guimo nao encontrada");
    const status: GuimoStatus = !active ? "paused" : "active";
    const integration = await this.prisma.guimoIntegration.update({ where: { id: current.id }, data: { status } });
    await this.prisma.auditLog.create({ data: { workspaceId, actorUserId, actorType: "user", action: active ? "guimo.integration_resumed" : "guimo.integration_paused", targetType: "GuimoIntegration", targetId: integration.id, resultStatus: "success", afterSummary: { status: integration.status } } });
    return this.toDto(integration);
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
    const event = await this.prisma.guimoWebhookEvent.findFirst({ where: { id: eventId, workspaceId }, include: { integration: { include: { rules: true } } } });
    if (!event) throw new NotFoundException("Evento Guimo nao encontrado");
    const integration = event.integration;
    if (integration.status !== "active") return this.complete(event, "blocked", "integration_blocked");
    const resolved = this.resolveRule(integration, event);
    if (!resolved) return this.complete(event, "ignored", "stage_not_configured");
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
      if (resolved.valueMode === "fixed") {
        valueCents = resolved.fixedValueCents;
        currency = integration.purchaseCurrency ?? "BRL";
      } else if (resolved.eventName === "Purchase") {
        const negotiation = await this.adapter.getNegotiation(event.negotiationId, headers);
        if (!(negotiation.value && negotiation.value > 0)) return this.complete(event, "blocked", "purchase_value_not_positive");
        if (!integration.purchaseCurrency || !integration.purchaseValueUnit) return this.complete(event, "blocked", "purchase_currency_or_unit_not_configured");
        valueCents = integration.purchaseValueUnit === "major" ? Math.round(negotiation.value * 100) : Math.round(negotiation.value);
        if (!Number.isSafeInteger(valueCents) || valueCents <= 0) return this.complete(event, "blocked", "purchase_value_invalid");
        currency = integration.purchaseCurrency;
      }
      const conversion = await this.conversions.recordExternalConversion({ workspaceId, sourceEventId: event.id, sourceTrigger: "guimo_stage", eventName: resolved.eventName as ConversionEventNameDto, eventId: event.dedupeKey, dedupeKey: `${event.dedupeKey}:${resolved.eventName}`, leadId: lead.id, phoneHash, businessSource: "paid", campaignId: lead.campaignId, adSetId: lead.adSetId, adId: lead.adId, ctwaClid: lead.ctwaClid, valueCents, valueSource: valueCents == null ? null : "actual", currency, eventOccurredAt: event.createdAt, sourcePayload: { provider: "guimo", stageId: event.stageId, negotiationId: event.negotiationId, contactId: event.contactId } });
      if (conversion.deliveryStatus === "ready_to_send") await this.queueConversion(conversion.conversionEventLogId, workspaceId);
      return this.complete(event, "processed", null, resolved.eventName);
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
  private resolveRule(i: GuimoIntegration & { rules?: GuimoRule[] }, e: GuimoWebhookEvent): { eventName: string; valueMode: "dynamic" | "fixed"; fixedValueCents: number | null } | null { const received = { id: e.stageId, name: e.stageName }; const previous = e.previousStageId && e.previousStageName ? { id: e.previousStageId, name: e.previousStageName } : null; if (i.rules?.length) { const rule = i.rules.find((candidate) => candidate.active && matchesGuimoStage({ name: candidate.stageName }, received, previous)); return rule ? { eventName: rule.eventName, valueMode: rule.valueMode as "dynamic" | "fixed", fixedValueCents: rule.fixedValueCents } : null; } if (matchesGuimoStage({ id: i.qualifiedStageId, name: i.qualifiedStageName }, received, previous)) return { eventName: "QualifiedLead", valueMode: "dynamic", fixedValueCents: null }; if (matchesGuimoStage({ id: i.purchaseStageId, name: i.purchaseStageName }, received, previous)) return { eventName: "Purchase", valueMode: "dynamic", fixedValueCents: null }; return null; }
  private async complete(event: GuimoWebhookEvent, status: string, errorCode: string | null, eventType?: string) { await this.prisma.guimoWebhookEvent.update({ where: { id: event.id }, data: { status, errorCode, eventType: eventType ?? null, processedAt: new Date() } }); await this.logWebhook(event.workspaceId, event.dedupeKey, status, { stageId: event.stageId, eventType: eventType ?? null, errorCode }); return { status, errorCode }; }
  private async recordDiscard(i: GuimoIntegration, errorCode: string) { await this.logWebhook(i.workspaceId, null, "discarded", { errorCode }); return { status: "discarded" as const }; }
  private async logWebhook(workspaceId: string, _key: string | null, status: string, summary: Record<string, unknown>) { await this.prisma.webhookLog.create({ data: { workspaceId, source: "guimo", eventType: "guimo.stage_movement", status, summaryPayload: summary as Prisma.InputJsonValue } }); }
  private async integrationFailure(event: GuimoWebhookEvent, code: string) { const log = await this.prisma.integrationLog.create({ data: { workspaceId: event.workspaceId, source: "guimo", operation: "guimo.crm_enrichment", status: "failed", providerErrorCode: code, requestSummary: { eventId: event.id }, responseSummary: { redacted: true } } }); await this.prisma.guimoWebhookEvent.update({ where: { id: event.id }, data: { status: "failed", errorCode: code } }); await this.prisma.diagnosticEvent.create({ data: { workspaceId: event.workspaceId, source: "guimo", eventType: "guimo.crm_enrichment_failed", severity: "error", status: "failed", title: "Falha ao enriquecer evento Guimo", message: "A integracao Guimo falhou sem registrar dados sensiveis.", errorCode: code, integrationLogId: log.id, summaryPayload: { eventId: event.id, redacted: true } } }); }
  private hasStage(id?: string | null, name?: string | null) { return Boolean(this.clean(id) || this.clean(name)); } private clean(v?: string | null) { return v?.trim() || null; } private hasUsableCrmCredentials(integration: Pick<GuimoIntegration, "crmHeadersEncrypted" | "crmHeadersIv" | "crmHeadersTag">) { return Boolean(this.key() && integration.crmHeadersEncrypted && integration.crmHeadersIv && integration.crmHeadersTag); } private hash(v: string) { return createHash("sha256").update(v).digest("hex"); } private matchesToken(token: unknown, hash: string) { if (typeof token !== "string" || !token) return false; const a = Buffer.from(this.hash(token)); const b = Buffer.from(hash); return a.length === b.length && timingSafeEqual(a, b); } private unique(e: unknown) { return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"; }
  private toDto(integration: GuimoIntegrationSafeRecord): GuimoIntegrationDto { return { id: integration.id, status: integration.status as GuimoStatus, webhookVersion: integration.webhookVersion, qualifiedStageId: integration.qualifiedStageId, qualifiedStageName: integration.qualifiedStageName, purchaseStageId: integration.purchaseStageId, purchaseStageName: integration.purchaseStageName, purchaseCurrency: integration.purchaseCurrency, purchaseValueUnit: integration.purchaseValueUnit as "major" | "cents" | null, hasCrmHeaders: Boolean(integration.crmHeadersEncrypted && integration.crmHeadersIv && integration.crmHeadersTag), rules: (integration.rules ?? []).map((rule) => this.toRuleDto(rule)), createdAt: integration.createdAt.toISOString(), updatedAt: integration.updatedAt.toISOString() }; }
  private toRuleDto(rule: GuimoRule): GuimoConversionRuleDto { return { id: rule.id, stageName: rule.stageName, eventName: rule.eventName as GuimoConversionRuleDto["eventName"], valueMode: rule.valueMode as "dynamic" | "fixed", fixedValueCents: rule.fixedValueCents, active: rule.active, createdAt: rule.createdAt.toISOString(), updatedAt: rule.updatedAt.toISOString() }; }
  private async auditRule(workspaceId: string, actorUserId: string, action: string, ruleId: string, rule: GuimoRule) { await this.prisma.auditLog.create({ data: { workspaceId, actorUserId, actorType: "user", action, targetType: "GuimoConversionRule", targetId: ruleId, resultStatus: "success", afterSummary: { stageName: rule.stageName, eventName: rule.eventName, valueMode: rule.valueMode, fixedValueCents: rule.fixedValueCents, active: rule.active } } }); }
  // Guimo cannot send a custom header, so the one-time token is the sole
  // credential and must travel inside the URL Guimo is configured with
  // (query string, matching the other URL-only inbound webhooks in this
  // codebase). `webhookPath` keeps a relative fallback for deployments
  // without API_PUBLIC_URL, but still embeds the token for local testing.
  private webhookLocation(integrationId: string, token: string) { const basePath = `/webhooks/guimo/v1/${encodeURIComponent(integrationId)}`; const webhookPath = `${basePath}?token=${encodeURIComponent(token)}`; const apiPublicUrl = process.env.API_PUBLIC_URL?.trim(); if (!apiPublicUrl) return { webhookPath, webhookUrl: null }; try { const url = new URL(basePath, apiPublicUrl); url.searchParams.set("token", token); return { webhookPath, webhookUrl: url.toString() }; } catch { return { webhookPath, webhookUrl: null }; } }
  private key(): Buffer | null { const value = process.env.GUIMO_CRM_ENCRYPTION_KEY?.trim(); if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null; const key = Buffer.from(value, "base64"); return key.length === 32 && key.toString("base64") === value ? key : null; }
  private encryptHeaders(headers: Headers) { const key = this.key(); if (!key) throw new Error("Guimo CRM encryption key is invalid"); const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(this.headersAad()); const encrypted = Buffer.concat([cipher.update(JSON.stringify(headers), "utf8"), cipher.final()]); return { crmHeadersEncrypted: encrypted.toString("base64"), crmHeadersIv: iv.toString("base64"), crmHeadersTag: cipher.getAuthTag().toString("base64") }; }
  private decryptHeaders(i: GuimoIntegration): Headers | null { const key = this.key(); if (!i.crmHeadersEncrypted || !i.crmHeadersIv || !i.crmHeadersTag || !key) return null; try { const decipher = createDecipheriv("aes-256-gcm", key, this.base64(i.crmHeadersIv, 12)); decipher.setAAD(this.headersAad()); decipher.setAuthTag(this.base64(i.crmHeadersTag, 16)); const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(this.base64(i.crmHeadersEncrypted)), decipher.final()]).toString("utf8")); return parseGuimoCrmHeaders(parsed); } catch { return null; } }
  private headersAad() { return Buffer.from("wpptrack:guimo-crm-headers:v1", "utf8"); }
  private base64(value: string, length?: number) { const decoded = Buffer.from(value, "base64"); if (decoded.toString("base64") !== value || (length !== undefined && decoded.length !== length)) throw new Error("Invalid Guimo encrypted header material"); return decoded; }
}
