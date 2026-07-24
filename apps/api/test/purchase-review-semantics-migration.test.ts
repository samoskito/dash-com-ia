import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260723210000_normalize_purchase_review_semantics/migration.sql",
  ),
  "utf8",
);

describe("purchase review semantics migration", () => {
  it("closes unsent reviews that do not resolve to a paid lead", () => {
    expect(migration).toContain('review."leadId" IS NULL');
    expect(migration).toContain(
      'review."conversionEventLogId" IS NULL',
    );
    expect(migration).toContain(
      `"reasonCode" = 'ignored_untracked_lead'`,
    );
  });

  it("promotes only meaningful known-lead legacy rows to actionable review", () => {
    expect(migration).toContain('review."leadId" IS NOT NULL');
    expect(migration).toContain(
      `"status" = 'review_required'::"PurchaseReviewStatus"`,
    );
    expect(migration).toContain('review."effectiveValueCents" > 0');
    expect(migration).toContain(
      'jsonb_array_length(item."attributeValues") > 0',
    );
  });

  it("preserves raw deliveries, decision audits and conversion history", () => {
    expect(migration).not.toMatch(/DELETE FROM/u);
    expect(migration).not.toContain('"InboundWebhookDelivery"');
    expect(migration).not.toContain('"ProviderConversionDecisionAudit"');
    expect(migration).not.toContain('"ConversionEventLog" AS');
  });
});
