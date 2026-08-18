import { createHash } from "node:crypto";

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

/** Valid Brazilian area codes (DDD) — used when prefixing default country code. */
const BR_AREA_CODES = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
]);

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

/**
 * Normalize phone with an account-level default country calling code.
 * - If the number already looks international (starts with the default CC, or
 *   is longer than national length), keep digits as-is (within E.164 bounds).
 * - If national BR-shaped (10–11 digits + valid DDD) and default is 55, prefix 55.
 * - Otherwise, if national length is plausible, prefix the configured default.
 */
export function normalizePhoneIdentityWithCountry(
  phone: string | undefined,
  defaultCountryCode = "55",
): string | undefined {
  const digits = phone?.replace(/\D/g, "");
  if (!digits) {
    return undefined;
  }

  const cc = (defaultCountryCode || "55").replace(/\D/g, "") || "55";

  if (digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS) {
    if (digits.startsWith(cc) && digits.length > cc.length + 7) {
      return digits;
    }
    // Already international-ish (e.g. 12–15 digits not needing prefix)
    if (digits.length >= 12) {
      return digits;
    }
  }

  // National BR mobile/landline without country code
  if (
    cc === "55" &&
    (digits.length === 10 || digits.length === 11) &&
    BR_AREA_CODES.has(digits.slice(0, 2))
  ) {
    return `55${digits}`;
  }

  // Generic: national number + configured CC when still within E.164 max
  if (
    digits.length >= 8 &&
    digits.length <= 12 &&
    !digits.startsWith(cc) &&
    digits.length + cc.length <= MAX_PHONE_DIGITS
  ) {
    return `${cc}${digits}`;
  }

  return normalizePhoneIdentity(digits);
}

export function hashPhoneIdentity(phone?: string): string | undefined {
  const normalized = normalizePhoneIdentity(phone);

  return normalized
    ? createHash("sha256").update(normalized).digest("hex")
    : undefined;
}

export function hashNormalizedPhone(normalized?: string): string | undefined {
  if (!normalized) {
    return undefined;
  }
  return createHash("sha256").update(normalized).digest("hex");
}
