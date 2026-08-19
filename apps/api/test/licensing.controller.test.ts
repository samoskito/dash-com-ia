import { HttpException, HttpStatus } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LicenseCryptoService } from "../src/licensing/license-crypto.service";
import {
  LICENSE_RATE_LIMIT_OPTIONS,
  LicenseRateLimitService,
} from "../src/licensing/license-rate-limit.service";
import { LicensingController } from "../src/licensing/licensing.controller";
import { LicensingModule } from "../src/licensing/licensing.module";
import { LicensingService } from "../src/licensing/licensing.service";

const activateResult = {
  status: "active",
  softLock: false,
  hardLock: false,
  expiresAt: "2027-08-19T00:00:00.000Z",
  validUntil: "2026-08-22T00:00:00.000Z",
  cacheToken: "cache.token",
  bound: true,
  keyPrefix: "PALMUP-TEST",
};

const PUBLIC_KEY_PEM =
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAFAKEPUBLICKEYMATERIAL\n-----END PUBLIC KEY-----\n";

async function createApp(options?: { maxRequests?: number }) {
  const licensingService = {
    activate: vi.fn(async () => activateResult),
    heartbeat: vi.fn(async () => activateResult),
  };
  const cryptoService = {
    getPublicKeyExport: vi.fn(() => PUBLIC_KEY_PEM),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [LicensingController],
    providers: [
      LicenseRateLimitService,
      {
        provide: LICENSE_RATE_LIMIT_OPTIONS,
        useValue: {
          maxRequests: options?.maxRequests ?? 30,
          windowMs: 5 * 60_000,
        },
      },
      { provide: LicensingService, useValue: licensingService },
      { provide: LicenseCryptoService, useValue: cryptoService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, licensingService, cryptoService };
}

describe("licensing controller", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      await app?.close();
    }
  });

  it("returns the Ed25519 public key", async () => {
    const { app, cryptoService } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .get("/license/public-key")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          alg: "Ed25519",
          publicKey: PUBLIC_KEY_PEM,
        });
      });

    expect(cryptoService.getPublicKeyExport).toHaveBeenCalledTimes(1);
  });

  it("activates via the licensing service and forwards the client IP", async () => {
    const { app, licensingService } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/license/activate")
      .set("x-forwarded-for", "203.0.113.10, 10.0.0.1")
      .send({
        key: "PALMUP-TEST-KEY1-KEY2-KEY3",
        fingerprint: "fp-1",
        accountIdentity: "samuel@rastrack.app",
        appVersion: "1.0.0",
        deployLabel: "vps-aluno",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("active");
        expect(body.keyPrefix).toBe("PALMUP-TEST");
        expect(JSON.stringify(body)).not.toContain("PALMUP-TEST-KEY1-KEY2-KEY3");
      });

    expect(licensingService.activate).toHaveBeenCalledWith({
      key: "PALMUP-TEST-KEY1-KEY2-KEY3",
      fingerprint: "fp-1",
      accountIdentity: "samuel@rastrack.app",
      appVersion: "1.0.0",
      deployLabel: "vps-aluno",
      ipAddress: "203.0.113.10",
    });
  });

  it("heartbeats via the licensing service", async () => {
    const { app, licensingService } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/license/heartbeat")
      .send({
        key: "PALMUP-TEST-KEY1-KEY2-KEY3",
        fingerprint: "fp-1",
      })
      .expect(200);

    expect(licensingService.heartbeat).toHaveBeenCalledWith({
      key: "PALMUP-TEST-KEY1-KEY2-KEY3",
      fingerprint: "fp-1",
      ipAddress: expect.any(String),
    });
  });

  it("maps service HttpExceptions through", async () => {
    const { app, licensingService } = await createApp();
    apps.push(app);
    licensingService.activate.mockRejectedValueOnce(
      new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          code: "license_invalid",
          message: "Licença inválida.",
        },
        HttpStatus.UNAUTHORIZED,
      ),
    );

    await request(app.getHttpServer())
      .post("/license/activate")
      .send({
        key: "PALMUP-TEST-KEY1-KEY2-KEY3",
        fingerprint: "fp-1",
        accountIdentity: "samuel@rastrack.app",
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe("license_invalid");
      });
  });

  it("rate limits a burst before calling the service", async () => {
    const { app, licensingService } = await createApp({ maxRequests: 2 });
    apps.push(app);

    const payload = {
      key: "PALMUP-TEST-KEY1-KEY2-KEY3",
      fingerprint: "fp-1",
      accountIdentity: "samuel@rastrack.app",
    };

    await request(app.getHttpServer())
      .post("/license/activate")
      .send(payload)
      .expect(200);
    await request(app.getHttpServer())
      .post("/license/activate")
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post("/license/activate")
      .send(payload)
      .expect(429)
      .expect(({ body }) => {
        expect(body.code).toBe("license_rate_limited");
        expect(JSON.stringify(body)).not.toContain("PALMUP-TEST-KEY1-KEY2-KEY3");
      });

    expect(licensingService.activate).toHaveBeenCalledTimes(2);
  });

  it("compiles LicensingModule and resolves controller plus rate limiter", async () => {
    const previous = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = "http://localhost:3000";
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [LicensingModule],
      }).compile();

      expect(
        moduleRef.get(LicensingController, { strict: false }),
      ).toBeInstanceOf(LicensingController);
      expect(
        moduleRef.get(LicenseRateLimitService, { strict: false }),
      ).toBeInstanceOf(LicenseRateLimitService);
      expect(
        moduleRef.get(LicensingService, { strict: false }),
      ).toBeInstanceOf(LicensingService);
    } finally {
      if (previous === undefined) {
        delete process.env.WEB_ORIGIN;
      } else {
        process.env.WEB_ORIGIN = previous;
      }
    }
  });
});
