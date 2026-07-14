import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  type CurrentWorkspaceDto,
  type WorkspaceListDto,
  type WorkspacePermissionsDto,
  type WorkspaceRole
} from "@wpptrack/shared";
import type { AuthenticatedUser } from "../auth/session.types";

@Injectable()
export class WorkspaceContextService {
  getPermissions(role: WorkspaceRole): WorkspacePermissionsDto {
    return {
      canInviteMembers: role === "owner" || role === "admin",
      canManageBilling: canManageWorkspaceBilling(role),
      canManageIntegrations: canManageIntegrations(role),
      canViewReports: canViewReports(role)
    };
  }

  listMemberships(authenticated: AuthenticatedUser): WorkspaceListDto {
    return authenticated.workspaces;
  }

  getCurrentWorkspace(authenticated: AuthenticatedUser): CurrentWorkspaceDto {
    const supportContext = authenticated.supportContext;

    if (supportContext) {
      return {
        id: supportContext.workspaceId,
        name: supportContext.workspaceName,
        slug: supportContext.workspaceSlug,
        role: "owner",
        operationalStatus: supportContext.operationalStatus ?? "active",
        permissions: this.getPermissions("owner"),
        accessMode: "platform_support",
        platformRole: authenticated.user.platformRole ?? null
      };
    }

    const activeWorkspaceId =
      authenticated.activeWorkspaceId ??
      (authenticated.workspaces.length === 1
        ? (authenticated.workspaces[0]?.id ?? null)
        : null);
    const workspace = authenticated.workspaces.find(
      (candidate) => candidate.id === activeWorkspaceId
    );

    if (!workspace) {
      throw new NotFoundException("Workspace nao encontrado");
    }

    if (workspace.operationalStatus === "blocked") {
      throw new ForbiddenException("Workspace bloqueado operacionalmente");
    }

    return {
      ...workspace,
      permissions: this.getPermissions(workspace.role),
      accessMode: "member",
      platformRole: authenticated.user.platformRole ?? null
    };
  }
}
