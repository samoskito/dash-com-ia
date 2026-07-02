import { describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service";

function createService(env: Record<string, string | undefined>) {
  return new AuthService({} as never, {} as never, env);
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
});
