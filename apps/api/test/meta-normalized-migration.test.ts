import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260714200000_meta_normalized_connections/migration.sql",
  ),
  "utf8",
);

describe("normalized Meta migration", () => {
  it("adds workspace-scoped normalized routing without mutating MetaIntegration", () => {
    expect(migration).toContain('CREATE TABLE "MetaCredential"');
    expect(migration).toContain('CREATE TABLE "MetaBusinessConnection"');
    expect(migration).toContain('"MetaCredential_workspaceId_fingerprint_key"');
    expect(migration).toContain(
      '"MetaBusinessConnection_workspaceId_businessManagerId_key"',
    );
    expect(migration).toContain(
      '"MetaConversionDestination_workspaceId_pixelId_pageId_key"',
    );
    expect(migration).toContain(
      '"MetaReportingAccount_workspaceId_businessConnectionId_active_idx"',
    );
    expect(migration).not.toMatch(/ALTER TABLE "MetaIntegration"/);
    expect(migration).not.toMatch(/UPDATE "MetaIntegration"/);
    expect(migration).not.toMatch(/DELETE FROM "MetaIntegration"/);
  });
});
