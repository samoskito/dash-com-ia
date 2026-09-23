/** Grace window after last successful signed cache / subscription expiry. */
export const LICENSE_GRACE_MS = 72 * 60 * 60 * 1000;

/** Default raw license key prefix (support-visible first segment). */
export const LICENSE_KEY_PREFIX_DEFAULT = "PALMUP";

/** Number of random body chunks after the prefix: PREFIX-XXXX-XXXX-XXXX-XXXX */
export const LICENSE_KEY_CHUNK_COUNT = 4;

/** Characters per random chunk (RFC 4648 base32 alphabet, uppercase). */
export const LICENSE_KEY_CHUNK_LENGTH = 4;

/** Products in palm_up.Transacoes that are eligible for student self-service claims. */
export const LICENSE_CLAIM_ELIGIBLE_PRODUCTS = [
  "Rastracking100 - Sua estrutura 100% rastreada",
  "Comunidade A Nova Ordem do Digital",
] as const;

export const LICENSE_CLAIM_PAID_STATUS = "Paga";
export const LICENSE_CLAIM_TABLE = "Transacoes";

export const LICENSE_CLAIM_CODE_TTL_MS = 15 * 60 * 1_000;
export const LICENSE_CLAIM_MAX_CODE_ATTEMPTS = 5;
export const LICENSE_CLAIM_CODE_COOLDOWN_MS = 60 * 1_000;
export const LICENSE_CLAIM_MAX_CODES_PER_DAY = 5;
export const LICENSE_CLAIM_ISSUING_STALE_MS = 2 * 60 * 1_000;
