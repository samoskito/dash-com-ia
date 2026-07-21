import { describe, expect, it, vi } from "vitest";
import { InboundWebhookMetaRouteReaderService } from "../src/inbound-webhooks/inbound-webhook-meta-route-reader.service";
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
        async ({
          where,
        }: {
          where: { id: string; workspaceId: string };
        }): Promise<{
          id: string;
          workspaceId: string;
          credentialId: string;
          status: string;
          defaultConversionDestinationId: string | null;
          credential: {
            encryptedAccessToken: string;
            tokenIv: string;
            tokenTag: string;
            source: string;
            status: string;
          };
        } | null> => {
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
            active?: boolean;
          };
        }): Promise<{
          id: string;
          workspaceId: string;
          adAccountId: string;
          businessConnectionId: string | null;
          conversionDestinationId: string | null;
          allowedDestinations: Array<{
            conversionDestinationId: string;
          }>;
          active: boolean;
        } | null> => {
          const accounts = [
            {
              id: "reporting_manual",
              workspaceId: "workspace_manual",
              adAccountId: "act_manual",
              businessConnectionId: "connection_manual",
              conversionDestinationId: "destination_override",
              allowedDestinations: [],
              active: true,
            },
            {
              id: "reporting_legacy",
              workspaceId: "workspace_legacy",
              adAccountId: "act_legacy",
              businessConnectionId: "connection_oauth_shadow",
              conversionDestinationId: null,
              allowedDestinations: [],
              active: true,
            },
            {
              id: "reporting_oauth",
              workspaceId: "workspace_oauth_advanced",
              adAccountId: "act_oauth",
              businessConnectionId: "connection_oauth",
              conversionDestinationId: null,
              allowedDestinations: [],
              active: true,
            },
          ];

          return (
            accounts.find(
              (account) =>
                account.workspaceId === where.workspaceId &&
                (where.id === undefined || account.id === where.id) &&
                (where.adAccountId === undefined ||
                  account.adAccountId === where.adAccountId) &&
                (where.active === undefined || account.active === where.active),
            ) ?? null
          );
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

          if (
            where.workspaceId === "workspace_manual" &&
            where.id === "destination_exact"
          ) {
            return {
              id: "destination_exact",
              pixelId: "pixel_exact",
              pageId: "page_exact",
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
    metaAd: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { workspaceId: string; adId: string };
        }): Promise<{
          adAccountId: string | null;
          destinationAssignment: {
            reportingAccountId: string;
            conversionDestinationId: string;
          } | null;
        } | null> => {
          if (
            where.workspaceId === "workspace_manual" &&
            where.adId === "ad_manual"
          ) {
            return {
              adAccountId: "act_manual",
              destinationAssignment: null,
            };
          }

          if (
            where.workspaceId === "workspace_oauth_advanced" &&
            where.adId === "ad_oauth"
          ) {
            return {
              adAccountId: "act_oauth",
              destinationAssignment: null,
            };
          }

          return null;
        },
      ),
    },
    metaCampaign: { findFirst: vi.fn(async () => null) },
  };

  return {
    encryption,
    prisma,
    routeReader: new InboundWebhookMetaRouteReaderService(prisma as never),
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

  it("uses the current ad assignment when a retry carries a stale destination", async () => {
    const { prisma, service } = createHarness();
    prisma.metaAd.findFirst.mockResolvedValueOnce({
      adAccountId: "act_manual",
      destinationAssignment: {
        reportingAccountId: "reporting_manual",
        conversionDestinationId: "destination_exact",
      },
    });

    await expect(
      service.resolveCapiRoute({
        workspaceId: "workspace_manual",
        metaAccountId: "act_manual",
        adId: "ad_manual",
        conversionDestinationId: "destination_override",
      }),
    ).resolves.toMatchObject({
      conversionDestinationId: "destination_exact",
      pixelId: "pixel_exact",
      pageId: "page_exact",
    });
  });

  it("previews an exact CAPI route without token access, decrypt, fingerprint or delivery resolution", async () => {
    const { encryption, prisma, routeReader, service } = createHarness();
    const decryptSpy = vi.spyOn(encryption, "decrypt");
    const fingerprintSpy = vi.spyOn(encryption, "fingerprint");
    const tokenRouteSpy = vi.spyOn(service, "resolveCapiRoute");
    prisma.metaAd.findFirst.mockResolvedValueOnce({
      adAccountId: "act_manual",
      destinationAssignment: {
        reportingAccountId: "reporting_manual",
        conversionDestinationId: "destination_exact",
      },
    });
    prisma.metaReportingAccount.findFirst.mockResolvedValueOnce({
      id: "reporting_manual",
      workspaceId: "workspace_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: "destination_override",
      allowedDestinations: [
        { conversionDestinationId: "destination_override" },
        { conversionDestinationId: "destination_exact" },
      ],
      active: true,
    });

    const preview = await routeReader.previewRoute({
      workspaceId: "workspace_manual",
      adId: "ad_manual",
      reportingAccountId: "reporting_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: "destination_exact",
    });

    expect(preview).toEqual({
      status: "resolved",
      reason: "route_resolved",
      reportingAccountId: "reporting_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: "destination_exact",
      pixelId: "pixel_exact",
      pageId: "page_exact",
    });
    expect(preview).not.toHaveProperty("accessToken");
    expect(preview).not.toHaveProperty("credentialId");
    expect(decryptSpy).not.toHaveBeenCalled();
    expect(fingerprintSpy).not.toHaveBeenCalled();
    expect(tokenRouteSpy).not.toHaveBeenCalled();
    expect(prisma.metaIntegration.findUnique).not.toHaveBeenCalled();
  });

  it("uses account override before BM default and BM default when no account override exists", async () => {
    const { routeReader } = createHarness();

    await expect(
      routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      reason: "route_resolved",
      reportingAccountId: "reporting_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: "destination_override",
      pixelId: "pixel_manual",
      pageId: "page_manual",
    });
    await expect(
      routeReader.previewRoute({
        workspaceId: "workspace_oauth_advanced",
        adId: "ad_oauth",
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      reason: "route_resolved",
      reportingAccountId: "reporting_oauth",
      businessConnectionId: "connection_oauth",
      conversionDestinationId: "destination_oauth",
      pixelId: "pixel_oauth",
      pageId: "page_oauth",
    });
  });

  it("routes one account with multiple destinations only through its exact ad assignment", async () => {
    const { prisma, routeReader } = createHarness();
    prisma.metaAd.findFirst.mockResolvedValueOnce({
      adAccountId: "act_manual",
      destinationAssignment: {
        reportingAccountId: "reporting_manual",
        conversionDestinationId: "destination_exact",
      },
    });
    prisma.metaReportingAccount.findFirst.mockResolvedValueOnce({
      id: "reporting_manual",
      workspaceId: "workspace_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: "destination_override",
      allowedDestinations: [
        { conversionDestinationId: "destination_override" },
        { conversionDestinationId: "destination_exact" },
      ],
      active: true,
    });

    await expect(
      routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      reason: "route_resolved",
      conversionDestinationId: "destination_exact",
      pixelId: "pixel_exact",
      pageId: "page_exact",
    });
  });

  it("blocks a multi-destination account when the ad assignment is missing or mismatched", async () => {
    const unresolved = createHarness();
    unresolved.prisma.metaReportingAccount.findFirst.mockResolvedValueOnce({
      id: "reporting_manual",
      workspaceId: "workspace_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: "destination_override",
      allowedDestinations: [
        { conversionDestinationId: "destination_override" },
        { conversionDestinationId: "destination_exact" },
      ],
      active: true,
    });

    await expect(
      unresolved.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "ad_destination_unresolved",
    });

    const mismatch = createHarness();
    mismatch.prisma.metaAd.findFirst.mockResolvedValueOnce({
      adAccountId: "act_manual",
      destinationAssignment: {
        reportingAccountId: "reporting_manual",
        conversionDestinationId: "destination_exact",
      },
    });
    mismatch.prisma.metaReportingAccount.findFirst.mockResolvedValueOnce({
      id: "reporting_manual",
      workspaceId: "workspace_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: "destination_override",
      allowedDestinations: [
        { conversionDestinationId: "destination_override" },
        { conversionDestinationId: "destination_exact" },
      ],
      active: true,
    });

    await expect(
      mismatch.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
        conversionDestinationId: "destination_override",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "ad_destination_mismatch",
    });
  });

  it("keeps an unknown ad unresolved without falling back to another account or BM", async () => {
    const { prisma, routeReader } = createHarness();

    await expect(
      routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_unknown",
      }),
    ).resolves.toEqual({
      status: "unresolved",
      reason: "ad_not_found",
      reportingAccountId: null,
      adAccountId: null,
      businessConnectionId: null,
      conversionDestinationId: null,
      pixelId: null,
      pageId: null,
    });
    expect(prisma.metaReportingAccount.findFirst).not.toHaveBeenCalled();
    expect(prisma.metaBusinessConnection.findFirst).not.toHaveBeenCalled();
  });

  it("keeps an ad without an attributed account unresolved", async () => {
    const { prisma, routeReader } = createHarness();
    prisma.metaAd.findFirst.mockResolvedValueOnce({
      adAccountId: null,
      destinationAssignment: null,
    });

    await expect(
      routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_without_account",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "ad_account_not_attributed",
      reportingAccountId: null,
      adAccountId: null,
      businessConnectionId: null,
    });
    expect(prisma.metaReportingAccount.findFirst).not.toHaveBeenCalled();
  });

  it("keeps missing, inactive and BM-less reporting accounts unresolved", async () => {
    const missing = createHarness();
    missing.prisma.metaAd.findFirst.mockResolvedValueOnce({
      adAccountId: "act_unsynchronized",
      destinationAssignment: null,
    });

    await expect(
      missing.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_unsynchronized",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "reporting_account_not_found",
      reportingAccountId: null,
      adAccountId: "act_unsynchronized",
      businessConnectionId: null,
    });
    expect(
      missing.prisma.metaBusinessConnection.findFirst,
    ).not.toHaveBeenCalled();

    const inactive = createHarness();
    inactive.prisma.metaAd.findFirst.mockResolvedValueOnce({
      adAccountId: "act_inactive",
      destinationAssignment: null,
    });
    inactive.prisma.metaReportingAccount.findFirst.mockResolvedValueOnce({
      id: "reporting_inactive",
      workspaceId: "workspace_manual",
      adAccountId: "act_inactive",
      businessConnectionId: "connection_manual",
      conversionDestinationId: null,
      allowedDestinations: [],
      active: false,
    });

    await expect(
      inactive.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_inactive",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "reporting_account_inactive",
      reportingAccountId: "reporting_inactive",
      adAccountId: "act_inactive",
      businessConnectionId: null,
    });
    expect(
      inactive.prisma.metaBusinessConnection.findFirst,
    ).not.toHaveBeenCalled();

    const withoutBm = createHarness();
    withoutBm.prisma.metaAd.findFirst.mockResolvedValueOnce({
      adAccountId: "act_without_bm",
      destinationAssignment: null,
    });
    withoutBm.prisma.metaReportingAccount.findFirst.mockResolvedValueOnce({
      id: "reporting_without_bm",
      workspaceId: "workspace_manual",
      adAccountId: "act_without_bm",
      businessConnectionId: null,
      conversionDestinationId: null,
      allowedDestinations: [],
      active: true,
    });

    await expect(
      withoutBm.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_without_bm",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "business_connection_not_assigned",
      reportingAccountId: "reporting_without_bm",
      adAccountId: "act_without_bm",
      businessConnectionId: null,
    });
    expect(
      withoutBm.prisma.metaBusinessConnection.findFirst,
    ).not.toHaveBeenCalled();
  });

  it("keeps paused BMs and inactive credentials unresolved", async () => {
    const paused = createHarness();
    paused.prisma.metaBusinessConnection.findFirst.mockResolvedValueOnce({
      id: "connection_manual",
      workspaceId: "workspace_manual",
      credentialId: "credential_manual",
      status: "paused",
      defaultConversionDestinationId: "destination_default",
      credential: {
        encryptedAccessToken: "unused",
        tokenIv: "unused",
        tokenTag: "unused",
        source: "manual",
        status: "active",
      },
    });

    await expect(
      paused.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "business_connection_inactive",
      reportingAccountId: "reporting_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: null,
    });

    const inactiveCredential = createHarness();
    inactiveCredential.prisma.metaBusinessConnection.findFirst.mockResolvedValueOnce(
      {
        id: "connection_manual",
        workspaceId: "workspace_manual",
        credentialId: "credential_manual",
        status: "active",
        defaultConversionDestinationId: "destination_default",
        credential: {
          encryptedAccessToken: "unused",
          tokenIv: "unused",
          tokenTag: "unused",
          source: "manual",
          status: "paused",
        },
      },
    );

    await expect(
      inactiveCredential.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "credential_inactive",
      reportingAccountId: "reporting_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: null,
    });
  });

  it("keeps absent and non-configured destinations unresolved without destination fallback", async () => {
    const absent = createHarness();
    absent.prisma.metaReportingAccount.findFirst.mockResolvedValueOnce({
      id: "reporting_manual",
      workspaceId: "workspace_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: null,
      allowedDestinations: [],
      active: true,
    });
    absent.prisma.metaBusinessConnection.findFirst.mockResolvedValueOnce({
      id: "connection_manual",
      workspaceId: "workspace_manual",
      credentialId: "credential_manual",
      status: "active",
      defaultConversionDestinationId: null,
      credential: {
        encryptedAccessToken: "unused",
        tokenIv: "unused",
        tokenTag: "unused",
        source: "manual",
        status: "active",
      },
    });

    await expect(
      absent.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "conversion_destination_missing",
      reportingAccountId: "reporting_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: null,
    });
    expect(
      absent.prisma.metaConversionDestination.findFirst,
    ).not.toHaveBeenCalled();

    const invalid = createHarness();
    invalid.prisma.metaReportingAccount.findFirst.mockResolvedValueOnce({
      id: "reporting_manual",
      workspaceId: "workspace_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: "destination_not_configured",
      allowedDestinations: [
        { conversionDestinationId: "destination_not_configured" },
      ],
      active: true,
    });

    await expect(
      invalid.routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
        conversionDestinationId: "destination_not_configured",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "conversion_destination_not_configured",
      reportingAccountId: "reporting_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: null,
      pixelId: null,
      pageId: null,
    });
    expect(
      invalid.prisma.metaConversionDestination.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "destination_not_configured",
          workspaceId: "workspace_manual",
          status: "configured",
        },
      }),
    );
  });

  it("never resolves reporting, BM or destination identifiers from another workspace", async () => {
    const { routeReader } = createHarness();

    await expect(
      routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
        reportingAccountId: "reporting_oauth",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "reporting_account_not_found",
      reportingAccountId: null,
      adAccountId: "act_manual",
      businessConnectionId: null,
    });
    await expect(
      routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
        businessConnectionId: "connection_oauth",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "business_connection_not_found",
      reportingAccountId: "reporting_manual",
      adAccountId: "act_manual",
      businessConnectionId: null,
      conversionDestinationId: null,
    });
    await expect(
      routeReader.previewRoute({
        workspaceId: "workspace_manual",
        adId: "ad_manual",
        conversionDestinationId: "destination_oauth",
      }),
    ).resolves.toMatchObject({
      status: "unresolved",
      reason: "conversion_destination_not_authorized",
      reportingAccountId: "reporting_manual",
      adAccountId: "act_manual",
      businessConnectionId: "connection_manual",
      conversionDestinationId: null,
      pixelId: null,
      pageId: null,
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
