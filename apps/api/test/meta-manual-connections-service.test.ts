import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MetaManualConnectionsService } from "../src/integrations/meta/meta-manual-connections.service";
import { MetaTokenEncryptionService } from "../src/integrations/meta/meta-token-encryption.service";

const now = new Date("2026-07-14T20:00:00.000Z");

function createHarness(options?: {
  legacyWorkspace?: boolean;
  scopes?: string[];
  enumeratesBusinesses?: boolean;
  businessListingFails?: boolean;
}) {
  const credentials: Array<Record<string, any>> = [];
  const connections: Array<Record<string, any>> = [];
  const destinations: Array<Record<string, any>> = [];
  const accounts: Array<Record<string, any>> = [];
  const audits: Array<Record<string, any>> = [];
  const encryption = new MetaTokenEncryptionService({
    META_TOKEN_ENCRYPTION_KEY: "manual-service-test-key",
  });
  const adapter = {
    getTokenProfile: vi.fn(async () => ({
      id: "system_user_1",
      name: "Usuario do sistema",
      scopes: options?.scopes ?? ["business_management", "ads_management"],
    })),
    listBusinesses: vi.fn(async () => {
      if (options?.businessListingFails) {
        throw new Error("Business listing unavailable for system user");
      }

      return options?.enumeratesBusinesses === false
        ? []
        : [
            {
              id: "business_1",
              name: "BM Principal",
              verificationStatus: "verified",
            },
          ];
    }),
    getBusiness: vi.fn(async ({ businessId }: { businessId: string }) => ({
      id: businessId,
      name: businessId === "business_1" ? "BM Principal" : `BM ${businessId}`,
      verificationStatus: "verified",
    })),
    getAdAccount: vi.fn(
      async ({
        adAccountId,
        businessId,
      }: {
        adAccountId: string;
        businessId?: string | null;
      }) => ({
        id: adAccountId,
        businessId: businessId ?? "business_1",
        name: `Conta ${adAccountId}`,
        accountStatus: "1",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
      }),
    ),
    getPixel: vi.fn(
      async ({
        pixelId,
        businessId,
      }: {
        pixelId: string;
        businessId?: string | null;
      }) => ({
        id: pixelId,
        businessId: businessId ?? "business_1",
        name: `Pixel ${pixelId}`,
        code: null,
      }),
    ),
    getPage: vi.fn(
      async ({
        pageId,
        businessId,
      }: {
        pageId: string;
        businessId?: string | null;
      }) => ({
        id: pageId,
        businessId: businessId ?? "business_1",
        name: `Pagina ${pageId}`,
      }),
    ),
    listOwnedAdAccounts: vi.fn(async () => []),
    listBusinessPixels: vi.fn(async () => []),
    listBusinessPages: vi.fn(async () => []),
  };
  const prisma: Record<string, any> = {
    metaIntegration: {
      findUnique: vi.fn(async () =>
        options?.legacyWorkspace ? { id: "legacy_1" } : null,
      ),
    },
    metaCredential: {
      findUnique: vi.fn(
        async ({ where }: any) =>
          credentials.find(
            (item) =>
              item.workspaceId === where.workspaceId_fingerprint.workspaceId &&
              item.fingerprint === where.workspaceId_fingerprint.fingerprint,
          ) ?? null,
      ),
      findFirst: vi.fn(
        async ({ where }: any) =>
          credentials.find(
            (item) =>
              item.id === where.id &&
              item.workspaceId === where.workspaceId &&
              item.source === where.source,
          ) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any) =>
        credentials.filter(
          (item) =>
            item.workspaceId === where.workspaceId &&
            item.source === where.source,
        ),
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = credentials.find(
          (item) =>
            item.workspaceId === where.workspaceId_fingerprint.workspaceId &&
            item.fingerprint === where.workspaceId_fingerprint.fingerprint,
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: now });
          return existing;
        }

        const record = {
          id: `credential_${credentials.length + 1}`,
          expiresAt: null,
          rotatedAt: null,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        credentials.push(record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const credential = credentials.find((item) => item.id === where.id);

        if (!credential) {
          throw new Error("Credential not found");
        }

        Object.assign(credential, data, { updatedAt: now });
        return credential;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matching = credentials.filter(
          (item) =>
            item.id === where.id &&
            item.workspaceId === where.workspaceId &&
            item.source === where.source,
        );
        matching.forEach((item) =>
          Object.assign(item, data, { updatedAt: now }),
        );
        return { count: matching.length };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const index = credentials.findIndex(
          (item) =>
            item.id === where.id &&
            item.workspaceId === where.workspaceId &&
            item.source === where.source,
        );

        if (index < 0) {
          return { count: 0 };
        }

        credentials.splice(index, 1);
        return { count: 1 };
      }),
    },
    metaBusinessConnection: {
      findUnique: vi.fn(
        async ({ where }: any) =>
          connections.find(
            (item) =>
              item.workspaceId ===
                where.workspaceId_businessManagerId.workspaceId &&
              item.businessManagerId ===
                where.workspaceId_businessManagerId.businessManagerId,
          ) ?? null,
      ),
      findMany: vi.fn(async ({ where, include }: any) =>
        connections
          .filter(
            (item) =>
              item.workspaceId === where.workspaceId &&
              (where.credentialId === undefined ||
                item.credentialId === where.credentialId),
          )
          .map((item) => {
            const connectionAccounts = accounts.filter(
              (account) => account.businessConnectionId === item.id,
            );

            return {
              ...item,
              _count: { reportingAccounts: connectionAccounts.length },
              reportingAccounts: include?.reportingAccounts
                ? connectionAccounts
                : connectionAccounts.map((account) => ({
                    active: account.active,
                  })),
              defaultConversionDestination:
                include?.defaultConversionDestination
                  ? destinations.find(
                      (destination) =>
                        destination.id === item.defaultConversionDestinationId,
                    )
                  : undefined,
            };
          }),
      ),
      findFirst: vi.fn(async ({ where }: any) => {
        const connection = connections.find(
          (item) =>
            item.id === where.id && item.workspaceId === where.workspaceId,
        );

        if (!connection) {
          return null;
        }

        return {
          ...connection,
          credential: credentials.find(
            (item) => item.id === connection.credentialId,
          ),
          defaultConversionDestination: destinations.find(
            (item) => item.id === connection.defaultConversionDestinationId,
          ),
          reportingAccounts: accounts.filter(
            (item) =>
              item.businessConnectionId === connection.id && item.active,
          ),
        };
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = connections.find(
          (item) =>
            item.workspaceId ===
              where.workspaceId_businessManagerId.workspaceId &&
            item.businessManagerId ===
              where.workspaceId_businessManagerId.businessManagerId,
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: now });
          return existing;
        }

        const record = {
          id: `connection_${connections.length + 1}`,
          lastSyncedAt: null,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        connections.push(record);
        return record;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matching = connections.filter(
          (item) =>
            item.id === where.id && item.workspaceId === where.workspaceId,
        );
        matching.forEach((item) =>
          Object.assign(item, data, { updatedAt: now }),
        );
        return { count: matching.length };
      }),
      count: vi.fn(
        async ({ where }: any) =>
          connections.filter(
            (item) =>
              item.workspaceId === where.workspaceId &&
              item.credentialId === where.credentialId,
          ).length,
      ),
      deleteMany: vi.fn(async ({ where }: any) => {
        const index = connections.findIndex(
          (item) =>
            item.id === where.id && item.workspaceId === where.workspaceId,
        );

        if (index < 0) {
          return { count: 0 };
        }

        connections.splice(index, 1);
        return { count: 1 };
      }),
    },
    metaConversionDestination: {
      findMany: vi.fn(async ({ where }: any) =>
        destinations.filter((item) => item.workspaceId === where.workspaceId),
      ),
      findFirst: vi.fn(
        async ({ where }: any) =>
          destinations.find(
            (item) =>
              item.workspaceId === where.workspaceId &&
              (where.id === undefined || item.id === where.id),
          ) ?? null,
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = where.workspaceId_pixelId_pageId;
        const existing = destinations.find(
          (item) =>
            item.workspaceId === key.workspaceId &&
            item.pixelId === key.pixelId &&
            item.pageId === key.pageId,
        );

        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const record = {
          id: `destination_${destinations.length + 1}`,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        destinations.push(record);
        return record;
      }),
    },
    metaReportingAccount: {
      findMany: vi.fn(async ({ where }: any) =>
        accounts.filter(
          (item) =>
            item.workspaceId === where.workspaceId &&
            (where.adAccountId?.in
              ? where.adAccountId.in.includes(item.adAccountId)
              : where.businessConnectionId?.not === null
                ? item.businessConnectionId !== null
                : true),
        ),
      ),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const account = accounts.find(
          (item) =>
            item.id === where.id && item.workspaceId === where.workspaceId,
        );

        if (!account) {
          return null;
        }

        const businessConnection = connections.find(
          (item) => item.id === account.businessConnectionId,
        );

        return {
          ...account,
          businessConnection:
            include?.businessConnection && businessConnection
              ? {
                  ...businessConnection,
                  credential: credentials.find(
                    (item) => item.id === businessConnection.credentialId,
                  ),
                }
              : undefined,
        };
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = where.workspaceId_adAccountId;
        const existing = accounts.find(
          (item) =>
            item.workspaceId === key.workspaceId &&
            item.adAccountId === key.adAccountId,
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: now });
          return existing;
        }

        const record = {
          id: `account_${accounts.length + 1}`,
          lastSyncedAt: null,
          lastSyncSince: null,
          lastSyncUntil: null,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        accounts.push(record);
        return record;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matching = accounts.filter(
          (item) =>
            (where.id === undefined || item.id === where.id) &&
            (where.workspaceId === undefined ||
              item.workspaceId === where.workspaceId) &&
            (where.businessConnectionId === undefined ||
              item.businessConnectionId === where.businessConnectionId) &&
            (where.active === undefined || item.active === where.active) &&
            (where.adAccountId?.notIn === undefined ||
              !where.adAccountId.notIn.includes(item.adAccountId)),
        );
        matching.forEach((item) =>
          Object.assign(item, data, { updatedAt: now }),
        );
        return { count: matching.length };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        audits.push(data);
        return data;
      }),
    },
  };
  prisma.$transaction = vi.fn(async (input: any) =>
    typeof input === "function" ? input(prisma) : Promise.all(input),
  );

  return {
    adapter,
    audits,
    credentials,
    connections,
    destinations,
    accounts,
    prisma,
    encryption,
    service: new MetaManualConnectionsService(
      prisma as never,
      adapter as never,
      encryption,
      { META_CONNECTION_MODES: "oauth,manual" },
    ),
  };
}

describe("MetaManualConnectionsService", () => {
  it("encrypts a permanent token immediately and never returns plaintext", async () => {
    const { credentials, encryption, service } = createHarness();
    const token = "EAAB-permanent-system-user-token";

    const result = await service.createCredential(
      "workspace_1",
      { label: "Token BM Principal", accessToken: token },
      "user_1",
    );

    expect(JSON.stringify(result)).not.toContain(token);
    expect(credentials[0]?.encryptedAccessToken).not.toBe(token);
    expect(credentials[0]?.fingerprint).toHaveLength(64);
    expect(
      encryption.decrypt({
        encryptedAccessToken: String(credentials[0]?.encryptedAccessToken),
        tokenIv: String(credentials[0]?.tokenIv),
        tokenTag: String(credentials[0]?.tokenTag),
      }),
    ).toBe(token);
    expect(result.credential).toMatchObject({
      workspaceId: "workspace_1",
      label: "Token BM Principal",
      tokenLast4: "oken",
      status: "pending",
    });
  });

  it("keeps a valid system-user token when Meta does not enumerate businesses", async () => {
    const { audits, credentials, service } = createHarness({
      enumeratesBusinesses: false,
    });

    const result = await service.createCredential("workspace_1", {
      label: "Token BM por ID",
      accessToken: "EAAB-permanent-system-user-token",
    });

    expect(result.businesses).toEqual([]);
    expect(result.credential.status).toBe("pending");
    expect(credentials).toHaveLength(1);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "meta.manual.credential_validated",
        afterSummary: expect.objectContaining({ accessibleBusinesses: 0 }),
      }),
    );
  });

  it("discovers an explicitly informed BM when automatic listing is unavailable", async () => {
    const { adapter, service } = createHarness({
      businessListingFails: true,
    });
    const credential = await service.createCredential("workspace_1", {
      label: "Token BM por ID",
      accessToken: "EAAB-permanent-system-user-token",
    });

    const result = await service.discoverAssets(
      "workspace_1",
      credential.credential.id,
      "business_direct",
    );

    expect(result.selectedBusinessId).toBe("business_direct");
    expect(result.businesses).toContainEqual(
      expect.objectContaining({ id: "business_direct" }),
    );
    expect(adapter.getBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "business_direct" }),
    );
  });

  it("refuses manual writes when the workspace already has legacy OAuth", async () => {
    const { adapter, credentials, service } = createHarness({
      legacyWorkspace: true,
    });

    await expect(
      service.createCredential("workspace_barbieri", {
        label: "Nao deve salvar",
        accessToken: "EAAB-permanent-system-user-token",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(adapter.getTokenProfile).not.toHaveBeenCalled();
    expect(credentials).toHaveLength(0);
  });

  it("rejects tokens missing required scopes without persisting them", async () => {
    const { credentials, service } = createHarness({ scopes: ["ads_read"] });

    await expect(
      service.createCredential("workspace_1", {
        label: "Token incompleto",
        accessToken: "EAAB-permanent-system-user-token",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credentials).toHaveLength(0);
  });

  it("rejects an invalid or revoked token without persisting it", async () => {
    const { adapter, credentials, service } = createHarness();
    adapter.getTokenProfile.mockRejectedValueOnce(
      new Error("OAuthException: invalid token"),
    );

    await expect(
      service.createCredential("workspace_1", {
        label: "Token revogado",
        accessToken: "EAAB-revoked-system-user-token",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credentials).toHaveLength(0);
  });

  it("activates an exact BM, account and destination in one transaction", async () => {
    const { accounts, connections, destinations, service } = createHarness();
    const discovery = await service.createCredential("workspace_1", {
      label: "Token BM Principal",
      accessToken: "EAAB-permanent-system-user-token",
    });

    const configuration = await service.createBusinessConnection(
      "workspace_1",
      {
        credentialId: discovery.credential.id,
        businessManagerId: "business_1",
        businessManagerName: "BM Principal",
        adAccountIds: ["act_1"],
        destination: {
          label: "Destino principal",
          pixelId: "pixel_1",
          pageId: "page_1",
        },
      },
      "user_1",
    );

    expect(connections).toHaveLength(1);
    expect(destinations).toHaveLength(1);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      workspaceId: "workspace_1",
      adAccountId: "act_1",
      businessConnectionId: connections[0]?.id,
    });
    expect(configuration.businessConnections[0]).toMatchObject({
      status: "active",
      defaultConversionDestinationId: destinations[0]?.id,
      reportingAccountCount: 1,
    });
    expect(JSON.stringify(configuration)).not.toContain(
      "EAAB-permanent-system-user-token",
    );
  });

  it("updates one saved BM and deactivates accounts removed from its form", async () => {
    const { accounts, connections, service } = createHarness();
    const credential = await service.createCredential("workspace_1", {
      label: "Token BM Principal",
      accessToken: "EAAB-permanent-system-user-token",
    });

    await service.createBusinessConnection("workspace_1", {
      credentialId: credential.credential.id,
      businessManagerId: "business_1",
      businessManagerName: "BM Principal",
      adAccountIds: ["act_1", "act_2"],
      destination: { pixelId: "pixel_1", pageId: "page_1" },
    });
    const destinationId = connections[0]?.defaultConversionDestinationId;

    const updated = await service.createBusinessConnection("workspace_1", {
      credentialId: credential.credential.id,
      businessManagerId: "business_1",
      businessManagerName: "BM Principal editada",
      adAccountIds: ["act_2"],
      destination: { existingDestinationId: destinationId },
    });

    expect(connections).toHaveLength(1);
    expect(connections[0]?.businessManagerName).toBe("BM Principal");
    expect(accounts.find((item) => item.adAccountId === "act_1")?.active).toBe(
      false,
    );
    expect(
      accounts.find((item) => item.adAccountId === "act_1")
        ?.businessConnectionId,
    ).toBeNull();
    expect(accounts.find((item) => item.adAccountId === "act_2")?.active).toBe(
      true,
    );
    expect(updated.businessConnections[0]).toMatchObject({
      reportingAccountCount: 1,
      activeReportingAccountCount: 1,
    });
  });

  it("removes only the confirmed workspace connection and preserves its history", async () => {
    const {
      accounts,
      audits,
      connections,
      credentials,
      destinations,
      service,
    } = createHarness();
    const credential = await service.createCredential("workspace_1", {
      label: "Token BM Principal",
      accessToken: "EAAB-permanent-system-user-token",
    });
    const configured = await service.createBusinessConnection("workspace_1", {
      credentialId: credential.credential.id,
      businessManagerId: "business_1",
      businessManagerName: "BM Principal",
      adAccountIds: ["act_1"],
      destination: { pixelId: "pixel_1", pageId: "page_1" },
    });
    const connectionId = configured.businessConnections[0]!.id;

    await expect(
      service.removeBusinessConnection("workspace_2", connectionId, {
        businessManagerId: "business_1",
      }),
    ).rejects.toThrow("Conexao Meta nao encontrada");
    await expect(
      service.removeBusinessConnection("workspace_1", connectionId, {
        businessManagerId: "business_errada",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const configuration = await service.removeBusinessConnection(
      "workspace_1",
      connectionId,
      { businessManagerId: "business_1" },
      "user_1",
    );

    expect(connections).toHaveLength(0);
    expect(credentials).toHaveLength(0);
    expect(destinations).toHaveLength(1);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      active: false,
      businessConnectionId: null,
      conversionDestinationId: null,
    });
    expect(configuration.businessConnections).toEqual([]);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "meta.manual.business_connection_removed",
        targetId: connectionId,
      }),
    );
  });

  it("keeps a shared credential when another BM still uses it", async () => {
    const { connections, credentials, service } = createHarness();
    const credential = await service.createCredential("workspace_1", {
      label: "Token compartilhado",
      accessToken: "EAAB-permanent-system-user-token",
    });
    await service.createBusinessConnection("workspace_1", {
      credentialId: credential.credential.id,
      businessManagerId: "business_1",
      businessManagerName: "BM 1",
      adAccountIds: ["act_1"],
      destination: { pixelId: "pixel_1", pageId: "page_1" },
    });
    const second = await service.createBusinessConnection("workspace_1", {
      credentialId: credential.credential.id,
      businessManagerId: "business_2",
      businessManagerName: "BM 2",
      adAccountIds: ["act_2"],
      destination: { pixelId: "pixel_2", pageId: "page_2" },
    });

    await service.removeBusinessConnection(
      "workspace_1",
      second.businessConnections.find(
        (connection) => connection.businessManagerId === "business_1",
      )!.id,
      { businessManagerId: "business_1" },
    );

    expect(connections).toHaveLength(1);
    expect(credentials).toHaveLength(1);
    expect(connections[0]?.businessManagerId).toBe("business_2");
  });

  it("does not let a credential configure a BM it cannot access", async () => {
    const { accounts, adapter, connections, destinations, service } =
      createHarness();
    const credential = await service.createCredential("workspace_1", {
      label: "Token BM 1",
      accessToken: "EAAB-permanent-system-user-token-one",
    });
    adapter.getBusiness.mockRejectedValueOnce(
      new Error("Business asset is not shared with this system user"),
    );

    await expect(
      service.createBusinessConnection("workspace_1", {
        credentialId: credential.credential.id,
        businessManagerId: "business_2",
        businessManagerName: "BM 2",
        adAccountIds: ["act_2"],
        destination: { pixelId: "pixel_2", pageId: "page_2" },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(connections).toHaveLength(0);
    expect(accounts).toHaveLength(0);
    expect(destinations).toHaveLength(0);
  });

  it("tests an active connection without sending a conversion event", async () => {
    const { adapter, audits, service } = createHarness();
    const discovery = await service.createCredential("workspace_1", {
      label: "Token BM Principal",
      accessToken: "EAAB-permanent-system-user-token",
    });
    const configuration = await service.createBusinessConnection(
      "workspace_1",
      {
        credentialId: discovery.credential.id,
        businessManagerId: "business_1",
        businessManagerName: "BM Principal",
        adAccountIds: ["act_1"],
        destination: {
          label: "Destino principal",
          pixelId: "pixel_1",
          pageId: "page_1",
        },
      },
      "user_1",
    );

    const result = await service.testBusinessConnection(
      "workspace_1",
      configuration.businessConnections[0]!.id,
      "user_1",
    );

    expect(result).toMatchObject({
      status: "active",
      reportingAccountCount: 1,
      message: "Token, BM, contas e destino validados com sucesso",
    });
    expect(adapter.getBusiness).toHaveBeenCalled();
    expect(adapter.getAdAccount).toHaveBeenCalled();
    expect(adapter.getPixel).toHaveBeenCalled();
    expect(adapter.getPage).toHaveBeenCalled();
    expect(adapter).not.toHaveProperty("sendEvent");
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "meta.manual.business_connection_tested",
        resultStatus: "success",
      }),
    );
  });

  it("supports two BMs with separate tokens and one shared matrix destination", async () => {
    const { connections, destinations, service } = createHarness();
    const first = await service.createCredential("workspace_1", {
      label: "Token BM 1",
      accessToken: "EAAB-permanent-system-user-token-one",
    });
    const second = await service.createCredential("workspace_1", {
      label: "Token BM 2",
      accessToken: "EAAB-permanent-system-user-token-two",
    });
    const firstConfiguration = await service.createBusinessConnection(
      "workspace_1",
      {
        credentialId: first.credential.id,
        businessManagerId: "business_1",
        businessManagerName: "BM 1",
        adAccountIds: ["act_1"],
        destination: {
          label: "Destino matriz",
          ownerBusinessManagerId: "business_matrix",
          pixelId: "pixel_matrix",
          pageId: "page_matrix",
        },
      },
    );
    const sharedDestinationId =
      firstConfiguration.businessConnections[0]!
        .defaultConversionDestinationId!;

    const configuration = await service.createBusinessConnection(
      "workspace_1",
      {
        credentialId: second.credential.id,
        businessManagerId: "business_2",
        businessManagerName: "BM 2",
        adAccountIds: ["act_2"],
        destination: { existingDestinationId: sharedDestinationId },
      },
    );

    expect(destinations).toHaveLength(1);
    expect(connections).toHaveLength(2);
    expect(new Set(connections.map((item) => item.credentialId)).size).toBe(2);
    expect(
      configuration.businessConnections.map(
        (item) => item.defaultConversionDestinationId,
      ),
    ).toEqual([sharedDestinationId, sharedDestinationId]);
  });

  it("supports dedicated Pixel and Page destinations per BM", async () => {
    const { destinations, service } = createHarness();
    const first = await service.createCredential("workspace_1", {
      label: "Token BM 1",
      accessToken: "EAAB-permanent-system-user-token-one",
    });
    const second = await service.createCredential("workspace_1", {
      label: "Token BM 2",
      accessToken: "EAAB-permanent-system-user-token-two",
    });

    await service.createBusinessConnection("workspace_1", {
      credentialId: first.credential.id,
      businessManagerId: "business_1",
      businessManagerName: "BM 1",
      adAccountIds: ["act_1"],
      destination: { pixelId: "pixel_1", pageId: "page_1" },
    });
    const configuration = await service.createBusinessConnection(
      "workspace_1",
      {
        credentialId: second.credential.id,
        businessManagerId: "business_2",
        businessManagerName: "BM 2",
        adAccountIds: ["act_2"],
        destination: { pixelId: "pixel_2", pageId: "page_2" },
      },
    );

    expect(destinations).toHaveLength(2);
    expect(
      new Set(
        configuration.businessConnections.map(
          (item) => item.defaultConversionDestinationId,
        ),
      ).size,
    ).toBe(2);
  });

  it("keeps the saved token unchanged when rotation validation fails", async () => {
    const { adapter, credentials, encryption, service } = createHarness();
    const originalToken = "EAAB-permanent-system-user-token-original";
    const replacementToken = "EAAB-permanent-system-user-token-replacement";
    const credential = await service.createCredential("workspace_1", {
      label: "Token BM Principal",
      accessToken: originalToken,
    });
    await service.createBusinessConnection("workspace_1", {
      credentialId: credential.credential.id,
      businessManagerId: "business_1",
      businessManagerName: "BM Principal",
      adAccountIds: ["act_1"],
      destination: { pixelId: "pixel_1", pageId: "page_1" },
    });
    const encryptedBefore = credentials[0]?.encryptedAccessToken;
    const fingerprintBefore = credentials[0]?.fingerprint;
    adapter.getBusiness.mockRejectedValueOnce(new Error("Token sem acesso"));

    await expect(
      service.rotateCredential(
        "workspace_1",
        credential.credential.id,
        { accessToken: replacementToken },
        "user_1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(credentials[0]?.encryptedAccessToken).toBe(encryptedBefore);
    expect(credentials[0]?.fingerprint).toBe(fingerprintBefore);
    expect(
      encryption.decrypt({
        encryptedAccessToken: String(credentials[0]?.encryptedAccessToken),
        tokenIv: String(credentials[0]?.tokenIv),
        tokenTag: String(credentials[0]?.tokenTag),
      }),
    ).toBe(originalToken);
  });

  it("validates and applies a destination override only to the selected account", async () => {
    const { accounts, service } = createHarness();
    const credential = await service.createCredential("workspace_1", {
      label: "Token BM 1",
      accessToken: "EAAB-permanent-system-user-token-one",
    });
    const initial = await service.createBusinessConnection("workspace_1", {
      credentialId: credential.credential.id,
      businessManagerId: "business_1",
      businessManagerName: "BM 1",
      adAccountIds: ["act_1", "act_2"],
      destination: { pixelId: "pixel_default", pageId: "page_default" },
    });
    const override = await service.createBusinessConnection("workspace_1", {
      credentialId: credential.credential.id,
      businessManagerId: "business_2",
      businessManagerName: "BM 2",
      adAccountIds: ["act_3"],
      destination: { pixelId: "pixel_override", pageId: "page_override" },
    });
    const overrideDestinationId = override.businessConnections.find(
      (connection) => connection.businessManagerId === "business_2",
    )!.defaultConversionDestinationId!;

    await service.setReportingAccountDestination(
      "workspace_1",
      accounts.find((account) => account.adAccountId === "act_1")!.id,
      { conversionDestinationId: overrideDestinationId },
    );

    expect(
      accounts.find((account) => account.adAccountId === "act_1")
        ?.conversionDestinationId,
    ).toBe(overrideDestinationId);
    expect(
      accounts.find((account) => account.adAccountId === "act_2")
        ?.conversionDestinationId,
    ).toBeNull();
    expect(initial.businessConnections).toHaveLength(1);
  });

  it("isolates a failed token validation to its own business connection", async () => {
    const { adapter, connections, service } = createHarness();
    const first = await service.createCredential("workspace_1", {
      label: "Token BM 1",
      accessToken: "EAAB-permanent-system-user-token-one",
    });
    const second = await service.createCredential("workspace_1", {
      label: "Token BM 2",
      accessToken: "EAAB-permanent-system-user-token-two",
    });
    const firstConfiguration = await service.createBusinessConnection(
      "workspace_1",
      {
        credentialId: first.credential.id,
        businessManagerId: "business_1",
        businessManagerName: "BM 1",
        adAccountIds: ["act_1"],
        destination: { pixelId: "pixel_1", pageId: "page_1" },
      },
    );
    await service.createBusinessConnection("workspace_1", {
      credentialId: second.credential.id,
      businessManagerId: "business_2",
      businessManagerName: "BM 2",
      adAccountIds: ["act_2"],
      destination: { pixelId: "pixel_2", pageId: "page_2" },
    });
    adapter.getBusiness.mockRejectedValueOnce(new Error("Token revoked"));

    await expect(
      service.testBusinessConnection(
        "workspace_1",
        firstConfiguration.businessConnections[0]!.id,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(connections[0]?.status).toBe("validation_required");
    expect(connections[1]?.status).toBe("active");
  });

  it("rejects credential and destination IDs from another workspace generically", async () => {
    const { service } = createHarness();
    const credential = await service.createCredential("workspace_1", {
      label: "Token BM 1",
      accessToken: "EAAB-permanent-system-user-token-one",
    });

    await expect(
      service.createBusinessConnection("workspace_2", {
        credentialId: credential.credential.id,
        businessManagerId: "business_2",
        businessManagerName: "BM 2",
        adAccountIds: ["act_2"],
        destination: { pixelId: "pixel_2", pageId: "page_2" },
      }),
    ).rejects.toThrow("Credencial Meta nao encontrada");
  });
});
