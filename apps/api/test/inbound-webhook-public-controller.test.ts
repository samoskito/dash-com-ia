import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import {
  InboundWebhookIngestionService,
  type InboundWebhookIngestionInput,
} from "../src/inbound-webhooks/inbound-webhook-ingestion.service";
import {
  InboundConversionAutomationIngestionService,
  type InboundConversionAutomationIngestionInput,
} from "../src/inbound-webhooks/inbound-conversion-automation-ingestion.service";
import { InboundWebhookPublicController } from "../src/inbound-webhooks/inbound-webhook-public.controller";

async function createApp() {
  const ingestion = {
    ingest: vi.fn(async (_input: InboundWebhookIngestionInput) => ({
      status: "accepted",
      deliveryId: "delivery_1",
      duplicate: false,
      queueStatus: "queued",
    })),
  };
  const conversionAutomationIngestion = {
    ingest: vi.fn(
      async (_input: InboundConversionAutomationIngestionInput) => ({
        status: "accepted",
        deliveryId: "delivery_conversion_1",
        duplicate: false,
        observationStatus: "observed",
      }),
    ),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [InboundWebhookPublicController],
    providers: [
      {
        provide: InboundWebhookIngestionService,
        useValue: ingestion,
      },
      {
        provide: InboundConversionAutomationIngestionService,
        useValue: conversionAutomationIngestion,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();

  return { app, ingestion, conversionAutomationIngestion };
}

describe("inbound webhook public controller", () => {
  it("routes automation callbacks without accepting workspace or event context", async () => {
    const { app, conversionAutomationIngestion } = await createApp();
    const payload = JSON.stringify({
      workspaceId: "workspace_untrusted",
      eventName: "Purchase",
      value: 1,
    });

    await request(app.getHttpServer())
      .post("/webhooks/inbound/conversions/endpoint_1?token=one-time-token")
      .set("Content-Type", "application/json")
      .set("x-attempt", "3")
      .send(payload)
      .expect(202)
      .expect({
        status: "accepted",
        deliveryId: "delivery_conversion_1",
        duplicate: false,
        observationStatus: "observed",
      });

    const input = conversionAutomationIngestion.ingest.mock.calls[0][0];
    expect(input).toMatchObject({
      endpointId: "endpoint_1",
      token: "one-time-token",
      providerAttempt: "3",
    });
    expect(input).not.toHaveProperty("workspaceId");
    expect(input).not.toHaveProperty("eventName");
    expect(input).not.toHaveProperty("value");
    expect((input.rawBody as Buffer).equals(Buffer.from(payload))).toBe(true);

    await app.close();
  });

  it("passes exact raw JSON bytes and no caller-supplied workspace context", async () => {
    const { app, ingestion } = await createApp();
    const payload = JSON.stringify({
      Type: "MessageUpdated",
      EventId: "umbler_event_1",
      workspaceId: "workspace_untrusted",
    });

    await request(app.getHttpServer())
      .post("/webhooks/inbound/connection_1?token=one-time-token")
      .set("Content-Type", "application/json")
      .set("x-attempt", "2")
      .set("x-workspace-id", "workspace_untrusted")
      .send(payload)
      .expect(202)
      .expect({
        status: "accepted",
        deliveryId: "delivery_1",
        duplicate: false,
        queueStatus: "queued",
      });

    expect(ingestion.ingest).toHaveBeenCalledTimes(1);
    const input = ingestion.ingest.mock.calls[0][0];
    expect(input).toMatchObject({
      connectionId: "connection_1",
      token: "one-time-token",
      contentType: "application/json",
      providerAttempt: "2",
    });
    expect(input.rawBody).toBeInstanceOf(Buffer);
    expect((input.rawBody as Buffer).equals(Buffer.from(payload, "utf8"))).toBe(
      true,
    );
    expect(input).not.toHaveProperty("workspaceId");

    await app.close();
  });

  it("rejects invalid JSON before the ingestion service", async () => {
    const { app, ingestion } = await createApp();

    await request(app.getHttpServer())
      .post("/webhooks/inbound/connection_1?token=one-time-token")
      .set("Content-Type", "application/json")
      .send("{invalid")
      .expect(400);

    expect(ingestion.ingest).not.toHaveBeenCalled();

    await app.close();
  });

  it("preserves the generic public missing response", async () => {
    const { app, ingestion } = await createApp();
    ingestion.ingest.mockRejectedValueOnce(
      new NotFoundException("Webhook nao encontrado"),
    );

    await request(app.getHttpServer())
      .post("/webhooks/inbound/missing?token=wrong")
      .set("Content-Type", "application/json")
      .send("{}")
      .expect(404)
      .expect(({ body }) => {
        expect(body.message).toBe("Webhook nao encontrado");
        expect(JSON.stringify(body)).not.toContain("wrong");
        expect(JSON.stringify(body)).not.toContain("workspace");
      });

    await app.close();
  });
});
