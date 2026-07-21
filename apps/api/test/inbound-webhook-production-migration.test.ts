import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260721030000_inbound_webhook_live_production/migration.sql",
  ),
  "utf8",
);

describe("inbound webhook live production migration", () => {
  it("creates the activation boundary and durable production ledger", () => {
    expect(migration).toContain(
      'CREATE TYPE "InboundWebhookProductionItemStatus"',
    );
    expect(migration).toContain(
      'ADD COLUMN "productionActivatedAt" TIMESTAMP(3)',
    );
    expect(
      migration.match(/ADD COLUMN "productionActivatedAt" TIMESTAMP\(3\)/g),
    ).toHaveLength(2);
    expect(migration).toContain('CREATE TABLE "InboundWebhookProductionItem"');
  });

  it("allows each observed event to enter live production only once", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "InboundWebhookProductionItem_eventId_key"',
    );
    expect(migration).toContain('ON "InboundWebhookProductionItem"("eventId")');
  });

  it("binds production items to the composite event tenant identity", () => {
    expect(migration).toContain('FOREIGN KEY ("workspaceId", "eventId")');
    expect(migration).toContain(
      'REFERENCES "InboundWebhookEvent"("workspaceId", "id")',
    );
  });

  it("does not backfill history or alter existing business records", () => {
    expect(migration).not.toMatch(/^\s*(?:UPDATE|DELETE FROM) /m);
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:Lead|ConversionEventLog|Meta[A-Za-z]+)"/,
    );
  });
});
