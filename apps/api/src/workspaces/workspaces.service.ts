import { randomBytes, createHash } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  type CurrentWorkspaceDto,
  type WorkspaceBillingDto,
  type WorkspaceBillingUpdateInputDto,
  type WorkspaceInviteDto,
  type WorkspaceInviteAcceptDto,
  type WorkspaceInviteAcceptInputDto,
  type WorkspaceInviteInputDto,
  type WorkspaceMemberDto,
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

  async getBillingConfiguration(
    workspaceId: string
  ): Promise<WorkspaceBillingDto> {
    const workspace = (await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true
      }
    })) as WorkspaceBillingRecord | null;

    if (!workspace) {
      throw new NotFoundException("Workspace nao encontrado");
    }

    return workspace;
  }

  async listBillingConfigurations(): Promise<WorkspaceBillingDto[]> {
    const workspaces = (await this.prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        asaasCustomerId: true
      },
      orderBy: {
        name: "asc"
      }
    })) as WorkspaceBillingRecord[];

    return workspaces;
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
        asaasCustomerId: true
      }
    })) as WorkspaceBillingRecord;

    return workspace;
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

    return this.prisma.$transaction(async (tx) => {
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
        status: "accepted"
      };
    });
  }

  private hashInviteToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
