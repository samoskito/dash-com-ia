import { describe, expect, it } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

describe("workspace contracts", () => {
  it("grants owner permissions", () => {
    const service = new WorkspacesService();

    expect(service.getPermissions("owner")).toEqual({
      canInviteMembers: true,
      canManageBilling: true,
      canManageIntegrations: true,
      canViewReports: true
    });
  });

  it("grants admin permissions without billing", () => {
    const service = new WorkspacesService();

    expect(service.getPermissions("admin")).toEqual({
      canInviteMembers: true,
      canManageBilling: false,
      canManageIntegrations: true,
      canViewReports: true
    });
  });

  it("keeps member permissions read-focused", () => {
    const service = new WorkspacesService();

    expect(service.getPermissions("member")).toEqual({
      canInviteMembers: false,
      canManageBilling: false,
      canManageIntegrations: false,
      canViewReports: true
    });
  });
});
