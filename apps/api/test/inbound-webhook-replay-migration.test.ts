import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260718170000_inbound_webhook_controlled_replay/migration.sql",
  ),
  "utf8",
);

describe("inbound webhook controlled replay migration", () => {
  it("creates tenant-scoped batch and item ledgers", () => {
    expect(migration).toContain(
      'CREATE TABLE "InboundWebhookReplayBatch"',
    );
    expect(migration).toContain(
      'CREATE TABLE "InboundWebhookReplayItem"',
    );
    expect(migration.match(/"workspaceId" TEXT NOT NULL/g)).toHaveLength(2);
  });

  it("allows each normalized event to be owned by only one replay item", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "InboundWebhookReplayItem_eventId_key"',
    );
    expect(migration).toContain(
      'ON "InboundWebhookReplayItem"("eventId")',
    );
  });

  it("binds replay batches and items to composite tenant identities", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("workspaceId", "connectionId")',
    );
    expect(migration).toContain(
      'REFERENCES "InboundWebhookConnection"("workspaceId", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspaceId", "batchId")',
    );
    expect(migration).toContain(
      'REFERENCES "InboundWebhookReplayBatch"("workspaceId", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspaceId", "eventId")',
    );
    expect(migration).toContain(
      'REFERENCES "InboundWebhookEvent"("workspaceId", "id")',
    );
  });

  it("does not alter leads, conversion logs or existing Meta records", () => {
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:Lead|ConversionEventLog|Meta[A-Za-z]+)"/,
    );
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE FROM) "(?:Lead|ConversionEventLog|Meta[A-Za-z]+)"/,
    );
  });
});
