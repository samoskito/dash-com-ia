import { HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { hashLicenseKey } from "../src/licensing/license-key.generator";
import { LicenseRateLimitService } from "../src/licensing/license-rate-limit.service";

function expectRateLimited(error: unknown) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  expect(exception.getResponse()).toMatchObject({
    statusCode: 429,
    code: "license_rate_limited",
  });
}

describe("LicenseRateLimitService", () => {
  it("allows traffic under the per-route IP budget", () => {
    const limiter = new LicenseRateLimitService({
      maxRequests: 2,
      windowMs: 60_000,
    });

    limiter.assertAllowed("activate", "203.0.113.10");
    limiter.assertAllowed("activate", "203.0.113.10");
  });

  it("trips after a burst on the same route and IP", () => {
    let now = 1_700_000_000_000;
    const limiter = new LicenseRateLimitService({
      maxRequests: 2,
      windowMs: 5 * 60_000,
      now: () => now,
    });

    limiter.assertAllowed("activate", "203.0.113.10");
    limiter.assertAllowed("activate", "203.0.113.10");

    try {
      limiter.assertAllowed("activate", "203.0.113.10");
      throw new Error("expected rate limit");
    } catch (error) {
      expectRateLimited(error);
    }
  });

  it("isolates budgets by route and by IP", () => {
    const limiter = new LicenseRateLimitService({
      maxRequests: 1,
      windowMs: 60_000,
    });

    limiter.assertAllowed("activate", "203.0.113.10");
    limiter.assertAllowed("heartbeat", "203.0.113.10");
    limiter.assertAllowed("activate", "198.51.100.20");

    try {
      limiter.assertAllowed("activate", "203.0.113.10");
      throw new Error("expected rate limit");
    } catch (error) {
      expectRateLimited(error);
    }
  });

  it("also buckets by license key hash prefix when a key is present", () => {
    const limiter = new LicenseRateLimitService({
      maxRequests: 1,
      windowMs: 60_000,
    });
    const key = "PALMUP-TEST-KEY1-KEY2-KEY3";

    limiter.assertAllowed("activate", "203.0.113.10", key);

    try {
      limiter.assertAllowed("activate", "198.51.100.20", key);
      throw new Error("expected rate limit");
    } catch (error) {
      expectRateLimited(error);
    }

    const response = (() => {
      try {
        limiter.assertAllowed("activate", "198.51.100.20", key);
      } catch (error) {
        return (error as HttpException).getResponse();
      }
      return null;
    })();
    expect(JSON.stringify(response)).not.toContain(key);
    expect(JSON.stringify(response)).not.toContain(hashLicenseKey(key));
  });

  it("expires hits after the window using the injected clock", () => {
    let now = 1_700_000_000_000;
    const limiter = new LicenseRateLimitService({
      maxRequests: 1,
      windowMs: 1_000,
      now: () => now,
    });

    limiter.assertAllowed("public-key", "203.0.113.10");
    now += 1_001;
    limiter.assertAllowed("public-key", "203.0.113.10");
  });
});
