import { Inject, Injectable } from "@nestjs/common";
import {
  MetaAssetSyncStatus,
  MetaConversionDestinationStatus,
  type Prisma
} from "@prisma/client";
import type {
  MetaConversionDestinationDto,
  MetaConversionDestinationInputDto,
  MetaConversionDestinationStatusDto,
  MetaReportingAccountDto,
  MetaReportingAccountInputDto,
  MetaAssetSyncStatusDto
} from "@wpptrack/shared";
import { PrismaService } from "../../common/prisma/prisma.service";

type MetaConversionDestinationRecord = {
  workspaceId: string;
  pixelId: string;
  pixelName: string;
  pageId: string;
  pageName: string;
  status: string;
  lastValidatedAt: Date | null;
  validationError: string | null;
};

type MetaReportingAccountRecord = {
  id: string;
  workspaceId: string;
  businessId: string;
  businessName: string;
  adAccountId: string;
  adAccountName: string;
  currency: string | null;
  timezoneName: string | null;
  active: boolean;
  syncStatus: string;
  lastSyncedAt: Date | null;
  syncError: string | null;
};

@Injectable()
export class MetaAssetsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getConversionDestination(
    workspaceId: string
  ): Promise<MetaConversionDestinationDto> {
    const destination =
      (await this.prisma.metaConversionDestination.findUnique({
        where: { workspaceId }
      })) as MetaConversionDestinationRecord | null;

    return destination
      ? this.toConversionDestinationDto(destination)
      : this.emptyConversionDestination(workspaceId);
  }

  async saveConversionDestination(
    workspaceId: string,
    input: MetaConversionDestinationInputDto,
    actorUserId?: string | null
  ): Promise<MetaConversionDestinationDto> {
    const now = new Date();
    const data = {
      pixelId: input.pixelId,
      pixelName: input.pixelName,
      pageId: input.pageId,
      pageName: input.pageName,
      status: MetaConversionDestinationStatus.configured,
      lastValidatedAt: now,
      validationError: null
    };
    const destination =
      (await this.prisma.metaConversionDestination.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          ...data
        },
        update: data
      })) as MetaConversionDestinationRecord;

    await this.recordMetaAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "meta.destination.updated",
      afterSummary: {
        pixelId: input.pixelId,
        pixelName: input.pixelName,
        pageId: input.pageId,
        pageName: input.pageName,
        status: "configured"
      } as Prisma.InputJsonValue
    });

    return this.toConversionDestinationDto(destination);
  }

  async listReportingAccounts(
    workspaceId: string
  ): Promise<MetaReportingAccountDto[]> {
    const accounts = (await this.prisma.metaReportingAccount.findMany({
      where: { workspaceId },
      orderBy: [{ active: "desc" }, { adAccountName: "asc" }]
    })) as MetaReportingAccountRecord[];

    return accounts.map((account) => this.toReportingAccountDto(account));
  }

  async saveReportingAccount(
    workspaceId: string,
    input: MetaReportingAccountInputDto,
    actorUserId?: string | null
  ): Promise<MetaReportingAccountDto> {
    const data = {
      businessId: input.businessId,
      businessName: input.businessName,
      adAccountId: input.adAccountId,
      adAccountName: input.adAccountName,
      currency: input.currency ?? null,
      timezoneName: input.timezoneName ?? null,
      active: true,
      syncStatus: MetaAssetSyncStatus.pending,
      syncError: null
    };
    const account = (await this.prisma.metaReportingAccount.upsert({
      where: {
        workspaceId_adAccountId: {
          workspaceId,
          adAccountId: input.adAccountId
        }
      },
      create: {
        workspaceId,
        ...data
      },
      update: data
    })) as MetaReportingAccountRecord;

    await this.recordMetaAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "meta.reporting_account.saved",
      afterSummary: {
        businessId: input.businessId,
        businessName: input.businessName,
        adAccountId: input.adAccountId,
        adAccountName: input.adAccountName,
        active: true,
        syncStatus: "pending"
      } as Prisma.InputJsonValue
    });

    return this.toReportingAccountDto(account);
  }

  async setReportingAccountActive(
    workspaceId: string,
    id: string,
    active: boolean,
    actorUserId?: string | null
  ): Promise<MetaReportingAccountDto[]> {
    await this.prisma.metaReportingAccount.updateMany({
      where: { id, workspaceId },
      data: { active }
    });
    await this.recordMetaAudit({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: "meta.reporting_account.status_updated",
      afterSummary: {
        id,
        active
      } as Prisma.InputJsonValue
    });

    return this.listReportingAccounts(workspaceId);
  }

  private async recordMetaAudit(input: {
    workspaceId: string;
    actorUserId: string | null;
    action: string;
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
          resultStatus: "success",
          beforeSummary: undefined,
          afterSummary: input.afterSummary
        }
      });
    } catch {
      return;
    }
  }

  private emptyConversionDestination(
    workspaceId: string
  ): MetaConversionDestinationDto {
    return {
      workspaceId,
      pixelId: null,
      pixelName: null,
      pageId: null,
      pageName: null,
      status: "needs_configuration",
      lastValidatedAt: null,
      validationError: null
    };
  }

  private toConversionDestinationDto(
    record: MetaConversionDestinationRecord
  ): MetaConversionDestinationDto {
    return {
      workspaceId: record.workspaceId,
      pixelId: record.pixelId,
      pixelName: record.pixelName,
      pageId: record.pageId,
      pageName: record.pageName,
      status: this.toConversionDestinationStatus(record.status),
      lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
      validationError: record.validationError
    };
  }

  private toReportingAccountDto(
    record: MetaReportingAccountRecord
  ): MetaReportingAccountDto {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      businessId: record.businessId,
      businessName: record.businessName,
      adAccountId: record.adAccountId,
      adAccountName: record.adAccountName,
      currency: record.currency,
      timezoneName: record.timezoneName,
      active: record.active,
      syncStatus: this.toSyncStatus(record.syncStatus),
      lastSyncedAt: record.lastSyncedAt?.toISOString() ?? null,
      syncError: record.syncError
    };
  }

  private toConversionDestinationStatus(
    status: string
  ): MetaConversionDestinationStatusDto {
    if (
      status === "needs_configuration" ||
      status === "configured" ||
      status === "error"
    ) {
      return status;
    }

    return "needs_configuration";
  }

  private toSyncStatus(status: string): MetaAssetSyncStatusDto {
    if (
      status === "pending" ||
      status === "syncing" ||
      status === "synced" ||
      status === "error"
    ) {
      return status;
    }

    return "pending";
  }
}
