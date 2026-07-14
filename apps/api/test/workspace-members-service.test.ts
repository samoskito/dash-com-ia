import { describe, expect, it } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const now = new Date("2026-07-14T12:00:00.000Z");

function authenticated(
  userId: string,
  role: "owner" | "admin" | "member",
  canManageMembers = false
) {
  return {
    user: {
      id: userId,
      email: `${userId}@wpptrack.com`,
      name: userId,
      authProvider: "email",
      emailVerifiedAt: null
    },
    activeWorkspaceId: "workspace_1",
    workspaces: [
      {
        id: "workspace_1",
        name: "Empresa 1",
        slug: "empresa-1",
        role,
        canManageMembers,
        operationalStatus: "active" as const
      }
    ]
  };
}

function member(
  id: string,
  userId: string,
  role: "owner" | "admin" | "member",
  canManageMembers = false,
  workspaceId = "workspace_1"
) {
  return {
    id,
    workspaceId,
    userId,
    role,
    canManageMembers,
    createdAt: now,
    user: {
      email: `${userId}@wpptrack.com`,
      name: userId
    }
  };
}

function createHarness() {
  const members = [
    member("member_owner", "owner", "owner"),
    member("member_manager", "manager", "admin", true),
    member("member_peer_manager", "peer_manager", "admin", true),
    member("member_admin", "admin", "admin"),
    member("member_analyst", "analyst", "member"),
    member("member_other", "other", "member", false, "workspace_2")
  ];
  const auditLogs: Array<Record<string, unknown>> = [];
  const revokedSessionWrites: Array<Record<string, unknown>> = [];
  const userPreferenceWrites: Array<Record<string, unknown>> = [];

  const prismaBase = {
    workspaceMember: {
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) =>
        members.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.workspaceId === where.workspaceId
        ) ?? null,
      update: async ({
        data,
        where
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const target = members.find((candidate) => candidate.id === where.id);

        if (!target) {
          throw new Error("member not found");
        }

        Object.assign(target, data);
        return target;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = members.findIndex((candidate) => candidate.id === where.id);

        if (index < 0) {
          throw new Error("member not found");
        }

        return members.splice(index, 1)[0];
      }
    },
    workspaceInvite: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "invite_1",
        status: "pending",
        createdAt: now,
        acceptedAt: null,
        ...data
      })
    },
    authSession: {
      updateMany: async (args: Record<string, unknown>) => {
        revokedSessionWrites.push(args);
        return { count: 1 };
      }
    },
    user: {
      updateMany: async (args: Record<string, unknown>) => {
        userPreferenceWrites.push(args);
        return { count: 1 };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditLogs.push(data);
        return { id: `audit_${auditLogs.length}`, ...data };
      }
    }
  };
  const prisma = {
    ...prismaBase,
    $transaction: async <T>(
      callback: (tx: typeof prismaBase) => Promise<T>
    ) => callback(prismaBase)
  };

  return {
    auditLogs,
    members,
    prisma,
    revokedSessionWrites,
    service: new WorkspacesService(prisma as never),
    userPreferenceWrites
  };
}

describe("workspace member management", () => {
  it("blocks a regular admin from inviting or changing team members", async () => {
    const { service } = createHarness();
    const actor = authenticated("admin", "admin");

    await expect(
      service.createInvite(actor, {
        email: "new@wpptrack.com",
        role: "member"
      })
    ).rejects.toThrow("Sem permissao para gerenciar membros");
    await expect(
      service.updateMemberRole(actor, "member_analyst", { role: "admin" })
    ).rejects.toThrow("Sem permissao para gerenciar membros");
  });

  it("lets a delegated admin manage ordinary members", async () => {
    const { auditLogs, service } = createHarness();

    const updated = await service.updateMemberRole(
      authenticated("manager", "admin", true),
      "member_analyst",
      { role: "admin" }
    );

    expect(updated).toMatchObject({
      id: "member_analyst",
      role: "admin",
      canManageMembers: false
    });
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "workspace.member_role_updated",
        actorUserId: "manager",
        targetId: "member_analyst"
      })
    );
  });

  it("blocks a delegated admin from changing the owner or a peer manager", async () => {
    const { service } = createHarness();
    const actor = authenticated("manager", "admin", true);

    await expect(
      service.updateMemberRole(actor, "member_owner", { role: "admin" })
    ).rejects.toThrow("Sem permissao para alterar este membro");
    await expect(
      service.updateMemberRole(actor, "member_peer_manager", {
        role: "member"
      })
    ).rejects.toThrow("Sem permissao para alterar este membro");
    await expect(
      service.updateMemberManagerCapability(actor, "member_admin", {
        canManageMembers: true
      })
    ).rejects.toThrow("Somente o owner");
  });

  it("allows only the owner to grant delegated team management", async () => {
    const { auditLogs, service } = createHarness();

    const updated = await service.updateMemberManagerCapability(
      authenticated("owner", "owner"),
      "member_admin",
      { canManageMembers: true }
    );

    expect(updated.canManageMembers).toBe(true);
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "workspace.member_manager_updated",
        actorUserId: "owner",
        targetId: "member_admin"
      })
    );
  });

  it("returns the same not-found result for a member from another workspace", async () => {
    const { service } = createHarness();

    await expect(
      service.updateMemberRole(
        authenticated("owner", "owner"),
        "member_other",
        { role: "admin" }
      )
    ).rejects.toThrow("Membro nao encontrado");
  });

  it("removes an ordinary member and revokes only sessions active in that workspace", async () => {
    const {
      members,
      revokedSessionWrites,
      service,
      userPreferenceWrites
    } = createHarness();

    const result = await service.removeMember(
      authenticated("owner", "owner"),
      "member_analyst"
    );

    expect(result).toEqual({
      memberId: "member_analyst",
      status: "removed"
    });
    expect(members.some((candidate) => candidate.id === "member_analyst")).toBe(
      false
    );
    expect(revokedSessionWrites[0]).toMatchObject({
      where: {
        userId: "analyst",
        activeWorkspaceId: "workspace_1",
        revokedAt: null
      }
    });
    expect(userPreferenceWrites[0]).toMatchObject({
      where: {
        id: "analyst",
        lastWorkspaceId: "workspace_1"
      },
      data: { lastWorkspaceId: null }
    });
  });

  it("never lets the canonical owner be removed", async () => {
    const { service } = createHarness();

    await expect(
      service.removeMember(
        authenticated("owner", "owner"),
        "member_owner"
      )
    ).rejects.toThrow("Sem permissao para remover este membro");
  });
});
