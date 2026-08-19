/** Grace window after last successful signed cache / subscription expiry. */
export const LICENSE_GRACE_MS = 72 * 60 * 60 * 1000;

/** Default raw license key prefix (support-visible first segment). */
export const LICENSE_KEY_PREFIX_DEFAULT = "PALMUP";

/** Number of random body chunks after the prefix: PREFIX-XXXX-XXXX-XXXX-XXXX */
export const LICENSE_KEY_CHUNK_COUNT = 4;

/** Characters per random chunk (RFC 4648 base32 alphabet, uppercase). */
export const LICENSE_KEY_CHUNK_LENGTH = 4;
