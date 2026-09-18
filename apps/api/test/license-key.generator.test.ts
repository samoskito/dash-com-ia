import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LICENSE_KEY_PREFIX_DEFAULT } from "../src/licensing/licensing.constants";
import {
  generateRawLicenseKey,
  hashLicenseKey,
  keyPrefixFromRaw,
} from "../src/licensing/license-key.generator";

const RAW_KEY_PATTERN =
  /^[A-Z0-9]+-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/;

describe("license key generator", () => {
  it("generates PREFIX-XXXX-XXXX-XXXX-XXXX with default PALMUP prefix", () => {
    const raw = generateRawLicenseKey();

    expect(raw).toMatch(RAW_KEY_PATTERN);
    expect(raw.startsWith(`${LICENSE_KEY_PREFIX_DEFAULT}-`)).toBe(true);
  });

  it("uses a custom prefix when provided", () => {
    const raw = generateRawLicenseKey("rastrack");

    expect(raw.startsWith("RASTRACK-")).toBe(true);
    expect(raw).toMatch(RAW_KEY_PATTERN);
  });

  it("hashes the same raw key deterministically", () => {
    const raw = "PALMUP-AAAA-BBBB-CCCC-DDDD";
    const expected = createHash("sha256").update(raw, "utf8").digest("hex");

    expect(hashLicenseKey(raw)).toBe(expected);
    expect(hashLicenseKey(raw)).toBe(hashLicenseKey(raw));
    expect(hashLicenseKey(raw.toLowerCase())).toBe(expected);
  });

  it("returns PREFIX-XXXX from the first two segments", () => {
    expect(keyPrefixFromRaw("PALMUP-A1B2-C3D4-E5F6-G7H8")).toBe("PALMUP-A1B2");
    expect(keyPrefixFromRaw("  palmup-zzzz-yyyy-xxxx-wwww  ")).toBe(
      "PALMUP-ZZZZ",
    );
  });
});
