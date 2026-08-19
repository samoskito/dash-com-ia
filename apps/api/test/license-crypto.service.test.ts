import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LicenseCryptoService } from "../src/licensing/license-crypto.service";

const samplePayload = {
  licenseKeyHash: "abc123",
  status: "active",
  expiresAt: "2027-08-19T00:00:00.000Z",
  issuedAt: "2026-08-19T00:00:00.000Z",
  validUntil: "2026-08-22T00:00:00.000Z",
  iat: 1755561600,
  softLock: false,
  hardLock: false,
};

function pemPair() {
  return LicenseCryptoService.generateEphemeralKeyPair();
}

function serviceFromPair(pair: {
  privateKeyPem: string;
  publicKeyPem: string;
}) {
  return new LicenseCryptoService({
    LICENSE_SIGNING_PRIVATE_KEY: pair.privateKeyPem,
    LICENSE_SIGNING_PUBLIC_KEY: pair.publicKeyPem,
  });
}

describe("license crypto service", () => {
  it("generates ephemeral Ed25519 PEM key pairs", () => {
    const pair = pemPair();

    expect(pair.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(pair.publicKeyPem).toContain("BEGIN PUBLIC KEY");
  });

  it("signs and verifies a cache payload roundtrip", () => {
    const service = serviceFromPair(pemPair());
    const token = service.signCache(samplePayload);

    expect(token.split(".")).toHaveLength(2);
    expect(service.verifyCache(token)).toEqual(samplePayload);
  });

  it("produces the same token for the same payload regardless of key order", () => {
    const service = serviceFromPair(pemPair());
    const reordered = {
      hardLock: false,
      licenseKeyHash: "abc123",
      iat: 1755561600,
      status: "active",
      softLock: false,
      issuedAt: "2026-08-19T00:00:00.000Z",
      validUntil: "2026-08-22T00:00:00.000Z",
      expiresAt: "2027-08-19T00:00:00.000Z",
    };

    expect(service.signCache(reordered)).toBe(service.signCache(samplePayload));
  });

  it("rejects a tampered payload", () => {
    const service = serviceFromPair(pemPair());
    const [payloadPart, signaturePart] = service.signCache(samplePayload).split(".");
    const payload = JSON.parse(
      Buffer.from(payloadPart ?? "", "base64url").toString("utf8"),
    ) as typeof samplePayload;
    payload.status = "revoked";
    const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signaturePart}`;

    expect(service.verifyCache(tampered)).toBeNull();
  });

  it("rejects a token signed by a different key", () => {
    const signer = serviceFromPair(pemPair());
    const other = serviceFromPair(pemPair());

    expect(other.verifyCache(signer.signCache(samplePayload))).toBeNull();
  });

  it("loads PEM keys encoded as base64", () => {
    const pair = pemPair();
    const service = new LicenseCryptoService({
      LICENSE_SIGNING_PRIVATE_KEY: Buffer.from(pair.privateKeyPem).toString(
        "base64",
      ),
      LICENSE_SIGNING_PUBLIC_KEY: Buffer.from(pair.publicKeyPem).toString(
        "base64",
      ),
    });

    const token = service.signCache(samplePayload);
    expect(service.verifyCache(token)).toEqual(samplePayload);
  });

  it("exports the configured public key as PEM", () => {
    const pair = pemPair();
    const service = serviceFromPair(pair);

    expect(service.getPublicKeyExport()).toContain("BEGIN PUBLIC KEY");
    expect(service.getPublicKeyExport()).not.toContain("PRIVATE");
  });

  it("fails closed when signing keys are missing", () => {
    const service = new LicenseCryptoService({});

    expect(() => service.signCache(samplePayload)).toThrow(
      /LICENSE_SIGNING_PRIVATE_KEY/,
    );
    expect(() => service.verifyCache("a.b")).toThrow(
      /LICENSE_SIGNING_PUBLIC_KEY/,
    );
    expect(() => service.getPublicKeyExport()).toThrow(
      /LICENSE_SIGNING_PUBLIC_KEY/,
    );
  });

  it("roundtrips payloads that include optional undefined fields", () => {
    const service = serviceFromPair(pemPair());
    const payload = {
      ...samplePayload,
      accountIdentityHash: undefined as string | undefined,
    };

    const token = service.signCache(payload);
    expect(service.verifyCache(token)).toEqual(samplePayload);
  });

  it("rejects non-Ed25519 signing keys", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const service = new LicenseCryptoService({
      LICENSE_SIGNING_PRIVATE_KEY: privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
      LICENSE_SIGNING_PUBLIC_KEY: publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    });

    expect(() => service.signCache(samplePayload)).toThrow(/Ed25519/i);
    expect(() => service.getPublicKeyExport()).toThrow(/Ed25519/i);
  });
});

describe("license crypto service helpers", () => {
  it("does not treat an unrelated ed25519 signature as valid cache", () => {
    const pair = generateKeyPairSync("ed25519");
    const foreign = sign(null, Buffer.from("not-a-cache"), pair.privateKey);
    const service = serviceFromPair(pemPair());
    const token = `${Buffer.from(JSON.stringify(samplePayload)).toString("base64url")}.${foreign.toString("base64url")}`;

    expect(service.verifyCache(token)).toBeNull();
  });
});
