import { describe, expect, it } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const prisma = {
  workspace: {
    update: async ({ data, where }: { data: { name: string }; where: { id: string } }) => ({
      id: where.id,
      name: data.name,
      slug: "comunidade-nod",
      role: "owner"
    })
  },
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

  it("updates workspace profile name without changing the slug", async () => {
    const service = new WorkspacesService(prisma as never);

    const workspace = await service.updateCurrentWorkspace(
      {
        user: {
          id: "user_1",
          email: "owner@wpptrack.com",
          name: "Owner",
          authProvider: "email",
          emailVerifiedAt: null
        },
        workspaces: [
          {
            id: "workspace_1",
            name: "Comunidade NOD",
            slug: "comunidade-nod",
            role: "owner"
          }
        ]
      },
      { name: "Loja Samuel" }
    );

    expect(workspace).toMatchObject({
      id: "workspace_1",
      name: "Loja Samuel",
      slug: "comunidade-nod",
      role: "owner"
    });
  });
});
