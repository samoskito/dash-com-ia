import { Inject, Injectable } from "@nestjs/common";
import type {
  WorkspacePackageAccessDto,
  WorkspacePackageAccessReason,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import {
  contractAllowsWhatsappAccess,
  contractRequiresProcessingBlock,
} from "./package-billing.policy";

@Injectable()
export class WorkspacePackageAccessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
  ) {}

  async getWorkspaceAccessState(
    workspaceId: string,
    now = new Date(),
  ): Promise<WorkspacePackageAccessDto> {
    const enforcementEnabled =
      this.configuration.isPackageBillingEnabled() &&
      this.configuration.isEnforcementEnabled();

    const contract = await this.prisma.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        isCurrent: true,
        planNameSnapshot: { not: null },
      },
      select: {
        contractStatus: true,
        accessEndsAt: true,
        graceEndsAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (
      contract &&
      contractRequiresProcessingBlock(
        contract.contractStatus,
        now,
        contract.graceEndsAt,
      )
    ) {
      return {
        enforcementEnabled: true,
        allowed: false,
        reason: this.blockReason(
          contract.contractStatus,
          contract.accessEndsAt,
          now,
          contract.graceEndsAt,
        ),
        contractStatus: contract.contractStatus,
        accessEndsAt: contract.accessEndsAt?.toISOString() ?? null,
      };
    }

    if (!enforcementEnabled) {
      return this.result({
        enforcementEnabled: false,
        allowed: true,
        reason: "enforcement_disabled",
      });
    }

    if (!contract) {
      return this.result({
        enforcementEnabled: true,
        allowed: false,
        reason: "missing_contract",
      });
    }

    const allowed = contractAllowsWhatsappAccess(
      contract.contractStatus,
      now,
      contract.accessEndsAt,
      contract.graceEndsAt,
    );
    const reason: WorkspacePackageAccessReason = allowed
      ? "active_contract"
      : this.blockReason(
          contract.contractStatus,
          contract.accessEndsAt,
          now,
          contract.graceEndsAt,
        );

    return {
      enforcementEnabled: true,
      allowed,
      reason,
      contractStatus: contract.contractStatus,
      accessEndsAt: contract.accessEndsAt?.toISOString() ?? null,
    };
  }

  private blockReason(
    contractStatus: Parameters<typeof contractAllowsWhatsappAccess>[0],
    accessEndsAt: Date | null,
    now: Date,
    graceEndsAt: Date | null,
  ): WorkspacePackageAccessReason {
    if (
      contractStatus === "grace_period" &&
      (graceEndsAt === null || graceEndsAt.getTime() <= now.getTime())
    ) {
      return "access_expired";
    }

    if (accessEndsAt !== null && accessEndsAt.getTime() <= now.getTime()) {
      return "access_expired";
    }

    return "contract_inactive";
  }

  private result(
    input: Pick<
      WorkspacePackageAccessDto,
      "allowed" | "enforcementEnabled" | "reason"
    >,
  ): WorkspacePackageAccessDto {
    return {
      ...input,
      contractStatus: null,
      accessEndsAt: null,
    };
  }
}
