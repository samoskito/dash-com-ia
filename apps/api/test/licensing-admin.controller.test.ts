import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformAdminService } from "../src/auth/platform-admin.service";
import { LicensingAdminController } from "../src/licensing/licensing.admin.controller";
import { LicensingModule } from "../src/licensing/licensing.module";
import { LicensingService } from "../src/licensing/licensing.service";

const adminLicense = {
  id: "lic_1",
  keyPrefix: "PALMUP-TEST",
  buyerEmail: "buyer@example.com",
  buyerName: "Buyer",
  guruTransactionId: null,
  productSku: "rastrackdash_annual",
  interval: "annual",
  expiresAt: "2027-08-19T00:00:00.000Z",
  status: "active",
  issuedAt: "2026-08-19T00:00:00.000Z",
  revokedAt: null,
  revokedReason: null,
  boundAccountEmail: "samuel@rastrack.app",
  boundAccountId: null,
  boundAt: "2026-08-19T01:00:00.000Z",
  nodApiEnabled: false,
  nodApiExpiresAt: null,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T01:00:00.000Z",
};

async function createApp(options?: { admin?: boolean }) {
  const allowAdmin = options?.admin ?? true;
  const platformAdminService = {
    assertPlatformAdmin: vi.fn(async () => {
      if (!allowAdmin) {
        throw new ForbiddenException(
          "Backoffice restrito aos administradores da plataforma",
        );
      }
      return {
        id: "user_1",
        email: "owner@wpptrack.com",
        role: "platform_owner" as const,
      };
    }),
  };
  const licensingService = {
    listLicenses: vi.fn(async () => ({
      items: [adminLicense],
      total: 1,
    })),
    getLicense: vi.fn(async () => ({
      ...adminLicense,
      activations: [],
    })),
    revokeLicense: vi.fn(async () => ({
      ...adminLicense,
      status: "revoked",
      revokedAt: "2026-08-19T12:00:00.000Z",
      revokedReason: "fraude confirmada",
    })),
    rebindLicense: vi.fn(async () => adminLicense),
    setNodApi: vi.fn(async () => ({
      ...adminLicense,
      nodApiEnabled: true,
    })),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [LicensingAdminController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdminService },
      { provide: LicensingService, useValue: licensingService },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, licensingService, platformAdminService };
}

describe("licensing admin controller", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      await app?.close();
    }
  });

  it("rejects non-admin callers with 403 and does not hit the service", async () => {
    const { app, licensingService, platformAdminService } = await createApp({
      admin: false,
    });
    apps.push(app);

    await request(app.getHttpServer())
      .get("/backoffice/licenses")
      .set("Authorization", "Bearer refresh-token")
      .expect(403);

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token",
    );
    expect(licensingService.listLicenses).not.toHaveBeenCalled();
  });

  it("lists licenses after asserting platform admin", async () => {
    const { app, licensingService, platformAdminService } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .get("/backoffice/licenses?status=active&email=buyer&take=20&skip=0")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(1);
        expect(body.items).toHaveLength(1);
        expect(body.items[0].id).toBe("lic_1");
        expect(JSON.stringify(body)).not.toContain("keyHash");
        expect(JSON.stringify(body)).not.toMatch(/PALMUP-[A-Z0-9]{4}-[A-Z0-9]{4}/);
      });

    expect(platformAdminService.assertPlatformAdmin).toHaveBeenCalledWith(
      "refresh-token",
    );
    expect(licensingService.listLicenses).toHaveBeenCalledWith({
      status: "active",
      email: "buyer",
      take: 20,
      skip: 0,
    });
  });

  it("requires a non-empty revoke reason", async () => {
    const { app, licensingService } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/backoffice/licenses/lic_1/revoke")
      .set("Authorization", "Bearer refresh-token")
      .send({ reason: "   " })
      .expect(400);

    expect(licensingService.revokeLicense).not.toHaveBeenCalled();
  });

  it("compiles LicensingModule and resolves the admin controller", async () => {
    const previous = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = "http://localhost:3000";
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [LicensingModule],
      }).compile();

      expect(
        moduleRef.get(LicensingAdminController, { strict: false }),
      ).toBeInstanceOf(LicensingAdminController);
    } finally {
      if (previous === undefined) {
        delete process.env.WEB_ORIGIN;
      } else {
        process.env.WEB_ORIGIN = previous;
      }
    }
  });
});
