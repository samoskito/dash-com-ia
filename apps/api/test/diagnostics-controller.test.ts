import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
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

const webhookLog = {
  id: "webhook_1",
  workspaceId: "workspace_1",
  source: "uazapi",
  eventType: "message.received",
  externalEventId: "evt_1",
  status: "received",
  receivedAt: "2026-07-02T03:00:00.000Z",
  processedAt: null,
  leadId: "lead_1",
  phoneHash: "phone_hash_1",
  campaignId: "cmp_1",
  adSetId: null,
  adId: "ad_1",
  jobId: null,
  errorCode: null,
  errorMessage: null
};

async function createApp() {
  const service = {
    listEvents: vi.fn(async () => [diagnosticEvent]),
    listWebhookLogs: vi.fn(async () => [webhookLog]),
    getEvent: vi.fn(async () => diagnosticEvent),
    recordEvent: vi.fn(async () => diagnosticEvent),
    retryEvent: vi.fn(async () => ({
      ok: true,
      status: "queued",
      diagnosticEventId: "diag_1",
      auditLogId: "audit_1",
      jobAttemptId: "job_attempt_1"
    }))
  };
  const platformAdminService = {
    assertPlatformAdmin: vi.fn(async () => ({
      id: "user_1",
      email: "owner@wpptrack.com"
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [DiagnosticsController],
    providers: [
      { provide: DiagnosticsService, useValue: service },
      { provide: PlatformAdminService, useValue: platformAdminService }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, platformAdminService, service };
}

describe("diagnostics controller", () => {
  it("lists backoffice diagnostic events", async () => {
    const { app, platformAdminService, service } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/backoffice/diagnostics/events?workspaceId=workspace_1&source=meta&status=error&q=currency&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z&leadId=lead_1&phoneHash=phone_hash_1&campaignId=cmp_1&adSetId=adset_1&adId=ad_1&errorCode=MISSING_CURRENCY&limit=10"
      )
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].id).toBe("diag_1");
        expect(body[0].source).toBe("meta");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(service.listEvents).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      source: "meta",
      status: "error",
      q: "currency",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adSetId: "adset_1",
      adId: "ad_1",
      errorCode: "MISSING_CURRENCY",
      limit: 10
    });

    await app.close();
  });

  it("lists backoffice webhook logs", async () => {
    const { app, platformAdminService, service } = await createApp();

    await request(app.getHttpServer())
      .get(
        "/backoffice/diagnostics/webhooks?workspaceId=workspace_1&source=uazapi&status=received&q=message&since=2026-07-01T00%3A00%3A00.000Z&until=2026-07-02T23%3A59%3A59.000Z&leadId=lead_1&phoneHash=phone_hash_1&campaignId=cmp_1&adId=ad_1&limit=10"
      )
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].id).toBe("webhook_1");
        expect(body[0].source).toBe("uazapi");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(service.listWebhookLogs).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      source: "uazapi",
      status: "received",
      q: "message",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-02T23:59:59.000Z",
      leadId: "lead_1",
      phoneHash: "phone_hash_1",
      campaignId: "cmp_1",
      adId: "ad_1",
      limit: 10
    });

    await app.close();
  });

  it("returns event detail", async () => {
    const { app, platformAdminService, service } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/diagnostics/events/diag_1")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.summaryPayload.currency).toBeNull();
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(service.getEvent).toHaveBeenCalledWith("diag_1");

    await app.close();
  });

  it("records diagnostic events through an internal scaffold endpoint", async () => {
    const { app, platformAdminService, service } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/diagnostics/events")
      .set("Authorization", "Bearer refresh-token")
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

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(service.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "meta",
        workspaceId: "workspace_1"
      })
    );

    await app.close();
  });

  it("queues an audited retry for a diagnostic event", async () => {
    const { app, platformAdminService, service } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/diagnostics/events/diag_1/retry")
      .set("Authorization", "Bearer refresh-token")
      .send({
        reason: "Cliente relatou conversao ausente"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("queued");
        expect(body.auditLogId).toBe("audit_1");
        expect(body.jobAttemptId).toBe("job_attempt_1");
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(service.retryEvent).toHaveBeenCalledWith("diag_1", {
      reason: "Cliente relatou conversao ausente"
    });

    await app.close();
  });
});
