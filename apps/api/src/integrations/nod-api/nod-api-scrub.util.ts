/**
 * Explicit deny-list scrub applied to every NOD API broker response, on top of
 * the fact that response DTOs are hand-built and never include upstream
 * admin-token fields in the first place. Defense in depth: if an upstream
 * payload or a future code change ever puts a secret-looking key into a
 * response object, this strips it before it reaches the wire.
 */
const SECRET_KEY_PATTERN = /(admin[-_]?token|uazapi[-_]?admin[-_]?token)/i;

export function scrubSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => scrubSecrets(item)) as unknown as T;
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        continue;
      }
      out[key] = scrubSecrets(val);
    }
    return out as T;
  }

  return value;
}
