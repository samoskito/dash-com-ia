import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260828100000_datacrazy_inbound_provider/migration.sql",
  ),
  "utf8",
);
const parserReleaseMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260828100100_datacrazy_v1_parser_release/migration.sql",
  ),
  "utf8",
);

describe("Data Crazy inbound migration", () => {
  it("commits the provider enum before any Data Crazy row uses it", () => {
    expect(enumMigration).toContain(
      "ALTER TYPE \"InboundWebhookProvider\" ADD VALUE IF NOT EXISTS 'datacrazy'",
    );
    expect(enumMigration).toContain(
      "ALTER TYPE \"DiagnosticSource\" ADD VALUE IF NOT EXISTS 'datacrazy'",
    );
    expect(enumMigration).not.toMatch(/\bINSERT INTO\b/i);
  });

  it("seeds only the observation parser in the following migration", () => {
    expect(parserReleaseMigration).toContain(
      'INSERT INTO "InboundWebhookParserRelease"',
    );
    expect(parserReleaseMigration).toContain("'inbound_parser_datacrazy_v1'");
    expect(parserReleaseMigration).toContain("'datacrazy'");
    expect(parserReleaseMigration).toContain("'observation_only'");
  });

  it("does not mutate existing provider, workspace, lead or conversion data", () => {
    for (const migration of [enumMigration, parserReleaseMigration]) {
      expect(migration).not.toMatch(/\b(?:UPDATE|DELETE FROM)\b/i);
      expect(migration).not.toMatch(
        /ALTER TABLE \"(?:InboundWebhookConnection|InboundWebhookDelivery|InboundWebhookEvent|Lead|ConversionEventLog)\"/,
      );
    }
  });
});
