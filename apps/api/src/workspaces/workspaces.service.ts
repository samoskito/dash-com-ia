import { randomBytes, createHash } from "node:crypto";
import {
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
  type WorkspaceInviteDto,
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

  async createInvite(
    authenticated: AuthenticatedUser,
    input: WorkspaceInviteInputDto
  ): Promise<WorkspaceInviteDto> {
    const workspace = this.getCurrentWorkspace(authenticated);

    if (!workspace.permissions.canInviteMembers) {
      throw new ForbiddenException("Sem permissao para convidar membros");
    }

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const invite = await this.prisma.workspaceInvite.create({
      data: {
        workspaceId: workspace.id,
        email: input.email,
        role: input.role,
        tokenHash: this.hashInviteToken(randomBytes(32).toString("hex")),
        expiresAt
      }
    });

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString()
    };
  }

  private hashInviteToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
