import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
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
import { configureInboundWebhookBodyParser } from "../src/inbound-webhooks/inbound-webhook-body-parser";
import {
  InboundWebhookPublicController,
  resolveInboundRawBody,
} from "../src/inbound-webhooks/inbound-webhook-public.controller";

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
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
    bodyParser: false,
  });
  configureInboundWebhookBodyParser(app);
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

  it("uses a JSON-parser object when Nest does not provide a raw body", async () => {
    const { app, ingestion, conversionAutomationIngestion } = await createApp();
    const controller = new InboundWebhookPublicController(
      ingestion as never,
      conversionAutomationIngestion as never,
    );
    const body = { leadId: "lead_1", nome: "Luiz Sérgio" };

    await controller.receive(
      "connection_1",
      "one-time-token",
      "application/json",
      undefined,
      undefined,
      { body },
    );

    expect(ingestion.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: Buffer.from(JSON.stringify(body)) }),
    );
    await app.close();
  });

  it("captures JSON bytes on text/plain and missing Content-Type posts", async () => {
    for (const contentType of ["text/plain", undefined]) {
      const { app, ingestion } = await createApp();
      const payload = JSON.stringify({ leadId: `lead_${contentType ?? "none"}` });
      let requestBuilder = request(app.getHttpServer())
        .post("/webhooks/inbound/connection_1?token=one-time-token")
        .send(payload);

      if (contentType) {
        requestBuilder = requestBuilder.set("Content-Type", contentType);
      }

      await requestBuilder.expect(202);
      expect(ingestion.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ rawBody: Buffer.from(payload) }),
      );
      await app.close();
    }
  });

  it("keeps the raw body resolver's precedence and string fallback", () => {
    expect(
      resolveInboundRawBody(Buffer.from("raw"), {
        rawBody: Buffer.from("request-raw"),
        body: { ignored: true },
      })?.toString(),
    ).toBe("raw");
    expect(resolveInboundRawBody(undefined, { body: '{"leadId":"lead_1"}' }))
      .toEqual(Buffer.from('{"leadId":"lead_1"}'));
  });

  it("accepts Umbler JSON payloads above the default 100 KiB parser limit", async () => {
    const { app, ingestion } = await createApp();
    const payload = JSON.stringify({
      Type: "Message",
      EventId: "umbler_event_large_http",
      Payload: {
        Content: {
          LastMessage: {
            Thumbnail: "x".repeat(256 * 1024),
          },
        },
      },
    });

    await request(app.getHttpServer())
      .post("/webhooks/inbound/connection_1?token=one-time-token")
      .set("Content-Type", "application/json")
      .send(payload)
      .expect(202);

    expect(ingestion.ingest).toHaveBeenCalledTimes(1);
    const input = ingestion.ingest.mock.calls[0][0];
    expect(input.rawBody).toBeInstanceOf(Buffer);
    expect((input.rawBody as Buffer).equals(Buffer.from(payload))).toBe(true);

    await app.close();
  });

  it("passes a double-encoded JSON body through to ingestion", async () => {
    const { app, ingestion } = await createApp();
    const payload = JSON.stringify(JSON.stringify({ leadId: "lead_1" }));

    await request(app.getHttpServer())
      .post("/webhooks/inbound/connection_1?token=one-time-token")
      .set("Content-Type", "application/json")
      .send(payload)
      .expect(202);

    expect(ingestion.ingest).toHaveBeenCalledTimes(1);
    expect(
      (ingestion.ingest.mock.calls[0][0].rawBody as Buffer).equals(
        Buffer.from(payload),
      ),
    ).toBe(true);

    await app.close();
  });

  it("passes invalid JSON through to ingestion for the stable public validation response", async () => {
    const { app, ingestion } = await createApp();
    const payload = "{invalid";
    ingestion.ingest.mockRejectedValueOnce(
      new BadRequestException("Payload JSON invalido"),
    );

    await request(app.getHttpServer())
      .post("/webhooks/inbound/connection_1?token=one-time-token")
      .set("Content-Type", "application/json")
      .send(payload)
      .expect(400)
      .expect({
        message: "Payload JSON invalido",
        error: "Bad Request",
        statusCode: 400,
      });

    expect(ingestion.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: Buffer.from(payload) }),
    );

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
