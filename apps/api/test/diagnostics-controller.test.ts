import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { DiagnosticsController } from "../src/diagnostics/diagnostics.controller";
import { DiagnosticsService } from "../src/diagnostics/diagnostics.service";

const diagnosticEvent = {
  id: "diag_1",
  workspaceId: "workspace_1",
  source: "meta",
  eventType: "pixel_event",
  severity: "error",
  status: "error",
  occurredAt: "2026-07-02T03:00:00.000Z",
  title: "Meta recusou evento",
  message: "Parametro currency ausente",
  leadId: null,
  phoneHash: null,
  campaignId: null,
  adSetId: null,
  adId: null,
  jobId: null,
  errorCode: "MISSING_CURRENCY",
  summaryPayload: {
    currency: null
  }
};

async function createApp() {
  const service = {
    listEvents: vi.fn(async () => [diagnosticEvent]),
    getEvent: vi.fn(async () => diagnosticEvent),
    recordEvent: vi.fn(async () => diagnosticEvent)
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [DiagnosticsController],
    providers: [{ provide: DiagnosticsService, useValue: service }]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, service };
}

describe("diagnostics controller", () => {
  it("lists backoffice diagnostic events", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/diagnostics/events?workspaceId=workspace_1&source=meta&limit=10")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].id).toBe("diag_1");
        expect(body[0].source).toBe("meta");
      });

    expect(service.listEvents).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      source: "meta",
      limit: 10
    });

    await app.close();
  });

  it("returns event detail", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/diagnostics/events/diag_1")
      .expect(200)
      .expect(({ body }) => {
        expect(body.summaryPayload.currency).toBeNull();
      });

    expect(service.getEvent).toHaveBeenCalledWith("diag_1");

    await app.close();
  });

  it("records diagnostic events through an internal scaffold endpoint", async () => {
    const { app, service } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/diagnostics/events")
      .send({
        workspaceId: "workspace_1",
        source: "meta",
        eventType: "pixel_event",
        severity: "error",
        status: "error",
        title: "Meta recusou evento",
        message: "Parametro currency ausente",
        summaryPayload: {
          authorization: "Bearer secret"
        }
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.errorCode).toBe("MISSING_CURRENCY");
      });

    expect(service.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "meta",
        workspaceId: "workspace_1"
      })
    );

    await app.close();
  });
});
