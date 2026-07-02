import { describe, expect, it } from "vitest";
import { MetaConnectionsService } from "../src/integrations/meta/meta-connections.service";
import { MetaTokenEncryptionService } from "../src/integrations/meta/meta-token-encryption.service";

function createHarness() {
  const db = {
    records: [] as Array<Record<string, unknown>>
  };
  const prisma = {
    metaIntegration: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) =>
        db.records.find((record) => record.workspaceId === where.workspaceId) ??
        null,
      upsert: async ({
        create,
        update,
        where
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { workspaceId: string };
      }) => {
        const index = db.records.findIndex(
          (record) => record.workspaceId === where.workspaceId
        );
        const now = new Date("2026-07-02T03:00:00.000Z");

        if (index === -1) {
          const record = {
            id: "meta_integration_1",
            createdAt: now,
            updatedAt: now,
            selectedBusinessId: null,
            selectedAdAccountId: null,
            selectedPixelId: null,
            ...create
          };
          db.records.push(record);
          return record;
        }

        db.records[index] = {
          ...db.records[index],
          ...update,
          updatedAt: now
        };

        return db.records[index];
      }
    }
  };
  const encryption = new MetaTokenEncryptionService({
    META_TOKEN_ENCRYPTION_KEY: "test-encryption-key"
  });

  return {
    db,
    encryption,
    service: new MetaConnectionsService(prisma as never, encryption)
  };
}

describe("meta connections service", () => {
  it("stores encrypted OAuth tokens and returns a sanitized connection", async () => {
    const { db, encryption, service } = createHarness();

    const connection = await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read", "business_management"]
    });

    expect(connection).toMatchObject({
      workspaceId: "workspace_1",
      status: "connected",
      tokenType: "bearer",
      scopes: ["ads_read", "business_management"],
      selectedBusinessId: null,
      selectedAdAccountId: null,
      selectedPixelId: null
    });
    expect(JSON.stringify(connection)).not.toContain("EAAB-secret-token");
    expect(db.records[0]?.encryptedAccessToken).not.toBe("EAAB-secret-token");
    expect(
      encryption.decrypt({
        encryptedAccessToken: String(db.records[0]?.encryptedAccessToken),
        tokenIv: String(db.records[0]?.tokenIv),
        tokenTag: String(db.records[0]?.tokenTag)
      })
    ).toBe("EAAB-secret-token");
  });

  it("returns not_connected when a workspace has no Meta integration", async () => {
    const { service } = createHarness();

    await expect(service.getConnection("workspace_1")).resolves.toEqual({
      workspaceId: "workspace_1",
      status: "not_connected",
      tokenType: null,
      scopes: [],
      expiresAt: null,
      connectedAt: null,
      selectedBusinessId: null,
      selectedAdAccountId: null,
      selectedPixelId: null
    });
  });
});
