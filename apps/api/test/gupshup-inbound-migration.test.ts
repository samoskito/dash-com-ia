import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260720010000_gupshup_inbound_observation/migration.sql",
  ),
  "utf8",
);

describe("Gupshup inbound observation migration", () => {
  it("registers the provider and its observation-only parser release", () => {
    expect(migration).toContain(
      "ALTER TYPE \"InboundWebhookProvider\" ADD VALUE IF NOT EXISTS 'gupshup'",
    );
    expect(migration).toContain(
      "ALTER TYPE \"DiagnosticSource\" ADD VALUE IF NOT EXISTS 'gupshup'",
    );
    expect(migration).toContain("'inbound_parser_gupshup_v1'");
    expect(migration).toContain("'observation_only'");
  });

  it("does not mutate existing Umbler or customer records", () => {
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE FROM)\b/i);
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:InboundWebhookConnection|InboundWebhookDelivery|InboundWebhookEvent|Lead|ConversionEventLog)"/,
    );
  });
});
