import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const auditLogs: Array<Record<string, unknown>> = [];

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
  },
  auditLog: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const log = {
        id: `audit_${auditLogs.length + 1}`,
        ...data
      };
      auditLogs.push(log);
      return log;
    }
  }
};

describe("workspace contracts", () => {
  it("grants owner permissions", () => {
    const service = new WorkspacesService(prisma as never);

    expect(service.getPermissions("owner")).toEqual({
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

  it("grants admin permissions without billing", () => {
    const service = new WorkspacesService(prisma as never);

    expect(service.getPermissions("admin")).toEqual({
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

  it("keeps member permissions read-focused", () => {
    const service = new WorkspacesService(prisma as never);

    expect(service.getPermissions("member")).toEqual({
      canInviteMembers: false,
      canManageMembers: false,
      canGrantMemberManager: false,
      canManageBilling: false,
      canManageIntegrations: false,
      canManageWorkspaceSettings: false,
      canTransferOwnership: false,
      canViewReports: true,
      canExportReports: true
    });
  });

  it("grants delegated team management only to the selected admin membership", () => {
    const service = new WorkspacesService(prisma as never);

    expect(service.getPermissions("admin", true)).toMatchObject({
      canManageMembers: true,
      canGrantMemberManager: false,
      canManageBilling: false,
      canManageIntegrations: true
    });
  });

  it("updates workspace profile name without changing the slug", async () => {
    auditLogs.length = 0;
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
        activeWorkspaceId: "workspace_1",
        workspaces: [
          {
            id: "workspace_1",
            name: "Comunidade NOD",
            slug: "comunidade-nod",
            role: "owner",
            operationalStatus: "active"
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
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "workspace.profile_updated",
        targetType: "Workspace",
        targetId: "workspace_1",
        resultStatus: "success"
      })
    );
    expect(auditLogs[0].beforeSummary).toMatchObject({
      name: "Comunidade NOD"
    });
    expect(auditLogs[0].afterSummary).toMatchObject({
      name: "Loja Samuel"
    });
  });

  it("blocks client-facing access when the current workspace is operationally blocked", () => {
    const service = new WorkspacesService(prisma as never);

    expect(() =>
      service.getCurrentWorkspace({
        user: {
          id: "user_1",
          email: "owner@wpptrack.com",
          name: "Owner",
          authProvider: "email",
          emailVerifiedAt: null
        },
        activeWorkspaceId: "workspace_1",
        workspaces: [
          {
            id: "workspace_1",
            name: "Comunidade NOD",
            slug: "comunidade-nod",
            role: "owner",
            operationalStatus: "blocked"
          }
        ]
      })
    ).toThrow(ForbiddenException);
  });

  it("exposes platform authority without changing workspace membership", () => {
    const service = new WorkspacesService(prisma as never);

    const workspace = service.getCurrentWorkspace({
      user: {
        id: "user_owner",
        email: "owner@wpptrack.com",
        name: "Owner",
        authProvider: "email",
        emailVerifiedAt: null,
        platformRole: "platform_owner"
      },
      activeWorkspaceId: "workspace_owner",
      workspaces: [
        {
          id: "workspace_owner",
          name: "Workspace do Owner",
          slug: "workspace-owner",
          role: "owner",
          operationalStatus: "active"
        }
      ]
    });

    expect(workspace.platformRole).toBe("platform_owner");
    expect(workspace.accessMode).toBe("member");
    expect(workspace.role).toBe("owner");
  });
});
