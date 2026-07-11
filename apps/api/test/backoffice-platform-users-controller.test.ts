import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { BackofficePlatformUsersController } from "../src/auth/backoffice-platform-users.controller";
import { PlatformAdminService } from "../src/auth/platform-admin.service";

async function createApp() {
  const platformAdminService = {
    assertPlatformOwner: vi.fn(async () => ({
      id: "platform_owner",
      email: "owner@wpptrack.com",
      role: "platform_owner"
    }))
  };
  const authService = {
    listPlatformUsers: vi.fn(async () => [
      {
        id: "platform_owner",
        name: "Owner",
        email: "owner@wpptrack.com",
        role: "platform_owner",
        createdAt: "2026-07-11T18:00:00.000Z"
      }
    ]),
    provisionPlatformUser: vi.fn(async (input) => ({
      id: "operator_1",
      name: input.name,
      email: input.email,
      role: input.role,
      createdAt: "2026-07-11T18:00:00.000Z"
    })),
    updatePlatformUserRole: vi.fn(async (_userId, input) => ({
      id: "operator_1",
      role: input.role
    }))
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BackofficePlatformUsersController],
    providers: [
      { provide: PlatformAdminService, useValue: platformAdminService },
      { provide: AuthService, useValue: authService }
    ]
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, authService, platformAdminService };
}

describe("backoffice platform users controller", () => {
  it("lists platform users only after owner authorization", async () => {
    const { app, platformAdminService } = await createApp();

    await request(app.getHttpServer())
      .get("/backoffice/platform-users")
      .set("Authorization", "Bearer refresh-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].role).toBe("platform_owner");
      });

    expect(platformAdminService.assertPlatformOwner).toHaveBeenCalledWith(
      "refresh-token"
    );
    await app.close();
  });

  it("creates an internal platform operator without returning the password", async () => {
    const { app, authService } = await createApp();

    await request(app.getHttpServer())
      .post("/backoffice/platform-users")
      .set("Authorization", "Bearer refresh-token")
      .send({
        name: "Operador",
        email: "operador@wpptrack.com",
        password: "temporary-strong-password",
        role: "platform_operator"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.role).toBe("platform_operator");
        expect(JSON.stringify(body)).not.toContain("password");
      });

    expect(authService.provisionPlatformUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "operador@wpptrack.com" }),
      "platform_owner"
    );
    await app.close();
  });
});
