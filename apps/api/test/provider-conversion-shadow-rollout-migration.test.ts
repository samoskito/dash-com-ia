import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260723220000_provider_conversion_shadow_rollout/migration.sql",
  ),
  "utf8",
);

describe("provider conversion shadow rollout migration", () => {
  it("keeps every existing channel on the legacy evaluator", () => {
    expect(migration).toContain(
      '"conversionEngineMode"\n    "ProviderConversionEngineMode" NOT NULL DEFAULT \'legacy\'',
    );
  });

  it("stores idempotent per-occurrence comparison evidence", () => {
    expect(migration).toContain(
      '"ProviderConversionShadowComparison_occurrence_fingerprint_key"',
    );
    expect(migration).toContain(
      '"providerRuleId",\n    "occurrenceKey",\n    "comparisonFingerprint"',
    );
  });

  it("forbids updates and deletes from the evidence table", () => {
    expect(migration).toContain(
      "ProviderConversionShadowComparison is append-only",
    );
    expect(migration).toContain(
      '"ProviderConversionShadowComparison_forbid_update"',
    );
    expect(migration).toContain(
      '"ProviderConversionShadowComparison_forbid_delete"',
    );
  });

  it("does not rewrite channels or historical decisions during deployment", () => {
    expect(migration).not.toMatch(
      /UPDATE\s+"InboundWebhookChannel"/u,
    );
    expect(migration).not.toContain('"ProviderConversionDecisionAudit"');
    expect(migration).not.toContain('"ConversionEventLog"');
  });
});
