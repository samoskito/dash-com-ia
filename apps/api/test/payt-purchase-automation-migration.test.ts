import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260915120000_payt_purchase_automation_provider/migration.sql",
  ),
  "utf8",
);

describe("Payt purchase automation migration", () => {
  it("adds only the provider and observation-only parser releases", () => {
    expect(migration).toContain(
      "ALTER TYPE \"InboundWebhookProvider\" ADD VALUE IF NOT EXISTS 'payt'",
    );
    expect(migration).toContain("'inbound_parser_payt_v1'");
    expect(migration).toContain("'inbound_parser_payt_automation_v1'");
    expect(migration).toContain("'observation_only'");
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE FROM)\b/i);
  });
});
