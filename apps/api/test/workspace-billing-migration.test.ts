import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260726120000_whatsapp_package_billing";
const migrationsDirectory = resolve(__dirname, "../prisma/migrations");
const migration = readFileSync(
  resolve(migrationsDirectory, migrationName, "migration.sql"),
  "utf8",
);
const schema = readFileSync(
  resolve(__dirname, "../prisma/schema.prisma"),
  "utf8",
);

describe("WhatsApp package billing migration", () => {
  it("is appended after the existing migration history", () => {
    const migrationNames = readdirSync(migrationsDirectory, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const migrationIndex = migrationNames.indexOf(migrationName);

    expect(migrationIndex).toBeGreaterThanOrEqual(65);
    expect(migration).toContain('CREATE TABLE "WhatsappSeat"');
  });

  it("keeps legacy billing columns and existing rows untouched", () => {
    expect(schema).toContain("pricePerWhatsappInstanceCents Int");
    expect(schema).toContain("activeInstances");
    expect(schema).toMatch(/status\s+String/u);
    expect(migration).not.toMatch(/\bDROP\s+(?:COLUMN|TABLE|TYPE)\b/iu);
    expect(migration).not.toMatch(
      /\bUPDATE\s+"(?:SubscriptionPlan|WorkspaceSubscription)"/u,
    );
    expect(migration).toContain('"isCurrent" BOOLEAN NOT NULL DEFAULT false');
  });

  it("adds package, contract, profile, event and audit structures", () => {
    expect(migration).toContain('CREATE TYPE "SubscriptionPlanKind"');
    expect(migration).toContain(
      'CREATE TYPE "WorkspaceSubscriptionContractStatus"',
    );
    expect(migration).toContain('CREATE TABLE "WorkspaceBillingProfile"');
    expect(migration).toContain('CREATE TABLE "WhatsappSeat"');
    expect(migration).toContain('CREATE TABLE "BillingProviderEvent"');
    expect(migration).toContain('CREATE TABLE "BillingContractAudit"');
    expect(migration).toContain(
      '"BillingProviderEvent_provider_providerEventId_key"',
    );
  });

  it("enforces one target and one current entitlement per provider resource", () => {
    expect(migration).toContain(
      'CONSTRAINT "WhatsappSeat_exactly_one_target_check"',
    );
    expect(migration).toContain(
      '"WhatsappSeat_whatsappInstanceId_current_key"',
    );
    expect(migration).toContain(
      '"WhatsappSeat_inboundWebhookChannelId_current_key"',
    );
    expect(migration).toContain(
      'REFERENCES "WhatsappInstance"("workspaceId", "id")',
    );
    expect(migration).toContain(
      'REFERENCES "InboundWebhookChannel"("workspaceId", "id")',
    );
  });

  it("allows at most one explicitly current contract per workspace", () => {
    expect(migration).toContain(
      '"WorkspaceSubscription_workspaceId_current_key"',
    );
    expect(migration).toMatch(
      /ON "WorkspaceSubscription"\("workspaceId"\)\s+WHERE "isCurrent" = true/u,
    );
  });
});
