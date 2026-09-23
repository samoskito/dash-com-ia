import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hashClaimEmail,
  normalizeClaimEmail,
  readLicenseClaimConfig
} from "../src/licensing/license-claim.config";

describe("license claim config", () => {
  it("normalizes valid email input", () => {
    expect(normalizeClaimEmail("  Aluno@X.COM ")).toBe("aluno@x.com");
  });

  it.each([
    ["invalid text", "nope"],
    ["non-string input", 123],
    ["overlong input", `${"a".repeat(330)}@x.com`]
  ])("rejects %s", (_label, input) => {
    expect(normalizeClaimEmail(input)).toBeNull();
  });

  it("hashes normalized emails to a short correlation id", () => {
    const normalized = "aluno@x.com";

    expect(hashClaimEmail(normalized)).toBe(
      createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 12)
    );
  });

  it("uses the locked safe defaults", () => {
    expect(readLicenseClaimConfig({})).toEqual({
      enabled: false,
      productSku: "rastrackdash_student_claim",
      interval: "annual",
      whatsappNotifyEnabled: false,
      turnstileSecret: null
    });
  });

  it("falls back to annual for an invalid interval", () => {
    expect(
      readLicenseClaimConfig({ LICENSE_CLAIM_INTERVAL: "weekly" }).interval
    ).toBe("annual");
  });

  it("reads supported explicit settings", () => {
    expect(
      readLicenseClaimConfig({
        LICENSE_CLAIM_ENABLED: " true ",
        LICENSE_CLAIM_PRODUCT_SKU: " custom_student_claim ",
        LICENSE_CLAIM_INTERVAL: "semiannual",
        LICENSE_CLAIM_WHATSAPP_NOTIFY_ENABLED: "TRUE",
        LICENSE_CLAIM_TURNSTILE_SECRET_KEY: " turnstile-secret "
      })
    ).toEqual({
      enabled: true,
      productSku: "custom_student_claim",
      interval: "semiannual",
      whatsappNotifyEnabled: true,
      turnstileSecret: "turnstile-secret"
    });
  });
});
