import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260723090000_inbound_provider_conversion_checkpoint/migration.sql",
  ),
  "utf8",
);

describe("inbound provider conversion checkpoint migration", () => {
  it("adds a nullable completion checkpoint without rewriting deliveries", () => {
    expect(migration).toContain(
      'ADD COLUMN "providerConversionsObservedAt" TIMESTAMP(3)',
    );
    expect(migration).not.toMatch(/^\s*(?:UPDATE|DELETE FROM) /mu);
    expect(migration).not.toContain("NOT NULL");
  });
});
