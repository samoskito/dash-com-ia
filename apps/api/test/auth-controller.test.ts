import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../src/common/runtime/runtime.module";

type GoogleCallbackResult = Awaited<
  ReturnType<AuthService["handleGoogleOAuthCallback"]>
>;

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
      role: "owner",
      operationalStatus: "active"
    }
  ],
  activeWorkspaceId: "workspace_1",
  refreshToken: "a".repeat(64),
  expiresAt: new Date("2026-08-01T03:00:00.000Z")
};

async function createApp(env: RuntimeEnv = {}) {
  const handleGoogleOAuthCallback = vi.fn<
    AuthService["handleGoogleOAuthCallback"]
  >(async () => ({
    provider: "google",
    action: "exchange_pending",
    missingEnv: [],
    codeReceived: true,
    redirectTo: "/overview"
  }));

  const authService = {
    register: vi.fn(async () => authPayload),
    login: vi.fn(async () => authPayload),
    getSession: vi.fn(async () => ({
      user: authPayload.user,
      workspaces: authPayload.workspaces,
      activeWorkspaceId: authPayload.activeWorkspaceId
    })),
    logout: vi.fn(async () => undefined),
    getGoogleOAuthStart: vi.fn(() => ({
      provider: "google",
      action: "redirect",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc",
      missingEnv: [],
      state: "state-token"
    })),
    handleGoogleOAuthCallback,
    requestPasswordReset: vi.fn(async () => ({
      ok: true,
      delivery: "not_configured",
      devToken: "reset-token-1234567890"
    })),
    resetPassword: vi.fn(async () => ({ ok: true })),
    requestEmailVerification: vi.fn(async () => ({
      ok: true,
      delivery: "not_configured",
      devToken: "verify-token-1234567890"
    })),
    confirmEmailVerification: vi.fn(async () => ({
      ok: true,
      emailVerifiedAt: "2026-07-02T03:00:00.000Z"
    }))
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      {
        provide: AuthService,
        useValue: authService
      },
      {
        provide: RUNTIME_ENV,
        useValue: env
      }
    ]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, authService };
}

describe("auth controller", () => {
  it("blocks public registration by default in production", async () => {
    const { app, authService } = await createApp({ NODE_ENV: "production" });

    await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        name: "Samuel Choairy",
        email: "samuel@wpptrack.com",
        password: "strong-password",
        workspaceName: "Comunidade NOD"
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe("Cadastro publico desabilitado");
      });

    expect(authService.register).not.toHaveBeenCalled();

    await app.close();
  });

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

  it("sets a shared cookie domain when configured for split frontend and API hosts", async () => {
    const { app } = await createApp({
      NODE_ENV: "production",
      AUTH_COOKIE_DOMAIN: ".rastrack.app"
    });

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "SAMUEL@WPPTRACK.COM",
        password: "strong-password"
      })
      .expect(200)
      .expect(({ headers }) => {
        const setCookie = headers["set-cookie"];
        const cookies = Array.isArray(setCookie)
          ? setCookie
          : [setCookie ?? ""];
        const sharedCookie = cookies.find((cookie) =>
          cookie.includes("Domain=.rastrack.app")
        );
        const legacyCookieCleanup = cookies.find(
          (cookie) =>
            cookie.includes("wpptrack_session=;") &&
            !cookie.includes("Domain=")
        );

        expect(sharedCookie).toContain("wpptrack_session=");
        expect(sharedCookie).toContain("Secure");
        expect(legacyCookieCleanup).toBeDefined();
      });

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

  it("clears the shared cookie domain when configured", async () => {
    const { app } = await createApp({
      NODE_ENV: "production",
      AUTH_COOKIE_DOMAIN: ".rastrack.app"
    });

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Authorization", `Bearer ${authPayload.refreshToken}`)
      .expect(200)
      .expect(({ headers }) => {
        const setCookie = headers["set-cookie"];
        const cookies = Array.isArray(setCookie)
          ? setCookie
          : [setCookie ?? ""];
        expect(
          cookies.some(
            (cookie) =>
              cookie.includes("wpptrack_session=;") &&
              cookie.includes("Domain=.rastrack.app")
          )
        ).toBe(true);
        expect(
          cookies.some(
            (cookie) =>
              cookie.includes("wpptrack_session=;") &&
              !cookie.includes("Domain=")
          )
        ).toBe(true);
      });

    await app.close();
  });

  it("returns a Google OAuth start action without contacting Google", async () => {
    const { app, authService } = await createApp({
      AUTH_GOOGLE_ENABLED: "true"
    });

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

  it("redirects authenticated Google OAuth callbacks back to the web app", async () => {
    const { app, authService } = await createApp({
      AUTH_GOOGLE_ENABLED: "true"
    });
    authService.handleGoogleOAuthCallback.mockResolvedValueOnce({
      provider: "google",
      action: "authenticated",
      missingEnv: [],
      codeReceived: true,
      redirectTo: "/reports",
      session: authPayload
    } as GoogleCallbackResult);

    await request(app.getHttpServer())
      .get("/auth/google/callback?code=oauth-code&state=state-token")
      .expect(302)
      .expect(({ headers }) => {
        expect(headers.location).toBe("http://localhost:3000/reports");
        expect(headers["set-cookie"]?.[0]).toContain("wpptrack_session=");
      });

    expect(authService.handleGoogleOAuthCallback).toHaveBeenCalledWith(
      {
        code: "oauth-code",
        state: "state-token"
      },
      expect.objectContaining({
        ipAddress: expect.any(String)
      })
    );

    await app.close();
  });

  it("sanitizes Google OAuth callback redirects before returning to the web app", async () => {
    const { app, authService } = await createApp({
      AUTH_GOOGLE_ENABLED: "true"
    });
    authService.handleGoogleOAuthCallback.mockResolvedValueOnce({
      provider: "google",
      action: "authenticated",
      missingEnv: [],
      codeReceived: true,
      redirectTo: "https://example.com/phishing",
      session: authPayload
    } as GoogleCallbackResult);

    await request(app.getHttpServer())
      .get("/auth/google/callback?code=oauth-code&state=state-token")
      .expect(302)
      .expect(({ headers }) => {
        expect(headers.location).toBe("http://localhost:3000/overview");
      });

    await app.close();
  });

  it("redirects Google OAuth callback failures to the login screen", async () => {
    const { app, authService } = await createApp({
      AUTH_GOOGLE_ENABLED: "true"
    });

    await request(app.getHttpServer())
      .get("/auth/google/callback?code=oauth-code&state=state-token")
      .expect(302)
      .expect(({ headers }) => {
        expect(headers.location).toBe(
          "http://localhost:3000/login?error=google_pending"
        );
      });

    expect(authService.handleGoogleOAuthCallback).toHaveBeenCalledWith(
      {
        code: "oauth-code",
        state: "state-token"
      },
      expect.objectContaining({
        ipAddress: expect.any(String)
      })
    );

    await app.close();
  });

  it("blocks Google OAuth routes when the deployment flag is disabled", async () => {
    const { app, authService } = await createApp({
      AUTH_GOOGLE_ENABLED: "false"
    });

    await request(app.getHttpServer())
      .post("/auth/google/start")
      .send({ redirectTo: "/overview" })
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe("Login com Google desabilitado");
      });

    await request(app.getHttpServer())
      .get("/auth/google/callback?code=oauth-code&state=state-token")
      .expect(403);

    expect(authService.getGoogleOAuthStart).not.toHaveBeenCalled();
    expect(authService.handleGoogleOAuthCallback).not.toHaveBeenCalled();

    await app.close();
  });

  it("starts and confirms password reset", async () => {
    const { app, authService } = await createApp();

    await request(app.getHttpServer())
      .post("/auth/password/forgot")
      .send({ email: " SAMUEL@WPPTRACK.COM " })
      .expect(201)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.devToken).toBe("reset-token-1234567890");
      });

    await request(app.getHttpServer())
      .post("/auth/password/reset")
      .send({
        token: "reset-token-1234567890",
        password: "new-strong-password"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
      });

    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      {
        email: "samuel@wpptrack.com"
      },
      expect.objectContaining({
        ipAddress: expect.any(String)
      })
    );
    expect(authService.resetPassword).toHaveBeenCalledWith({
      token: "reset-token-1234567890",
      password: "new-strong-password"
    });

    await app.close();
  });

  it("starts and confirms email verification", async () => {
    const { app, authService } = await createApp();

    await request(app.getHttpServer())
      .post("/auth/email/verification/start")
      .set("Authorization", `Bearer ${authPayload.refreshToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.devToken).toBe("verify-token-1234567890");
      });

    await request(app.getHttpServer())
      .post("/auth/email/verification/confirm")
      .send({ token: "verify-token-1234567890" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.emailVerifiedAt).toBe("2026-07-02T03:00:00.000Z");
      });

    expect(authService.requestEmailVerification).toHaveBeenCalledWith(
      authPayload.refreshToken
    );
    expect(authService.confirmEmailVerification).toHaveBeenCalledWith({
      token: "verify-token-1234567890"
    });

    await app.close();
  });
});
