import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuruLicenseWebhookController } from "../src/licensing/guru-license-webhook.controller";
import { GuruLicenseWebhookService } from "../src/licensing/guru-license-webhook.service";
import { LicenseRateLimitService } from "../src/licensing/license-rate-limit.service";

async function createApp(handleImpl?: ReturnType<typeof vi.fn>) {
  const webhooks = {
    handle:
      handleImpl ??
      vi.fn(async (_body: unknown, secret: string | undefined) => {
        if (secret === "ok-secret") {
          return { httpStatus: 200, body: { resultStatus: "license_issued" } };
        }
        return { httpStatus: 401, body: { resultStatus: "signature_invalid" } };
      }),
  };
  const rateLimit = {
    assertAllowed: vi.fn(),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [GuruLicenseWebhookController],
    providers: [
      { provide: GuruLicenseWebhookService, useValue: webhooks },
      { provide: LicenseRateLimitService, useValue: rateLimit },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, webhooks, rateLimit };
}

describe("GuruLicenseWebhookController", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close();
    }
  });

  it("accepts shared secret from query string when Guru cannot send headers", async () => {
    const { app, webhooks } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/license/webhooks/guru?secret=ok-secret")
      .send({
        status: "ativa",
        id: "sub_1",
        subscriber: { email: "aluno@example.com", name: "Aluno" },
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.resultStatus).toBe("license_issued");
      });

    expect(webhooks.handle).toHaveBeenCalledWith(
      expect.any(Object),
      "ok-secret",
    );
  });

  it("rejects missing/invalid query secret", async () => {
    const { app } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/license/webhooks/guru?secret=wrong")
      .send({ status: "ativa", id: "sub_2" })
      .expect(401)
      .expect(({ body }) => {
        expect(body.resultStatus).toBe("signature_invalid");
      });
  });

  it("still accepts header secret", async () => {
    const { app, webhooks } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/license/webhooks/guru")
      .set("x-guru-webhook-secret", "ok-secret")
      .send({ status: "ativa", id: "sub_3" })
      .expect(200);

    expect(webhooks.handle).toHaveBeenCalledWith(
      expect.any(Object),
      "ok-secret",
    );
  });
});
