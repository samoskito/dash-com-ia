import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../prisma/migrations/20260717183000_inbound_webhook_observation/migration.sql",
  ),
  "utf8",
);

function tableDefinition(table: string): string {
  const match = migration.match(
    new RegExp(`CREATE TABLE "${table}" \\([\\s\\S]*?\\n\\);`),
  );

  if (!match) {
    throw new Error(`Missing migration table ${table}`);
  }

  return match[0];
}

function foreignKeyDefinition(constraint: string): string {
  const match = migration.match(
    new RegExp(
      `ADD CONSTRAINT "${constraint}"[\\s\\S]*?ON DELETE [A-Z ]+ ON UPDATE CASCADE;`,
    ),
  );

  if (!match) {
    throw new Error(`Missing migration constraint ${constraint}`);
  }

  return match[0];
}

function checkConstraintDefinition(constraint: string): string {
  const match = migration.match(
    new RegExp(`ADD CONSTRAINT "${constraint}"[\\s\\S]*?;`),
  );

  if (!match) {
    throw new Error(`Missing migration constraint ${constraint}`);
  }

  return match[0];
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("inbound webhook observation migration", () => {
  it.each([
    "InboundWebhookConnection",
    "InboundWebhookChannel",
    "InboundWebhookChannelRoute",
    "InboundWebhookDelivery",
    "InboundWebhookEvent",
  ])("keeps %s tenant-scoped", (table) => {
    expect(tableDefinition(table)).toContain('"workspaceId" TEXT NOT NULL');
  });

  it("adds both delivery and canonical event idempotency keys", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "InboundWebhookDelivery_connection_ingress_key"',
    );
    expect(migration).toContain(
      'ON "InboundWebhookDelivery"("connectionId", "ingressKey")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "InboundWebhookEvent_connection_dedupe_key"',
    );
    expect(migration).toContain(
      'ON "InboundWebhookEvent"("connectionId", "dedupeKey")',
    );
  });

  it("uses the stable connection, organization and provider channel identity", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "InboundWebhookChannel_identity_key"',
    );
    expect(migration).toContain(
      'ON "InboundWebhookChannel"("connectionId", "organizationId", "providerChannelId")',
    );
  });

  it.each([
    ["InboundWebhookConnection", "InboundWebhookConnection"],
    ["InboundWebhookChannel", "InboundWebhookChannel"],
    ["InboundWebhookDelivery", "InboundWebhookDelivery"],
    ["MetaBusinessConnection", "MetaBusinessConnection"],
    ["MetaReportingAccount", "MetaReportingAccount"],
    ["MetaConversionDestination", "MetaConversionDestination"],
  ])("adds the tenant identity required by %s relations", (index, table) => {
    expect(migration).toContain(
      `CREATE UNIQUE INDEX "${index}_workspaceId_id_key"`,
    );
    expect(migration).toContain(`ON "${table}"("workspaceId", "id")`);
  });

  it.each([
    [
      "InboundWebhookChannel_connectionId_fkey",
      "connectionId",
      "InboundWebhookConnection",
    ],
    [
      "InboundWebhookChannelRoute_channelId_fkey",
      "channelId",
      "InboundWebhookChannel",
    ],
    [
      "InboundWebhookDelivery_connectionId_fkey",
      "connectionId",
      "InboundWebhookConnection",
    ],
    [
      "InboundWebhookEvent_connectionId_fkey",
      "connectionId",
      "InboundWebhookConnection",
    ],
    [
      "InboundWebhookEvent_deliveryId_fkey",
      "deliveryId",
      "InboundWebhookDelivery",
    ],
    [
      "InboundWebhookEvent_channelId_fkey",
      "channelId",
      "InboundWebhookChannel",
    ],
  ])(
    "binds internal relation %s to workspaceId + id",
    (constraint, childId, parentTable) => {
      const definition = normalizeSql(foreignKeyDefinition(constraint));

      expect(definition).toContain(
        `FOREIGN KEY ("workspaceId", "${childId}") REFERENCES "${parentTable}"("workspaceId", "id")`,
      );
      expect(definition).toContain("ON DELETE RESTRICT");
    },
  );

  it("stores nullable workspace/id pairs for removable Meta route assets", () => {
    const route = tableDefinition("InboundWebhookChannelRoute");

    expect(route).toContain('"metaBusinessConnectionWorkspaceId" TEXT');
    expect(route).toContain('"metaBusinessConnectionId" TEXT');
    expect(route).not.toContain('"metaBusinessConnectionId" TEXT NOT NULL');
    expect(route).toContain('"metaReportingAccountWorkspaceId" TEXT');
    expect(route).toContain('"metaReportingAccountId" TEXT');
    expect(route).toContain('"metaConversionDestinationWorkspaceId" TEXT');
    expect(route).toContain('"metaConversionDestinationId" TEXT');
  });

  it.each([
    [
      "InboundWebhookChannelRoute_metaBusinessConnectionId_fkey",
      "metaBusinessConnectionWorkspaceId",
      "metaBusinessConnectionId",
      "MetaBusinessConnection",
    ],
    [
      "InboundWebhookChannelRoute_metaReportingAccountId_fkey",
      "metaReportingAccountWorkspaceId",
      "metaReportingAccountId",
      "MetaReportingAccount",
    ],
    [
      "InboundWebhookChannelRoute_metaConversionDestinationId_fkey",
      "metaConversionDestinationWorkspaceId",
      "metaConversionDestinationId",
      "MetaConversionDestination",
    ],
    [
      "InboundWebhookEvent_resolvedBusinessConnectionId_fkey",
      "resolvedBusinessConnectionWorkspaceId",
      "resolvedBusinessConnectionId",
      "MetaBusinessConnection",
    ],
    [
      "InboundWebhookEvent_resolvedReportingAccountId_fkey",
      "resolvedReportingAccountWorkspaceId",
      "resolvedReportingAccountId",
      "MetaReportingAccount",
    ],
    [
      "InboundWebhookEvent_resolvedConversionDestinationId_fkey",
      "resolvedConversionDestinationWorkspaceId",
      "resolvedConversionDestinationId",
      "MetaConversionDestination",
    ],
  ])(
    "preserves history with tenant-composite SET NULL relation %s",
    (constraint, workspaceField, idField, parentTable) => {
      const definition = normalizeSql(foreignKeyDefinition(constraint));

      expect(definition).toContain(
        `FOREIGN KEY ("${workspaceField}", "${idField}") REFERENCES "${parentTable}"("workspaceId", "id")`,
      );
      expect(definition).toContain("ON DELETE SET NULL");
      expect(definition).not.toContain("ON DELETE RESTRICT");
      expect(definition).not.toContain("ON DELETE CASCADE");
    },
  );

  it.each([
    [
      "InboundWebhookChannelRoute_business_workspace_check",
      "metaBusinessConnectionWorkspaceId",
      "metaBusinessConnectionId",
    ],
    [
      "InboundWebhookChannelRoute_reporting_workspace_check",
      "metaReportingAccountWorkspaceId",
      "metaReportingAccountId",
    ],
    [
      "InboundWebhookChannelRoute_destination_workspace_check",
      "metaConversionDestinationWorkspaceId",
      "metaConversionDestinationId",
    ],
    [
      "InboundWebhookEvent_business_workspace_check",
      "resolvedBusinessConnectionWorkspaceId",
      "resolvedBusinessConnectionId",
    ],
    [
      "InboundWebhookEvent_reporting_workspace_check",
      "resolvedReportingAccountWorkspaceId",
      "resolvedReportingAccountId",
    ],
    [
      "InboundWebhookEvent_destination_workspace_check",
      "resolvedConversionDestinationWorkspaceId",
      "resolvedConversionDestinationId",
    ],
  ])(
    "requires a complete same-workspace Meta pair in %s",
    (constraint, workspaceField, idField) => {
      const definition = normalizeSql(checkConstraintDefinition(constraint));

      expect(definition).toContain(
        `"${workspaceField}" IS NULL AND "${idField}" IS NULL`,
      );
      expect(definition).toContain(`"${workspaceField}" IS NOT NULL`);
      expect(definition).toContain(`"${workspaceField}" = "workspaceId"`);
      expect(definition).toContain(`"${idField}" IS NOT NULL`);
    },
  );

  it("stores only encrypted expiring raw payload material", () => {
    const delivery = tableDefinition("InboundWebhookDelivery");

    expect(delivery).toContain('"encryptedPayload" TEXT');
    expect(delivery).toContain('"payloadIv" TEXT');
    expect(delivery).toContain('"payloadTag" TEXT');
    expect(delivery).toContain('"encryptionKeyVersion" INTEGER');
    expect(delivery).toContain('"payloadExpiresAt" TIMESTAMP(3) NOT NULL');
    expect(migration).toContain(
      'CREATE INDEX "InboundWebhookDelivery_payloadExpiresAt_idx"\nON "InboundWebhookDelivery"("payloadExpiresAt")',
    );
    expect(migration).toContain(
      'CREATE INDEX "InboundWebhookDelivery_recovery_idx"\nON "InboundWebhookDelivery"("status", "lastReceivedAt", "queuedAt")',
    );
    expect(delivery).not.toMatch(/"rawPayload"/i);
    expect(delivery).not.toMatch(/"payloadText"/i);
  });

  it("uses a tombstone and stores no plaintext connection secret", () => {
    const connection = tableDefinition("InboundWebhookConnection");

    expect(connection).toContain('"removedAt" TIMESTAMP(3)');
    expect(connection).toContain('"secretHash" TEXT');
    expect(connection).not.toMatch(/"secret" TEXT/i);
    expect(connection).not.toMatch(/"webhookUrl"/i);
  });

  it("seeds Umbler v1 as observation-only and extends diagnostics", () => {
    expect(migration).toContain(
      `ALTER TYPE "DiagnosticSource" ADD VALUE 'umbler'`,
    );
    expect(migration).toContain("'inbound_parser_umbler_v1'");
    expect(migration).toContain("'umbler'");
    expect(migration).toContain("'v1'");
    expect(migration).toContain("'observation_only'");
    expect(migration).toContain(
      'ON CONFLICT ("provider", "version") DO NOTHING',
    );
  });

  it("is additive and does not mutate existing business records", () => {
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE FROM) "(?:Workspace|Lead|Meta|Conversion)/,
    );
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:Workspace|Lead|Meta|Conversion)/,
    );
  });
});
