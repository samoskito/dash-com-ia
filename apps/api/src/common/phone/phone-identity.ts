import { createHash } from "node:crypto";

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

export function normalizePhoneIdentity(phone?: string): string | undefined {
  const digits = phone?.replace(/\D/g, "");

  if (
    !digits ||
    digits.length < MIN_PHONE_DIGITS ||
    digits.length > MAX_PHONE_DIGITS
  ) {
    return undefined;
  }

  return digits;
}

export function hashPhoneIdentity(phone?: string): string | undefined {
  const normalized = normalizePhoneIdentity(phone);

  return normalized
    ? createHash("sha256").update(normalized).digest("hex")
    : undefined;
}
