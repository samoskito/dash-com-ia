export const GUIMO_CRM_AUTH_HEADER_NAMES = ["authorization", "x-api-key"] as const;
const GUIMO_CRM_AUTH_HEADER_NAME_SET = new Set<string>(GUIMO_CRM_AUTH_HEADER_NAMES);
const GUIMO_OPERATIONAL_HEADER_NAMES = new Set(["accept", "content-type", "host", "origin"]);

export type GuimoConfigurationInput = { qualifiedStageId?: string; qualifiedStageName?: string; purchaseStageId?: string; purchaseStageName?: string; purchaseCurrency?: string; purchaseValueUnit?: "major" | "cents"; crmHeaders?: Record<string, string> };

/** Accept only the observed CRM authentication headers; callers never control transport headers. */
export function parseGuimoCrmHeaders(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  const result: Record<string, string> = {};
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim().toLowerCase();
    if (!name || GUIMO_OPERATIONAL_HEADER_NAMES.has(name) || !GUIMO_CRM_AUTH_HEADER_NAME_SET.has(name) || typeof rawValue !== "string" || !rawValue.trim() || name in result) return null;
    result[name] = rawValue.trim();
  }
  return result;
}

export function parseGuimoConfiguration(value: unknown): GuimoConfigurationInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>; const text = (key: string) => typeof v[key] === "string" && v[key].trim() ? v[key].trim() : undefined;
  const unit = text("purchaseValueUnit"); if (unit && unit !== "major" && unit !== "cents") return null;
  const headers = v.crmHeaders === undefined ? undefined : parseGuimoCrmHeaders(v.crmHeaders);
  if (v.crmHeaders !== undefined && !headers) return null;
  const result = { qualifiedStageId: text("qualifiedStageId"), qualifiedStageName: text("qualifiedStageName"), purchaseStageId: text("purchaseStageId"), purchaseStageName: text("purchaseStageName"), purchaseCurrency: text("purchaseCurrency"), purchaseValueUnit: unit as "major" | "cents" | undefined, crmHeaders: headers ?? undefined };
  return result.qualifiedStageId || result.qualifiedStageName || result.purchaseStageId || result.purchaseStageName ? result : null;
}
