import { afterEach, describe, expect, it, vi } from "vitest";
import { apiBaseUrl } from "../src/lib/api";
import {
  confirmClaimCode,
  requestClaimCode,
} from "../src/lib/license-claim-api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestClaimCode", () => {
  it("posts the email without cookies or cache and treats 202 as generic success", async () => {
    const fetchMock = stubFetch(
      jsonResponse(202, { status: "code_sent_if_eligible" }),
    );

    await expect(requestClaimCode("aluno@x.com")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${apiBaseUrl}/license/claim/request`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual({ email: "aluno@x.com" });
  });

  it("sends the captcha token when present", async () => {
    const fetchMock = stubFetch(
      jsonResponse(202, { status: "code_sent_if_eligible" }),
    );

    await requestClaimCode("aluno@x.com", "turnstile-token");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      email: "aluno@x.com",
      captchaToken: "turnstile-token",
    });
  });

  it("maps license_rate_limited to rate_limited", async () => {
    stubFetch(jsonResponse(429, { statusCode: 429, code: "license_rate_limited" }));

    await expect(requestClaimCode("aluno@x.com")).resolves.toEqual({
      ok: false,
      code: "rate_limited",
    });
  });

  it("maps license_claim_disabled to disabled", async () => {
    stubFetch(jsonResponse(503, { statusCode: 503, code: "license_claim_disabled" }));

    await expect(requestClaimCode("aluno@x.com")).resolves.toEqual({
      ok: false,
      code: "disabled",
    });
  });

  it("maps a thrown fetch to network", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    await expect(requestClaimCode("aluno@x.com")).resolves.toEqual({
      ok: false,
      code: "network",
    });
  });

  it("maps an unknown server error to network", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));

    await expect(requestClaimCode("aluno@x.com")).resolves.toEqual({
      ok: false,
      code: "network",
    });
  });
});

describe("confirmClaimCode", () => {
  const issuedBody = {
    status: "issued",
    licenseKey: "PALMUP-AAAA-BBBB-CCCC-DDDD",
    accountIdentity: "aluno@x.com",
    keyPrefix: "PALMUP-AAAA",
    expiresAt: "2027-09-23T12:00:00.000Z",
    emailDelivery: "queued",
  };

  it("posts email and code without cookies or cache and returns the issued key", async () => {
    const fetchMock = stubFetch(jsonResponse(200, issuedBody));

    await expect(confirmClaimCode("aluno@x.com", "123456")).resolves.toEqual({
      ok: true,
      status: "issued",
      licenseKey: "PALMUP-AAAA-BBBB-CCCC-DDDD",
      accountIdentity: "aluno@x.com",
      keyPrefix: "PALMUP-AAAA",
      expiresAt: "2027-09-23T12:00:00.000Z",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${apiBaseUrl}/license/claim/confirm`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "aluno@x.com",
      code: "123456",
    });
  });

  it("returns already_issued_contact_support", async () => {
    stubFetch(jsonResponse(200, { status: "already_issued_contact_support" }));

    await expect(confirmClaimCode("aluno@x.com", "123456")).resolves.toEqual({
      ok: true,
      status: "already_issued_contact_support",
    });
  });

  it.each([
    [400, "license_claim_code_invalid", "code_invalid"],
    [409, "license_claim_in_progress", "in_progress"],
    [429, "license_rate_limited", "rate_limited"],
    [503, "license_claim_disabled", "disabled"],
  ] as const)("maps HTTP %i %s to %s", async (status, apiCode, expected) => {
    stubFetch(jsonResponse(status, { statusCode: status, code: apiCode }));

    await expect(confirmClaimCode("aluno@x.com", "123456")).resolves.toEqual({
      ok: false,
      code: expected,
    });
  });

  it("maps a thrown fetch to network", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    await expect(confirmClaimCode("aluno@x.com", "123456")).resolves.toEqual({
      ok: false,
      code: "network",
    });
  });

  it("treats a malformed success body as network", async () => {
    stubFetch(jsonResponse(200, { status: "issued" }));

    await expect(confirmClaimCode("aluno@x.com", "123456")).resolves.toEqual({
      ok: false,
      code: "network",
    });
  });
});
