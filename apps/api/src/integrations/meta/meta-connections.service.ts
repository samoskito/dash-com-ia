import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  MetaAssetSelectionInputDto,
  MetaAssetsDto,
  MetaCapiTokenInputDto,
  MetaCapiTokenStatusDto,
  MetaConnectionDto,
  MetaConnectionStatusDto
} from "@wpptrack/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MetaAdapter } from "./meta.adapter";
import { MetaTokenEncryptionService } from "./meta-token-encryption.service";

export type SaveMetaConnectionInput = {
  workspaceId: string;
  accessToken: string;
  tokenType: string | null;
  expiresInSeconds: number | null;
  scopes: string[];
  actorUserId?: string | null;
};

type MetaIntegrationRecord = {
  workspaceId: string;
  status: string;
  encryptedAccessToken: string;
  tokenIv: string;
  tokenTag: string;
  tokenType: string | null;
  scopes: string[];
  expiresAt: Date | null;
  lastConnectedAt: Date | null;
  selectedBusinessId: string | null;
  selectedAdAccountId: string | null;
  selectedPixelId: string | null;
  capiAccessTokenEncrypted: string | null;
  capiTokenIv: string | null;
  capiTokenTag: string | null;
  updatedAt: Date;
};

@Injectable()
export class MetaConnectionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly encryption: MetaTokenEncryptionService
  ) {}

  async getConnection(workspaceId: string): Promise<MetaConnectionDto> {
    const connection = (await this.prisma.metaIntegration.findUnique({
      where: { workspaceId }
    })) as MetaIntegrationRecord | null;

    if (!connection) {
      return {
        workspaceId,
        status: "not_connected",
        tokenType: null,
        scopes: [],
        expiresAt: null,
        connectedAt: null,
        selectedBusinessId: null,
        selectedAdAccountId: null,
        selectedPixelId: null,
        capiTokenConfigured: false
      };
    }

    return this.toDto(connection);
  }

  async saveOAuthConnection(
    input: SaveMetaConnectionInput
  ): Promise<MetaConnectionDto> {
    const encrypted = this.encryption.encrypt(input.accessToken);
    const expiresAt = input.expiresInSeconds
      ? new Date(Date.now() + input.expiresInSeconds * 1000)
      : null;
    const connectedAt = new Date();
    const data = {
      status: "connected",
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag,
      tokenType: input.tokenType,
      scopes: input.scopes,
      expiresAt,
      lastConnectedAt: connectedAt
    };
    const connection = (await this.prisma.metaIntegration.upsert({
      where: { workspaceId: input.workspaceId },
      create: {
        workspaceId: input.workspaceId,
        ...data
      },
      update: data
    })) as MetaIntegrationRecord;
    await this.recordMetaAudit({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: "meta.oauth.connected",
      resultStatus: "connected",
      afterSummary: {
        status: "connected",
        tokenType: input.tokenType,
        scopes: input.scopes,
        expiresAt: expiresAt?.toISOString() ?? null
      } as Prisma.InputJsonValue
    });

    return this.toDto(connection);
  }

  async listAssets(
    workspaceId: string,
    metaAdapter: Pick<
      MetaAdapter,
      "listBusinesses" | "listOwnedAdAccounts" | "listBusinessPixels"
    >
  ): Promise<MetaAssetsDto> {
    const connection = (await this.prisma.metaIntegration.findUnique({
      where: { workspaceId }
    })) as MetaIntegrationRecord | null;

    if (!connection) {
      return this.emptyAssets(workspaceId, "not_connected", null);
    }

    try {
      const accessToken = this.encryption.decrypt({
        encryptedAccessToken: connection.encryptedAccessToken,
        tokenIv: connection.tokenIv,
        tokenTag: connection.tokenTag
      });
      const businesses = await metaAdapter.listBusinesses({ accessToken });
      const selectedBusinessId = connection.selectedBusinessId;
      const selectedBusinessExists = businesses.some(
        (business) => business.id === selectedBusinessId
      );
      const [adAccounts, pixels] =
        selectedBusinessId && selectedBusinessExists
          ? await Promise.all([
              metaAdapter
                .listOwnedAdAccounts({
                  accessToken,
                  businessId: selectedBusinessId
                })
                .then((items) =>
                  items.map((adAccount) => ({
                    ...adAccount,
                    businessId: adAccount.businessId ?? selectedBusinessId
                  }))
                )
                .catch(() => []),
              metaAdapter
                .listBusinessPixels({
                  accessToken,
                  businessId: selectedBusinessId
                })
                .then((items) =>
                  items.map((pixel) => ({
                    ...pixel,
                    businessId: pixel.businessId ?? selectedBusinessId,
                    code: null
                  }))
                )
                .catch(() => [])
            ])
          : [[], []];

      return {
        workspaceId,
        status: this.toStatus(connection.status),
        businesses,
        adAccounts,
        pixels,
        selection: {
          businessId: connection.selectedBusinessId,
          adAccountId: connection.selectedAdAccountId,
          pixelId: connection.selectedPixelId
        },
        lastSyncedAt: new Date().toISOString(),
        syncError: null
      };
    } catch (error) {
      return this.emptyAssets(
        workspaceId,
        "error",
        error instanceof Error ? error.message : "Erro ao sincronizar ativos Meta"
      );
    }
  }

  async saveAssetSelection(
    workspaceId: string,
    input: MetaAssetSelectionInputDto,
    actorUserId?: string | null
  ): Promise<MetaConnectionDto> {
    const connection = (await this.prisma.metaIntegration.update({
      where: { workspaceId },
      data: {
        selectedBusinessId: input.businessId,
        selectedAdAccountId: input.adAccountId,
        selectedPixelId: input.pixelId
      }
    })) as MetaIntegrationRecord;
    await this.recordMetaAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "meta.assets.selection_updated",
      resultStatus: "success",
      afterSummary: {
        businessId: input.businessId,
        adAccountId: input.adAccountId,
        pixelId: input.pixelId
      } as Prisma.InputJsonValue
    });

    return this.toDto(connection);
  }

  async saveCapiToken(
    workspaceId: string,
    input: MetaCapiTokenInputDto,
    actorUserId?: string | null
  ): Promise<MetaCapiTokenStatusDto> {
    const encrypted = input.clear
      ? null
      : this.encryption.encrypt(input.accessToken ?? "");
    const connection = (await this.prisma.metaIntegration.update({
      where: { workspaceId },
      data: input.clear
        ? {
            capiAccessTokenEncrypted: null,
            capiTokenIv: null,
            capiTokenTag: null
          }
        : {
            capiAccessTokenEncrypted: encrypted?.encryptedAccessToken,
            capiTokenIv: encrypted?.tokenIv,
            capiTokenTag: encrypted?.tokenTag
          }
    })) as MetaIntegrationRecord;
    const configured = Boolean(connection.capiAccessTokenEncrypted);

    await this.recordMetaAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "meta.capi_token.updated",
      resultStatus: configured ? "configured" : "cleared",
      afterSummary: {
        configured,
        tokenLast4:
          !input.clear && input.accessToken
            ? input.accessToken.slice(-4)
            : null
      } as Prisma.InputJsonValue
    });

    return {
      workspaceId: connection.workspaceId,
      configured,
      updatedAt: connection.updatedAt.toISOString()
    };
  }

  private async recordMetaAudit(input: {
    workspaceId: string;
    actorUserId: string | null;
    action: string;
    resultStatus: string;
    afterSummary: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          actorType: input.actorUserId ? "user" : "system",
          action: input.action,
          targetType: "MetaIntegration",
          targetId: input.workspaceId,
          reason: null,
          sourceIp: null,
          resultStatus: input.resultStatus,
          beforeSummary: undefined,
          afterSummary: input.afterSummary
        }
      });
    } catch {
      return;
    }
  }

  private emptyAssets(
    workspaceId: string,
    status: MetaConnectionStatusDto,
    syncError: string | null
  ): MetaAssetsDto {
    return {
      workspaceId,
      status,
      businesses: [],
      adAccounts: [],
      pixels: [],
      selection: {
        businessId: null,
        adAccountId: null,
        pixelId: null
      },
      lastSyncedAt: null,
      syncError
    };
  }

  private toDto(record: MetaIntegrationRecord): MetaConnectionDto {
    return {
      workspaceId: record.workspaceId,
      status: this.toStatus(record.status),
      tokenType: record.tokenType,
      scopes: record.scopes,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      connectedAt: record.lastConnectedAt?.toISOString() ?? null,
      selectedBusinessId: record.selectedBusinessId,
      selectedAdAccountId: record.selectedAdAccountId,
      selectedPixelId: record.selectedPixelId,
      capiTokenConfigured: Boolean(record.capiAccessTokenEncrypted)
    };
  }

  private toStatus(status: string): MetaConnectionStatusDto {
    if (
      status === "connected" ||
      status === "needs_reconnect" ||
      status === "error"
    ) {
      return status;
    }

    return "not_connected";
  }
}
