import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260718190000_inbound_webhook_replay_canary_operations/migration.sql",
  ),
  "utf8",
);

describe("inbound webhook replay canary migration", () => {
  it("adds fixed replay scopes and recovery metadata", () => {
    expect(migration).toContain(
      'CREATE TYPE "InboundWebhookReplaySelection" AS ENUM',
    );
    expect(migration).toContain(
      'ADD COLUMN "selection" "InboundWebhookReplaySelection"',
    );
    expect(migration).toContain('ADD COLUMN "requestedLimit" INTEGER NOT NULL');
    expect(migration).toContain(
      'ADD COLUMN "retryableFailedCount" INTEGER NOT NULL',
    );
    expect(migration).toContain('ADD COLUMN "attemptCount" INTEGER NOT NULL');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "InboundWebhookReplayBatch_one_active_per_connection_key"',
    );
    expect(migration).toContain("WHERE \"status\" IN ('queued', 'processing')");
  });

  it("defaults new batches to one event without changing source records", () => {
    expect(migration).toContain(
      "ALTER COLUMN \"selection\" SET DEFAULT 'canary_1'",
    );
    expect(migration).toContain('ALTER COLUMN "requestedLimit" SET DEFAULT 1');
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE FROM) "(?:InboundWebhookEvent|Lead|ConversionEventLog)"/,
    );
  });
});
