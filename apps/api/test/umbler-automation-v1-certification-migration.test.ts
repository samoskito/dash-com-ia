import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Umbler automation v1 certification migration", () => {
  it("certifies only the real automation parser and adds its lookup index", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../prisma/migrations/20260722180000_umbler_automation_v1_certification/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("\"version\" = 'automation-v1'");
    expect(migration).toContain("\"status\" = 'certified'");
    expect(migration).toContain(
      '"InboundWebhookEvent_workspace_connection_contact_occurred_idx"',
    );
    expect(migration).toContain('"contactIdentityHash"');
  });
});
