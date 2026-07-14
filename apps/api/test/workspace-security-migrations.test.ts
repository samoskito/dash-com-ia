import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migrationSql(name: string): string {
  return readFileSync(
    resolve(process.cwd(), "prisma", "migrations", name, "migration.sql"),
    "utf8"
  );
}

describe("workspace security migration contracts", () => {
  it("backfills an active workspace only for users with exactly one membership", () => {
    const sql = migrationSql("20260714050000_active_workspace_context");

    expect(sql).toContain('ADD COLUMN "activeWorkspaceId" TEXT');
    expect(sql).toContain('session."revokedAt" IS NULL');
    expect(sql).toContain('session."expiresAt" > CURRENT_TIMESTAMP');
    expect(sql).toMatch(/SELECT COUNT\(\*\)[\s\S]*?= 1;/);
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain('"AuthSession_userId_activeWorkspaceId_idx"');
  });

  it("stores one-time Meta OAuth state hashes with expiry and tenant ownership", () => {
    const sql = migrationSql("20260714051000_meta_oauth_state_security");

    expect(sql).toContain('"stateHash" TEXT NOT NULL');
    expect(sql).not.toMatch(/"state" TEXT NOT NULL/);
    expect(sql).toContain('"expiresAt" TIMESTAMP(3) NOT NULL');
    expect(sql).toContain('"consumedAt" TIMESTAMP(3)');
    expect(sql).toContain('"MetaOAuthState_stateHash_key"');
    expect(sql).toContain('FOREIGN KEY ("workspaceId")');
    expect(sql).toContain('FOREIGN KEY ("userId")');
  });
});
