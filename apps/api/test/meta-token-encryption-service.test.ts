import { describe, expect, it } from "vitest";
import { MetaTokenEncryptionService } from "../src/integrations/meta/meta-token-encryption.service";

describe("meta token encryption service", () => {
  it("encrypts and decrypts Meta tokens without storing plaintext", () => {
    const service = new MetaTokenEncryptionService({
      META_TOKEN_ENCRYPTION_KEY: "test-encryption-key"
    });

    const encrypted = service.encrypt("EAAB-secret-token");

    expect(encrypted.encryptedAccessToken).not.toContain("EAAB-secret-token");
    expect(encrypted.tokenIv).toHaveLength(16);
    expect(encrypted.tokenTag).toHaveLength(24);
    expect(service.decrypt(encrypted)).toBe("EAAB-secret-token");
  });

  it("reports missing encryption configuration", () => {
    const service = new MetaTokenEncryptionService({});

    expect(service.getMissingEnv()).toEqual(["META_TOKEN_ENCRYPTION_KEY"]);
  });
});
