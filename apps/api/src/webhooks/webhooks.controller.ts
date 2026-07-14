import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
  RawBody,
  UnauthorizedException
} from "@nestjs/common";
import { BillingService } from "../billing/billing.service";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { ConversionRulesService } from "../conversion-rules/conversion-rules.service";
import { DiagnosticsService } from "../diagnostics/diagnostics.service";
import { LeadsService } from "../leads/leads.service";
import { parseUazapiWebhook } from "./uazapi-webhook-parser";

type WebhookBody = Record<string, unknown>;

type VerifiedUazapiContext = {
  workspaceId: string;
  whatsappInstanceId: string;
  providerInstanceId: string | null;
};

type VerifiedMetaContext = {
  workspaceId: string;
  pageId: string;
};

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

    return this.recordUazapiWebhook(body, undefined, workspaceId);
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
        providerInstanceId: true,
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

    return this.recordUazapiWebhook(body, {
      workspaceId: instance.workspaceId,
      whatsappInstanceId: instance.id,
      providerInstanceId: instance.providerInstanceId
    });
  }

  @Post("asaas")
  @HttpCode(202)
  async recordAsaas(
    @Body() body: WebhookBody,
    @Headers("asaas-access-token") asaasAccessToken?: string,
    @Headers("x-workspace-id") workspaceId?: string
  ) {
    this.assertAsaasWebhookToken(asaasAccessToken);
    const context =
      await this.billingService.resolveAsaasPaymentWebhookContext(body);

    if (!context) {
      return {
        status: "ignored",
        billing: {
          processed: false,
          status: "ignored"
        }
      };
    }

    if (workspaceId && workspaceId !== context.workspaceId) {
      throw new UnauthorizedException("Webhook Asaas nao autorizado");
    }

    return this.recordAsaasWebhook(body, context);
  }

  @Post("meta")
  @HttpCode(202)
  async recordMeta(
    @Body() body: WebhookBody,
    @RawBody() rawBody: Buffer | undefined,
    @Headers("x-hub-signature-256") signature?: string,
    @Headers("x-workspace-id") workspaceId?: string
  ) {
    this.assertMetaWebhookSignature(rawBody, signature);
    const context = await this.resolveMetaContext(body);

    if (workspaceId && workspaceId !== context.workspaceId) {
      throw new UnauthorizedException("Webhook Meta nao autorizado");
  }

    return this.recordMetaWebhook(body, context);
  }

  private async recordAsaasWebhook(
    body: WebhookBody,
    context: { workspaceId: string; paymentId: string }
  ) {
    const eventType = this.firstString(body.event) ?? "asaas.webhook";
    const externalEventId =
      this.firstString(body.id) ??
      this.firstString(body.eventId) ??
      this.firstString(body.externalEventId);
    const diagnostic = await this.diagnosticsService.recordWebhookLog({
      workspaceId: context.workspaceId,
      source: "asaas",
      eventType,
      externalEventId,
      idempotencyKey: [
        "asaas",
        context.workspaceId,
        context.paymentId,
        externalEventId ?? eventType
      ].join(":"),
      summaryPayload: body
    });

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

  private recordMetaWebhook(body: WebhookBody, context: VerifiedMetaContext) {
    const meta = this.getMetaWebhookMetadata(body);
    const externalEventId =
      meta.externalEventId ??
      this.firstString(body.id) ??
      this.firstString(body.eventId) ??
      this.firstString(body.externalEventId);

    return this.diagnosticsService.recordWebhookLog({
      workspaceId: context.workspaceId,
      source: "meta",
      eventType: meta.eventType,
      externalEventId,
      idempotencyKey: externalEventId
        ? `meta:${context.workspaceId}:${context.pageId}:${externalEventId}`
        : undefined,
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

  private assertMetaWebhookSignature(
    rawBody: Buffer | undefined,
    signature: string | undefined
  ) {
    const appSecret = process.env.META_APP_SECRET;
    const signatureHex = signature?.startsWith("sha256=")
      ? signature.slice("sha256=".length)
      : undefined;

    if (
      !appSecret ||
      !rawBody ||
      !signatureHex ||
      !/^[a-f0-9]{64}$/i.test(signatureHex)
    ) {
      throw new UnauthorizedException("Webhook Meta nao autorizado");
    }

    const expectedSignature = createHmac("sha256", appSecret)
      .update(rawBody)
      .digest();
    const receivedSignature = Buffer.from(signatureHex, "hex");

    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      throw new UnauthorizedException("Webhook Meta nao autorizado");
    }
  }

  private async resolveMetaContext(
    body: WebhookBody
  ): Promise<VerifiedMetaContext> {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    const pageIds = Array.from(
      new Set(
        entries
          .map((entry) => this.firstString(this.recordValue(entry)?.id))
          .filter((pageId): pageId is string => Boolean(pageId))
      )
    );

    if (pageIds.length !== 1) {
      throw new UnauthorizedException("Webhook Meta nao autorizado");
    }

    const destinations = await this.prisma.metaConversionDestination.findMany({
      where: {
        pageId: pageIds[0]
      },
      select: {
        workspaceId: true
      },
      take: 2
    });

    if (destinations.length !== 1) {
      throw new UnauthorizedException("Webhook Meta nao autorizado");
    }

    return {
      workspaceId: destinations[0].workspaceId,
      pageId: pageIds[0]
    };
  }

  private assertAsaasWebhookToken(receivedToken?: string) {
    const expectedToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN;

    if (
      !expectedToken ||
      !receivedToken ||
      this.hashToken(receivedToken) !== this.hashToken(expectedToken)
    ) {
      throw new UnauthorizedException("Webhook Asaas nao autorizado");
    }
  }

  private assertUazapiWebhookToken(receivedToken?: string) {
    const expectedToken = process.env.UAZAPI_WEBHOOK_AUTH_TOKEN;

    if (
      !expectedToken ||
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
    verifiedContext?: VerifiedUazapiContext,
    claimedWorkspaceId?: string
  ) {
    const parsed = parseUazapiWebhook(body);
    const resolvedContext =
      verifiedContext ??
      (await this.resolveUazapiContext(parsed.providerInstanceId));

    if (!resolvedContext) {
      throw new UnauthorizedException("Webhook Uazapi nao autorizado");
    }

    this.assertUazapiContextMatches(
      body,
      parsed.providerInstanceId,
      claimedWorkspaceId,
      resolvedContext
    );

    const diagnostic = await this.diagnosticsService.recordWebhookLog({
      workspaceId: resolvedContext.workspaceId,
      source: "uazapi",
      eventType: parsed.eventType,
      externalEventId: parsed.externalEventId,
      idempotencyKey: parsed.externalEventId
        ? [
            "uazapi",
            resolvedContext.workspaceId,
            resolvedContext.whatsappInstanceId,
            parsed.externalEventId
          ].join(":")
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

    const triggerInput = {
      messageText: parsed.messageText,
      labels: parsed.labels
    };
    const rules = await this.conversionRulesService.evaluateTriggers(
      resolvedContext.workspaceId,
      triggerInput
    );
    const lead = await this.leadsService.upsertFromWhatsappWebhook({
      workspaceId: resolvedContext.workspaceId,
      whatsappInstanceId: resolvedContext.whatsappInstanceId,
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
        workspaceId: resolvedContext.workspaceId,
        leadId: lead?.id ?? parsed.leadId,
        phoneHash: parsed.phoneHash,
        campaignId: parsed.campaignId,
        adSetId: parsed.adSetId,
        adId: parsed.adId,
        ctwaClid: parsed.ctwaClid
      });
    const conversion = await this.conversionEventsService.recordRuleMatches({
      workspaceId: resolvedContext.workspaceId,
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
        this.conversionEventsQueueService.enqueueSend(
          logId,
          resolvedContext.workspaceId
        )
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

  private firstString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private recordValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private assertUazapiContextMatches(
    body: WebhookBody,
    providerInstanceId: string | undefined,
    claimedWorkspaceId: string | undefined,
    context: VerifiedUazapiContext
  ) {
    const workspace = this.recordValue(body.workspace);
    const claimedWorkspaceIds = [
      claimedWorkspaceId,
      this.firstString(body.workspaceId),
      this.firstString(body.workspace_id),
      this.firstString(workspace?.id),
      this.firstString(workspace?.workspaceId)
    ].filter((value): value is string => Boolean(value));
    const claimedLocalInstanceIds = [
      this.firstString(body.whatsappInstanceId),
      this.firstString(body.whatsapp_instance_id)
    ].filter((value): value is string => Boolean(value));

    if (
      claimedWorkspaceIds.some(
        (workspaceId) => workspaceId !== context.workspaceId
      ) ||
      claimedLocalInstanceIds.some(
        (instanceId) => instanceId !== context.whatsappInstanceId
      ) ||
      (providerInstanceId && providerInstanceId !== context.providerInstanceId)
    ) {
      throw new UnauthorizedException("Webhook Uazapi nao autorizado");
    }
  }

  private async resolveUazapiContext(
    providerInstanceId?: string
  ): Promise<VerifiedUazapiContext | null> {
    if (!providerInstanceId) {
      return null;
    }

    const instances = await this.prisma.whatsappInstance.findMany({
      where: {
        provider: "uazapi",
        providerInstanceId
      },
      select: {
        id: true,
        workspaceId: true,
        providerInstanceId: true
      },
      take: 2
    });

    return instances.length === 1
      ? {
          workspaceId: instances[0].workspaceId,
          whatsappInstanceId: instances[0].id,
          providerInstanceId: instances[0].providerInstanceId
        }
      : null;
  }
}
