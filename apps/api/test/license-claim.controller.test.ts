import { HttpException, HttpStatus, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RUNTIME_ENV,
  RUNTIME_FETCH,
  type RuntimeEnv,
} from "../src/common/runtime/runtime.module";
import { LicenseClaimCaptchaService } from "../src/licensing/license-claim-captcha.service";
import { LicenseClaimController } from "../src/licensing/license-claim.controller";
import { LicenseClaimService } from "../src/licensing/license-claim.service";
import { LicenseRateLimitService } from "../src/licensing/license-rate-limit.service";

const issuedResult = {
  status: "issued" as const,
  licenseKey: "PALMUP-TEST-KEY1-KEY2-KEY3",
  accountIdentity: "ana@example.com",
  keyPrefix: "PALMUP-TEST",
  expiresAt: "2027-09-23T00:00:00.000Z",
  emailDelivery: "queued" as const,
};

type ClaimsMock = {
  processRequest: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
};

type CaptchaMock = {
  verify: ReturnType<typeof vi.fn>;
};

async function createApp(options?: {
  enabled?: boolean;
  claims?: ClaimsMock;
  captcha?: CaptchaMock;
}) {
  const claims =
    options?.claims ??
    ({
      processRequest: vi.fn(async () => "eligible"),
      confirm: vi.fn(async () => issuedResult),
    } satisfies ClaimsMock);
  const captcha =
    options?.captcha ??
    ({ verify: vi.fn(async () => true) } satisfies CaptchaMock);
  const env: RuntimeEnv = {
    LICENSE_CLAIM_ENABLED: options?.enabled === false ? "false" : "true",
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [LicenseClaimController],
    providers: [
      LicenseRateLimitService,
      { provide: LicenseClaimService, useValue: claims },
      { provide: LicenseClaimCaptchaService, useValue: captcha },
      { provide: RUNTIME_ENV, useValue: env },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, claims, captcha };
}

describe("license claim controller", () => {
  const apps: INestApplication[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close();
    }
    vi.restoreAllMocks();
  });

  it("returns 503 from both routes when the kill switch is disabled", async () => {
    const { app, claims, captcha } = await createApp({ enabled: false });
    apps.push(app);

    for (const route of ["request", "confirm"]) {
      await request(app.getHttpServer())
        .post(`/license/claim/${route}`)
        .send({ email: "ana@example.com", code: "123456" })
        .expect(503)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            statusCode: 503,
            code: "license_claim_disabled",
          });
        });
    }

    expect(captcha.verify).not.toHaveBeenCalled();
    expect(claims.processRequest).not.toHaveBeenCalled();
    expect(claims.confirm).not.toHaveBeenCalled();
  });

  it("returns the identical 202 response for eligible, ineligible, and failed processing", async () => {
    const processRequest = vi
      .fn()
      .mockResolvedValueOnce("eligible")
      .mockResolvedValueOnce("not_eligible")
      .mockRejectedValueOnce(new Error("student base unavailable"));
    const claims = {
      processRequest,
      confirm: vi.fn(async () => issuedResult),
    } satisfies ClaimsMock;
    const { app } = await createApp({ claims });
    apps.push(app);

    const bodies: unknown[] = [];
    for (const email of ["ana@example.com", "bia@example.com", "caio@example.com"]) {
      const response = await request(app.getHttpServer())
        .post("/license/claim/request")
        .send({ email })
        .expect(202)
        .expect("Cache-Control", "no-store");
      bodies.push(response.body);
    }

    expect(bodies.map((body) => JSON.stringify(body))).toEqual([
      '{"status":"code_sent_if_eligible"}',
      '{"status":"code_sent_if_eligible"}',
      '{"status":"code_sent_if_eligible"}',
    ]);
    expect(processRequest).toHaveBeenNthCalledWith(1, "ana@example.com");
    expect(processRequest).toHaveBeenNthCalledWith(2, "bia@example.com");
    expect(processRequest).toHaveBeenNthCalledWith(3, "caio@example.com");
  });

  it("returns the same 202 response and skips processing when captcha fails", async () => {
    const captcha = { verify: vi.fn(async () => false) } satisfies CaptchaMock;
    const { app, claims } = await createApp({ captcha });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/license/claim/request")
      .send({ email: "ana@example.com", captchaToken: "bad-token" })
      .expect(202)
      .expect({ status: "code_sent_if_eligible" });

    expect(captcha.verify).toHaveBeenCalledWith("bad-token", expect.any(String));
    expect(claims.processRequest).not.toHaveBeenCalled();
  });

  it("rate limits the sixth request by socket IP even when forwarded IPs change", async () => {
    const { app, claims, captcha } = await createApp();
    apps.push(app);

    for (let index = 0; index < 5; index += 1) {
      await request(app.getHttpServer())
        .post("/license/claim/request")
        .set("x-forwarded-for", `203.0.113.${index + 1}`)
        .send({ email: `student-${index}@example.com` })
        .expect(202);
    }

    await request(app.getHttpServer())
      .post("/license/claim/request")
      .set("x-forwarded-for", "203.0.113.99")
      .send({ email: "student-5@example.com" })
      .expect(429)
      .expect(({ body }) => {
        expect(body.code).toBe("license_rate_limited");
      });

    expect(captcha.verify).toHaveBeenCalledTimes(5);
    expect(claims.processRequest).toHaveBeenCalledTimes(5);
  });

  it("rate limits the fourth code request for one normalized email", async () => {
    const { app, claims } = await createApp();
    apps.push(app);

    for (let index = 0; index < 3; index += 1) {
      await request(app.getHttpServer())
        .post("/license/claim/request")
        .set("x-forwarded-for", `203.0.113.${index + 1}`)
        .send({ email: index === 0 ? " ANA@EXAMPLE.COM " : "ana@example.com" })
        .expect(202);
    }

    await request(app.getHttpServer())
      .post("/license/claim/request")
      .set("x-forwarded-for", "203.0.113.4")
      .send({ email: "ana@example.com" })
      .expect(429);

    expect(claims.processRequest).toHaveBeenCalledTimes(3);
  });

  it("returns a confirmed license with no-store headers", async () => {
    const { app, claims } = await createApp();
    apps.push(app);

    await request(app.getHttpServer())
      .post("/license/claim/confirm")
      .send({ email: "ana@example.com", code: "123456" })
      .expect(200)
      .expect("Cache-Control", "no-store")
      .expect("Pragma", "no-cache")
      .expect(({ body }) => {
        expect(body).toEqual(issuedResult);
      });

    expect(claims.confirm).toHaveBeenCalledWith(
      "ana@example.com",
      "123456",
    );
  });

  it("preserves the generic invalid-code error from the claim service", async () => {
    const invalidCode = new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        code: "license_claim_code_invalid",
        message: "Código inválido ou expirado.",
      },
      HttpStatus.BAD_REQUEST,
    );
    const claims = {
      processRequest: vi.fn(async () => "eligible"),
      confirm: vi.fn(async () => {
        throw invalidCode;
      }),
    } satisfies ClaimsMock;
    const { app } = await createApp({ claims });
    apps.push(app);

    await request(app.getHttpServer())
      .post("/license/claim/confirm")
      .send({ email: "ana@example.com", code: "000000" })
      .expect(400)
      .expect("Cache-Control", "no-store")
      .expect(({ body }) => {
        expect(body).toEqual({
          statusCode: 400,
          code: "license_claim_code_invalid",
          message: "Código inválido ou expirado.",
        });
      });
  });
});

describe("license claim captcha service", () => {
  it("is disabled when the Turnstile secret is empty", async () => {
    const fetchImpl = vi.fn();
    const captcha = new LicenseClaimCaptchaService(
      {},
      fetchImpl as unknown as typeof fetch,
    );

    await expect(captcha.verify(undefined, "203.0.113.10")).resolves.toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the token and remote IP to Turnstile", async () => {
    const fetchImpl = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const captcha = new LicenseClaimCaptchaService(
      { LICENSE_CLAIM_TURNSTILE_SECRET_KEY: " turnstile-secret " },
      fetchImpl as unknown as typeof fetch,
    );

    await expect(captcha.verify(" token-value ", "203.0.113.10")).resolves.toBe(
      true,
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const params = new URLSearchParams(init?.body as string);
    expect(Object.fromEntries(params)).toEqual({
      secret: "turnstile-secret",
      response: "token-value",
      remoteip: "203.0.113.10",
    });
  });

  it("fails closed for a missing token or a Turnstile/network error", async () => {
    const fetchImpl = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) => {
        throw new Error("network unavailable");
      },
    );
    const captcha = new LicenseClaimCaptchaService(
      { LICENSE_CLAIM_TURNSTILE_SECRET_KEY: "turnstile-secret" },
      fetchImpl as unknown as typeof fetch,
    );

    await expect(captcha.verify(undefined)).resolves.toBe(false);
    await expect(captcha.verify("token-value")).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an HTTP failure", new Response(null, { status: 503 })],
    [
      "an unsuccessful verification",
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ],
  ])("fails closed for %s", async (_label, turnstileResponse) => {
    const fetchImpl = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) => turnstileResponse,
    );
    const captcha = new LicenseClaimCaptchaService(
      { LICENSE_CLAIM_TURNSTILE_SECRET_KEY: "turnstile-secret" },
      fetchImpl as unknown as typeof fetch,
    );

    await expect(captcha.verify("token-value")).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
