import { describe, expect, it } from "vitest";
import { LicenseDeliverySecretService } from "../src/licensing/license-delivery-secret.service";

const RAW_KEY = "PALMUP-ABCD-1234-EFGH-5678";

function service(secret = "license-delivery-test-secret-value") {
  return new LicenseDeliverySecretService({ LICENSE_DELIVERY_SECRET: secret });
}

describe("LicenseDeliverySecretService", () => {
  it("round-trips the raw key without leaking it in the ciphertext framing", () => {
    const svc = service();
    const encrypted = svc.encrypt("lic_1", RAW_KEY);

    expect(JSON.stringify(encrypted)).not.toContain(RAW_KEY);
    expect(svc.decrypt("lic_1", encrypted)).toBe(RAW_KEY);
  });

  it("fails closed when LICENSE_DELIVERY_SECRET is missing", () => {
    const svc = service("");
    expect(() => svc.encrypt("lic_1", RAW_KEY)).toThrow(
      "Missing LICENSE_DELIVERY_SECRET",
    );
  });

  it("rejects decryption when licenseId (AAD) does not match", () => {
    const svc = service();
    const encrypted = svc.encrypt("lic_1", RAW_KEY);
    expect(() => svc.decrypt("lic_other", encrypted)).toThrow();
  });

  it("rejects a tampered ciphertext", () => {
    const svc = service();
    const encrypted = svc.encrypt("lic_1", RAW_KEY);
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from("tampered-payload").toString("base64"),
    };
    expect(() => svc.decrypt("lic_1", tampered)).toThrow();
  });
});
