import { describe, expect, it, vi } from "vitest";
import { MetaConnectionResolverService } from "../src/integrations/meta/meta-connection-resolver.service";
import { MetaTokenEncryptionService } from "../src/integrations/meta/meta-token-encryption.service";

function encryptedToken(encryption: MetaTokenEncryptionService, value: string) {
  return encryption.encrypt(value);
}

function createHarness() {
  const encryption = new MetaTokenEncryptionService({
    META_TOKEN_ENCRYPTION_KEY: "resolver-test-key",
  });
  const legacyEncrypted = encryptedToken(encryption, "legacy-token");
  const oauthAdvancedEncrypted = encryptedToken(
    encryption,
    "oauth-advanced-token",
  );
  const oauthAdvancedCapiEncrypted = encryptedToken(
    encryption,
    "oauth-advanced-capi-token",
  );
  const manualEncrypted = encryptedToken(encryption, "manual-token");
  const prisma = {
    metaIntegration: {
      findUnique: vi.fn(
        async ({ where }: { where: { workspaceId: string } }) => {
          if (where.workspaceId === "workspace_legacy") {
            return {
              ...legacyEncrypted,
              capiAccessTokenEncrypted: null,
              capiTokenIv: null,
              capiTokenTag: null,
              selectedBusinessId: "business_legacy",
              selectedAdAccountId: "act_legacy",
              selectedPixelId: "pixel_legacy",
              primaryConversionDestinationId: "destination_legacy",
              advancedRoutingEnabled: false,
              status: "connected",
            };
          }

          if (where.workspaceId === "workspace_oauth_advanced") {
            return {
              ...oauthAdvancedEncrypted,
              capiAccessTokenEncrypted:
                oauthAdvancedCapiEncrypted.encryptedAccessToken,
              capiTokenIv: oauthAdvancedCapiEncrypted.tokenIv,
              capiTokenTag: oauthAdvancedCapiEncrypted.tokenTag,
              selectedBusinessId: "business_oauth",
              selectedAdAccountId: "act_oauth",
              selectedPixelId: "pixel_primary",
              primaryConversionDestinationId: "destination_primary",
              advancedRoutingEnabled: true,
              status: "connected",
            };
          }

          return null;
        },
      ),
    },
    metaBusinessConnection: {
      count: vi.fn(async ({ where }: { where: { workspaceId: string } }) =>
        [
          "workspace_manual",
          "workspace_legacy",
          "workspace_oauth_advanced",
        ].includes(where.workspaceId)
          ? 1
          : 0,
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; workspaceId: string } }) => {
          if (
            where.workspaceId === "workspace_manual" &&
            where.id === "connection_manual"
          ) {
            return {
              id: "connection_manual",
              workspaceId: "workspace_manual",
              credentialId: "credential_manual",
              status: "active",
              defaultConversionDestinationId: "destination_default",
              credential: {
                ...manualEncrypted,
                source: "manual",
                status: "active",
              },
            };
          }

          if (
            where.workspaceId === "workspace_oauth_advanced" &&
            where.id === "connection_oauth"
          ) {
            return {
              id: "connection_oauth",
              workspaceId: "workspace_oauth_advanced",
              credentialId: "credential_oauth",
              status: "active",
              defaultConversionDestinationId: "destination_oauth",
              credential: {
                ...oauthAdvancedEncrypted,
                source: "oauth",
                status: "active",
              },
            };
          }

          return null;
        },
      ),
    },
    metaReportingAccount: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            workspaceId: string;
            id?: string;
            adAccountId?: string;
          };
        }) => {
          if (
            where.workspaceId === "workspace_manual" &&
            (where.adAccountId === "act_manual" ||
              where.id === "reporting_manual")
          ) {
            return {
              id: "reporting_manual",
              workspaceId: "workspace_manual",
              adAccountId: "act_manual",
              businessConnectionId: "connection_manual",
              conversionDestinationId: "destination_override",
            };
          }

          if (where.workspaceId === "workspace_legacy") {
            return {
              id: "reporting_legacy",
              workspaceId: "workspace_legacy",
              adAccountId: "act_legacy",
              businessConnectionId: "connection_oauth_shadow",
            };
          }

          if (
            where.workspaceId === "workspace_oauth_advanced" &&
            (where.adAccountId === "act_oauth" ||
              where.id === "reporting_oauth")
          ) {
            return {
              id: "reporting_oauth",
              workspaceId: "workspace_oauth_advanced",
              adAccountId: "act_oauth",
              businessConnectionId: "connection_oauth",
              conversionDestinationId: null,
            };
          }

          return null;
        },
      ),
      findMany: vi.fn(async ({ where }: { where: { workspaceId: string } }) =>
        where.workspaceId === "workspace_manual"
          ? [
              {
                id: "reporting_manual",
                workspaceId: "workspace_manual",
                adAccountId: "act_manual",
                businessConnectionId: "connection_manual",
                conversionDestinationId: "destination_override",
              },
            ]
          : where.workspaceId === "workspace_oauth_advanced"
            ? [
                {
                  id: "reporting_oauth",
                  workspaceId: "workspace_oauth_advanced",
                  adAccountId: "act_oauth",
                  businessConnectionId: "connection_oauth",
                  conversionDestinationId: null,
                },
              ]
            : [],
      ),
      count: vi.fn(async ({ where }: { where: { workspaceId: string } }) =>
        where.workspaceId === "workspace_legacy" ? 1 : 0,
      ),
    },
    metaConversionDestination: {
      findFirst: vi.fn(
        async ({ where }: { where: { workspaceId: string; id?: string } }) => {
          if (
            where.workspaceId === "workspace_manual" &&
            where.id === "destination_override"
          ) {
            return {
              id: "destination_override",
              pixelId: "pixel_manual",
              pageId: "page_manual",
              status: "configured",
            };
          }

          if (where.workspaceId === "workspace_legacy") {
            return {
              id: "destination_legacy",
              pixelId: "pixel_legacy",
              pageId: "page_legacy",
            };
          }

          if (
            where.workspaceId === "workspace_oauth_advanced" &&
            where.id === "destination_oauth"
          ) {
            return {
              id: "destination_oauth",
              pixelId: "pixel_oauth",
              pageId: "page_oauth",
              status: "configured",
            };
          }

          return null;
        },
      ),
    },
    metaAd: { findFirst: vi.fn(async () => null) },
    metaCampaign: { findFirst: vi.fn(async () => null) },
  };

  return {
    encryption,
    prisma,
    service: new MetaConnectionResolverService(prisma as never, encryption),
  };
}

describe("MetaConnectionResolverService", () => {
  it("builds one exact reporting target per active manual account", async () => {
    const { service } = createHarness();

    await expect(
      service.listReportingSyncTargets("workspace_manual"),
    ).resolves.toEqual([
      {
        workspaceId: "workspace_manual",
        businessConnectionId: "connection_manual",
        reportingAccountId: "reporting_manual",
      },
    ]);
    await expect(
      service.listReportingSyncTargets("workspace_legacy"),
    ).resolves.toEqual([
      {
        workspaceId: "workspace_legacy",
        businessConnectionId: null,
        reportingAccountId: null,
      },
    ]);
  });

  it("resolves an exact manual reporting route without selecting another account", async () => {
    const { service } = createHarness();

    await expect(
      service.resolveReportingRoute({
        workspaceId: "workspace_manual",
        reportingAccountId: "reporting_manual",
        businessConnectionId: "connection_manual",
      }),
    ).resolves.toMatchObject({
      source: "manual",
      accessToken: "manual-token",
      reportingAccountId: "reporting_manual",
      businessConnectionId: "connection_manual",
      credentialId: "credential_manual",
    });
  });

  it("resolves the exact normalized credential and account destination override", async () => {
    const { service } = createHarness();

    await expect(
      service.resolveCapiRoute({
        workspaceId: "workspace_manual",
        metaAccountId: "act_manual",
      }),
    ).resolves.toEqual({
      source: "manual",
      workspaceId: "workspace_manual",
      accessToken: "manual-token",
      reportingAccountId: "reporting_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      credentialId: "credential_manual",
      conversionDestinationId: "destination_override",
      pixelId: "pixel_manual",
      pageId: "page_manual",
    });
  });

  it("rejects a connection identifier from another workspace without disclosing it", async () => {
    const { service } = createHarness();

    await expect(
      service.resolveCapiRoute({
        workspaceId: "workspace_manual",
        metaAccountId: "act_manual",
        businessConnectionId: "connection_other_workspace",
      }),
    ).rejects.toThrow("Rota Meta nao encontrada");
  });

  it("preserves the legacy OAuth reporting and CAPI route", async () => {
    const { service } = createHarness();

    await expect(
      service.resolveReportingRoute({
        workspaceId: "workspace_legacy",
        reportingAccountId: "reporting_legacy",
      }),
    ).resolves.toMatchObject({
      source: "legacy_oauth",
      accessToken: "legacy-token",
      adAccountId: "act_legacy",
      businessConnectionId: null,
    });
    await expect(
      service.resolveCapiRoute({ workspaceId: "workspace_legacy" }),
    ).resolves.toMatchObject({
      source: "legacy_oauth",
      accessToken: "legacy-token",
      pixelId: "pixel_legacy",
      pageId: "page_legacy",
    });
  });

  it("uses the selected BM destination only after OAuth advanced routing is enabled", async () => {
    const { service } = createHarness();

    await expect(
      service.resolveReportingRoute({
        workspaceId: "workspace_oauth_advanced",
        reportingAccountId: "reporting_oauth",
        businessConnectionId: "connection_oauth",
      }),
    ).resolves.toMatchObject({
      source: "legacy_oauth",
      accessToken: "oauth-advanced-token",
      reportingAccountId: "reporting_oauth",
      businessConnectionId: "connection_oauth",
    });
    await expect(
      service.resolveCapiRoute({
        workspaceId: "workspace_oauth_advanced",
        metaAccountId: "act_oauth",
      }),
    ).resolves.toEqual({
      source: "legacy_oauth",
      workspaceId: "workspace_oauth_advanced",
      accessToken: "oauth-advanced-capi-token",
      reportingAccountId: "reporting_oauth",
      adAccountId: "act_oauth",
      businessConnectionId: "connection_oauth",
      credentialId: "credential_oauth",
      conversionDestinationId: "destination_oauth",
      pixelId: "pixel_oauth",
      pageId: "page_oauth",
    });
  });

  it("builds the legacy compatibility projection without writing", async () => {
    const { encryption, prisma, service } = createHarness();

    await expect(
      service.getLegacyCompatibilityProjection("workspace_legacy"),
    ).resolves.toEqual({
      source: "legacy_oauth",
      workspaceId: "workspace_legacy",
      businessId: "business_legacy",
      adAccountId: "act_legacy",
      pixelId: "pixel_legacy",
      destinationPixelId: "pixel_legacy",
      destinationPageId: "page_legacy",
      credentialFingerprint: encryption.fingerprint("legacy-token"),
    });
    expect(Object.keys(prisma).some((key) => key.includes("update"))).toBe(
      false,
    );
  });
});
