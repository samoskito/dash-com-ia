import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { UazapiAdapter } from "../src/integrations/uazapi/uazapi.adapter";
import {
  NodApiAuthGuard,
  NodApiHealthAuthGuard,
} from "../src/integrations/nod-api/nod-api-auth.guard";
import { NodApiController } from "../src/integrations/nod-api/nod-api.controller";
import { NodApiService } from "../src/integrations/nod-api/nod-api.service";
import { LicenseAccountBindingService } from "../src/licensing/license-account-binding.service";
import {
  LICENSE_RATE_LIMIT_OPTIONS,
  LicenseRateLimitService,
} from "../src/licensing/license-rate-limit.service";
import { LicensingService } from "../src/licensing/licensing.service";

const RAW_KEY = "PALMUP-TEST-KEY1-KEY2-KEY3";
const UPSTREAM_ADMIN_TOKEN = "uazapi-admin-token-should-never-leak";

function baseLicense(overrides: Record<string, unknown> = {}) {
  return {
    id: "lic_1",
    keyHash: "hash",
    keyPrefix: "PALMUP-TEST",
    boundAccountEmail: null,
    boundAccountId: null,
    nodApiEnabled: true,
    nodApiExpiresAt: null,
    status: "active",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    ...overrides,
  };
}

const ACTIVE_STATE = { status: "active", softLock: false, hardLock: false, usable: true };
const BLOCKED_STATE = { status: "blocked", softLock: true, hardLock: false, usable: false };

async function createApp(options?: {
  license?: ReturnType<typeof baseLicense> | null;
  runtimeState?: typeof ACTIVE_STATE;
  uazapiOverrides?: Record<string, unknown>;
  maxRequests?: number;
}) {
  const license = options?.license === undefined ? baseLicense() : options.license;
  const prisma = {
    license: { findUnique: vi.fn(async () => license) },
  };
  const licensingService = {
    deriveRuntimeState: vi.fn(() => options?.runtimeState ?? ACTIVE_STATE),
  };
  const bindingService = {
    normalizeAccountIdentity: vi.fn((raw: string) => raw.trim().toLowerCase()),
  };
  const uazapi = {
    getHealth: vi.fn(async () => ({
      provider: "uazapi",
      status: "connected",
      checkedAt: new Date().toISOString(),
    })),
    createInstance: vi.fn(async () => ({
      status: "created",
      providerInstanceId: "instance_1",
      instanceToken: "instance-token-xyz",
      message: null,
    })),
    getInstanceStatus: vi.fn(async () => ({
      providerInstanceId: "instance_1",
      connectionStatus: "connected",
      qrCode: null,
      connectedPhone: "5511999999999",
      message: null,
    })),
    ...options?.uazapiOverrides,
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [NodApiController],
    providers: [
      NodApiService,
      NodApiAuthGuard,
      NodApiHealthAuthGuard,
      LicenseRateLimitService,
      {
        provide: LICENSE_RATE_LIMIT_OPTIONS,
        useValue: { maxRequests: options?.maxRequests ?? 30, windowMs: 5 * 60_000 },
      },
      { provide: PrismaService, useValue: prisma },
      { provide: LicensingService, useValue: licensingService },
      { provide: LicenseAccountBindingService, useValue: bindingService },
      { provide: UazapiAdapter, useValue: uazapi },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, prisma, licensingService, bindingService, uazapi };
}

describe("nod-api broker", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      await app?.close();
    }
  });

  it("rejects a request missing the license key/fingerprint", async () => {
    const { app } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .send({})
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe("nod_api_invalid_request");
      });
  });

  it("rejects an invalid license key", async () => {
    const { app } = await createApp({ license: null });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({})
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe("nod_api_invalid_license");
      });
  });

  it("rejects a blocked license (revoked/expired at the license level)", async () => {
    const { app } = await createApp({ runtimeState: BLOCKED_STATE });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({})
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("nod_api_license_blocked");
      });
  });

  it("rejects when nodApiEnabled is false", async () => {
    const { app } = await createApp({ license: baseLicense({ nodApiEnabled: false }) });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({})
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("nod_api_disabled");
      });
  });

  it("rejects when nodApiExpiresAt is in the past", async () => {
    const { app } = await createApp({
      license: baseLicense({ nodApiExpiresAt: new Date(Date.now() - 60_000) }),
    });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({})
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("nod_api_expired");
      });
  });

  it("rejects an account-identity mismatch against an already-bound license", async () => {
    const { app } = await createApp({
      license: baseLicense({ boundAccountEmail: "owner@example.com" }),
    });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .set("x-license-account-identity", "someone-else@example.com")
      .send({})
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("nod_api_account_mismatch");
      });
  });

  it("health skips the nodApiEnabled/expired gates but still reports the flags", async () => {
    const { app } = await createApp({
      license: baseLicense({ nodApiEnabled: false, nodApiExpiresAt: new Date(Date.now() - 60_000) }),
    });
    apps.push(app);

    await request(app.getHttpServer())
      .get("/nod-api/health")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          ok: true,
          upstreamConfigured: true,
          nodApiEnabled: false,
          nodApiExpiresAt: expect.any(String),
        });
      });
  });

  it("creates an instance and never leaks the admin token or raw key", async () => {
    const { app, uazapi } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({ name: "Turma 2026" })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          instanceId: "instance_1",
          instanceToken: "instance-token-xyz",
          status: "created",
        });
        const serialized = JSON.stringify(body);
        expect(serialized.toLowerCase()).not.toContain("admintoken");
        expect(serialized).not.toContain(RAW_KEY);
        expect(serialized).not.toContain(UPSTREAM_ADMIN_TOKEN);
      });

    expect(uazapi.createInstance).toHaveBeenCalledWith({
      name: "Turma 2026",
      localInstanceId: "nod-api:lic_1",
      workspaceId: "nod-api:lic_1",
    });
  });

  it("scrubs an admin-token-shaped field even if it leaked into an upstream payload", async () => {
    const { app } = await createApp({
      uazapiOverrides: {
        createInstance: vi.fn(async () => ({
          status: "created",
          providerInstanceId: "instance_1",
          instanceToken: "instance-token-xyz",
          message: null,
          adminToken: UPSTREAM_ADMIN_TOKEN,
        })),
      },
    });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({})
      .expect(200)
      .expect(({ body }) => {
        expect(body).not.toHaveProperty("adminToken");
        expect(JSON.stringify(body)).not.toContain(UPSTREAM_ADMIN_TOKEN);
      });
  });

  it("returns 503 when Uazapi admin credentials are not configured", async () => {
    const { app } = await createApp({
      uazapiOverrides: {
        createInstance: vi.fn(async () => ({
          status: "not_configured",
          providerInstanceId: null,
          instanceToken: null,
          message: "Missing UAZAPI_BASE_URL or UAZAPI_ADMIN_TOKEN",
        })),
      },
    });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({})
      .expect(503)
      .expect(({ body }) => {
        expect(body.code).toBe("nod_api_upstream_not_configured");
      });
  });

  it("checks instance status with the student-supplied instance token (BYO, not admin token)", async () => {
    const { app, uazapi } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances/status")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({ instanceId: "instance_1", instanceToken: "instance-token-xyz" })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          instanceId: "instance_1",
          status: "connected",
          qrCode: null,
          connectedPhone: "5511999999999",
          message: null,
        });
      });

    expect(uazapi.getInstanceStatus).toHaveBeenCalledWith(
      "instance_1",
      "instance-token-xyz",
    );
  });

  it("rejects an instance/status call missing instanceToken", async () => {
    const { app } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances/status")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({ instanceId: "instance_1" })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe("nod_api_invalid_request");
      });
  });

  it("rate limits a burst before calling the service", async () => {
    const { app, uazapi } = await createApp({ maxRequests: 2 });
    apps.push(app);

    for (let i = 0; i < 2; i += 1) {
      await request(app.getHttpServer())
        .post("/nod-api/instances")
        .set("x-license-key", RAW_KEY)
        .set("x-license-fingerprint", "fp-1")
        .send({})
        .expect(200);
    }

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .set("x-license-key", RAW_KEY)
      .set("x-license-fingerprint", "fp-1")
      .send({})
      .expect(429)
      .expect(({ body }) => {
        expect(body.code).toBe("license_rate_limited");
      });

    expect(uazapi.createInstance).toHaveBeenCalledTimes(2);
  });

  it("accepts the license key/fingerprint via body fields too", async () => {
    const { app } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/nod-api/instances")
      .send({ licenseKey: RAW_KEY, fingerprint: "fp-1" })
      .expect(200);
  });
});
