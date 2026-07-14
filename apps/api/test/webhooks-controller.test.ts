import { createHash, createHmac } from "node:crypto";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { BillingService } from "../src/billing/billing.service";
import { ConversionEventsQueueService } from "../src/common/queue/conversion-events-queue.service";
import { ConversionEventsService } from "../src/conversion-events/conversion-events.service";
import { ConversionRulesService } from "../src/conversion-rules/conversion-rules.service";
import { DiagnosticsService } from "../src/diagnostics/diagnostics.service";
import { LeadsService } from "../src/leads/leads.service";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { WebhooksController } from "../src/webhooks/webhooks.controller";

const asaasWebhookToken = "secure-asaas-webhook-token";
const metaAppSecret = "secure-meta-app-secret";
const uazapiWebhookToken = "secure-uazapi-webhook-token";

beforeEach(() => {
  process.env.ASAAS_WEBHOOK_AUTH_TOKEN = asaasWebhookToken;
  process.env.META_APP_SECRET = metaAppSecret;
  process.env.UAZAPI_WEBHOOK_AUTH_TOKEN = uazapiWebhookToken;
});

afterEach(() => {
  delete process.env.ASAAS_WEBHOOK_AUTH_TOKEN;
  delete process.env.META_APP_SECRET;
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
    resolveAsaasPaymentWebhookContext: vi.fn(async () => ({
      workspaceId: "workspace_1",
      paymentId: "pay_asaas_1"
    })),
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
    recordAutomaticLeadSubmitted: vi.fn(async () => ({
      created: ["automatic_1"],
      duplicates: []
    })),
    recordRuleMatches: vi.fn(async () => ({
      created: ["conversion_1"],
      duplicates: []
    })),
    listReadyLogIds: vi.fn(async (logIds: string[]) => logIds)
  };
  const conversionEventsQueueService = {
    enqueueSend: vi.fn(
      async (conversionEventLogId: string, _workspaceId: string) => ({
      conversionEventLogId,
      jobId: `conversion-send_${conversionEventLogId}`,
      status: "queued"
      })
    )
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
          providerInstanceId: string | null;
          webhookTokenHash?: string;
        } | null> => null
      ),
      findMany: vi.fn(async () => [
        {
          id: "wpp_1",
          workspaceId: "workspace_1",
          providerInstanceId: "provider_instance_1"
        }
      ])
    },
    metaConversionDestination: {
      findMany: vi.fn(async () => [
        {
          workspaceId: "workspace_1"
        }
      ])
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

  const app = moduleRef.createNestApplication({ rawBody: true });
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

function signMetaPayload(payload: Record<string, unknown>) {
  return `sha256=${createHmac("sha256", metaAppSecret)
    .update(JSON.stringify(payload))
    .digest("hex")}`;
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
      .set("x-wpptrack-webhook-token", uazapiWebhookToken)
      .send({
        event: "message.received",
        id: "evt_uazapi_1",
        instance: {
          id: "provider_instance_1"
        },
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
        expect(body.conversion.automatic.created).toEqual(["automatic_1"]);
        expect(body.conversion.created).toEqual(["conversion_1"]);
        expect(body.conversion.queued).toEqual([
          {
            conversionEventLogId: "automatic_1",
            jobId: "conversion-send_automatic_1",
            status: "queued"
          },
          {
            conversionEventLogId: "conversion_1",
            jobId: "conversion-send_conversion_1",
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
        idempotencyKey: "uazapi:workspace_1:wpp_1:evt_uazapi_1",
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
        phoneHash: expectedPhoneHash,
        rules: expect.arrayContaining([
          expect.objectContaining({ eventName: "QualifiedLead" })
        ])
      })
    );
    expect(conversionEventsService.recordAutomaticLeadSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        leadId: "lead_1",
        phoneHash: expectedPhoneHash,
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1"
      })
    );
    expect(conversionEventsService.listReadyLogIds).toHaveBeenCalledWith([
      "automatic_1",
      "conversion_1"
    ]);
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
      "automatic_1",
      "workspace_1"
    );
    expect(conversionEventsQueueService.enqueueSend).toHaveBeenCalledWith(
      "conversion_1",
      "workspace_1"
    );

    await app.close();
  });

  it("extracts Uazapi CTWA referral attribution and object labels", async () => {
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
    conversionEventsService.recordAutomaticLeadSubmitted.mockResolvedValueOnce({
      created: ["automatic_pending_meta"],
      duplicates: []
    });
    conversionEventsService.recordRuleMatches.mockResolvedValueOnce({
      created: ["conversion_ready_1"],
      duplicates: []
    });
    conversionEventsService.listReadyLogIds.mockResolvedValueOnce([
      "conversion_ready_1"
    ]);

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-workspace-id", "workspace_1")
      .set("x-wpptrack-webhook-token", uazapiWebhookToken)
      .send({
        event: "message.received",
        id: "evt_uazapi_referral_1",
        instance: {
          id: "provider_instance_1"
        },
        message: {
          text: "fechei",
          referral: {
            source_id: "ad_ref_1",
            ctwa_clid: "ctwa_click_1",
            source_url: "https://fb.com/ad/ref",
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
        adId: "ad_ref_1",
        ctwaClid: "ctwa_click_1",
        ctwaSourceUrl: "https://fb.com/ad/ref"
      })
    );
    expect(conversionEventsService.recordAutomaticLeadSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        leadId: "lead_1",
        phoneHash: expectedPhoneHash,
        campaignId: "cmp_ref_1",
        adSetId: "adset_ref_1",
        adId: "ad_ref_1",
        ctwaClid: "ctwa_click_1"
      })
    );
    expect(conversionEventsService.recordRuleMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        leadId: "lead_1",
        phoneHash: expectedPhoneHash,
        campaignId: "cmp_ref_1",
        adSetId: "adset_ref_1",
        adId: "ad_ref_1",
        ctwaClid: "ctwa_click_1"
      })
    );
    expect(conversionEventsService.listReadyLogIds).toHaveBeenCalledWith([
      "automatic_pending_meta",
      "conversion_ready_1"
    ]);
    expect(conversionEventsQueueService.enqueueSend).toHaveBeenCalledOnce();
    expect(conversionEventsQueueService.enqueueSend).toHaveBeenCalledWith(
      "conversion_ready_1",
      "workspace_1"
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
      .set("x-wpptrack-webhook-token", uazapiWebhookToken)
      .send({
        event: "message.received",
        id: "evt_uazapi_1",
        instance: {
          id: "provider_instance_1"
        },
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
    expect(
      conversionEventsService.recordAutomaticLeadSubmitted
    ).not.toHaveBeenCalled();
    expect(conversionEventsService.recordRuleMatches).not.toHaveBeenCalled();
    expect(conversionEventsService.listReadyLogIds).not.toHaveBeenCalled();
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

  it("fails closed when the legacy Uazapi secret is not configured", async () => {
    delete process.env.UAZAPI_WEBHOOK_AUTH_TOKEN;
    const { app, diagnosticsService, conversionRulesService, prismaService } =
      await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-wpptrack-webhook-token", uazapiWebhookToken)
      .send({
        event: "message.received",
        id: "evt_uazapi_missing_secret",
        instance: {
          id: "provider_instance_1"
        }
      })
      .expect(401);

    expect(prismaService.whatsappInstance.findMany).not.toHaveBeenCalled();
    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();
    expect(conversionRulesService.evaluateTriggers).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects legacy Uazapi tenant claims that diverge from the verified instance", async () => {
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      leadsService,
      prismaService
    } = await createApp();
    prismaService.whatsappInstance.findMany.mockResolvedValueOnce([
      {
        id: "wpp_b",
        workspaceId: "workspace_b",
        providerInstanceId: "provider_instance_b"
      }
    ]);

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-wpptrack-webhook-token", uazapiWebhookToken)
      .set("x-workspace-id", "workspace_a")
      .send({
        event: "message.received",
        id: "evt_cross_tenant",
        workspaceId: "workspace_a",
        whatsappInstanceId: "wpp_a",
        instance: {
          id: "provider_instance_b"
        }
      })
      .expect(401);

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();
    expect(conversionRulesService.evaluateTriggers).not.toHaveBeenCalled();
    expect(leadsService.upsertFromWhatsappWebhook).not.toHaveBeenCalled();

    await app.close();
  });

  it("accepts Uazapi webhooks with valid auth token from header or query", async () => {
    const { app, diagnosticsService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-wpptrack-webhook-token", uazapiWebhookToken)
      .send({
        event: "message.received",
        id: "evt_uazapi_2",
        instance: {
          id: "provider_instance_1"
        }
      })
      .expect(202);

    await request(app.getHttpServer())
      .post(`/webhooks/uazapi?token=${uazapiWebhookToken}`)
      .send({
        event: "message.received",
        id: "evt_uazapi_3",
        instance: {
          id: "provider_instance_1"
        }
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
    prismaService.whatsappInstance.findMany.mockResolvedValueOnce([
      {
      id: "wpp_1",
      workspaceId: "workspace_1",
      providerInstanceId: "provider_instance_1"
      }
    ]);

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-wpptrack-webhook-token", uazapiWebhookToken)
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

    expect(prismaService.whatsappInstance.findMany).toHaveBeenCalledWith({
      where: {
        provider: "uazapi",
        providerInstanceId: "provider_instance_1"
      },
      select: {
        id: true,
        workspaceId: true,
        providerInstanceId: true
      },
      take: 2
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
      providerInstanceId: "provider_instance_1",
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
        providerInstanceId: true,
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
      providerInstanceId: "provider_instance_1",
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

  it("rejects provider instance divergence on the authenticated per-instance route", async () => {
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      leadsService,
      prismaService
    } = await createApp();
    prismaService.whatsappInstance.findFirst.mockResolvedValueOnce({
      id: "wpp_a",
      workspaceId: "workspace_a",
      providerInstanceId: "provider_instance_a",
      webhookTokenHash: createHash("sha256")
        .update("instance-webhook-secret")
        .digest("hex")
    });

    await request(app.getHttpServer())
      .post("/webhooks/uazapi/instances/wpp_a?token=instance-webhook-secret")
      .send({
        event: "message.received",
        id: "evt_uazapi_instance_cross_tenant",
        instance: {
          id: "provider_instance_b"
        }
      })
      .expect(401);

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();
    expect(conversionRulesService.evaluateTriggers).not.toHaveBeenCalled();
    expect(leadsService.upsertFromWhatsappWebhook).not.toHaveBeenCalled();

    await app.close();
  });

  it("records Asaas and Meta webhooks", async () => {
    const { app, diagnosticsService, billingService, prismaService } =
      await createApp();
    const metaPayload = {
      object: "page",
      id: "evt_meta_1",
      entry: [
        {
          id: "page_1",
          changes: []
        }
      ]
    };

    await request(app.getHttpServer())
      .post("/webhooks/asaas")
      .set("asaas-access-token", asaasWebhookToken)
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
      .set("x-hub-signature-256", signMetaPayload(metaPayload))
      .send(metaPayload)
      .expect(202);

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "asaas",
        eventType: "PAYMENT_RECEIVED",
        workspaceId: "workspace_1",
        idempotencyKey: "asaas:workspace_1:pay_asaas_1:evt_asaas_1"
      })
    );
    expect(
      billingService.resolveAsaasPaymentWebhookContext
    ).toHaveBeenCalledWith({
      event: "PAYMENT_RECEIVED",
      id: "evt_asaas_1",
      payment: {
        id: "pay_asaas_1",
        status: "RECEIVED"
      }
    });
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
        eventType: "page",
        workspaceId: "workspace_1",
        idempotencyKey: "meta:workspace_1:page_1:evt_meta_1"
      })
    );
    expect(
      prismaService.metaConversionDestination.findMany
    ).toHaveBeenCalledWith({
      where: {
        pageId: "page_1"
      },
      select: {
        workspaceId: true
      },
      take: 2
    });

    await app.close();
  });

  it("extracts attribution fields from Meta leadgen webhooks", async () => {
    const { app, diagnosticsService } = await createApp();
    const payload = {
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
    };

    await request(app.getHttpServer())
      .post("/webhooks/meta")
      .set("x-hub-signature-256", signMetaPayload(payload))
      .set("x-workspace-id", "workspace_1")
      .send(payload)
      .expect(202);

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "meta",
        eventType: "meta.leadgen",
        externalEventId: "leadgen_1",
        idempotencyKey: "meta:workspace_1:page_1:leadgen_1",
        campaignId: "cmp_1",
        adSetId: "adset_1",
        adId: "ad_1"
      })
    );

    await app.close();
  });

  it("rejects Meta webhooks with an invalid signature", async () => {
    const { app, diagnosticsService, prismaService } = await createApp();
    const payload = {
      object: "page",
      entry: [{ id: "page_1", changes: [] }]
    };

    await request(app.getHttpServer())
      .post("/webhooks/meta")
      .set("x-hub-signature-256", `sha256=${"0".repeat(64)}`)
      .send(payload)
      .expect(401);

    expect(
      prismaService.metaConversionDestination.findMany
    ).not.toHaveBeenCalled();
    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects Meta webhooks without a signature", async () => {
    const { app, diagnosticsService, prismaService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/meta")
      .send({
        object: "page",
        entry: [{ id: "page_1", changes: [] }]
      })
      .expect(401);

    expect(
      prismaService.metaConversionDestination.findMany
    ).not.toHaveBeenCalled();
    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("fails closed when META_APP_SECRET is not configured", async () => {
    delete process.env.META_APP_SECRET;
    const { app, diagnosticsService, prismaService } = await createApp();
    const payload = {
      object: "page",
      entry: [{ id: "page_1", changes: [] }]
    };

    await request(app.getHttpServer())
      .post("/webhooks/meta")
      .set("x-hub-signature-256", signMetaPayload(payload))
      .send(payload)
      .expect(401);

    expect(
      prismaService.metaConversionDestination.findMany
    ).not.toHaveBeenCalled();
    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects a Meta workspace claim that diverges from the page owner", async () => {
    const { app, diagnosticsService } = await createApp();
    const payload = {
      object: "page",
      entry: [{ id: "page_1", changes: [] }]
    };

    await request(app.getHttpServer())
      .post("/webhooks/meta")
      .set("x-hub-signature-256", signMetaPayload(payload))
      .set("x-workspace-id", "workspace_2")
      .send(payload)
      .expect(401);

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects a Meta page mapped to more than one workspace", async () => {
    const { app, diagnosticsService, prismaService } = await createApp();
    prismaService.metaConversionDestination.findMany.mockResolvedValueOnce([
      { workspaceId: "workspace_1" },
      { workspaceId: "workspace_2" }
    ]);
    const payload = {
      object: "page",
      entry: [{ id: "page_shared", changes: [] }]
    };

    await request(app.getHttpServer())
      .post("/webhooks/meta")
      .set("x-hub-signature-256", signMetaPayload(payload))
      .send(payload)
      .expect(401);

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

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
      .set("asaas-access-token", asaasWebhookToken)
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
    expect(
      billingService.resolveAsaasPaymentWebhookContext
    ).not.toHaveBeenCalled();
    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("fails closed when the Asaas webhook secret is not configured", async () => {
    delete process.env.ASAAS_WEBHOOK_AUTH_TOKEN;
    const { app, billingService, diagnosticsService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/asaas")
      .set("asaas-access-token", asaasWebhookToken)
      .send({
        event: "PAYMENT_RECEIVED",
        id: "evt_asaas_missing_secret",
        payment: {
          id: "pay_asaas_1"
        }
      })
      .expect(401);

    expect(
      billingService.resolveAsaasPaymentWebhookContext
    ).not.toHaveBeenCalled();
    expect(billingService.processAsaasPaymentWebhook).not.toHaveBeenCalled();
    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects an Asaas workspace claim that diverges from the verified charge", async () => {
    const { app, billingService, diagnosticsService } = await createApp();
    billingService.resolveAsaasPaymentWebhookContext.mockResolvedValueOnce({
      workspaceId: "workspace_b",
      paymentId: "pay_asaas_b"
    });

    await request(app.getHttpServer())
      .post("/webhooks/asaas")
      .set("asaas-access-token", asaasWebhookToken)
      .set("x-workspace-id", "workspace_a")
      .send({
        event: "PAYMENT_RECEIVED",
        id: "evt_asaas_cross_tenant",
        payment: {
          id: "pay_asaas_b"
        }
      })
      .expect(401);

    expect(diagnosticsService.recordWebhookLog).not.toHaveBeenCalled();
    expect(billingService.processAsaasPaymentWebhook).not.toHaveBeenCalled();

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
        id: "evt_asaas_1",
        payment: {
          id: "pay_asaas_1"
        }
      })
      .expect(202);

    expect(billingService.processAsaasPaymentWebhook).toHaveBeenCalledOnce();

    await app.close();
  });

  it("does not return duplicate webhook IDs from another tenant", async () => {
    const diagnosticEventFindMany = vi.fn();
    const diagnosticsService = new DiagnosticsService({
      webhookLog: {
        findUnique: vi.fn(async () => ({
          id: "webhook_workspace_b",
          workspaceId: "workspace_b",
          source: "uazapi"
        }))
      },
      diagnosticEvent: {
        findMany: diagnosticEventFindMany
      }
    } as never);

    await expect(
      diagnosticsService.recordWebhookLog({
        workspaceId: "workspace_a",
        source: "uazapi",
        eventType: "message.received",
        externalEventId: "evt_shared",
        idempotencyKey: "uazapi:workspace_a:wpp_a:evt_shared"
      })
    ).rejects.toMatchObject({ status: 409 });

    expect(diagnosticEventFindMany).not.toHaveBeenCalled();
  });
});
