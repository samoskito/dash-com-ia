import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  MetaAdAccountAssetDto,
  MetaConnectionCapabilitiesDto,
  MetaManualAccountDestinationInputDto,
  MetaManualAssetDiscoveryDto,
  MetaManualBusinessConnectionDto,
  MetaManualBusinessConnectionInputDto,
  MetaManualBusinessConnectionStatusInputDto,
  MetaManualConnectionTestResultDto,
  MetaManualConfigurationDto,
  MetaManualCredentialDto,
  MetaManualCredentialInputDto,
  MetaManualCredentialRotationInputDto,
  MetaPageAssetDto,
  MetaPixelAssetDto,
} from "@wpptrack/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { IntegrationEnv } from "../integration.types";
import { INTEGRATION_ENV } from "../integration.types";
import { MetaAdapter } from "./meta.adapter";
import { MetaTokenEncryptionService } from "./meta-token-encryption.service";

type CredentialRecord = {
  id: string;
  workspaceId: string;
  source: "oauth" | "manual";
  label: string;
  encryptedAccessToken: string;
  tokenIv: string;
  tokenTag: string;
  encryptionKeyVersion: number;
  fingerprint: string;
  tokenLast4: string;
  tokenType: string | null;
  scopes: string[];
  expiresAt: Date | null;
  status:
    | "pending"
    | "active"
    | "validation_required"
    | "expired"
    | "revoked"
    | "error"
    | "paused";
  lastValidatedAt: Date | null;
  validationError: string | null;
  rotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type BusinessConnectionRecord = {
  id: string;
  workspaceId: string;
  credentialId: string;
  businessManagerId: string;
  businessManagerName: string;
  status:
    | "pending"
    | "active"
    | "validation_required"
    | "token_expired"
    | "missing_permission"
    | "destination_invalid"
    | "error"
    | "paused";
  defaultConversionDestinationId: string | null;
  lastValidatedAt: Date | null;
  validationError: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { reportingAccounts: number };
  reportingAccounts?: Array<{ active: boolean }>;
};

type DestinationRecord = {
  id: string;
  workspaceId: string;
  label: string | null;
  pixelId: string;
  pixelName: string;
  pageId: string;
  pageName: string;
  ownerBusinessManagerId: string | null;
  status: "needs_configuration" | "configured" | "error";
  lastValidatedAt: Date | null;
  validationError: string | null;
};

type ReportingAccountRecord = {
  id: string;
  workspaceId: string;
  businessId: string;
  businessName: string;
  adAccountId: string;
  adAccountName: string;
  currency: string | null;
  timezoneName: string | null;
  businessConnectionId: string | null;
  conversionDestinationId: string | null;
  active: boolean;
  syncStatus: "pending" | "syncing" | "synced" | "error";
  lastSyncedAt: Date | null;
  lastSyncSince: string | null;
  lastSyncUntil: string | null;
  syncError: string | null;
};

@Injectable()
export class MetaManualConnectionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly adapter: MetaAdapter,
    private readonly encryption: MetaTokenEncryptionService,
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env,
  ) {}

  getCapabilities(): MetaConnectionCapabilitiesDto {
    const enabledModes = (this.env.META_CONNECTION_MODES ?? "oauth")
      .split(",")
      .map((mode) => mode.trim().toLowerCase())
      .filter(
        (mode): mode is "oauth" | "manual" =>
          mode === "oauth" || mode === "manual",
      );

    return {
      enabledModes: [...new Set(enabledModes)],
      oauthEnabled: enabledModes.includes("oauth"),
      manualEnabled: enabledModes.includes("manual"),
    };
  }

  async listConfiguration(
    workspaceId: string,
  ): Promise<MetaManualConfigurationDto> {
    this.requireManualEnabled();
    const [credentials, businessConnections, destinations, reportingAccounts] =
      await Promise.all([
        this.prisma.metaCredential.findMany({
          where: { workspaceId, source: "manual" },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.metaBusinessConnection.findMany({
          where: { workspaceId },
          include: {
            _count: { select: { reportingAccounts: true } },
            reportingAccounts: { select: { active: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.metaConversionDestination.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.metaReportingAccount.findMany({
          where: { workspaceId, businessConnectionId: { not: null } },
          orderBy: [{ businessName: "asc" }, { adAccountName: "asc" }],
        }),
      ]);

    return {
      workspaceId,
      credentials: (credentials as CredentialRecord[]).map((record) =>
        this.toCredentialDto(record),
      ),
      businessConnections: (
        businessConnections as BusinessConnectionRecord[]
      ).map((record) => this.toBusinessConnectionDto(record)),
      destinations: (destinations as DestinationRecord[]).map((record) =>
        this.toDestinationDto(record),
      ),
      reportingAccounts: (reportingAccounts as ReportingAccountRecord[]).map(
        (record) => this.toReportingAccountDto(record),
      ),
    };
  }

  async createCredential(
    workspaceId: string,
    input: MetaManualCredentialInputDto,
    actorUserId?: string | null,
  ): Promise<MetaManualAssetDiscoveryDto> {
    this.requireManualEnabled();
    await this.assertLegacyPathAbsent(workspaceId);
    const accessToken = input.accessToken.trim();

    try {
      const [profile, businesses] = await Promise.all([
        this.adapter.getTokenProfile({ accessToken }),
        this.adapter.listBusinesses({ accessToken }),
      ]);
      this.assertRequiredScopes(profile.scopes);

      if (businesses.length === 0) {
        throw new BadRequestException(
          "Este token nao retornou nenhum Business Manager acessivel",
        );
      }

      const now = new Date();
      const encrypted = this.encryption.encrypt(accessToken);
      const fingerprint = this.encryption.fingerprint(accessToken);
      const existing = (await this.prisma.metaCredential.findUnique({
        where: {
          workspaceId_fingerprint: { workspaceId, fingerprint },
        },
      })) as CredentialRecord | null;
      const status = existing?.status === "active" ? "active" : "pending";
      const credential = (await this.prisma.metaCredential.upsert({
        where: {
          workspaceId_fingerprint: { workspaceId, fingerprint },
        },
        create: {
          workspaceId,
          source: "manual",
          label: input.label,
          encryptedAccessToken: encrypted.encryptedAccessToken,
          tokenIv: encrypted.tokenIv,
          tokenTag: encrypted.tokenTag,
          encryptionKeyVersion: this.encryption.currentKeyVersion,
          fingerprint,
          tokenLast4: this.encryption.tokenLast4(accessToken),
          tokenType: "system_user",
          scopes: profile.scopes,
          expiresAt: null,
          status,
          lastValidatedAt: now,
          validationError: null,
          createdByUserId: actorUserId ?? null,
        },
        update: {
          label: input.label,
          encryptedAccessToken: encrypted.encryptedAccessToken,
          tokenIv: encrypted.tokenIv,
          tokenTag: encrypted.tokenTag,
          encryptionKeyVersion: this.encryption.currentKeyVersion,
          tokenLast4: this.encryption.tokenLast4(accessToken),
          tokenType: "system_user",
          scopes: profile.scopes,
          status,
          lastValidatedAt: now,
          validationError: null,
        },
      })) as CredentialRecord;

      await this.recordAudit({
        workspaceId,
        actorUserId: actorUserId ?? null,
        action: "meta.manual.credential_validated",
        targetType: "MetaCredential",
        targetId: credential.id,
        resultStatus: "success",
        afterSummary: {
          label: credential.label,
          fingerprint: credential.fingerprint.slice(0, 12),
          tokenLast4: credential.tokenLast4,
          identityId: profile.id,
          accessibleBusinesses: businesses.length,
          scopes: profile.scopes,
        },
      });

      return {
        credential: this.toCredentialDto(credential),
        businesses,
        selectedBusinessId: null,
        adAccounts: [],
        pixels: [],
        pages: [],
      };
    } catch (error) {
      throw this.publicBadRequest(
        error,
        "Nao foi possivel validar o token permanente na Meta",
      );
    }
  }

  async discoverAssets(
    workspaceId: string,
    credentialId: string,
    businessId?: string | null,
  ): Promise<MetaManualAssetDiscoveryDto> {
    this.requireManualEnabled();
    const credential = await this.getManualCredential(
      workspaceId,
      credentialId,
    );
    const accessToken = this.decryptCredential(credential);

    try {
      const businesses = await this.adapter.listBusinesses({ accessToken });
      const selectedBusinessId =
        businessId?.trim() || businesses[0]?.id || null;

      if (!selectedBusinessId) {
        return {
          credential: this.toCredentialDto(credential),
          businesses,
          selectedBusinessId: null,
          adAccounts: [],
          pixels: [],
          pages: [],
        };
      }

      const selectedBusiness = await this.adapter.getBusiness({
        accessToken,
        businessId: selectedBusinessId,
      });
      const normalizedBusinesses = businesses.some(
        (business) => business.id === selectedBusiness.id,
      )
        ? businesses
        : [...businesses, selectedBusiness];
      const [accountsResult, pixelsResult, pagesResult] =
        await Promise.allSettled([
          this.adapter.listOwnedAdAccounts({
            accessToken,
            businessId: selectedBusinessId,
          }),
          this.adapter.listBusinessPixels({
            accessToken,
            businessId: selectedBusinessId,
          }),
          this.adapter.listBusinessPages({
            accessToken,
            businessId: selectedBusinessId,
          }),
        ]);

      return {
        credential: this.toCredentialDto(credential),
        businesses: normalizedBusinesses,
        selectedBusinessId,
        adAccounts:
          accountsResult.status === "fulfilled" ? accountsResult.value : [],
        pixels: pixelsResult.status === "fulfilled" ? pixelsResult.value : [],
        pages: pagesResult.status === "fulfilled" ? pagesResult.value : [],
      };
    } catch (error) {
      throw this.publicBadRequest(
        error,
        "Nao foi possivel consultar os ativos acessiveis por este token",
      );
    }
  }

  async createBusinessConnection(
    workspaceId: string,
    input: MetaManualBusinessConnectionInputDto,
    actorUserId?: string | null,
  ): Promise<MetaManualConfigurationDto> {
    this.requireManualEnabled();
    await this.assertLegacyPathAbsent(workspaceId);
    const credential = await this.getManualCredential(
      workspaceId,
      input.credentialId,
    );
    const accessToken = this.decryptCredential(credential);

    try {
      const business = await this.adapter.getBusiness({
        accessToken,
        businessId: input.businessManagerId,
      });
      const accounts = await Promise.all(
        [...new Set(input.adAccountIds)].map((adAccountId) =>
          this.adapter.getAdAccount({
            accessToken,
            adAccountId,
            businessId: business.id,
          }),
        ),
      );
      const destination = await this.validateDestinationInput({
        workspaceId,
        accessToken,
        businessId: input.destination.ownerBusinessManagerId ?? business.id,
        input: input.destination,
      });
      const occupiedAccounts = await this.prisma.metaReportingAccount.findMany({
        where: {
          workspaceId,
          adAccountId: { in: accounts.map((account) => account.id) },
          businessConnectionId: { not: null },
        },
        select: { adAccountId: true, businessConnectionId: true },
      });
      const existingConnection =
        await this.prisma.metaBusinessConnection.findUnique({
          where: {
            workspaceId_businessManagerId: {
              workspaceId,
              businessManagerId: business.id,
            },
          },
          select: { id: true },
        });
      const conflictingAccount = occupiedAccounts.find(
        (account) => account.businessConnectionId !== existingConnection?.id,
      );

      if (conflictingAccount) {
        throw new ConflictException(
          `A conta ${conflictingAccount.adAccountId} ja pertence a outra conexao Meta deste workspace`,
        );
      }

      const now = new Date();
      const saved = await this.prisma.$transaction(async (transaction) => {
        const savedDestination = destination.existing
          ? destination.record
          : await transaction.metaConversionDestination.upsert({
              where: {
                workspaceId_pixelId_pageId: {
                  workspaceId,
                  pixelId: destination.pixel.id,
                  pageId: destination.page.id,
                },
              },
              create: {
                workspaceId,
                label:
                  input.destination.label ??
                  `${destination.pixel.name} / ${destination.page.name}`,
                pixelId: destination.pixel.id,
                pixelName: destination.pixel.name,
                pageId: destination.page.id,
                pageName: destination.page.name,
                ownerBusinessManagerId:
                  input.destination.ownerBusinessManagerId ?? business.id,
                status: "configured",
                lastValidatedAt: now,
                validationError: null,
                createdByUserId: actorUserId ?? null,
              },
              update: {
                label:
                  input.destination.label ??
                  `${destination.pixel.name} / ${destination.page.name}`,
                pixelName: destination.pixel.name,
                pageName: destination.page.name,
                ownerBusinessManagerId:
                  input.destination.ownerBusinessManagerId ?? business.id,
                status: "configured",
                lastValidatedAt: now,
                validationError: null,
              },
            });
        const connection = await transaction.metaBusinessConnection.upsert({
          where: {
            workspaceId_businessManagerId: {
              workspaceId,
              businessManagerId: business.id,
            },
          },
          create: {
            workspaceId,
            credentialId: credential.id,
            businessManagerId: business.id,
            businessManagerName: business.name,
            status: "active",
            defaultConversionDestinationId: savedDestination.id,
            lastValidatedAt: now,
            validationError: null,
            createdByUserId: actorUserId ?? null,
          },
          update: {
            credentialId: credential.id,
            businessManagerName: business.name,
            status: "active",
            defaultConversionDestinationId: savedDestination.id,
            lastValidatedAt: now,
            validationError: null,
          },
        });

        for (const account of accounts) {
          await transaction.metaReportingAccount.upsert({
            where: {
              workspaceId_adAccountId: {
                workspaceId,
                adAccountId: account.id,
              },
            },
            create: {
              workspaceId,
              businessId: business.id,
              businessName: business.name,
              adAccountId: account.id,
              adAccountName: account.name,
              currency: account.currency,
              timezoneName: account.timezoneName,
              businessConnectionId: connection.id,
              conversionDestinationId: null,
              active: true,
              syncStatus: "pending",
              syncError: null,
            },
            update: {
              businessId: business.id,
              businessName: business.name,
              adAccountName: account.name,
              currency: account.currency,
              timezoneName: account.timezoneName,
              businessConnectionId: connection.id,
              active: true,
              syncStatus: "pending",
              syncError: null,
            },
          });
        }

        await transaction.metaCredential.update({
          where: { id: credential.id },
          data: {
            status: "active",
            lastValidatedAt: now,
            validationError: null,
          },
        });

        return {
          connectionId: connection.id,
          destinationId: savedDestination.id,
        };
      });

      await this.recordAudit({
        workspaceId,
        actorUserId: actorUserId ?? null,
        action: "meta.manual.business_connection_activated",
        targetType: "MetaBusinessConnection",
        targetId: saved.connectionId,
        resultStatus: "success",
        afterSummary: {
          credentialId: credential.id,
          businessManagerId: business.id,
          destinationId: saved.destinationId,
          adAccountIds: accounts.map((account) => account.id),
        },
      });

      return this.listConfiguration(workspaceId);
    } catch (error) {
      throw this.publicBadRequest(
        error,
        "Nao foi possivel ativar esta estrutura Meta",
      );
    }
  }

  async rotateCredential(
    workspaceId: string,
    credentialId: string,
    input: MetaManualCredentialRotationInputDto,
    actorUserId?: string | null,
  ): Promise<MetaManualConfigurationDto> {
    this.requireManualEnabled();
    const credential = await this.getManualCredential(
      workspaceId,
      credentialId,
    );
    const accessToken = input.accessToken.trim();

    try {
      const profile = await this.adapter.getTokenProfile({ accessToken });
      this.assertRequiredScopes(profile.scopes);
      const connections = await this.prisma.metaBusinessConnection.findMany({
        where: { workspaceId, credentialId },
        include: {
          defaultConversionDestination: true,
          reportingAccounts: true,
        },
      });

      for (const connection of connections) {
        await this.adapter.getBusiness({
          accessToken,
          businessId: connection.businessManagerId,
        });

        for (const account of connection.reportingAccounts) {
          await this.adapter.getAdAccount({
            accessToken,
            adAccountId: account.adAccountId,
            businessId: connection.businessManagerId,
          });
        }

        if (connection.defaultConversionDestination) {
          await this.validateDestinationAccess(
            accessToken,
            connection.defaultConversionDestination,
          );
        }
      }

      const encrypted = this.encryption.encrypt(accessToken);
      const fingerprint = this.encryption.fingerprint(accessToken);
      const now = new Date();

      await this.prisma.$transaction([
        this.prisma.metaCredential.update({
          where: { id: credential.id },
          data: {
            encryptedAccessToken: encrypted.encryptedAccessToken,
            tokenIv: encrypted.tokenIv,
            tokenTag: encrypted.tokenTag,
            encryptionKeyVersion: this.encryption.currentKeyVersion,
            fingerprint,
            tokenLast4: this.encryption.tokenLast4(accessToken),
            scopes: profile.scopes,
            status: "active",
            lastValidatedAt: now,
            validationError: null,
            rotatedAt: now,
          },
        }),
        this.prisma.metaBusinessConnection.updateMany({
          where: { workspaceId, credentialId },
          data: {
            status: "active",
            lastValidatedAt: now,
            validationError: null,
          },
        }),
      ]);

      await this.recordAudit({
        workspaceId,
        actorUserId: actorUserId ?? null,
        action: "meta.manual.credential_rotated",
        targetType: "MetaCredential",
        targetId: credential.id,
        resultStatus: "success",
        afterSummary: {
          fingerprint: fingerprint.slice(0, 12),
          tokenLast4: this.encryption.tokenLast4(accessToken),
          affectedConnections: connections.length,
        },
      });

      return this.listConfiguration(workspaceId);
    } catch (error) {
      throw this.publicBadRequest(
        error,
        "O novo token nao acessa toda a estrutura desta conexao",
      );
    }
  }

  async setBusinessConnectionStatus(
    workspaceId: string,
    connectionId: string,
    input: MetaManualBusinessConnectionStatusInputDto,
    actorUserId?: string | null,
  ): Promise<MetaManualConfigurationDto> {
    this.requireManualEnabled();
    const connection = await this.prisma.metaBusinessConnection.findFirst({
      where: { id: connectionId, workspaceId },
      include: { credential: true },
    });

    if (!connection) {
      throw new NotFoundException("Conexao Meta nao encontrada");
    }

    if (
      input.status === "active" &&
      connection.credential.status !== "active"
    ) {
      throw new ConflictException(
        "Valide ou troque o token antes de reativar esta conexao",
      );
    }

    await this.prisma.metaBusinessConnection.updateMany({
      where: { id: connectionId, workspaceId },
      data: { status: input.status },
    });
    await this.recordAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "meta.manual.business_connection_status_updated",
      targetType: "MetaBusinessConnection",
      targetId: connectionId,
      resultStatus: "success",
      afterSummary: { status: input.status },
    });

    return this.listConfiguration(workspaceId);
  }

  async testBusinessConnection(
    workspaceId: string,
    connectionId: string,
    actorUserId?: string | null,
  ): Promise<MetaManualConnectionTestResultDto> {
    this.requireManualEnabled();
    const connection = await this.prisma.metaBusinessConnection.findFirst({
      where: { id: connectionId, workspaceId },
      include: {
        credential: true,
        defaultConversionDestination: true,
        reportingAccounts: {
          where: { active: true },
          orderBy: { adAccountId: "asc" },
        },
      },
    });

    if (!connection?.defaultConversionDestination) {
      throw new NotFoundException("Conexao Meta nao encontrada");
    }

    const accessToken = this.decryptCredential(
      connection.credential as CredentialRecord,
    );

    try {
      await this.adapter.getBusiness({
        accessToken,
        businessId: connection.businessManagerId,
      });

      for (const account of connection.reportingAccounts) {
        await this.adapter.getAdAccount({
          accessToken,
          adAccountId: account.adAccountId,
          businessId: connection.businessManagerId,
        });
      }

      await this.validateDestinationAccess(
        accessToken,
        connection.defaultConversionDestination,
      );
      const now = new Date();

      await this.prisma.$transaction([
        this.prisma.metaBusinessConnection.updateMany({
          where: { id: connection.id, workspaceId },
          data: {
            status: "active",
            lastValidatedAt: now,
            validationError: null,
          },
        }),
        this.prisma.metaCredential.updateMany({
          where: {
            id: connection.credentialId,
            workspaceId,
            source: "manual",
          },
          data: {
            status: "active",
            lastValidatedAt: now,
            validationError: null,
          },
        }),
      ]);
      await this.recordAudit({
        workspaceId,
        actorUserId: actorUserId ?? null,
        action: "meta.manual.business_connection_tested",
        targetType: "MetaBusinessConnection",
        targetId: connection.id,
        resultStatus: "success",
        afterSummary: {
          credentialId: connection.credentialId,
          destinationId: connection.defaultConversionDestination.id,
          reportingAccountCount: connection.reportingAccounts.length,
        },
      });

      return {
        connectionId: connection.id,
        credentialId: connection.credentialId,
        destinationId: connection.defaultConversionDestination.id,
        reportingAccountCount: connection.reportingAccounts.length,
        status: "active",
        validatedAt: now.toISOString(),
        message: "Token, BM, contas e destino validados com sucesso",
      };
    } catch (error) {
      const now = new Date();

      await this.prisma.metaBusinessConnection.updateMany({
        where: { id: connection.id, workspaceId },
        data: {
          status: "validation_required",
          lastValidatedAt: now,
          validationError: "A Meta recusou a validacao desta conexao",
        },
      });
      await this.recordAudit({
        workspaceId,
        actorUserId: actorUserId ?? null,
        action: "meta.manual.business_connection_tested",
        targetType: "MetaBusinessConnection",
        targetId: connection.id,
        resultStatus: "failed",
        afterSummary: {
          reportingAccountCount: connection.reportingAccounts.length,
          reason: "meta_validation_failed",
        },
      });

      throw this.publicBadRequest(
        error,
        "A Meta recusou a validacao desta conexao",
      );
    }
  }

  async setReportingAccountDestination(
    workspaceId: string,
    reportingAccountId: string,
    input: MetaManualAccountDestinationInputDto,
    actorUserId?: string | null,
  ): Promise<MetaManualConfigurationDto> {
    this.requireManualEnabled();
    const account = await this.prisma.metaReportingAccount.findFirst({
      where: { id: reportingAccountId, workspaceId },
      include: {
        businessConnection: { include: { credential: true } },
      },
    });

    if (!account?.businessConnection) {
      throw new NotFoundException("Conta Meta normalizada nao encontrada");
    }

    if (input.conversionDestinationId) {
      const destination = await this.prisma.metaConversionDestination.findFirst(
        {
          where: { id: input.conversionDestinationId, workspaceId },
        },
      );

      if (!destination) {
        throw new NotFoundException("Destino Meta nao encontrado");
      }

      const accessToken = this.decryptCredential(
        account.businessConnection.credential as CredentialRecord,
      );

      try {
        await this.validateDestinationAccess(accessToken, destination);
      } catch (error) {
        throw this.publicBadRequest(
          error,
          "O token desta BM nao acessa o destino selecionado",
        );
      }
    }

    await this.prisma.metaReportingAccount.updateMany({
      where: { id: reportingAccountId, workspaceId },
      data: { conversionDestinationId: input.conversionDestinationId },
    });
    await this.recordAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "meta.manual.reporting_destination_updated",
      targetType: "MetaReportingAccount",
      targetId: reportingAccountId,
      resultStatus: "success",
      afterSummary: {
        conversionDestinationId: input.conversionDestinationId,
      },
    });

    return this.listConfiguration(workspaceId);
  }

  private async validateDestinationInput(input: {
    workspaceId: string;
    accessToken: string;
    businessId: string;
    input: MetaManualBusinessConnectionInputDto["destination"];
  }): Promise<
    | { existing: true; record: DestinationRecord }
    | {
        existing: false;
        pixel: MetaPixelAssetDto;
        page: MetaPageAssetDto;
      }
  > {
    if (input.input.existingDestinationId) {
      const record = (await this.prisma.metaConversionDestination.findFirst({
        where: {
          id: input.input.existingDestinationId,
          workspaceId: input.workspaceId,
        },
      })) as DestinationRecord | null;

      if (!record) {
        throw new NotFoundException("Destino Meta nao encontrado");
      }

      await this.validateDestinationAccess(input.accessToken, record);
      return { existing: true, record };
    }

    const [pixel, page] = await Promise.all([
      this.adapter.getPixel({
        accessToken: input.accessToken,
        pixelId: input.input.pixelId ?? "",
        businessId: input.businessId,
      }),
      this.adapter.getPage({
        accessToken: input.accessToken,
        pageId: input.input.pageId ?? "",
        businessId: input.businessId,
      }),
    ]);

    return { existing: false, pixel, page };
  }

  private async validateDestinationAccess(
    accessToken: string,
    destination: {
      pixelId: string;
      pageId: string;
      ownerBusinessManagerId?: string | null;
    },
  ): Promise<void> {
    await Promise.all([
      this.adapter.getPixel({
        accessToken,
        pixelId: destination.pixelId,
        businessId: destination.ownerBusinessManagerId ?? null,
      }),
      this.adapter.getPage({
        accessToken,
        pageId: destination.pageId,
        businessId: destination.ownerBusinessManagerId ?? null,
      }),
    ]);
  }

  private async getManualCredential(
    workspaceId: string,
    credentialId: string,
  ): Promise<CredentialRecord> {
    const credential = (await this.prisma.metaCredential.findFirst({
      where: { id: credentialId, workspaceId, source: "manual" },
    })) as CredentialRecord | null;

    if (!credential) {
      throw new NotFoundException("Credencial Meta nao encontrada");
    }

    if (
      credential.status === "revoked" ||
      credential.status === "paused" ||
      credential.status === "expired"
    ) {
      throw new ConflictException(
        "Esta credencial precisa ser validada antes de ser utilizada",
      );
    }

    return credential;
  }

  private decryptCredential(credential: CredentialRecord): string {
    try {
      return this.encryption.decrypt({
        encryptedAccessToken: credential.encryptedAccessToken,
        tokenIv: credential.tokenIv,
        tokenTag: credential.tokenTag,
      });
    } catch {
      throw new ConflictException(
        "Nao foi possivel abrir a credencial Meta armazenada",
      );
    }
  }

  private async assertLegacyPathAbsent(workspaceId: string): Promise<void> {
    const legacy = await this.prisma.metaIntegration.findUnique({
      where: { workspaceId },
      select: { id: true },
    });

    if (legacy) {
      throw new ConflictException(
        "Este workspace ja usa a conexao OAuth legada. A configuracao manual exige uma migracao separada e aprovada",
      );
    }
  }

  private assertRequiredScopes(scopes: string[]): void {
    if (scopes.length === 0) {
      return;
    }

    const granted = new Set(scopes.map((scope) => scope.toLowerCase()));
    const canReadAds = granted.has("ads_read") || granted.has("ads_management");

    if (!granted.has("business_management") || !canReadAds) {
      throw new BadRequestException(
        "O token precisa de business_management e ads_read ou ads_management",
      );
    }
  }

  private requireManualEnabled(): void {
    if (!this.getCapabilities().manualEnabled) {
      throw new NotFoundException("Conexao manual Meta nao habilitada");
    }
  }

  private toCredentialDto(record: CredentialRecord): MetaManualCredentialDto {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      source: record.source,
      label: record.label,
      fingerprint: record.fingerprint.slice(0, 12),
      tokenLast4: record.tokenLast4,
      tokenType: record.tokenType,
      scopes: record.scopes,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      status: record.status,
      lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
      validationError: record.validationError,
      rotatedAt: record.rotatedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toBusinessConnectionDto(
    record: BusinessConnectionRecord,
  ): MetaManualBusinessConnectionDto {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      credentialId: record.credentialId,
      businessManagerId: record.businessManagerId,
      businessManagerName: record.businessManagerName,
      status: record.status,
      defaultConversionDestinationId:
        record.defaultConversionDestinationId ?? null,
      reportingAccountCount:
        record._count?.reportingAccounts ??
        record.reportingAccounts?.length ??
        0,
      activeReportingAccountCount:
        record.reportingAccounts?.filter((account) => account.active).length ??
        0,
      lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
      validationError: record.validationError,
      lastSyncedAt: record.lastSyncedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toDestinationDto(record: DestinationRecord) {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      label: record.label,
      pixelId: record.pixelId,
      pixelName: record.pixelName,
      pageId: record.pageId,
      pageName: record.pageName,
      ownerBusinessManagerId: record.ownerBusinessManagerId,
      status: record.status,
      lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
      validationError: record.validationError,
    };
  }

  private toReportingAccountDto(record: ReportingAccountRecord) {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      businessId: record.businessId,
      businessName: record.businessName,
      adAccountId: record.adAccountId,
      adAccountName: record.adAccountName,
      currency: record.currency,
      timezoneName: record.timezoneName,
      businessConnectionId: record.businessConnectionId,
      conversionDestinationId: record.conversionDestinationId,
      active: record.active,
      syncStatus: record.syncStatus,
      lastSyncedAt: record.lastSyncedAt?.toISOString() ?? null,
      lastSyncSince: record.lastSyncSince,
      lastSyncUntil: record.lastSyncUntil,
      syncError: record.syncError,
    };
  }

  private async recordAudit(input: {
    workspaceId: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    resultStatus: string;
    afterSummary: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          actorType: input.actorUserId ? "user" : "system",
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: null,
          sourceIp: null,
          resultStatus: input.resultStatus,
          beforeSummary: undefined,
          afterSummary: input.afterSummary as Prisma.InputJsonValue,
        },
      });
    } catch {
      return;
    }
  }

  private publicBadRequest(error: unknown, fallback: string): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      return error;
    }

    const raw = error instanceof Error ? error.message : fallback;
    const redacted = raw
      .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
      .replace(/EAA[A-Za-z0-9_-]{12,}/g, "[redacted-token]")
      .slice(0, 400);

    return new BadRequestException(redacted || fallback);
  }
}
