import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { BillingService } from "../src/billing/billing.service";
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

  const moduleRef = await Test.createTestingModule({
    controllers: [WebhooksController],
    providers: [
      { provide: DiagnosticsService, useValue: diagnosticsService },
      { provide: BillingService, useValue: billingService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, diagnosticsService, billingService };
}

describe("webhooks controller", () => {
  it("records Uazapi webhooks", async () => {
    const { app, diagnosticsService } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/uazapi")
      .set("x-workspace-id", "workspace_1")
      .send({
        event: "message.received",
        id: "evt_uazapi_1",
        token: "secret"
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body.status).toBe("received");
        expect(body.webhookLogId).toBe("webhook_1");
      });

    expect(diagnosticsService.recordWebhookLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        eventType: "message.received",
        externalEventId: "evt_uazapi_1"
      })
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
