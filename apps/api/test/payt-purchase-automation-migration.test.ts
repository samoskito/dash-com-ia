import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const providerMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260915120000_payt_purchase_automation_provider/migration.sql",
  ),
  "utf8",
);

const parserReleaseMigration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260916010000_payt_parser_releases/migration.sql",
  ),
  "utf8",
);

describe("Payt purchase automation migration", () => {
  it("adds the provider enum without inserting payt rows in the same file", () => {
    expect(providerMigration).toContain(
      "ALTER TYPE \"InboundWebhookProvider\" ADD VALUE IF NOT EXISTS 'payt'",
    );
    // Postgres cannot use a brand-new enum label in the same transaction as ADD VALUE.
    expect(providerMigration).not.toContain("InboundWebhookParserRelease");
    expect(providerMigration).not.toContain("inbound_parser_payt");
    expect(providerMigration).not.toMatch(/\b(?:UPDATE|DELETE FROM)\b/i);
  });

  it("seeds observation-only Payt parser releases in a follow-up migration", () => {
    expect(parserReleaseMigration).toContain("'inbound_parser_payt_v1'");
    expect(parserReleaseMigration).toContain(
      "'inbound_parser_payt_automation_v1'",
    );
    expect(parserReleaseMigration).toContain("'observation_only'");
    expect(parserReleaseMigration).toContain("'payt'");
    expect(parserReleaseMigration).not.toMatch(/\b(?:UPDATE|DELETE FROM)\b/i);
  });
});
