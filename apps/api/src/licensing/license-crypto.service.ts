import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  RUNTIME_ENV,
  type RuntimeEnv,
} from "../common/runtime/runtime.module";

export type LicenseCachePayload = {
  licenseKeyHash: string;
  status: string;
  expiresAt: string;
  issuedAt: string;
  validUntil: string;
  iat: number;
  accountIdentityHash?: string;
  softLock: boolean;
  hardLock: boolean;
  [key: string]: unknown;
};

export type EphemeralLicenseKeyPair = {
  privateKeyPem: string;
  publicKeyPem: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Stable JSON with sorted object keys (recursive).
 * `undefined` object values are omitted (never emit the invalid token `undefined`).
 * Array holes / explicit undefined items become `null` (JSON.stringify semantics).
 */
export function canonicalizeJson(value: unknown): string {
  if (value === undefined) {
    // Only reachable for top-level or array items; objects strip undefined keys.
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalizeJson(nested)}`)
    .join(",")}}`;
}

function decodeEnvKeyMaterial(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("BEGIN")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
    if (decoded.includes("BEGIN")) {
      return decoded.replace(/\\n/g, "\n");
    }
  } catch {
    // fall through — createPrivateKey/createPublicKey will fail closed
  }
  return trimmed;
}

function assertEd25519(key: KeyObject, label: string): KeyObject {
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `${label} must be an Ed25519 key (got ${key.asymmetricKeyType ?? "unknown"})`,
    );
  }
  return key;
}

function loadPrivateKey(raw: string | undefined): KeyObject {
  if (!raw?.trim()) {
    throw new Error(
      "Missing LICENSE_SIGNING_PRIVATE_KEY (Ed25519 PKCS8 PEM or base64 PEM)",
    );
  }
  try {
    return assertEd25519(
      createPrivateKey(decodeEnvKeyMaterial(raw)),
      "LICENSE_SIGNING_PRIVATE_KEY",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("LICENSE_SIGNING_PRIVATE_KEY")
    ) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "invalid private key material";
    throw new Error(`Invalid LICENSE_SIGNING_PRIVATE_KEY: ${message}`);
  }
}

function loadPublicKey(raw: string | undefined): KeyObject {
  if (!raw?.trim()) {
    throw new Error(
      "Missing LICENSE_SIGNING_PUBLIC_KEY (Ed25519 SPKI PEM or base64 PEM)",
    );
  }
  try {
    return assertEd25519(
      createPublicKey(decodeEnvKeyMaterial(raw)),
      "LICENSE_SIGNING_PUBLIC_KEY",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("LICENSE_SIGNING_PUBLIC_KEY")
    ) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "invalid public key material";
    throw new Error(`Invalid LICENSE_SIGNING_PUBLIC_KEY: ${message}`);
  }
}

/**
 * Ed25519 signing for offline license cache tokens.
 * Token format: base64url(canonical JSON).base64url(signature)
 * Private key never leaves the PalmUP API process.
 */
@Injectable()
export class LicenseCryptoService {
  constructor(
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  static generateEphemeralKeyPair(): EphemeralLicenseKeyPair {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return {
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
  }

  signCache(payload: object): string {
    if (!isRecord(payload)) {
      throw new Error("License cache payload must be a plain object");
    }
    const privateKey = loadPrivateKey(this.env.LICENSE_SIGNING_PRIVATE_KEY);
    const body = canonicalizeJson(payload);
    const signature = sign(null, Buffer.from(body, "utf8"), privateKey);
    return `${Buffer.from(body, "utf8").toString("base64url")}.${signature.toString("base64url")}`;
  }

  verifyCache(token: string): LicenseCachePayload | null {
    if (typeof token !== "string" || !token.includes(".")) {
      return null;
    }
    const [payloadPart, signaturePart, ...rest] = token.split(".");
    if (!payloadPart || !signaturePart || rest.length > 0) {
      return null;
    }

    let payloadBytes: Buffer;
    let signatureBytes: Buffer;
    try {
      payloadBytes = Buffer.from(payloadPart, "base64url");
      signatureBytes = Buffer.from(signaturePart, "base64url");
    } catch {
      return null;
    }

    const publicKey = loadPublicKey(this.env.LICENSE_SIGNING_PUBLIC_KEY);
    const ok = verify(null, payloadBytes, publicKey, signatureBytes);
    if (!ok) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(payloadBytes.toString("utf8"));
      if (!isRecord(parsed)) {
        return null;
      }
      // Re-canonicalize to reject non-stable encodings that still verify.
      if (canonicalizeJson(parsed) !== payloadBytes.toString("utf8")) {
        return null;
      }
      return parsed as LicenseCachePayload;
    } catch {
      return null;
    }
  }

  getPublicKeyExport(): string {
    const publicKey = loadPublicKey(this.env.LICENSE_SIGNING_PUBLIC_KEY);
    return publicKey.export({ type: "spki", format: "pem" }).toString();
  }
}
