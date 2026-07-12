import { describe, expect, it, vi } from "vitest";
import { MetaConnectionsService } from "../src/integrations/meta/meta-connections.service";
import { MetaTokenEncryptionService } from "../src/integrations/meta/meta-token-encryption.service";

function createHarness() {
  const db = {
    records: [] as Array<Record<string, unknown>>,
    snapshots: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>
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
      },
      update: async ({
        data,
        where
      }: {
        data: Record<string, unknown>;
        where: { workspaceId: string };
      }) => {
        const index = db.records.findIndex(
          (record) => record.workspaceId === where.workspaceId
        );

        if (index === -1) {
          throw new Error("Record not found");
        }

        db.records[index] = {
          ...db.records[index],
          ...data,
          updatedAt: new Date("2026-07-02T04:00:00.000Z")
        };

        return db.records[index];
      }
    },
    metaAssetSnapshot: {
      findUnique: async ({
        where
      }: {
        where: { workspaceId_snapshotKey: { workspaceId: string; snapshotKey: string } };
      }) =>
        db.snapshots.find(
          (record) =>
            record.workspaceId === where.workspaceId_snapshotKey.workspaceId &&
            record.snapshotKey === where.workspaceId_snapshotKey.snapshotKey
        ) ?? null,
      upsert: async ({
        create,
        update,
        where
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { workspaceId_snapshotKey: { workspaceId: string; snapshotKey: string } };
      }) => {
        const index = db.snapshots.findIndex(
          (record) =>
            record.workspaceId === where.workspaceId_snapshotKey.workspaceId &&
            record.snapshotKey === where.workspaceId_snapshotKey.snapshotKey
        );
        const now = new Date("2026-07-09T12:00:00.000Z");

        if (index === -1) {
          const record = {
            id: `snapshot_${db.snapshots.length + 1}`,
            createdAt: now,
            updatedAt: now,
            ...create
          };
          db.snapshots.push(record);
          return record;
        }

        db.snapshots[index] = {
          ...db.snapshots[index],
          ...update,
          updatedAt: now
        };

        return db.snapshots[index];
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `audit_${db.auditLogs.length + 1}`,
          createdAt: new Date("2026-07-02T04:00:00.000Z"),
          ...data
        };
        db.auditLogs.push(log);
        return log;
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
      scopes: ["ads_read", "business_management"],
      actorUserId: "user_1"
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
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "meta.oauth.connected",
        targetType: "MetaIntegration",
        targetId: "workspace_1",
        resultStatus: "connected"
      })
    );
    expect(JSON.stringify(db.auditLogs)).not.toContain("EAAB-secret-token");
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
      selectedPixelId: null,
      capiTokenConfigured: false
    });
  });

  it("refreshes businesses and preloads only the first BM assets", async () => {
    const { service } = createHarness();
    const metaAdapter = {
      listBusinesses: vi.fn(async () => [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified"
        },
        {
          id: "business_2",
          name: "BM Secundario",
          verificationStatus: null
        }
      ]),
      listOwnedAdAccounts: vi.fn(
        async ({ businessId }: { businessId: string }) =>
          businessId === "business_1"
            ? [
                {
                  id: "act_123",
                  name: "Conta WhatsApp",
                  accountStatus: "1",
                  currency: "BRL",
                  timezoneName: "America/Sao_Paulo"
                },
                {
                  id: "act_456",
                  name: "Conta Remarketing",
                  accountStatus: "1",
                  currency: "BRL",
                  timezoneName: "America/Sao_Paulo"
                }
              ]
            : [
                {
                  id: "act_789",
                  name: "Conta Outro BM",
                  accountStatus: "1",
                  currency: "USD",
                  timezoneName: "America/New_York"
                }
              ]
      ),
      listBusinessPixels: vi.fn(
        async ({ businessId }: { businessId: string }) =>
          businessId === "business_1"
            ? [
                {
                  id: "pixel_1",
                  name: "Pixel Loja",
                  code: "1234567890"
                },
                {
                  id: "pixel_2",
                  name: "Pixel Remarketing",
                  code: "0987654321"
                }
              ]
            : [
                {
                  id: "pixel_3",
                  name: "Pixel Outro BM",
                  code: "9999999999"
                }
              ]
      ),
      listBusinessPages: vi.fn(
        async ({ businessId }: { businessId: string }) =>
          businessId === "business_1"
            ? [
                {
                  id: "page_1",
                  businessId: "business_1",
                  name: "Pagina Principal"
                }
              ]
            : []
      )
    };

    await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read"]
    });

    const assets = await service.refreshAssets(
      "workspace_1",
      metaAdapter as never
    );

    expect(assets).toMatchObject({
      workspaceId: "workspace_1",
      status: "connected",
      businesses: [{ name: "BM Principal" }, { name: "BM Secundario" }],
      adAccounts: [
        { businessId: "business_1", name: "Conta WhatsApp" },
        { businessId: "business_1", name: "Conta Remarketing" }
      ],
      pixels: [
        { businessId: "business_1", name: "Pixel Loja", code: null },
        { businessId: "business_1", name: "Pixel Remarketing", code: null }
      ],
      pages: [
        { businessId: "business_1", name: "Pagina Principal" }
      ],
      selection: {
        businessId: null,
        adAccountId: null,
        pixelId: null
      },
      syncError: null
    });
    expect(metaAdapter.listBusinesses).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token"
    });
    expect(metaAdapter.listOwnedAdAccounts).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_1"
    });
    expect(metaAdapter.listBusinessPixels).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_1"
    });
    expect(metaAdapter.listBusinessPages).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_1"
    });
    expect(metaAdapter.listOwnedAdAccounts).not.toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "business_2" })
    );
    expect(JSON.stringify(assets)).not.toContain("EAAB-secret-token");
  });

  it("loads ad accounts, pixels and pages only for the selected business", async () => {
    const { service } = createHarness();
    const metaAdapter = {
      listBusinesses: vi.fn(async () => [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified"
        },
        {
          id: "business_2",
          name: "BM Secundario",
          verificationStatus: null
        }
      ]),
      listOwnedAdAccounts: vi.fn(
        async ({ businessId }: { businessId: string }) =>
          businessId === "business_1"
            ? [
                {
                  id: "act_123",
                  name: "Conta WhatsApp",
                  accountStatus: "1",
                  currency: "BRL",
                  timezoneName: "America/Sao_Paulo"
                }
              ]
            : [
                {
                  id: "act_789",
                  name: "Conta Outro BM",
                  accountStatus: "1",
                  currency: "USD",
                  timezoneName: "America/New_York"
                }
              ]
      ),
      listBusinessPixels: vi.fn(
        async ({ businessId }: { businessId: string }) =>
          businessId === "business_1"
            ? [
                {
                  id: "pixel_1",
                  name: "Pixel Loja",
                  code: "1234567890"
                }
              ]
            : [
                {
                  id: "pixel_3",
                  name: "Pixel Outro BM",
                  code: "9999999999"
                }
              ]
      ),
      listBusinessPages: vi.fn(
        async ({ businessId }: { businessId: string }) =>
          businessId === "business_1"
            ? [
                {
                  id: "page_1",
                  businessId: "business_1",
                  name: "Pagina Principal"
                }
              ]
            : [
                {
                  id: "page_2",
                  businessId: "business_2",
                  name: "Pagina Outro BM"
                }
              ]
      )
    };

    await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read"]
    });
    await service.saveAssetSelection("workspace_1", {
      businessId: "business_1",
      adAccountId: null,
      pixelId: null
    });

    const assets = await service.refreshAssets(
      "workspace_1",
      metaAdapter as never
    );

    expect(assets).toMatchObject({
      workspaceId: "workspace_1",
      status: "connected",
      businesses: [{ name: "BM Principal" }, { name: "BM Secundario" }],
      adAccounts: [{ businessId: "business_1", name: "Conta WhatsApp" }],
      pixels: [{ businessId: "business_1", name: "Pixel Loja", code: null }],
      pages: [{ businessId: "business_1", name: "Pagina Principal" }],
      selection: {
        businessId: "business_1",
        adAccountId: null,
        pixelId: null
      },
      syncError: null
    });
    expect(metaAdapter.listOwnedAdAccounts).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_1"
    });
    expect(metaAdapter.listBusinessPixels).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_1"
    });
    expect(metaAdapter.listBusinessPages).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_1"
    });
    expect(metaAdapter.listOwnedAdAccounts).not.toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "business_2" })
    );
    expect(metaAdapter.listBusinessPixels).not.toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "business_2" })
    );
    expect(metaAdapter.listBusinessPages).not.toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "business_2" })
    );
    expect(JSON.stringify(assets)).not.toContain("EAAB-secret-token");
  });

  it("returns cached Meta assets without calling Graph on page load", async () => {
    const { db, service } = createHarness();
    const metaAdapter = {
      listBusinesses: vi.fn(),
      listOwnedAdAccounts: vi.fn(),
      listBusinessPixels: vi.fn(),
      listBusinessPages: vi.fn()
    };

    await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read"]
    });
    await service.saveAssetSelection("workspace_1", {
      businessId: "business_1",
      adAccountId: null,
      pixelId: null
    });
    db.snapshots.push(
      {
        workspaceId: "workspace_1",
        snapshotKey: "root",
        businessId: null,
        status: "connected",
        businesses: [
          { id: "business_1", name: "BM Principal", verificationStatus: "verified" }
        ],
        adAccounts: [],
        pixels: [],
        pages: [],
        syncError: null,
        syncedAt: new Date("2026-07-09T11:00:00.000Z")
      },
      {
        workspaceId: "workspace_1",
        snapshotKey: "business_1",
        businessId: "business_1",
        status: "connected",
        businesses: [],
        adAccounts: [
          {
            id: "act_123",
            businessId: "business_1",
            name: "Conta WhatsApp",
            accountStatus: "1",
            currency: "BRL",
            timezoneName: "America/Sao_Paulo"
          }
        ],
        pixels: [
          {
            id: "pixel_1",
            businessId: "business_1",
            name: "Pixel Loja",
            code: null
          }
        ],
        pages: [
          {
            id: "page_1",
            businessId: "business_1",
            name: "Pagina Principal"
          }
        ],
        syncError: null,
        syncedAt: new Date("2026-07-09T11:01:00.000Z")
      }
    );

    const assets = await service.listAssets("workspace_1", metaAdapter as never);

    expect(assets).toMatchObject({
      workspaceId: "workspace_1",
      status: "connected",
      businesses: [{ name: "BM Principal" }],
      adAccounts: [{ name: "Conta WhatsApp" }],
      pixels: [{ name: "Pixel Loja" }],
      pages: [{ name: "Pagina Principal" }],
      lastSyncedAt: "2026-07-09T11:01:00.000Z",
      syncError: null
    });
    expect(metaAdapter.listBusinesses).not.toHaveBeenCalled();
    expect(metaAdapter.listOwnedAdAccounts).not.toHaveBeenCalled();
    expect(metaAdapter.listBusinessPixels).not.toHaveBeenCalled();
    expect(metaAdapter.listBusinessPages).not.toHaveBeenCalled();
  });

  it("refreshes Meta asset snapshots from Graph when requested", async () => {
    const { db, service } = createHarness();
    const metaAdapter = {
      listBusinesses: vi.fn(async () => [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified"
        }
      ]),
      listOwnedAdAccounts: vi.fn(async () => [
        {
          id: "act_123",
          name: "Conta WhatsApp",
          accountStatus: "1",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo"
        }
      ]),
      listBusinessPixels: vi.fn(async () => [
        {
          id: "pixel_1",
          name: "Pixel Loja",
          code: "1234567890"
        }
      ]),
      listBusinessPages: vi.fn(async () => [
        {
          id: "page_1",
          businessId: "business_1",
          name: "Pagina Principal"
        }
      ])
    };

    await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read"]
    });

    const assets = await service.refreshAssets(
      "workspace_1",
      metaAdapter as never,
      "business_1",
      "user_1"
    );

    expect(assets).toMatchObject({
      businesses: [{ name: "BM Principal" }],
      adAccounts: [{ businessId: "business_1", name: "Conta WhatsApp" }],
      pixels: [{ businessId: "business_1", name: "Pixel Loja", code: null }],
      pages: [{ businessId: "business_1", name: "Pagina Principal" }],
      syncError: null
    });
    expect(db.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: "workspace_1",
          snapshotKey: "root",
          businessId: null
        }),
        expect.objectContaining({
          workspaceId: "workspace_1",
          snapshotKey: "business_1",
          businessId: "business_1"
        })
      ])
    );
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        action: "meta.assets.snapshot_refreshed",
        resultStatus: "success"
      })
    );
  });

  it("loads ad accounts and pixels for a requested business without saving selection first", async () => {
    const { service } = createHarness();
    const metaAdapter = {
      listBusinesses: vi.fn(async () => [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified"
        },
        {
          id: "business_2",
          name: "BM Secundario",
          verificationStatus: null
        }
      ]),
      listOwnedAdAccounts: vi.fn(async ({ businessId }: { businessId: string }) =>
        businessId === "business_2"
          ? [
              {
                id: "act_789",
                name: "Conta Outro BM",
                accountStatus: "1",
                currency: "USD",
                timezoneName: "America/New_York"
              }
            ]
          : []
      ),
      listBusinessPixels: vi.fn(async ({ businessId }: { businessId: string }) =>
        businessId === "business_2"
          ? [
              {
                id: "pixel_3",
                name: "Pixel Outro BM",
                code: "9999999999"
              }
            ]
          : []
      ),
      listBusinessPages: vi.fn(async ({ businessId }: { businessId: string }) =>
        businessId === "business_2"
          ? [
              {
                id: "page_3",
                businessId: "business_2",
                name: "Pagina Outro BM"
              }
            ]
          : []
      )
    };

    await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read"]
    });

    const assets = await service.refreshAssets(
      "workspace_1",
      metaAdapter as never,
      "business_2"
    );

    expect(assets).toMatchObject({
      workspaceId: "workspace_1",
      status: "connected",
      businesses: [{ name: "BM Principal" }, { name: "BM Secundario" }],
      adAccounts: [{ businessId: "business_2", name: "Conta Outro BM" }],
      pixels: [{ businessId: "business_2", name: "Pixel Outro BM", code: null }],
      pages: [{ businessId: "business_2", name: "Pagina Outro BM" }],
      selection: {
        businessId: null,
        adAccountId: null,
        pixelId: null
      },
      syncError: null
    });
    expect(metaAdapter.listOwnedAdAccounts).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_2"
    });
    expect(metaAdapter.listBusinessPixels).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_2"
    });
    expect(metaAdapter.listBusinessPages).toHaveBeenCalledWith({
      accessToken: "EAAB-secret-token",
      businessId: "business_2"
    });
  });

  it("keeps available assets and reports partial Meta permission failures", async () => {
    const { service } = createHarness();
    const metaAdapter = {
      listBusinesses: vi.fn(async () => [
        {
          id: "business_1",
          name: "BM Principal",
          verificationStatus: "verified"
        }
      ]),
      listOwnedAdAccounts: vi.fn(async () => [
        {
          id: "act_123",
          name: "Conta WhatsApp",
          accountStatus: "1",
          currency: "BRL",
          timezoneName: "America/Sao_Paulo"
        }
      ]),
      listBusinessPixels: vi.fn(async () => {
        throw new Error("Permissions error");
      }),
      listBusinessPages: vi.fn(async () => [
        {
          id: "page_1",
          businessId: "business_1",
          name: "Pagina Principal"
        }
      ])
    };

    await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read"]
    });

    const assets = await service.refreshAssets(
      "workspace_1",
      metaAdapter as never
    );

    expect(assets).toMatchObject({
      status: "connected",
      adAccounts: [{ businessId: "business_1", id: "act_123" }],
      pixels: [],
      pages: [{ businessId: "business_1", id: "page_1" }],
      syncError:
        "A Meta nao permitiu carregar Pixels para o BM selecionado."
    });
  });

  it("saves selected Meta business, ad account and pixel", async () => {
    const { db, service } = createHarness();

    await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-secret-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read"]
    });

    await expect(
      service.saveAssetSelection("workspace_1", {
        businessId: "business_1",
        adAccountId: "act_123",
        pixelId: "pixel_1",
      }, "user_1")
    ).resolves.toMatchObject({
      workspaceId: "workspace_1",
      selectedBusinessId: "business_1",
      selectedAdAccountId: "act_123",
      selectedPixelId: "pixel_1"
    });
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "meta.assets.selection_updated",
        targetType: "MetaIntegration",
        targetId: "workspace_1",
        resultStatus: "success"
      })
    );
    expect(db.auditLogs.at(-1)?.afterSummary).toMatchObject({
      businessId: "business_1",
      adAccountId: "act_123",
      pixelId: "pixel_1"
    });
  });

  it("stores and clears a workspace Meta CAPI token without exposing the secret", async () => {
    const { db, encryption, service } = createHarness();

    await service.saveOAuthConnection({
      workspaceId: "workspace_1",
      accessToken: "EAAB-oauth-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
      scopes: ["ads_read"]
    });

    await expect(
      service.saveCapiToken(
        "workspace_1",
        { accessToken: "EAAB-capi-token-secret", clear: false },
        "user_1"
      )
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      configured: true,
      updatedAt: "2026-07-02T04:00:00.000Z"
    });

    expect(db.records[0]?.capiAccessTokenEncrypted).not.toBe(
      "EAAB-capi-token-secret"
    );
    expect(
      encryption.decrypt({
        encryptedAccessToken: String(db.records[0]?.capiAccessTokenEncrypted),
        tokenIv: String(db.records[0]?.capiTokenIv),
        tokenTag: String(db.records[0]?.capiTokenTag)
      })
    ).toBe("EAAB-capi-token-secret");
    expect(JSON.stringify(db.auditLogs)).not.toContain("EAAB-capi-token-secret");
    expect(db.auditLogs.at(-1)).toMatchObject({
      workspaceId: "workspace_1",
      actorUserId: "user_1",
      action: "meta.capi_token.updated",
      resultStatus: "configured"
    });

    await expect(
      service.saveCapiToken("workspace_1", { clear: true }, "user_1")
    ).resolves.toEqual({
      workspaceId: "workspace_1",
      configured: false,
      updatedAt: "2026-07-02T04:00:00.000Z"
    });

    expect(db.records[0]).toMatchObject({
      capiAccessTokenEncrypted: null,
      capiTokenIv: null,
      capiTokenTag: null
    });
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: "meta.capi_token.updated",
      resultStatus: "cleared"
    });
  });
});
