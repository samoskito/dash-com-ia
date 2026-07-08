import { createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { BillingService } from "../src/billing/billing.service";
import { ConversionEventsQueueService } from "../src/common/queue/conversion-events-queue.service";
import { ConversionEventsService } from "../src/conversion-events/conversion-events.service";
import { ConversionRulesService } from "../src/conversion-rules/conversion-rules.service";
import { DiagnosticsService } from "../src/diagnostics/diagnostics.service";
import { LeadsService } from "../src/leads/leads.service";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { WebhooksController } from "../src/webhooks/webhooks.controller";

afterEach(() => {
  delete process.env.ASAAS_WEBHOOK_AUTH_TOKEN;
  delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  delete process.env.UAZAPI_WEBHOOK_AUTH_TOKEN;
});

async function createApp() {
  const diagnosticsService = {
    recordWebhookLog: vi.fn(async () => ({
      webhookLogId: "webhook_1",
      diagnosticEventId: "diag_1",
      status: "received"
    }))
  };
  const billingService = {
    processAsaasPaymentWebhook: vi.fn(async () => ({
      processed: true,
      status: "paid",
      chargeId: "charge_1",
      activationId: "activation_1"
    }))
  };
  const conversionRulesService = {
    evaluateTriggers: vi.fn(async () => [
      {
        id: "rule_1",
        workspaceId: "workspace_1",
        name: "Lead qualificado",
        triggerType: "keyword",
        triggerValue: "quero comprar",
        matchMode: "contains",
        eventName: "QualifiedLead",
        pixelId: null,
        active: true,
        createdAt: "2026-07-02T03:00:00.000Z",
        updatedAt: "2026-07-02T03:00:00.000Z"
      }
    ])
  };
  const conversionEventsService = {
    recordRuleMatches: vi.fn(async () => ({
      created: ["conversion_1"]
    }))
  };
  const conversionEventsQueueService = {
    enqueueSend: vi.fn(async () => ({
      conversionEventLogId: "conversion_1",
      jobId: "conversion-send:conversion_1",
      status: "queued"
    }))
  };
  const leadsService = {
    upsertFromWhatsappWebhook: vi.fn(async () => ({
      id: "lead_1"
    }))
  };
  const prismaService = {
    whatsappInstance: {
      findFirst: vi.fn(
        async (): Promise<{
          id: string;
          workspaceId: string;
          providerInstanceId?: string;
          webhookTokenHash?: string;
        } | null> => null
      )
    }
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [WebhooksController],
    providers: [
      { provide: DiagnosticsService, useValue: diagnosticsService },
      { provide: BillingService, useValue: billingService },
      { provide: ConversionRulesService, useValue: conversionRulesService },
      { provide: ConversionEventsService, useValue: conversionEventsService },
      {
        provide: ConversionEventsQueueService,
        useValue: conversionEventsQueueService
      },
      { provide: LeadsService, useValue: leadsService },
      { provide: PrismaService, useValue: prismaService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    diagnosticsService,
    billingService,
    conversionRulesService,
    conversionEventsService,
    conversionEventsQueueService,
    leadsService,
    prismaService
  };
}

describe("webhooks controller", () => {
  it("returns Meta webhook challenge when verify token matches", async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "secure-meta-verify-token";
    const { app, diagnosticsService } = await createApp();

    await request(app.getHttpServer())
      .get("/webhooks/meta")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "secure-meta-verify-token",
        "hub.challenge": "challenge_123"
      })
      .expect(200, "challenge_123");

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects Meta webhook challenge when verify token is invalid", async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "secure-meta-verify-token";
    const { app, diagnosticsService } = await createApp();

    await request(app.getHttpServer())
      .get("/webhooks/meta")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge_123"
      })
      .expect(401);

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("records Uazapi webhooks", async () => {
    const expectedPhoneHash = createHash("sha256")
      .update("5511988441020")
      .digest("hex");
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      conversionEventsService,
      conversionEventsQueueService,
      leadsService
    } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-workspace-id", "workspace_1")
      .send({
        event: "message.received",
        id: "evt_uazapi_1",
        token: "secret",
        message: {
          text: "Oi, quero comprar"
        },
        labels: ["Venda fechada"],
        phone: "+55 11 98844-1020",
        leadId: "lead_external_1",
        name: "Mariana Alves",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1"
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body.status).toBe("received");
        expect(body.webhookLogId).toBe("webhook_1");
        expect(body.conversion.created).toEqual(["conversion_1"]);
        expect(body.conversion.queued).toEqual([
          {
            conversionEventLogId: "conversion_1",
            jobId: "conversion-send:conversion_1",
            status: "queued"
          }
        ]);
      });

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        eventType: "message.received",
        externalEventId: "evt_uazapi_1",
        leadId: "lead_external_1",
        phoneHash: expectedPhoneHash,
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1"
      })
    );
    expect(conversionRulesService.evaluateTriggers).toHaveBeenCalledWith(
      "workspace_1",
      {
        messageText: "Oi, quero comprar",
        labels: ["Venda fechada"]
      }
    );
    expect(conversionEventsService.recordRuleMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        leadId: "lead_1",
        rules: expect.arrayContaining([
          expect.objectContaining({ eventName: "QualifiedLead" })
        ])
      })
    );
    expect(leadsService.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        name: "Mariana Alves",
        phone: "+55 11 98844-1020",
        labels: ["Venda fechada"],
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1"
      })
    );
    expect(conversionEventsQueueService.enqueueSend).toHaveBeenCalledWith(
      "conversion_1"
    );

    await app.close();
  });

  it("extracts Uazapi CTWA referral attribution and object labels", async () => {
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      conversionEventsService,
      leadsService
    } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-workspace-id", "workspace_1")
      .send({
        event: "message.received",
        id: "evt_uazapi_referral_1",
        message: {
          text: "fechei",
          referral: {
            source_id: "ad_ref_1",
            ctwa_clid: "ctwa_click_1",
            ads_context_data: {
              campaign_id: "cmp_ref_1",
              adset_id: "adset_ref_1",
              ad_id: "ad_ref_1"
            }
          }
        },
        chat: {
          labels: [
            {
              name: "Venda fechada"
            },
            {
              label: "Cliente VIP"
            }
          ]
        },
        phone: "+55 11 98844-1020",
        name: "Mariana Alves"
      })
      .expect(202);

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        eventType: "message.received",
        externalEventId: "evt_uazapi_referral_1",
        campaignId: "cmp_ref_1",
        adSetId: "adset_ref_1",
        adId: "ad_ref_1"
      })
    );
    expect(conversionRulesService.evaluateTriggers).toHaveBeenCalledWith(
      "workspace_1",
      {
        messageText: "fechei",
        labels: ["Venda fechada", "Cliente VIP"]
      }
    );
    expect(leadsService.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        labels: ["Venda fechada", "Cliente VIP"],
        campaignId: "cmp_ref_1",
        adSetId: "adset_ref_1",
        adId: "ad_ref_1"
      })
    );
    expect(conversionEventsService.recordRuleMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "cmp_ref_1",
        adSetId: "adset_ref_1",
        adId: "ad_ref_1"
      })
    );

    await app.close();
  });

  it("does not run conversion side effects for duplicate Uazapi webhooks", async () => {
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      conversionEventsService,
      conversionEventsQueueService,
      leadsService
    } = await createApp();
    diagnosticsService.recordWebhookLog.mockResolvedValueOnce({
      webhookLogId: "webhook_1",
      diagnosticEventId: "diag_1",
      status: "duplicate"
    });

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-workspace-id", "workspace_1")
      .send({
        event: "message.received",
        id: "evt_uazapi_1",
        message: {
          text: "Oi, quero comprar"
        }
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body.status).toBe("duplicate");
        expect(body.conversion).toEqual({
          created: [],
          duplicates: [],
          queued: []
        });
      });

    expect(conversionRulesService.evaluateTriggers).not.toHaveBeenCalled();
    expect(leadsService.upsertFromWhatsappWebhook).not.toHaveBeenCalled();
    expect(conversionEventsService.recordRuleMatches).not.toHaveBeenCalled();
    expect(conversionEventsQueueService.enqueueSend).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects Uazapi webhooks with invalid auth token when configured", async () => {
    process.env.UAZAPI_WEBHOOK_AUTH_TOKEN = "secure-uazapi-webhook-token";
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      leadsService
    } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .send({
        event: "message.received",
        id: "evt_uazapi_2"
      })
      .expect(401);

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-wpptrack-webhook-token", "wrong-token")
      .send({
        event: "message.received",
        id: "evt_uazapi_2"
      })
      .expect(401);

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();
    expect(conversionRulesService.evaluateTriggers).not.toHaveBeenCalled();
    expect(leadsService.upsertFromWhatsappWebhook).not.toHaveBeenCalled();

    await app.close();
  });

  it("accepts Uazapi webhooks with valid auth token from header or query", async () => {
    process.env.UAZAPI_WEBHOOK_AUTH_TOKEN = "secure-uazapi-webhook-token";
    const { app, diagnosticsService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-wpptrack-webhook-token", "secure-uazapi-webhook-token")
      .send({
        event: "message.received",
        id: "evt_uazapi_2"
      })
      .expect(202);

    await request(app.getHttpServer())
      .post("/webhooks/uazapi?token=secure-uazapi-webhook-token")
      .send({
        event: "message.received",
        id: "evt_uazapi_3"
      })
      .expect(202);

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it("resolves Uazapi webhooks to workspace and local instance by provider instance id", async () => {
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      leadsService,
      prismaService
    } = await createApp();
    prismaService.whatsappInstance.findFirst.mockResolvedValueOnce({
      id: "wpp_1",
      workspaceId: "workspace_1",
      providerInstanceId: "provider_instance_1"
    });

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .send({
        event: "message.received",
        id: "evt_uazapi_2",
        instance: {
          id: "provider_instance_1"
        },
        message: {
          text: "Oi, quero comprar"
        },
        phone: "+55 11 98844-1020"
      })
      .expect(202);

    expect(prismaService.whatsappInstance.findFirst).toHaveBeenCalledWith({
      where: {
        provider: "uazapi",
        providerInstanceId: "provider_instance_1"
      },
      select: {
        id: true,
        workspaceId: true
      }
    });
    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        externalEventId: "evt_uazapi_2"
      })
    );
    expect(conversionRulesService.evaluateTriggers).toHaveBeenCalledWith(
      "workspace_1",
      expect.objectContaining({
        messageText: "Oi, quero comprar"
      })
    );
    expect(leadsService.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        whatsappInstanceId: "wpp_1"
      })
    );

    await app.close();
  });

  it("accepts Uazapi webhooks on a per-instance URL when the instance token matches", async () => {
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      leadsService,
      prismaService
    } = await createApp();
    prismaService.whatsappInstance.findFirst.mockResolvedValueOnce({
      id: "wpp_1",
      workspaceId: "workspace_1",
      webhookTokenHash: createHash("sha256")
        .update("instance-webhook-secret")
        .digest("hex")
    });

    await request(app.getHttpServer())
      .post("/webhooks/uazapi/instances/wpp_1?token=instance-webhook-secret")
      .send({
        event: "message.received",
        id: "evt_uazapi_instance_1",
        message: {
          text: "Oi, quero comprar"
        },
        phone: "+55 11 98844-1020"
      })
      .expect(202);

    expect(prismaService.whatsappInstance.findFirst).toHaveBeenCalledWith({
      where: {
        id: "wpp_1",
        provider: "uazapi"
      },
      select: {
        id: true,
        workspaceId: true,
        webhookTokenHash: true
      }
    });
    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        externalEventId: "evt_uazapi_instance_1"
      })
    );
    expect(conversionRulesService.evaluateTriggers).toHaveBeenCalledWith(
      "workspace_1",
      expect.objectContaining({
        messageText: "Oi, quero comprar"
      })
    );
    expect(leadsService.upsertFromWhatsappWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        whatsappInstanceId: "wpp_1"
      })
    );

    await app.close();
  });

  it("rejects Uazapi per-instance webhooks when the instance token is invalid", async () => {
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      leadsService,
      prismaService
    } = await createApp();
    prismaService.whatsappInstance.findFirst.mockResolvedValueOnce({
      id: "wpp_1",
      workspaceId: "workspace_1",
      webhookTokenHash: createHash("sha256")
        .update("instance-webhook-secret")
        .digest("hex")
    });

    await request(app.getHttpServer())
      .post("/webhooks/uazapi/instances/wpp_1?token=wrong-secret")
      .send({
        event: "message.received",
        id: "evt_uazapi_instance_2"
      })
      .expect(401);

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();
    expect(conversionRulesService.evaluateTriggers).not.toHaveBeenCalled();
    expect(leadsService.upsertFromWhatsappWebhook).not.toHaveBeenCalled();

    await app.close();
  });

  it("records Asaas and Meta webhooks", async () => {
    const { app, diagnosticsService, billingService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/asaas")
      .send({
        event: "PAYMENT_RECEIVED",
        id: "evt_asaas_1",
        payment: {
          id: "pay_asaas_1",
          status: "RECEIVED"
        }
      })
      .expect(202);

    await request(app.getHttpServer())
      .post("/webhooks/meta")
      .send({
        object: "page",
        id: "evt_meta_1"
      })
      .expect(202);

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "asaas",
        eventType: "PAYMENT_RECEIVED"
      })
    );
    expect(billingService.processAsaasPaymentWebhook).toHaveBeenCalledWith({
      event: "PAYMENT_RECEIVED",
      id: "evt_asaas_1",
      payment: {
        id: "pay_asaas_1",
        status: "RECEIVED"
      }
    });
    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "meta",
        eventType: "page"
      })
    );

    await app.close();
  });

  it("extracts attribution fields from Meta leadgen webhooks", async () => {
    const { app, diagnosticsService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/meta")
      .set("x-workspace-id", "workspace_1")
      .send({
        object: "page",
        entry: [
          {
            id: "page_1",
            changes: [
              {
                field: "leadgen",
                value: {
                  leadgen_id: "leadgen_1",
                  campaign_id: "cmp_1",
                  adset_id: "adset_1",
                  ad_id: "ad_1"
                }
              }
            ]
          }
        ]
      })
      .expect(202);

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        eventType: "meta.leadgen",
        externalEventId: "leadgen_1",
        idempotencyKey: "meta:leadgen_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1"
      })
    );

    await app.close();
  });

  it("does not run billing side effects for duplicate Asaas webhooks", async () => {
    const { app, diagnosticsService, billingService } = await createApp();
    diagnosticsService.recordWebhookLog.mockResolvedValueOnce({
      webhookLogId: "webhook_1",
      diagnosticEventId: "diag_1",
      status: "duplicate"
    });

    await request(app.getHttpServer())
      .post("/webhooks/asaas")
      .send({
        event: "PAYMENT_RECEIVED",
        id: "evt_asaas_1",
        payment: {
          id: "pay_asaas_1",
          status: "RECEIVED"
        }
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body.status).toBe("duplicate");
        expect(body.billing).toEqual({
          processed: false,
          status: "ignored"
        });
      });

    expect(billingService.processAsaasPaymentWebhook).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects Asaas webhooks with invalid auth token when configured", async () => {
    process.env.ASAAS_WEBHOOK_AUTH_TOKEN = "secure-webhook-token-123456789012345";
    const { app, billingService, diagnosticsService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/asaas")
      .send({
        event: "PAYMENT_RECEIVED",
        id: "evt_asaas_1"
      })
      .expect(401);

    await request(app.getHttpServer())
      .post("/webhooks/asaas")
      .set("asaas-access-token", "wrong-token")
      .send({
        event: "PAYMENT_RECEIVED",
        id: "evt_asaas_1"
      })
      .expect(401);

    expect(billingService.processAsaasPaymentWebhook).not.toHaveBeenCalled();
    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("accepts Asaas webhooks with valid auth token when configured", async () => {
    process.env.ASAAS_WEBHOOK_AUTH_TOKEN = "secure-webhook-token-123456789012345";
    const { app, billingService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/asaas")
      .set("asaas-access-token", "secure-webhook-token-123456789012345")
      .send({
        event: "PAYMENT_RECEIVED",
        id: "evt_asaas_1"
      })
      .expect(202);

    expect(billingService.processAsaasPaymentWebhook).toHaveBeenCalledOnce();

    await app.close();
  });
});
