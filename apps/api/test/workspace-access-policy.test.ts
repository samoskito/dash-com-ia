import { describe, expect, it } from "vitest";
import { WorkspaceAccessPolicyService } from "../src/workspaces/workspace-access-policy.service";

describe("WorkspaceAccessPolicyService", () => {
  const policy = new WorkspaceAccessPolicyService();

  it("grants every workspace capability to the owner", () => {
    expect(policy.getPermissions("owner")).toEqual({
      canInviteMembers: true,
      canManageMembers: true,
      canGrantMemberManager: true,
      canManageBilling: true,
      canManageIntegrations: true,
      canManageWorkspaceSettings: true,
      canTransferOwnership: true,
      canViewReports: true,
      canExportReports: true
    });
  });

  it("keeps regular admin operational without team, billing or ownership authority", () => {
    expect(policy.getPermissions("admin")).toEqual({
      canInviteMembers: false,
      canManageMembers: false,
      canGrantMemberManager: false,
      canManageBilling: false,
      canManageIntegrations: true,
      canManageWorkspaceSettings: true,
      canTransferOwnership: false,
      canViewReports: true,
      canExportReports: true
    });
  });

  it("adds team actions to a delegated admin without allowing re-delegation", () => {
    expect(policy.getPermissions("admin", true)).toMatchObject({
      canManageMembers: true,
      canInviteMembers: true,
      canGrantMemberManager: false,
      canManageBilling: false,
      canTransferOwnership: false
    });
  });

  it("keeps analysts read-only with allowed reports and exports", () => {
    expect(policy.getPermissions("member")).toMatchObject({
      canViewReports: true,
      canExportReports: true,
      canManageIntegrations: false,
      canManageWorkspaceSettings: false,
      canManageMembers: false
    });
  });

  it("prevents a delegated admin from affecting the owner or a peer manager", () => {
    const delegatedAdmin = { role: "admin" as const, canManageMembers: true };

    expect(
      policy.canManageMember(delegatedAdmin, { role: "owner" })
    ).toBe(false);
    expect(
      policy.canManageMember(delegatedAdmin, {
        role: "admin",
        canManageMembers: true
      })
    ).toBe(false);
    expect(
      policy.canManageMember(delegatedAdmin, {
        role: "admin",
        canManageMembers: false
      })
    ).toBe(true);
    expect(policy.canManageMember(delegatedAdmin, { role: "member" })).toBe(
      true
    );
  });
});
