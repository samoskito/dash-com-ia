import { randomBytes, createHash } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  type CurrentWorkspaceDto,
  type BackofficeWhatsappInstanceDto,
  type WorkspaceBillingDto,
  type WorkspaceBillingUpdateInputDto,
  type WorkspaceInviteDto,
  type WorkspaceInviteAcceptDto,
  type WorkspaceInviteAcceptInputDto,
  type WorkspaceInviteInputDto,
  type WorkspaceMemberDto,
  type WorkspaceUpdateInputDto,
  type WorkspaceRole
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/session.types";

export type WorkspacePermissions = {
  canInviteMembers: boolean;
  canManageBilling: boolean;
  canManageIntegrations: boolean;
  canViewReports: boolean;
};

type WorkspaceBillingRecord = {
  id: string;
  name: string;
  slug: string;
  asaasCustomerId: string | null;
  subscriptions?: Array<{
    status: string;
    activeInstances: number;
  }>;
  whatsappInstances?: Array<{
    id: string;
  }>;
};

type BackofficeWhatsappInstanceRecord = {
  id: string;
  name: string;
  provider: string;
  status: string;
  providerInstanceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  workspaceId: string;
  workspace: {
    name: string;
  };
};

@Injectable()
export class WorkspacesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getPermissions(role: WorkspaceRole): WorkspacePermissions {
    return {
      canInviteMembers: role === "owner" || role === "admin",
      canManageBilling: canManageWorkspaceBilling(role),
      canManageIntegrations: canManageIntegrations(role),
      canViewReports: canViewReports(role)
    };
  }

  getCurrentWorkspace(authenticated: AuthenticatedUser): CurrentWorkspaceDto {
    const workspace = authenticated.workspaces[0];

    if (!workspace) {
      throw new NotFoundException("Workspace nao encontrado");
    }

    return {
      ...workspace,
      permissions: this.getPermissions(workspace.role)
    };
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMemberDto[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
      joinedAt: member.createdAt.toISOString()
    }));
  }

  async listInvites(workspaceId: string): Promise<WorkspaceInviteDto[]> {
    const invites = await this.prisma.workspaceInvite.findMany({
      where: { workspaceId },
      orderBy: {
        createdAt: "desc"
      }
    });

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString()
    }));
  }

  async updateCurrentWorkspace(
    authenticated: AuthenticatedUser,
    input: WorkspaceUpdateInputDto
  ): Promise<CurrentWorkspaceDto> {
    const workspace = this.getCurrentWorkspace(authenticated);

    if (!workspace.permissions.canInviteMembers) {
      throw new ForbiddenException("Sem permissao para atualizar workspace");
    }

    const updated = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        name: input.name
      },
      select: {
        id: true,
        name: true,
        slug: true
      }
    });

    return {
      ...updated,
      role: workspace.role,
      permissions: workspace.permissions
    };
  }

  async getBillingConfiguration(
    workspaceId: string
  ): Promise<WorkspaceBillingDto> {
    const workspace = (await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true,
        subscriptions: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1,
          select: {
            status: true,
            activeInstances: true
          }
        },
        whatsappInstances: {
          where: {
            status: "active"
          },
          select: {
            id: true
          }
        }
      }
    })) as WorkspaceBillingRecord | null;

    if (!workspace) {
      throw new NotFoundException("Workspace nao encontrado");
    }

    return this.toWorkspaceBillingDto(workspace);
  }

  async listBillingConfigurations(): Promise<WorkspaceBillingDto[]> {
    const workspaces = (await this.prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true,
        subscriptions: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1,
          select: {
            status: true,
            activeInstances: true
          }
        },
        whatsappInstances: {
          where: {
            status: "active"
          },
          select: {
            id: true
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    })) as WorkspaceBillingRecord[];

    return workspaces.map((workspace) => this.toWorkspaceBillingDto(workspace));
  }

  async listBackofficeWhatsappInstances(): Promise<BackofficeWhatsappInstanceDto[]> {
    const instances = (await this.prisma.whatsappInstance.findMany({
      include: {
        workspace: {
          select: {
            name: true
          }
        }
      },
      orderBy: [
        {
          workspace: {
            name: "asc"
          }
        },
        {
          createdAt: "desc"
        }
      ]
    })) as BackofficeWhatsappInstanceRecord[];

    return instances.map((instance) => ({
      id: instance.id,
      workspaceId: instance.workspaceId,
      workspaceName: instance.workspace.name,
      name: instance.name,
      provider: this.toWhatsappProvider(instance.provider),
      billingStatus: this.toWhatsappBillingStatus(instance.status),
      providerInstanceId: instance.providerInstanceId,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString()
    }));
  }

  async updateBillingConfiguration(
    workspaceId: string,
    input: WorkspaceBillingUpdateInputDto
  ): Promise<WorkspaceBillingDto> {
    const workspace = (await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        asaasCustomerId: input.asaasCustomerId?.trim() || null
      },
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true,
        subscriptions: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1,
          select: {
            status: true,
            activeInstances: true
          }
        },
        whatsappInstances: {
          where: {
            status: "active"
          },
          select: {
            id: true
          }
        }
      }
    })) as WorkspaceBillingRecord;

    return this.toWorkspaceBillingDto(workspace);
  }

  async createInvite(
    authenticated: AuthenticatedUser,
    input: WorkspaceInviteInputDto
  ): Promise<WorkspaceInviteDto> {
    const workspace = this.getCurrentWorkspace(authenticated);

    if (!workspace.permissions.canInviteMembers) {
      throw new ForbiddenException("Sem permissao para convidar membros");
    }

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const acceptToken = randomBytes(32).toString("hex");
    const invite = await this.prisma.workspaceInvite.create({
      data: {
        workspaceId: workspace.id,
        email: input.email,
        role: input.role,
        tokenHash: this.hashInviteToken(acceptToken),
        expiresAt
      }
    });
    await this.recordWorkspaceAudit({
      workspaceId: workspace.id,
      actorUserId: authenticated.user.id,
      action: "workspace.invite_created",
      targetType: "WorkspaceInvite",
      targetId: invite.id,
      resultStatus: "pending",
      afterSummary: {
        invitedEmailHash: this.hashAuditValue(invite.email),
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString()
      } as Prisma.InputJsonValue
    });

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      acceptToken
    };
  }

  async acceptInvite(
    authenticated: AuthenticatedUser,
    input: WorkspaceInviteAcceptInputDto
  ): Promise<WorkspaceInviteAcceptDto> {
    const tokenHash = this.hashInviteToken(input.token);
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { tokenHash }
    });

    if (!invite) {
      throw new NotFoundException("Convite nao encontrado");
    }

    if (invite.status !== "pending") {
      throw new BadRequestException("Convite nao esta pendente");
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      await this.prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: "expired" }
      });
      throw new BadRequestException("Convite expirado");
    }

    if (invite.email.toLowerCase() !== authenticated.user.email.toLowerCase()) {
      throw new ForbiddenException("Convite pertence a outro email");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: authenticated.user.id,
          role: invite.role
        }
      });
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedAt: new Date()
        }
      });

      return {
        workspaceId: invite.workspaceId,
        memberId: member.id,
        role: invite.role,
        status: "accepted" as const
      };
    });
    await this.recordWorkspaceAudit({
      workspaceId: invite.workspaceId,
      actorUserId: authenticated.user.id,
      action: "workspace.invite_accepted",
      targetType: "WorkspaceInvite",
      targetId: invite.id,
      resultStatus: "accepted",
      beforeSummary: {
        status: "pending",
        invitedEmailHash: this.hashAuditValue(invite.email),
        role: invite.role
      } as Prisma.InputJsonValue,
      afterSummary: {
        status: "accepted",
        memberId: result.memberId,
        userId: authenticated.user.id,
        role: result.role
      } as Prisma.InputJsonValue
    });

    return result;
  }

  private hashInviteToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private hashAuditValue(value: string): string {
    return createHash("sha256")
      .update(value.trim().toLowerCase())
      .digest("hex");
  }

  private async recordWorkspaceAudit(input: {
    workspaceId: string;
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    resultStatus: string;
    beforeSummary?: Prisma.InputJsonValue;
    afterSummary?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          actorType: "user",
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: null,
          sourceIp: null,
          resultStatus: input.resultStatus,
          beforeSummary: input.beforeSummary,
          afterSummary: input.afterSummary
        }
      });
    } catch {
      return;
    }
  }

  private toWorkspaceBillingDto(
    workspace: WorkspaceBillingRecord
  ): WorkspaceBillingDto {
    const subscription = workspace.subscriptions?.[0];

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      asaasCustomerId: workspace.asaasCustomerId,
      subscriptionStatus: this.toWorkspaceBillingStatus(subscription?.status),
      activeInstances:
        subscription?.activeInstances ?? workspace.whatsappInstances?.length ?? 0
    };
  }

  private toWorkspaceBillingStatus(
    status: string | undefined
  ): WorkspaceBillingDto["subscriptionStatus"] {
    if (
      status === "active" ||
      status === "pending" ||
      status === "overdue" ||
      status === "cancelled"
    ) {
      return status;
    }

    return "not_configured";
  }

  private toWhatsappProvider(provider: string): BackofficeWhatsappInstanceDto["provider"] {
    return provider === "cloud_api" ? "cloud_api" : "uazapi";
  }

  private toWhatsappBillingStatus(
    status: string
  ): BackofficeWhatsappInstanceDto["billingStatus"] {
    if (
      status === "active" ||
      status === "disconnected" ||
      status === "suspended" ||
      status === "error"
    ) {
      return status;
    }

    return "pending_payment";
  }
}
