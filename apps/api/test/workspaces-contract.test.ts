import { describe, expect, it } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const prisma = {
  workspaceMember: {
    findMany: async () => []
  },
  workspaceInvite: {
    create: async () => {
      throw new Error("not used in permission tests");
    }
  }
};

describe("workspace contracts", () => {
  it("grants owner permissions", () => {
    const service = new WorkspacesService(prisma as never);

    expect(service.getPermissions("owner")).toEqual({
      canInviteMembers: true,
      canManageBilling: true,
      canManageIntegrations: true,
      canViewReports: true
    });
  });

  it("grants admin permissions without billing", () => {
    const service = new WorkspacesService(prisma as never);

    expect(service.getPermissions("admin")).toEqual({
      canInviteMembers: true,
      canManageBilling: false,
      canManageIntegrations: true,
      canViewReports: true
    });
  });

  it("keeps member permissions read-focused", () => {
    const service = new WorkspacesService(prisma as never);

    expect(service.getPermissions("member")).toEqual({
      canInviteMembers: false,
      canManageBilling: false,
      canManageIntegrations: false,
      canViewReports: true
    });
  });
});
