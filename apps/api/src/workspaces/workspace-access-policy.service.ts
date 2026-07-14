import { Injectable } from "@nestjs/common";
import type {
  WorkspacePermissionsDto,
  WorkspaceRole
} from "@wpptrack/shared";

export type WorkspacePolicySubject = {
  role: WorkspaceRole;
  canManageMembers?: boolean;
};

@Injectable()
export class WorkspaceAccessPolicyService {
  getPermissions(
    role: WorkspaceRole,
    canManageMembers = false
  ): WorkspacePermissionsDto {
    const isOwner = role === "owner";
    const isAdmin = role === "admin";
    const managesMembers = isOwner || (isAdmin && canManageMembers);

    return {
      canInviteMembers: managesMembers,
      canManageMembers: managesMembers,
      canGrantMemberManager: isOwner,
      canManageBilling: isOwner,
      canManageIntegrations: isOwner || isAdmin,
      canManageWorkspaceSettings: isOwner || isAdmin,
      canTransferOwnership: isOwner,
      canViewReports: true,
      canExportReports: true
    };
  }

  canManageMember(
    actor: WorkspacePolicySubject,
    target: WorkspacePolicySubject,
    isSelf = false
  ): boolean {
    if (target.role === "owner") {
      return false;
    }

    if (actor.role === "owner") {
      return true;
    }

    return (
      actor.role === "admin" &&
      actor.canManageMembers === true &&
      (target.canManageMembers !== true || isSelf)
    );
  }
}
