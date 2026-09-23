import { createHash } from "node:crypto";
import type { LicenseInterval } from "@prisma/client";
import { z } from "zod";
import type { RuntimeEnv } from "../common/runtime/runtime.module";

const claimEmailSchema = z.string().trim().max(320).email();

export type LicenseClaimConfig = {
  enabled: boolean;
  productSku: string;
  interval: LicenseInterval;
  whatsappNotifyEnabled: boolean;
  turnstileSecret: string | null;
};

function enabled(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

function interval(raw: string | undefined): LicenseInterval {
  const value = raw?.trim().toLowerCase();
  return value === "monthly" || value === "semiannual" || value === "annual"
    ? value
    : "annual";
}

export function normalizeClaimEmail(raw: unknown): string | null {
  const parsed = claimEmailSchema.safeParse(raw);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export function hashClaimEmail(normalized: string): string {
  return createHash("sha256")
    .update(normalized, "utf8")
    .digest("hex")
    .slice(0, 12);
}

export function readLicenseClaimConfig(env: RuntimeEnv): LicenseClaimConfig {
  return {
    enabled: enabled(env.LICENSE_CLAIM_ENABLED),
    productSku:
      env.LICENSE_CLAIM_PRODUCT_SKU?.trim() || "rastrackdash_student_claim",
    interval: interval(env.LICENSE_CLAIM_INTERVAL),
    whatsappNotifyEnabled: enabled(
      env.LICENSE_CLAIM_WHATSAPP_NOTIFY_ENABLED,
    ),
    turnstileSecret:
      env.LICENSE_CLAIM_TURNSTILE_SECRET_KEY?.trim() || null,
  };
}
