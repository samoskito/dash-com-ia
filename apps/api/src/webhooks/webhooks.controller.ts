import { createHash } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UnauthorizedException
} from "@nestjs/common";
import type { DiagnosticSourceDto } from "@wpptrack/shared";
import { BillingService } from "../billing/billing.service";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { ConversionRulesService } from "../conversion-rules/conversion-rules.service";
import { DiagnosticsService } from "../diagnostics/diagnostics.service";
import { LeadsService } from "../leads/leads.service";
import { parseUazapiWebhook } from "./uazapi-webhook-parser";

type WebhookBody = Record<string, unknown>;

@Controller("webhooks")
export class WebhooksController {
  constructor(
    @Inject(DiagnosticsService)
    private readonly diagnosticsService: DiagnosticsService,
    @Inject(BillingService)
    private readonly billingService: BillingService,
    @Inject(ConversionRulesService)
    private readonly conversionRulesService: ConversionRulesService,
    @Inject(ConversionEventsService)
    private readonly conversionEventsService: ConversionEventsService,
    @Inject(ConversionEventsQueueService)
    private readonly conversionEventsQueueService: ConversionEventsQueueService,
    @Inject(LeadsService)
    private readonly leadsService: LeadsService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {}

  @Get("meta")
  verifyMetaWebhook(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") verifyToken?: string,
    @Query("hub.challenge") challenge?: string
  ) {
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

    if (
      !expectedToken ||
      mode !== "subscribe" ||
      verifyToken !== expectedToken ||
      !challenge
    ) {
      throw new UnauthorizedException("Meta webhook token invalido");
    }

    return challenge;
  }

  @Post("uazapi")
  @HttpCode(202)
  recordUazapi(
    @Body() body: WebhookBody,
    @Headers("x-workspace-id") workspaceId?: string,
    @Headers("x-wpptrack-webhook-token") webhookToken?: string,
    @Headers("authorization") authorization?: string,
    @Query("token") queryToken?: string
  ) {
    this.assertUazapiWebhookToken(
      webhookToken ?? this.getBearerToken(authorization) ?? queryToken
    );

    return this.recordUazapiWebhook(body, workspaceId);
  }

  @Post("uazapi/instances/:instanceId")
  @HttpCode(202)
  async recordUazapiInstance(
    @Param("instanceId") instanceId: string,
    @Body() body: WebhookBody,
    @Headers("x-wpptrack-webhook-token") webhookToken?: string,
    @Headers("authorization") authorization?: string,
    @Query("token") queryToken?: string
  ) {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: {
        id: instanceId,
        provider: "uazapi"
      },
      select: {
        id: true,
        workspaceId: true,
        webhookTokenHash: true
      }
    });
    const receivedToken =
      webhookToken ?? this.getBearerToken(authorization) ?? queryToken;

    if (
      !instance?.webhookTokenHash ||
      !receivedToken ||
      this.hashToken(receivedToken) !== instance.webhookTokenHash
    ) {
      throw new UnauthorizedException("Webhook Uazapi nao autorizado");
    }

    return this.recordUazapiWebhook(body, instance.workspaceId, instance.id);
  }

  @Post("asaas")
  @HttpCode(202)
  recordAsaas(
    @Body() body: WebhookBody,
    @Headers("asaas-access-token") asaasAccessToken?: string,
    @Headers("x-workspace-id") workspaceId?: string
  ) {
    this.assertAsaasWebhookToken(asaasAccessToken);

    return this.recordAsaasWebhook(body, workspaceId);
  }

  @Post("meta")
  @HttpCode(202)
  recordMeta(
    @Body() body: WebhookBody,
    @Headers("x-workspace-id") workspaceId?: string
  ) {
    return this.recordMetaWebhook(body, workspaceId);
  }

  private record(
    source: DiagnosticSourceDto,
    body: WebhookBody,
    workspaceId?: string
  ) {
    const eventType = this.getEventType(source, body);
    const externalEventId =
      this.firstString(body.id) ??
      this.firstString(body.eventId) ??
      this.firstString(body.externalEventId);

    return this.diagnosticsService.recordWebhookLog({
      workspaceId,
      source,
      eventType,
      externalEventId,
      idempotencyKey: externalEventId ? `${source}:${externalEventId}` : undefined,
      summaryPayload: body
    });
  }

  private async recordAsaasWebhook(body: WebhookBody, workspaceId?: string) {
    const diagnostic = await this.record("asaas", body, workspaceId);

    if (diagnostic.status === "duplicate") {
      return {
        ...diagnostic,
        billing: {
          processed: false,
          status: "ignored"
        }
      };
    }

    const billing = await this.billingService.processAsaasPaymentWebhook(body);

    return {
      ...diagnostic,
      billing
    };
  }

  private recordMetaWebhook(body: WebhookBody, workspaceId?: string) {
    const meta = this.getMetaWebhookMetadata(body);
    const externalEventId =
      meta.externalEventId ??
      this.firstString(body.id) ??
      this.firstString(body.eventId) ??
      this.firstString(body.externalEventId);

    return this.diagnosticsService.recordWebhookLog({
      workspaceId,
      source: "meta",
      eventType: meta.eventType,
      externalEventId,
      idempotencyKey: externalEventId ? `meta:${externalEventId}` : undefined,
      campaignId: meta.campaignId,
      adSetId: meta.adSetId,
      adId: meta.adId,
      summaryPayload: body
    });
  }

  private getMetaWebhookMetadata(body: WebhookBody): {
    eventType: string;
    externalEventId?: string;
    campaignId?: string;
    adSetId?: string;
    adId?: string;
  } {
    const change = this.getFirstMetaChange(body);
    const value = change?.value;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const valueObject = value as Record<string, unknown>;
      const field = this.firstString(change?.field);
      const isLeadgen =
        field === "leadgen" ||
        Boolean(this.firstString(valueObject.leadgen_id));

      if (isLeadgen) {
        return {
          eventType: "meta.leadgen",
          externalEventId:
            this.firstString(valueObject.leadgen_id) ??
            this.firstString(valueObject.id),
          campaignId:
            this.firstString(valueObject.campaign_id) ??
            this.firstString(valueObject.campaignId),
          adSetId:
            this.firstString(valueObject.adset_id) ??
            this.firstString(valueObject.ad_set_id) ??
            this.firstString(valueObject.adgroup_id) ??
            this.firstString(valueObject.adSetId),
          adId:
            this.firstString(valueObject.ad_id) ??
            this.firstString(valueObject.adId)
        };
      }
    }

    return {
      eventType:
        this.firstString(body.object) ??
        this.firstString(body.event) ??
        "meta.webhook"
    };
  }

  private getFirstMetaChange(body: WebhookBody): Record<string, unknown> | null {
    const entries = Array.isArray(body.entry) ? body.entry : [];

    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const changes = (entry as Record<string, unknown>).changes;

      if (!Array.isArray(changes)) {
        continue;
      }

      for (const change of changes) {
        if (change && typeof change === "object" && !Array.isArray(change)) {
          return change as Record<string, unknown>;
        }
      }
    }

    return null;
  }

  private assertAsaasWebhookToken(receivedToken?: string) {
    const expectedToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN;

    if (!expectedToken) {
      return;
    }

    if (
      !receivedToken ||
      this.hashToken(receivedToken) !== this.hashToken(expectedToken)
    ) {
      throw new UnauthorizedException("Webhook Asaas nao autorizado");
    }
  }

  private assertUazapiWebhookToken(receivedToken?: string) {
    const expectedToken = process.env.UAZAPI_WEBHOOK_AUTH_TOKEN;

    if (!expectedToken) {
      return;
    }

    if (
      !receivedToken ||
      this.hashToken(receivedToken) !== this.hashToken(expectedToken)
    ) {
      throw new UnauthorizedException("Webhook Uazapi nao autorizado");
    }
  }

  private getBearerToken(authorization?: string): string | undefined {
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    return this.firstString(authorization.slice("Bearer ".length));
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async recordUazapiWebhook(
    body: WebhookBody,
    workspaceId?: string,
    whatsappInstanceId?: string
  ) {
    const parsed = parseUazapiWebhook(body);
    const resolvedContext = await this.resolveUazapiContext(
      parsed.providerInstanceId
    );
    const resolvedWorkspaceId = workspaceId ?? resolvedContext?.workspaceId;
    const resolvedWhatsappInstanceId =
      whatsappInstanceId ??
      this.firstString(body.whatsappInstanceId) ??
      resolvedContext?.whatsappInstanceId;
    const diagnostic = await this.diagnosticsService.recordWebhookLog({
      workspaceId: resolvedWorkspaceId,
      source: "uazapi",
      eventType: parsed.eventType,
      externalEventId: parsed.externalEventId,
      idempotencyKey: parsed.externalEventId
        ? `uazapi:${parsed.externalEventId}`
        : undefined,
      leadId: parsed.leadId,
      phoneHash: parsed.phoneHash,
      campaignId: parsed.campaignId,
      adSetId: parsed.adSetId,
      adId: parsed.adId,
      summaryPayload: body
    });

    if (diagnostic.status === "duplicate") {
      return {
        ...diagnostic,
        conversion: {
          created: [],
          duplicates: [],
          queued: []
        }
      };
    }

    if (!resolvedWorkspaceId) {
      return {
        ...diagnostic,
        conversion: {
          created: [],
          duplicates: [],
          queued: []
        }
      };
    }

    const triggerInput = {
      messageText: parsed.messageText,
      labels: parsed.labels
    };
    const rules = await this.conversionRulesService.evaluateTriggers(
      resolvedWorkspaceId,
      triggerInput
    );
    const lead = await this.leadsService.upsertFromWhatsappWebhook({
      workspaceId: resolvedWorkspaceId,
      whatsappInstanceId: resolvedWhatsappInstanceId,
      name: parsed.contactName,
      phone: parsed.phone,
      phoneHash: parsed.phoneHash,
      source: "uazapi",
      labels: triggerInput.labels,
      campaignId: parsed.campaignId,
      adSetId: parsed.adSetId,
      adId: parsed.adId,
      ctwaClid: parsed.ctwaClid,
      ctwaSourceUrl: parsed.ctwaSourceUrl,
      occurredAt: new Date()
    });
    const automatic =
      await this.conversionEventsService.recordAutomaticLeadSubmitted({
        workspaceId: resolvedWorkspaceId,
        leadId: lead?.id ?? parsed.leadId,
        phoneHash: parsed.phoneHash,
        campaignId: parsed.campaignId,
        adSetId: parsed.adSetId,
        adId: parsed.adId,
        ctwaClid: parsed.ctwaClid
      });
    const conversion = await this.conversionEventsService.recordRuleMatches({
      workspaceId: resolvedWorkspaceId,
      rules,
      leadId: lead?.id ?? parsed.leadId,
      phoneHash: parsed.phoneHash,
      campaignId: parsed.campaignId,
      adSetId: parsed.adSetId,
      adId: parsed.adId,
      ctwaClid: parsed.ctwaClid
    });
    const readyLogIds = await this.conversionEventsService.listReadyLogIds([
      ...automatic.created,
      ...conversion.created
    ]);
    const queued = await Promise.all(
      readyLogIds.map((logId) =>
        this.conversionEventsQueueService.enqueueSend(logId)
      )
    );

    return {
      ...diagnostic,
      conversion: {
        ...conversion,
        automatic,
        queued
      }
    };
  }

  private getEventType(source: DiagnosticSourceDto, body: WebhookBody): string {
    if (source === "asaas") {
      return this.firstString(body.event) ?? "asaas.webhook";
    }

    if (source === "uazapi") {
      return this.firstString(body.event) ?? this.firstString(body.type) ?? "uazapi.webhook";
    }

    return this.firstString(body.object) ?? this.firstString(body.event) ?? "meta.webhook";
  }

  private firstString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private async resolveUazapiContext(
    providerInstanceId?: string
  ): Promise<{ workspaceId: string; whatsappInstanceId: string } | null> {
    if (!providerInstanceId) {
      return null;
    }

    const instance = await this.prisma.whatsappInstance.findFirst({
      where: {
        provider: "uazapi",
        providerInstanceId
      },
      select: {
        id: true,
        workspaceId: true
      }
    });

    return instance
      ? {
          workspaceId: instance.workspaceId,
          whatsappInstanceId: instance.id
        }
      : null;
  }
}
