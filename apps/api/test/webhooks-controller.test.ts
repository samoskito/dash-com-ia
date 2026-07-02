import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { BillingService } from "../src/billing/billing.service";
import { ConversionEventsService } from "../src/conversion-events/conversion-events.service";
import { ConversionRulesService } from "../src/conversion-rules/conversion-rules.service";
import { DiagnosticsService } from "../src/diagnostics/diagnostics.service";
import { WebhooksController } from "../src/webhooks/webhooks.controller";

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
    })),
    sendReadyEvent: vi.fn(async () => ({
      conversionEventLogId: "conversion_1",
      status: "sent"
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [WebhooksController],
    providers: [
      { provide: DiagnosticsService, useValue: diagnosticsService },
      { provide: BillingService, useValue: billingService },
      { provide: ConversionRulesService, useValue: conversionRulesService },
      { provide: ConversionEventsService, useValue: conversionEventsService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    diagnosticsService,
    billingService,
    conversionRulesService,
    conversionEventsService
  };
}

describe("webhooks controller", () => {
  it("records Uazapi webhooks", async () => {
    const {
      app,
      diagnosticsService,
      conversionRulesService,
      conversionEventsService
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
        labels: ["Venda fechada"]
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body.status).toBe("received");
        expect(body.webhookLogId).toBe("webhook_1");
        expect(body.conversion.created).toEqual(["conversion_1"]);
        expect(body.conversion.sent).toEqual([
          {
            conversionEventLogId: "conversion_1",
            status: "sent"
          }
        ]);
      });

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        eventType: "message.received",
        externalEventId: "evt_uazapi_1"
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
        rules: expect.arrayContaining([
          expect.objectContaining({ eventName: "QualifiedLead" })
        ])
      })
    );
    expect(conversionEventsService.sendReadyEvent).toHaveBeenCalledWith(
      "conversion_1"
    );

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
});
