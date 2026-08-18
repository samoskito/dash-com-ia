import { describe, expect, it } from "vitest";
import {
  hashNormalizedPhone,
  normalizePhoneIdentity,
  normalizePhoneIdentityWithCountry,
} from "../src/common/phone/phone-identity";

describe("phone identity with country code", () => {
  it("keeps legacy normalizePhoneIdentity behavior", () => {
    expect(normalizePhoneIdentity("+55 11 98844-1020")).toBe("5511988441020");
    expect(normalizePhoneIdentity("123")).toBeUndefined();
  });

  it("prefixes BR national numbers with 55 when default is 55", () => {
    expect(normalizePhoneIdentityWithCountry("11988441020", "55")).toBe(
      "5511988441020",
    );
    expect(normalizePhoneIdentityWithCountry("1133334444", "55")).toBe(
      "551133334444",
    );
  });

  it("does not double-prefix when already international", () => {
    expect(normalizePhoneIdentityWithCountry("5511988441020", "55")).toBe(
      "5511988441020",
    );
  });

  it("uses Paraguay default country code 595", () => {
    expect(normalizePhoneIdentityWithCountry("981234567", "595")).toBe(
      "595981234567",
    );
  });

  it("hashes normalized phones stably", () => {
    const a = hashNormalizedPhone("5511988441020");
    const b = hashNormalizedPhone("5511988441020");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
