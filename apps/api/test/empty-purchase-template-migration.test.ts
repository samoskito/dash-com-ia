import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260723170000_ignore_empty_purchase_templates/migration.sql",
  ),
  "utf8",
);

const classificationMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260723200000_add_empty_template_classification/migration.sql",
  ),
  "utf8",
);

describe("empty purchase template cleanup migration", () => {
  it("removes only empty provider-message reviews from the operational queue", () => {
    expect(migration).toContain(
      '"sourceType" = \'provider_message\'::"PurchaseReviewSourceType"',
    );
    expect(migration).toContain(
      '"status" = \'awaiting_data\'::"PurchaseReviewStatus"',
    );
    expect(migration).toContain(
      'jsonb_array_length(item."attributeValues") > 0',
    );
    expect(migration).toContain("\"reasonCode\" = 'empty_template_ignored'");
  });

  it("preserves raw webhook payloads and partial purchase data", () => {
    expect(migration).not.toMatch(/DELETE FROM/u);
    expect(migration).not.toContain('"InboundWebhookDelivery"');
    expect(migration).not.toContain('"InboundWebhookPayload"');
  });
});

describe("empty purchase template classification migration", () => {
  it("adds the dedicated classification idempotently", () => {
    expect(classificationMigration).toContain(
      `ADD VALUE IF NOT EXISTS 'ignored_empty_template'`,
    );
  });

  it("preserves deliveries and encrypted payloads", () => {
    expect(classificationMigration).not.toMatch(/DELETE FROM/u);
    expect(classificationMigration).not.toContain('"InboundWebhookDelivery"');
    expect(classificationMigration).not.toContain('"InboundWebhookPayload"');
  });
});
