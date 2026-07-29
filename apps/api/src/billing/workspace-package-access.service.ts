import { Inject, Injectable } from "@nestjs/common";
import type {
  WorkspacePackageAccessDto,
  WorkspacePackageAccessReason,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { contractAllowsWhatsappAccess } from "./package-billing.policy";

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

    if (!enforcementEnabled) {
      return this.result({
        enforcementEnabled: false,
        allowed: true,
        reason: "enforcement_disabled",
      });
    }

    const contract = await this.prisma.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        isCurrent: true,
        planNameSnapshot: { not: null },
      },
      select: {
        contractStatus: true,
        accessEndsAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

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
    );
    const reason: WorkspacePackageAccessReason = allowed
      ? "active_contract"
      : this.blockReason(contract.contractStatus, contract.accessEndsAt, now);

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
  ): WorkspacePackageAccessReason {
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
