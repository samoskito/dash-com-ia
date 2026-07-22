import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260722140000_umbler_message_purchase_review/migration.sql",
  ),
  "utf8",
);

describe("Umbler message purchase review migration", () => {
  it("adds phrase triggers, author scope and append-only purchase review tables", () => {
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'message_phrase'");
    expect(migration).toContain(
      'CREATE TYPE "ProviderConversionMessageAuthorScope"',
    );
    expect(migration).toContain('CREATE TABLE "PurchaseReview"');
    expect(migration).toContain('CREATE TABLE "PurchaseReviewItem"');
    expect(migration).toContain('CREATE TABLE "PurchaseValueAdjustment"');
  });

  it("keeps every review and relation scoped to its workspace", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("workspaceId", "providerRuleId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspaceId", "sourceDeliveryId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspaceId", "purchaseReviewId")',
    );
    expect(migration).toContain(
      '"providerExecutionWorkspaceId" IS NULL OR "providerExecutionWorkspaceId" = "workspaceId"',
    );
  });

  it("enforces positive values, quantities and idempotent occurrences", () => {
    expect(migration).toContain('"PurchaseReview_values_check"');
    expect(migration).toContain('"PurchaseReviewItem_quantity_check"');
    expect(migration).toContain(
      '"PurchaseReview_providerRuleId_externalOccurrenceKey_key"',
    );
  });

  it("does not rewrite historical deliveries, leads or conversions", () => {
    expect(migration).not.toMatch(/^\s*(?:UPDATE|DELETE FROM) /m);
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:Lead|ConversionEventLog|InboundWebhookDelivery)"/,
    );
  });
});
