import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260721120000_umbler_conversion_events_foundation/migration.sql",
  ),
  "utf8",
);

describe("Umbler conversion events foundation migration", () => {
  it("adds isolated automation and structured catalog primitives", () => {
    expect(migration).toContain(
      "ADD VALUE IF NOT EXISTS 'provider_automation'",
    );
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'structured_catalog'");
    expect(migration).toContain('CREATE TABLE "ProviderConversionRuleConfig"');
    expect(migration).toContain(
      'CREATE TABLE "ProviderConversionRuleEndpoint"',
    );
    expect(migration).toContain('CREATE TABLE "ConversionCatalog"');
    expect(migration).toContain('CREATE TABLE "ConversionCatalogVariant"');
    expect(migration).toContain(
      'CREATE TABLE "ProviderConversionRuleExecution"',
    );
  });

  it("keeps historical deliveries on message observation by default", () => {
    expect(migration).toContain(
      '"purpose" "InboundWebhookDeliveryPurpose" NOT NULL DEFAULT \'message_observation\'',
    );
    expect(migration).not.toMatch(/^\s*(?:UPDATE|DELETE FROM) /m);
  });

  it("binds provider resources and executions to composite workspace identities", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("workspaceId", "conversionRuleId")',
    );
    expect(migration).toContain('FOREIGN KEY ("workspaceId", "connectionId")');
    expect(migration).toContain(
      'FOREIGN KEY ("workspaceId", "sourceDeliveryId")',
    );
    expect(migration).toContain(
      '"providerRuleEndpointWorkspaceId" = "workspaceId"',
    );
    expect(migration).toContain('"channelWorkspaceId" = "workspaceId"');
  });

  it("enforces replay idempotency and catalog integrity", () => {
    expect(migration).toContain(
      '"ProviderConversionRuleExecution_providerRuleId_externalExecutionKey_key"',
    );
    expect(migration).toContain(
      '"ConversionCatalogVariant_catalogId_normalizedKey_key"',
    );
    expect(migration).toContain(
      'CONSTRAINT "ConversionCatalogVariant_valueCents_check"',
    );
  });

  it("stores only a hash for endpoint authentication", () => {
    expect(migration).toContain('"secretHash" TEXT NOT NULL');
    expect(migration).not.toContain('"secret" TEXT');
    expect(migration).not.toContain('"webhookUrl" TEXT');
  });

  it("seeds the Umbler automation parser in observation only", () => {
    expect(migration).toContain("'inbound_parser_umbler_automation_v1'");
    expect(migration).toContain("'automation-v1'");
    expect(migration).toContain("'observation_only'");
    expect(migration).toContain(
      'ON CONFLICT ("provider", "version") DO NOTHING',
    );
  });

  it("does not mutate leads, conversion events, or the live intake path", () => {
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:Lead|ConversionEventLog|InboundWebhookEvent|InboundWebhookConnection|InboundWebhookChannel)"/,
    );
  });
});
