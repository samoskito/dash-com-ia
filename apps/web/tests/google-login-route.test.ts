import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/login/google/route";

const originalFetch = global.fetch;
const originalGoogleFlag = process.env.AUTH_GOOGLE_ENABLED;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalGoogleFlag === undefined) {
    delete process.env.AUTH_GOOGLE_ENABLED;
  } else {
    process.env.AUTH_GOOGLE_ENABLED = originalGoogleFlag;
  }
  vi.restoreAllMocks();
});

describe("google login route", () => {
  it("requests a Google OAuth start action and redirects to Google", async () => {
    process.env.AUTH_GOOGLE_ENABLED = "true";
    global.fetch = vi.fn(
      async () =>
      new Response(
        JSON.stringify({
          provider: "google",
          action: "redirect",
          authorizationUrl:
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=client_123",
          missingEnv: [],
          state: "state-token"
        }),
        { status: 200 }
      )
    ) as typeof fetch;

    const response = await GET(
      new Request("http://localhost/login/google?redirectTo=/reports")
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/google/start"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          redirectTo: "/reports"
        })
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
  });

  it("redirects back to login when Google OAuth is not configured", async () => {
    process.env.AUTH_GOOGLE_ENABLED = "true";
    global.fetch = vi.fn(
      async () =>
      new Response(
        JSON.stringify({
          provider: "google",
          action: "configure_env",
          authorizationUrl: null,
          missingEnv: ["GOOGLE_CLIENT_ID"],
          state: null
        }),
        { status: 200 }
      )
    ) as typeof fetch;

    const response = await GET(new Request("http://localhost/login/google"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=google_env"
    );
  });

  it("does not contact the API when Google login is disabled", async () => {
    process.env.AUTH_GOOGLE_ENABLED = "false";
    global.fetch = vi.fn() as typeof fetch;

    const response = await GET(new Request("http://localhost/login/google"));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=google_disabled"
    );
  });
});
