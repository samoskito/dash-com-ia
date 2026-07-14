import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const authenticated = {
  user: {
    id: "user_2",
    email: "admin@wpptrack.com",
    name: "Admin",
    authProvider: "email",
    emailVerifiedAt: null
  },
  activeWorkspaceId: null,
  workspaces: []
};

const ownerAuthenticated = {
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
      role: "owner" as const,
      operationalStatus: "active" as const
    }
  ]
};

type FakePrisma = {
  workspaceMember: {
    findMany: () => Promise<never[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  workspaceInvite: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    findMany: (args: {
      where: { workspaceId: string };
      orderBy: { createdAt: "desc" };
    }) => Promise<Record<string, unknown>[]>;
    findUnique: (args: { where: { tokenHash: string } }) => Promise<Record<string, unknown> | null>;
    update: (args: { data: Record<string, unknown>; where: { id: string } }) => Promise<Record<string, unknown>>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};

function createHarness() {
  const now = new Date("2026-07-02T03:00:00.000Z");
  const db = {
    invites: [
      {
        id: "invite_1",
        workspaceId: "workspace_1",
        email: "admin@wpptrack.com",
        role: "admin",
        status: "pending",
        tokenHash: "placeholder",
        expiresAt: new Date("2026-07-09T03:00:00.000Z"),
        acceptedAt: null,
        createdAt: now
      }
    ],
    members: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>
  };
  const prisma: FakePrisma = {
    workspaceMember: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const member = {
          id: `member_${db.members.length + 1}`,
          createdAt: now,
          ...data
        };
        db.members.push(member);
        return member;
      }
    },
    workspaceInvite: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const invite = {
          id: `invite_${db.invites.length + 1}`,
          status: "pending",
          acceptedAt: null,
          createdAt: now,
          ...data
        };
        db.invites.push(invite as (typeof db.invites)[number]);
        return invite;
      },
      findMany: async ({ where }: { where: { workspaceId: string } }) =>
        db.invites.filter((invite) => invite.workspaceId === where.workspaceId),
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        db.invites.find((invite) => invite.tokenHash === where.tokenHash) ?? null,
      update: async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => {
        const index = db.invites.findIndex((invite) => invite.id === where.id);
        db.invites[index] = {
          ...db.invites[index],
          ...data
        };
        return db.invites[index];
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `audit_${db.auditLogs.length + 1}`,
          createdAt: now,
          ...data
        };
        db.auditLogs.push(log);
        return log;
      }
    },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
      callback(prisma)
  };
  const service = new WorkspacesService(prisma as never);

  return {
    db,
    service,
    setInviteToken(token: string) {
      db.invites[0].tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");
    }
  };
}

describe("workspace invite service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T04:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates pending workspace invites and audits without storing invite tokens", async () => {
    const { db, service } = createHarness();

    const invite = await service.createInvite(ownerAuthenticated, {
      email: "new@wpptrack.com",
      role: "member"
    });

    expect(invite).toMatchObject({
      id: "invite_2",
      email: "new@wpptrack.com",
      role: "member",
      status: "pending"
    });
    expect(invite.acceptToken).toBeDefined();
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "workspace.invite_created",
        targetType: "WorkspaceInvite",
        targetId: "invite_2",
        resultStatus: "pending"
      })
    );
    expect(JSON.stringify(db.auditLogs)).not.toContain(
      db.invites[1].tokenHash as string
    );
    expect(JSON.stringify(db.auditLogs)).not.toContain(invite.acceptToken);
  });

  it("lists workspace invites without exposing token hashes", async () => {
    const { service } = createHarness();

    const invites = await service.listInvites("workspace_1");

    expect(invites).toEqual([
      {
        id: "invite_1",
        email: "admin@wpptrack.com",
        role: "admin",
        status: "pending",
        expiresAt: "2026-07-09T03:00:00.000Z"
      }
    ]);
    expect(invites[0]).not.toHaveProperty("tokenHash");
    expect(invites[0]).not.toHaveProperty("acceptToken");
  });

  it("accepts a pending invite and creates a workspace membership", async () => {
    const { db, service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");

    const result = await service.acceptInvite(authenticated, {
      token: "invite-token-1234567890"
    });

    expect(result).toEqual({
      workspaceId: "workspace_1",
      memberId: "member_1",
      role: "admin",
      status: "accepted"
    });
    expect(db.members[0]).toMatchObject({
      workspaceId: "workspace_1",
      userId: "user_2",
      role: "admin"
    });
    expect(db.invites[0]).toMatchObject({
      status: "accepted"
    });
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_2",
        actorType: "user",
        action: "workspace.invite_accepted",
        targetType: "WorkspaceInvite",
        targetId: "invite_1",
        resultStatus: "accepted"
      })
    );
  });

  it("marks expired invites as expired and audits the state change", async () => {
    const { db, service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");
    db.invites[0].expiresAt = new Date("2026-07-01T03:00:00.000Z");

    await expect(
      service.acceptInvite(authenticated, {
        token: "invite-token-1234567890"
      })
    ).rejects.toThrow("Convite expirado");

    expect(db.invites[0]).toMatchObject({
      status: "expired"
    });
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_2",
        actorType: "user",
        action: "workspace.invite_expired",
        targetType: "WorkspaceInvite",
        targetId: "invite_1",
        resultStatus: "expired"
      })
    );
  });
});
