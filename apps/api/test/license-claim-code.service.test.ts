import { describe, expect, it } from "vitest";
import { LicenseClaimCodeService } from "../src/licensing/license-claim-code.service";

const ENV = {
  LICENSE_DELIVERY_SECRET: "test-license-delivery-secret",
};

describe("LicenseClaimCodeService", () => {
  it("generates zero-padded six-digit codes", () => {
    const service = new LicenseClaimCodeService(ENV);

    for (let index = 0; index < 200; index += 1) {
      expect(service.generate()).toMatch(/^\d{6}$/);
    }
  });

  it("verifies a code hashed for the same claim", () => {
    const service = new LicenseClaimCodeService(ENV);
    const storedHash = service.hash("claim-1", "012345");

    expect(service.verify("claim-1", "012345", storedHash)).toBe(true);
  });

  it("rejects a matching code hashed for a different claim", () => {
    const service = new LicenseClaimCodeService(ENV);
    const storedHash = service.hash("claim-1", "012345");

    expect(service.verify("claim-2", "012345", storedHash)).toBe(false);
  });

  it("rejects a different code", () => {
    const service = new LicenseClaimCodeService(ENV);
    const storedHash = service.hash("claim-1", "012345");

    expect(service.verify("claim-1", "543210", storedHash)).toBe(false);
  });

  it("rejects null and malformed stored hashes", () => {
    const service = new LicenseClaimCodeService(ENV);

    expect(service.verify("claim-1", "012345", null)).toBe(false);
    expect(service.verify("claim-1", "012345", "not-a-sha256-hash")).toBe(
      false,
    );
  });

  it("requires LICENSE_DELIVERY_SECRET when hashing", () => {
    const service = new LicenseClaimCodeService({});

    expect(() => service.hash("claim-1", "012345")).toThrow(
      "Missing LICENSE_DELIVERY_SECRET",
    );
  });
});
