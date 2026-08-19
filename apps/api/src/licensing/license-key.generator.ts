import { createHash, randomBytes } from "node:crypto";
import {
  LICENSE_KEY_CHUNK_COUNT,
  LICENSE_KEY_CHUNK_LENGTH,
  LICENSE_KEY_PREFIX_DEFAULT,
} from "./licensing.constants";

/** RFC 4648 base32 alphabet (A-Z2-7), uppercase. */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizePrefix(prefix?: string): string {
  const value = (prefix ?? LICENSE_KEY_PREFIX_DEFAULT).trim().toUpperCase();
  if (!value) {
    throw new Error("License key prefix must not be empty");
  }
  if (!/^[A-Z0-9]+$/.test(value)) {
    throw new Error("License key prefix must be alphanumeric");
  }
  return value;
}

function randomChunk(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += BASE32_ALPHABET[bytes[i]! % BASE32_ALPHABET.length];
  }
  return out;
}

/**
 * Generates a raw license key: PREFIX-XXXX-XXXX-XXXX-XXXX.
 * Callers must hash before persistence; never store the raw key after issue.
 */
export function generateRawLicenseKey(prefix?: string): string {
  const head = normalizePrefix(prefix);
  const chunks: string[] = [];
  for (let i = 0; i < LICENSE_KEY_CHUNK_COUNT; i += 1) {
    chunks.push(randomChunk(LICENSE_KEY_CHUNK_LENGTH));
  }
  return `${head}-${chunks.join("-")}`;
}

/** SHA-256 hex of the normalized raw key (trim + uppercase). */
export function hashLicenseKey(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Support-visible prefix: first two segments (PREFIX-XXXX).
 * Not secret alone — still never log the full raw key.
 */
export function keyPrefixFromRaw(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  const parts = normalized.split("-").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("License key must contain at least PREFIX-XXXX");
  }
  return `${parts[0]}-${parts[1]}`;
}
