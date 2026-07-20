import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260720010000_gupshup_inbound_observation/migration.sql",
  ),
  "utf8",
);

const parserReleaseMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260720010100_gupshup_inbound_parser_release/migration.sql",
  ),
  "utf8",
);

describe("Gupshup inbound observation migration", () => {
  it("commits the provider enums before any Gupshup row uses them", () => {
    expect(enumMigration).toContain(
      "ALTER TYPE \"InboundWebhookProvider\" ADD VALUE IF NOT EXISTS 'gupshup'",
    );
    expect(enumMigration).toContain(
      "ALTER TYPE \"DiagnosticSource\" ADD VALUE IF NOT EXISTS 'gupshup'",
    );
    expect(enumMigration).not.toMatch(/\bINSERT INTO\b/i);
  });

  it("seeds the observation-only parser in the following migration", () => {
    expect(parserReleaseMigration).toContain(
      'INSERT INTO "InboundWebhookParserRelease"',
    );
    expect(parserReleaseMigration).toContain("'inbound_parser_gupshup_v1'");
    expect(parserReleaseMigration).toContain("'gupshup'");
    expect(parserReleaseMigration).toContain("'observation_only'");
  });

  it("does not mutate existing Umbler or customer records", () => {
    for (const migration of [enumMigration, parserReleaseMigration]) {
      expect(migration).not.toMatch(/\b(?:UPDATE|DELETE FROM)\b/i);
      expect(migration).not.toMatch(
        /ALTER TABLE "(?:InboundWebhookConnection|InboundWebhookDelivery|InboundWebhookEvent|Lead|ConversionEventLog)"/,
      );
    }
  });
});
