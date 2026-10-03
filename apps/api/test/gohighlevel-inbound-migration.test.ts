import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20261003190000_gohighlevel_inbound_observation/migration.sql",
  ),
  "utf8",
);

const parserReleaseMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20261003190100_gohighlevel_v1_parser_release/migration.sql",
  ),
  "utf8",
);

describe("GoHighLevel inbound observation migration", () => {
  it("commits the provider enums before any GoHighLevel row uses them", () => {
    expect(enumMigration).toContain(
      "ALTER TYPE \"InboundWebhookProvider\" ADD VALUE IF NOT EXISTS 'gohighlevel'",
    );
    expect(enumMigration).toContain(
      "ALTER TYPE \"DiagnosticSource\" ADD VALUE IF NOT EXISTS 'gohighlevel'",
    );
    expect(enumMigration).not.toMatch(/\bINSERT INTO\b/i);
  });

  it("seeds the observation-only parser in the following migration", () => {
    expect(parserReleaseMigration).toContain(
      'INSERT INTO "InboundWebhookParserRelease"',
    );
    expect(parserReleaseMigration).toContain("'inbound_parser_gohighlevel_v1'");
    expect(parserReleaseMigration).toContain("'gohighlevel'");
    expect(parserReleaseMigration).toContain("'observation_only'");
    expect(parserReleaseMigration).toContain(
      'ON CONFLICT ("provider", "version") DO NOTHING',
    );
  });

  it("does not mutate existing customer records", () => {
    for (const migration of [enumMigration, parserReleaseMigration]) {
      expect(migration).not.toMatch(/\b(?:UPDATE|DELETE FROM)\b/i);
      expect(migration).not.toMatch(
        /ALTER TABLE "(?:InboundWebhookConnection|InboundWebhookDelivery|InboundWebhookEvent|Lead|ConversionEventLog)"/,
      );
    }
  });
});
