import { Inject, Injectable } from "@nestjs/common";
import type {
  MetaAssetSelectionInputDto,
  MetaAssetsDto,
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
        selectedPixelId: null
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

    return this.toDto(connection);
  }

  async listAssets(
    workspaceId: string,
    metaAdapter: Pick<
      MetaAdapter,
      "listBusinesses" | "listOwnedAdAccounts" | "listAdAccountPixels"
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
      const businessId = connection.selectedBusinessId ?? businesses[0]?.id ?? null;
      const adAccounts = businessId
        ? await metaAdapter.listOwnedAdAccounts({
            accessToken,
            businessId
          })
        : [];
      const adAccountId =
        connection.selectedAdAccountId ?? adAccounts[0]?.id ?? null;
      const pixels = adAccountId
        ? await metaAdapter.listAdAccountPixels({
            accessToken,
            adAccountId
          })
        : [];

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
    input: MetaAssetSelectionInputDto
  ): Promise<MetaConnectionDto> {
    const connection = (await this.prisma.metaIntegration.update({
      where: { workspaceId },
      data: {
        selectedBusinessId: input.businessId,
        selectedAdAccountId: input.adAccountId,
        selectedPixelId: input.pixelId
      }
    })) as MetaIntegrationRecord;

    return this.toDto(connection);
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
      selectedPixelId: record.selectedPixelId
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
