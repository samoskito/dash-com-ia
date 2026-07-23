import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260723190000_provider_conversion_decision_audit/migration.sql",
  ),
  "utf8",
);

describe("provider conversion decision audit migration", () => {
  it("creates the audit table and optional legacy links idempotently", () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "ProviderConversionDecisionAudit"',
    );
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "providerDecisionId" TEXT',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_evaluation_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_version_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConversionRuleExecution_decision_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReview_decision_key"',
    );
    expect(migration).toContain("IF NOT EXISTS (");
  });

  it("stores frozen decision evidence and deterministic lookup fields", () => {
    expect(migration).toContain('"normalizedOccurrence" JSONB NOT NULL');
    expect(migration).toContain('"ruleSnapshot" JSONB NOT NULL');
    expect(migration).toContain('"catalogSnapshot" JSONB');
    expect(migration).toContain('"conversionSnapshot" JSONB NOT NULL');
    expect(migration).toContain('"leadResolution" JSONB NOT NULL');
    expect(migration).toContain('"decisionJson" JSONB NOT NULL');
    expect(migration).toContain('"occurrenceKey" TEXT NOT NULL');
    expect(migration).toContain('"decisionFingerprint" TEXT NOT NULL');
  });

  it("enforces append-only history without rewriting existing conversions", () => {
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON "ProviderConversionDecisionAudit"',
    );
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE FROM)\s+"(?:ConversionEventLog|ProviderConversionRuleExecution|PurchaseReview)"/u,
    );
    expect(migration).not.toContain("ON DELETE CASCADE");
  });
});
