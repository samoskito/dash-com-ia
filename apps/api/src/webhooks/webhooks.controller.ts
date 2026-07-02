import { createHash } from "node:crypto";
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import type { DiagnosticSourceDto } from "@wpptrack/shared";
import { BillingService } from "../billing/billing.service";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { ConversionRulesService } from "../conversion-rules/conversion-rules.service";
import { DiagnosticsService } from "../diagnostics/diagnostics.service";
import { LeadsService } from "../leads/leads.service";

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
    private readonly leadsService: LeadsService
  ) {}

  @Post("uazapi")
  @HttpCode(202)
  recordUazapi(
    @Body() body: WebhookBody,
    @Headers("x-workspace-id") workspaceId?: string
  ) {
    return this.recordUazapiWebhook(body, workspaceId);
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

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async recordUazapiWebhook(body: WebhookBody, workspaceId?: string) {
    const diagnostic = await this.record("uazapi", body, workspaceId);

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

    if (!workspaceId) {
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
      messageText: this.getMessageText(body),
      labels: this.getLabels(body)
    };
    const rules = await this.conversionRulesService.evaluateTriggers(
      workspaceId,
      triggerInput
    );
    const lead = await this.leadsService.upsertFromWhatsappWebhook({
      workspaceId,
      whatsappInstanceId: this.firstString(body.whatsappInstanceId),
      name: this.getContactName(body),
      phone: this.getPhone(body),
      phoneHash: this.firstString(body.phoneHash),
      source: "uazapi",
      campaignId: this.firstString(body.campaignId),
      adSetId: this.firstString(body.adSetId),
      adId: this.firstString(body.adId),
      occurredAt: new Date()
    });
    const conversion = await this.conversionEventsService.recordRuleMatches({
      workspaceId,
      rules,
      leadId: lead?.id ?? this.firstString(body.leadId),
      phoneHash: this.firstString(body.phoneHash),
      campaignId: this.firstString(body.campaignId),
      adSetId: this.firstString(body.adSetId),
      adId: this.firstString(body.adId)
    });
    const queued = await Promise.all(
      conversion.created.map((logId) =>
        this.conversionEventsQueueService.enqueueSend(logId)
      )
    );

    return {
      ...diagnostic,
      conversion: {
        ...conversion,
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

  private getMessageText(body: WebhookBody): string | undefined {
    const message = body.message;

    if (typeof message === "string") {
      return this.firstString(message);
    }

    if (message && typeof message === "object" && !Array.isArray(message)) {
      const messageObject = message as Record<string, unknown>;
      return (
        this.firstString(messageObject.text) ??
        this.firstString(messageObject.body) ??
        this.firstString(messageObject.message) ??
        this.firstString(messageObject.conversation)
      );
    }

    return (
      this.firstString(body.text) ??
      this.firstString(body.body) ??
      this.firstString(body.messageText)
    );
  }

  private getLabels(body: WebhookBody): string[] {
    const rawLabels =
      body.labels ??
      (body.chat &&
      typeof body.chat === "object" &&
      !Array.isArray(body.chat)
        ? (body.chat as Record<string, unknown>).labels
        : undefined) ??
      body.label;

    if (!rawLabels) {
      return [];
    }

    const list = Array.isArray(rawLabels) ? rawLabels : [rawLabels];

    return list
      .map((label) => this.labelToString(label))
      .filter((label): label is string => Boolean(label));
  }

  private getPhone(body: WebhookBody): string | undefined {
    const contact = body.contact;
    const chat = body.chat;

    return (
      this.firstString(body.phone) ??
      this.firstString(body.from) ??
      this.firstString(body.sender) ??
      (contact && typeof contact === "object" && !Array.isArray(contact)
        ? this.firstString((contact as Record<string, unknown>).phone)
        : undefined) ??
      (chat && typeof chat === "object" && !Array.isArray(chat)
        ? this.firstString((chat as Record<string, unknown>).phone)
        : undefined)
    );
  }

  private getContactName(body: WebhookBody): string | undefined {
    const contact = body.contact;

    return (
      this.firstString(body.name) ??
      this.firstString(body.contactName) ??
      this.firstString(body.pushName) ??
      (contact && typeof contact === "object" && !Array.isArray(contact)
        ? this.firstString((contact as Record<string, unknown>).name)
        : undefined)
    );
  }

  private labelToString(label: unknown): string | undefined {
    if (typeof label === "string") {
      return this.firstString(label);
    }

    if (label && typeof label === "object" && !Array.isArray(label)) {
      const labelObject = label as Record<string, unknown>;
      return (
        this.firstString(labelObject.name) ??
        this.firstString(labelObject.title) ??
        this.firstString(labelObject.label)
      );
    }

    return undefined;
  }
}
