import { describe, expect, it } from "vitest";
import { ExternalCredentialEncryptionService } from "../src/external-data/external-credential-encryption.service";

describe("external connector credential encryption", () => {
  it("encrypts and decrypts the full MySQL credential envelope", () => {
    const service = new ExternalCredentialEncryptionService({
      EXTERNAL_CONNECTOR_ENCRYPTION_KEY: "test-external-connector-key"
    });
    const credentials = {
      host: "mysql.internal",
      port: 3306,
      database: "tracking",
      username: "wpptrack_reader",
      password: "super-secret-password"
    };

    const encrypted = service.encrypt(credentials);

    expect(encrypted.credentialsEncrypted).not.toContain(credentials.password);
    expect(encrypted.credentialsIv).toHaveLength(16);
    expect(encrypted.credentialsTag).toHaveLength(24);
    expect(service.decrypt(encrypted)).toEqual(credentials);
  });

  it("rejects decryption under another key", () => {
    const first = new ExternalCredentialEncryptionService({
      EXTERNAL_CONNECTOR_ENCRYPTION_KEY: "first-key"
    });
    const second = new ExternalCredentialEncryptionService({
      EXTERNAL_CONNECTOR_ENCRYPTION_KEY: "second-key"
    });
    const encrypted = first.encrypt({
      host: "mysql.internal",
      port: 3306,
      database: "tracking",
      username: "reader",
      password: "secret"
    });

    expect(() => second.decrypt(encrypted)).toThrow();
  });

  it("reports the dedicated missing environment variable", () => {
    const service = new ExternalCredentialEncryptionService({});

    expect(service.getMissingEnv()).toEqual([
      "EXTERNAL_CONNECTOR_ENCRYPTION_KEY"
    ]);
  });
});
