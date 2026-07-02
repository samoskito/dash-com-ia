import { Inject, Injectable } from "@nestjs/common";
import type { MetaConnectionDto, MetaConnectionStatusDto } from "@wpptrack/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
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
