import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";

const authPayload = {
  user: {
    id: "user_1",
    email: "samuel@wpptrack.com",
    name: "Samuel Choairy",
    authProvider: "email",
    emailVerifiedAt: null
  },
  workspaces: [
    {
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "owner"
    }
  ],
  refreshToken: "a".repeat(64),
  expiresAt: new Date("2026-08-01T03:00:00.000Z")
};

async function createApp() {
  const authService = {
    register: vi.fn(async () => authPayload),
    login: vi.fn(async () => authPayload),
    getSession: vi.fn(async () => ({
      user: authPayload.user,
      workspaces: authPayload.workspaces
    })),
    logout: vi.fn(async () => undefined),
    getGoogleOAuthStart: vi.fn(() => ({
      provider: "google",
      action: "redirect",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc",
      missingEnv: [],
      state: "state-token"
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      {
        provide: AuthService,
        useValue: authService
      }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, authService };
}

describe("auth controller", () => {
  it("registers a user and returns a session payload", async () => {
    const { app, authService } = await createApp();

    await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        name: "Samuel Choairy",
        email: " SAMUEL@WPPTRACK.COM ",
        password: "strong-password",
        workspaceName: "Comunidade NOD"
      })
      .expect(201)
      .expect(({ body, headers }) => {
        expect(body.user.email).toBe("samuel@wpptrack.com");
        expect(body.refreshToken).toHaveLength(64);
        expect(headers["set-cookie"]?.[0]).toContain("wpptrack_session=");
      });

    expect(authService.register).toHaveBeenCalledWith(
      {
        name: "Samuel Choairy",
        email: "samuel@wpptrack.com",
        password: "strong-password",
        workspaceName: "Comunidade NOD"
      },
      expect.objectContaining({
        ipAddress: expect.any(String)
      })
    );

    await app.close();
  });

  it("logs in and sets the session cookie", async () => {
    const { app, authService } = await createApp();

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "SAMUEL@WPPTRACK.COM",
        password: "strong-password"
      })
      .expect(200)
      .expect(({ body, headers }) => {
        expect(body.user.email).toBe("samuel@wpptrack.com");
        expect(headers["set-cookie"]?.[0]).toContain("HttpOnly");
      });

    expect(authService.login).toHaveBeenCalledWith(
      {
        email: "samuel@wpptrack.com",
        password: "strong-password"
      },
      expect.objectContaining({
        ipAddress: expect.any(String)
      })
    );

    await app.close();
  });

  it("loads the active user from bearer token", async () => {
    const { app, authService } = await createApp();

    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${authPayload.refreshToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.email).toBe("samuel@wpptrack.com");
        expect(body.workspaces[0].role).toBe("owner");
      });

    expect(authService.getSession).toHaveBeenCalledWith(
      authPayload.refreshToken
    );

    await app.close();
  });

  it("logs out and clears the session cookie", async () => {
    const { app, authService } = await createApp();

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Authorization", `Bearer ${authPayload.refreshToken}`)
      .expect(200)
      .expect(({ body, headers }) => {
        expect(body).toEqual({ ok: true });
        expect(headers["set-cookie"]?.[0]).toContain("wpptrack_session=;");
      });

    expect(authService.logout).toHaveBeenCalledWith(authPayload.refreshToken);

    await app.close();
  });

  it("returns a Google OAuth start action without contacting Google", async () => {
    const { app, authService } = await createApp();

    await request(app.getHttpServer())
      .post("/auth/google/start")
      .send({
        redirectTo: "/overview"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.provider).toBe("google");
        expect(body.action).toBe("redirect");
        expect(body.authorizationUrl).toContain("accounts.google.com");
      });

    expect(authService.getGoogleOAuthStart).toHaveBeenCalledWith({
      redirectTo: "/overview"
    });

    await app.close();
  });
});
