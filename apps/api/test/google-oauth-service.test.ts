import { describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service";

function createService(
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch
) {
  return new AuthService({} as never, {} as never, env, fetchImpl);
}

function tamperOAuthStateRedirect(state: string, redirectTo: string): string {
  const [payload, signature] = state.split(".");
  const decoded = JSON.parse(
    Buffer.from(payload ?? state, "base64url").toString("utf8")
  ) as Record<string, unknown>;
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      ...decoded,
      redirectTo
    })
  ).toString("base64url");

  return signature ? `${tamperedPayload}.${signature}` : tamperedPayload;
}

describe("google oauth service", () => {
  it("returns missing env action when Google credentials are not configured", () => {
    const service = createService({});

    const action = service.getGoogleOAuthStart({
      redirectTo: "/overview"
    });

    expect(action).toEqual({
      provider: "google",
      action: "configure_env",
      authorizationUrl: null,
      missingEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_REDIRECT_URI"],
      state: null
    });
  });

  it("builds Google authorization URL without contacting Google", () => {
    const service = createService({
      GOOGLE_CLIENT_ID: "client_123",
      GOOGLE_REDIRECT_URI: "https://api.wpptrack.test/auth/google/callback"
    });

    const action = service.getGoogleOAuthStart({
      redirectTo: "/overview"
    });

    expect(action.action).toBe("redirect");
    expect(action.authorizationUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(action.authorizationUrl).toContain("client_id=client_123");
    expect(action.authorizationUrl).toContain("scope=openid+email+profile");
    expect(action.state).toEqual(expect.any(String));
  });

  it("reports missing callback env without exchanging the authorization code", async () => {
    const service = createService({
      GOOGLE_CLIENT_ID: "client_123",
      GOOGLE_REDIRECT_URI: "https://api.wpptrack.test/auth/google/callback"
    });

    const result = await service.handleGoogleOAuthCallback({
      code: "oauth-code",
      state: "state-token"
    });

    expect(result).toEqual({
      provider: "google",
      action: "configure_env",
      missingEnv: ["GOOGLE_CLIENT_SECRET"],
      codeReceived: true,
      redirectTo: "/overview"
    });
  });

  it("ignores tampered Google OAuth state redirects", async () => {
    const service = createService({
      GOOGLE_CLIENT_ID: "client_123",
      GOOGLE_REDIRECT_URI: "https://api.wpptrack.test/auth/google/callback"
    });
    const start = service.getGoogleOAuthStart({
      redirectTo: "/reports"
    });
    const tamperedState = tamperOAuthStateRedirect(
      start.state!,
      "/settings"
    );

    const result = await service.handleGoogleOAuthCallback({
      code: "oauth-code",
      state: tamperedState
    });

    expect(result).toMatchObject({
      action: "configure_env",
      redirectTo: "/overview"
    });
  });

  it("returns exchange_failed when Google rejects the callback code", async () => {
    const service = createService(
      {
        GOOGLE_CLIENT_ID: "client_123",
        GOOGLE_CLIENT_SECRET: "secret_123",
        GOOGLE_REDIRECT_URI: "https://api.wpptrack.test/auth/google/callback"
      },
      (async () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Bad authorization code"
          }),
          { status: 400 }
        )) as typeof fetch
    );
    const start = service.getGoogleOAuthStart({
      redirectTo: "/reports"
    });

    const result = await service.handleGoogleOAuthCallback({
      code: "oauth-code",
      state: start.state!
    });

    expect(result).toEqual({
      provider: "google",
      action: "exchange_failed",
      missingEnv: [],
      codeReceived: true,
      redirectTo: "/reports",
      message: "Bad authorization code"
    });
  });
});
