import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260723173000_add_untracked_lead_classification/migration.sql",
  ),
  "utf8",
);
const cleanupMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260723173100_ignore_untracked_provider_conversions/migration.sql",
  ),
  "utf8",
);

describe("untracked provider conversion cleanup migrations", () => {
  it("adds a dedicated internal classification", () => {
    expect(enumMigration).toContain(
      `ADD VALUE IF NOT EXISTS 'ignored_untracked_lead'`,
    );
  });

  it("closes only unsent derived records without a paid lead", () => {
    expect(cleanupMigration).toContain('execution."leadId" IS NULL');
    expect(cleanupMigration).toContain(
      'execution."conversionEventLogId" IS NULL',
    );
    expect(cleanupMigration).toContain(
      'lead."phoneHash" = execution."contactIdentityHash"',
    );
    expect(cleanupMigration).toContain('review."leadId" IS NULL');
    expect(cleanupMigration).toContain('review."conversionEventLogId" IS NULL');
    expect(cleanupMigration).toContain(
      "COALESCE(execution.\"reasonCode\", '') <> 'empty_template_ignored'",
    );
    expect(cleanupMigration).not.toContain(
      `'materialized'::"ProviderConversionExecutionStatus"`,
    );
    expect(cleanupMigration).not.toContain(`'sent'::"PurchaseReviewStatus"`);
    expect(cleanupMigration).not.toContain(
      `'duplicate'::"PurchaseReviewStatus"`,
    );
  });

  it("preserves raw deliveries and records the ignored decision", () => {
    expect(cleanupMigration).not.toMatch(/DELETE FROM/u);
    expect(cleanupMigration).toContain(
      `"classification" = 'ignored_untracked_lead'::"InboundWebhookEventClassification"`,
    );
    expect(cleanupMigration).toContain(
      `"reasonCode" = 'ignored_untracked_lead'`,
    );
  });
});
