import { Injectable } from "@nestjs/common";
import {
  canManageIntegrations,
  canManageWorkspaceBilling,
  canViewReports,
  type WorkspaceRole
} from "@wpptrack/shared";

export type WorkspacePermissions = {
  canInviteMembers: boolean;
  canManageBilling: boolean;
  canManageIntegrations: boolean;
  canViewReports: boolean;
};

@Injectable()
export class WorkspacesService {
  getPermissions(role: WorkspaceRole): WorkspacePermissions {
    return {
      canInviteMembers: role === "owner" || role === "admin",
      canManageBilling: canManageWorkspaceBilling(role),
      canManageIntegrations: canManageIntegrations(role),
      canViewReports: canViewReports(role)
    };
  }
}
