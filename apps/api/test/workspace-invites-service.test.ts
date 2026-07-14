import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordService } from "../src/auth/password.service";
import { WorkspaceAccessPolicyService } from "../src/workspaces/workspace-access-policy.service";
import { WorkspaceContextService } from "../src/workspaces/workspace-context.service";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const authenticated = {
  user: {
    id: "user_2",
    email: "admin@wpptrack.com",
    name: "Admin",
    authProvider: "email",
    emailVerifiedAt: null,
  },
  activeWorkspaceId: null,
  workspaces: [],
};

const ownerAuthenticated = {
  user: {
    id: "user_1",
    email: "owner@wpptrack.com",
    name: "Owner",
    authProvider: "email",
    emailVerifiedAt: null,
  },
  activeWorkspaceId: "workspace_1",
  workspaces: [
    {
      id: "workspace_1",
      name: "Comunidade NOD",
      slug: "comunidade-nod",
      role: "owner" as const,
      operationalStatus: "active" as const,
    },
  ],
};

function platformSupportAuthenticated(
  platformRole: "platform_owner" | "platform_operator",
) {
  return {
    user: {
      id: `user_${platformRole}`,
      email: `${platformRole}@wpptrack.com`,
      name: platformRole,
      authProvider: "email",
      emailVerifiedAt: null,
      platformRole,
    },
    activeWorkspaceId: null,
    workspaces: [],
    supportContext: {
      workspaceId: "workspace_1",
      workspaceName: "Comunidade NOD",
      workspaceSlug: "comunidade-nod",
      operationalStatus: "active" as const,
      startedAt: "2026-07-02T03:00:00.000Z",
    },
  };
}

type InviteRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  status: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

function createHarness(options: { emailFails?: boolean } = {}) {
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
        createdAt: now,
      },
    ] as InviteRecord[],
    users: [
      {
        id: "user_2",
        email: "admin@wpptrack.com",
        name: "Admin",
        passwordHash: "existing-password-hash",
        authProvider: "email",
        emailVerifiedAt: null,
      },
    ] as Array<Record<string, unknown>>,
    members: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>,
    queuedEmails: [] as Array<Record<string, unknown>>,
  };

  const matchesInvite = (
    invite: InviteRecord,
    where: Record<string, unknown>,
  ) => {
    const status = where.status as string | { in?: string[] } | undefined;
    const expiresAt = where.expiresAt as { gt?: Date; lte?: Date } | undefined;

    return (
      (where.id === undefined || invite.id === where.id) &&
      (where.workspaceId === undefined ||
        invite.workspaceId === where.workspaceId) &&
      (where.tokenHash === undefined || invite.tokenHash === where.tokenHash) &&
      (status === undefined ||
        (typeof status === "string"
          ? invite.status === status
          : status.in?.includes(invite.status) === true)) &&
      (expiresAt?.gt === undefined ||
        invite.expiresAt.getTime() > expiresAt.gt.getTime()) &&
      (expiresAt?.lte === undefined ||
        invite.expiresAt.getTime() <= expiresAt.lte.getTime())
    );
  };

  const prisma: any = {
    workspaceMember: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (
          db.members.some(
            (member) =>
              member.workspaceId === data.workspaceId &&
              member.userId === data.userId,
          )
        ) {
          throw { code: "P2002" };
        }

        const member = {
          id: `member_${db.members.length + 1}`,
          createdAt: now,
          canManageMembers: false,
          ...data,
        };
        db.members.push(member);
        return member;
      },
    },
    workspaceInvite: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const invite = {
          id: `invite_${db.invites.length + 1}`,
          status: "pending",
          acceptedAt: null,
          createdAt: now,
          ...data,
        } as InviteRecord;
        db.invites.push(invite);
        return invite;
      },
      findMany: async ({ where }: { where: { workspaceId: string } }) =>
        db.invites.filter((invite) => invite.workspaceId === where.workspaceId),
      findUnique: async ({
        where,
        include,
      }: {
        where: { id?: string; tokenHash?: string };
        include?: Record<string, unknown>;
      }) => {
        const invite =
          db.invites.find(
            (candidate) =>
              (where.id !== undefined && candidate.id === where.id) ||
              (where.tokenHash !== undefined &&
                candidate.tokenHash === where.tokenHash),
          ) ?? null;

        return invite && include
          ? { ...invite, workspace: { name: "Comunidade NOD" } }
          : invite;
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; workspaceId: string };
      }) =>
        db.invites.find(
          (invite) =>
            invite.id === where.id && invite.workspaceId === where.workspaceId,
        ) ?? null,
      update: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const index = db.invites.findIndex((invite) => invite.id === where.id);
        db.invites[index] = { ...db.invites[index], ...data } as InviteRecord;
        return db.invites[index];
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
      }) => {
        let count = 0;
        db.invites = db.invites.map((invite) => {
          if (!matchesInvite(invite, where)) {
            return invite;
          }

          count += 1;
          return { ...invite, ...data } as InviteRecord;
        });
        return { count };
      },
    },
    user: {
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string };
      }) =>
        db.users.find(
          (user) =>
            (where.email !== undefined && user.email === where.email) ||
            (where.id !== undefined && user.id === where.id),
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const user = { id: `user_${db.users.length + 1}`, ...data };
        db.users.push(user);
        return user;
      },
      update: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const index = db.users.findIndex((user) => user.id === where.id);
        db.users[index] = { ...db.users[index], ...data };
        return db.users[index];
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `audit_${db.auditLogs.length + 1}`,
          createdAt: now,
          ...data,
        };
        db.auditLogs.push(log);
        return log;
      },
    },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
      callback(prisma),
  };

  const authService = {
    activateWorkspaceSessionInTransaction: vi.fn(async () => undefined),
    createSessionForUser: vi.fn(async () => ({
      ...authenticated,
      activeWorkspaceId: "workspace_1",
      refreshToken: "new-refresh-token",
      expiresAt: new Date("2026-08-01T03:00:00.000Z"),
    })),
  };
  const emailQueue = {
    isEnabled: () => true,
    enqueue: vi.fn(async (input: Record<string, unknown>) => {
      if (options.emailFails) {
        throw new Error("queue unavailable");
      }
      db.queuedEmails.push(input);
      return { jobId: `email_${db.queuedEmails.length}` };
    }),
  };
  const service = new WorkspacesService(
    prisma as never,
    new PasswordService(),
    new WorkspaceContextService(),
    new WorkspaceAccessPolicyService(),
    authService as never,
    emailQueue as never,
  );

  return {
    authService,
    db,
    emailQueue,
    service,
    setInviteToken(token: string) {
      db.invites[0].tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");
    },
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

  it("creates and queues an invitation without exposing its token", async () => {
    const { db, service } = createHarness();

    const invite = await service.createInvite(ownerAuthenticated, {
      email: "new@wpptrack.com",
      role: "member",
    });

    expect(invite).toMatchObject({
      id: "invite_2",
      email: "new@wpptrack.com",
      role: "member",
      status: "pending",
    });
    expect(invite).not.toHaveProperty("acceptToken");
    expect(db.queuedEmails).toHaveLength(1);
    expect(db.queuedEmails[0]).toMatchObject({
      action: { type: "WorkspaceInvite", id: "invite_2" },
      envelope: {
        to: { address: "new@wpptrack.com" },
        template: "workspace_invitation",
      },
    });
    const serializedAudit = JSON.stringify(db.auditLogs);
    expect(serializedAudit).not.toContain(db.invites[1].tokenHash);
    expect(serializedAudit).not.toContain(
      (db.queuedEmails[0].envelope as { data: { token: string } }).data.token,
    );
  });

  it("records a failed delivery without exposing credentials", async () => {
    const { db, service } = createHarness({ emailFails: true });

    const invite = await service.createInvite(ownerAuthenticated, {
      email: "new@wpptrack.com",
      role: "member",
    });

    expect(invite.status).toBe("failed");
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        action: "workspace.invite_delivery_failed",
        actorType: "system",
        resultStatus: "failed",
      }),
    );
  });

  it("lets only the platform owner manage invites during support access", async () => {
    const { db, service } = createHarness();

    await service.createInvite(platformSupportAuthenticated("platform_owner"), {
      email: "support-created@wpptrack.com",
      role: "member",
    });

    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        actorType: "platform_owner",
        action: "workspace.invite_created",
        workspaceId: "workspace_1",
      }),
    );

    await expect(
      service.createInvite(platformSupportAuthenticated("platform_operator"), {
        email: "blocked@wpptrack.com",
        role: "member",
      }),
    ).rejects.toThrow("Sem permissao para gerenciar membros");
  });

  it("lists invitations without token material", async () => {
    const { service } = createHarness();

    const invites = await service.listInvites("workspace_1");

    expect(invites).toEqual([
      {
        id: "invite_1",
        email: "admin@wpptrack.com",
        role: "admin",
        status: "pending",
        expiresAt: "2026-07-09T03:00:00.000Z",
      },
    ]);
    expect(invites[0]).not.toHaveProperty("tokenHash");
    expect(invites[0]).not.toHaveProperty("acceptToken");
  });

  it("makes a revoked invitation indistinguishable from an invalid token", async () => {
    const { db, service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");

    const revoked = await service.revokeInvite(ownerAuthenticated, "invite_1");

    expect(revoked.status).toBe("revoked");
    expect(db.invites[0].status).toBe("revoked");
    await expect(
      service.inspectInvite({ token: "invite-token-1234567890" }),
    ).resolves.toEqual({ state: "invalid" });
  });

  it("rotates the token when an invitation is resent", async () => {
    const { db, service, setInviteToken } = createHarness();
    setInviteToken("old-invite-token-1234567890");
    const previousHash = db.invites[0].tokenHash;

    const resent = await service.resendInvite(ownerAuthenticated, "invite_1");
    const replacementToken = (
      db.queuedEmails[0].envelope as { data: { token: string } }
    ).data.token;

    expect(resent).not.toHaveProperty("acceptToken");
    expect(resent.status).toBe("pending");
    expect(db.invites[0].tokenHash).not.toBe(previousHash);
    expect(db.queuedEmails).toHaveLength(1);
    expect(JSON.stringify(db.auditLogs)).not.toContain(db.invites[0].tokenHash);
    await expect(
      service.inspectInvite({ token: "old-invite-token-1234567890" }),
    ).resolves.toEqual({ state: "invalid" });
    await expect(
      service.inspectInvite({ token: replacementToken }),
    ).resolves.toMatchObject({ state: "valid" });
  });

  it("inspects valid invitations with only masked public data", async () => {
    const { service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");

    await expect(
      service.inspectInvite({ token: "invite-token-1234567890" }),
    ).resolves.toEqual({
      state: "valid",
      workspaceName: "Comunidade NOD",
      emailHint: "ad***@wpptrack.com",
      role: "admin",
      accountMode: "login",
      expiresAt: "2026-07-09T03:00:00.000Z",
    });
    await expect(
      service.inspectInvite({ token: "unknown-token-1234567890" }),
    ).resolves.toEqual({ state: "invalid" });
  });

  it("accepts an invitation for the matching authenticated user", async () => {
    const { authService, db, service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");

    const result = await service.acceptInvite(
      authenticated,
      { token: "invite-token-1234567890" },
      "refresh-token",
    );

    expect(result).toEqual({
      workspaceId: "workspace_1",
      memberId: "member_1",
      role: "admin",
      status: "accepted",
    });
    expect(db.members[0]).toMatchObject({
      workspaceId: "workspace_1",
      userId: "user_2",
      role: "admin",
    });
    expect(
      authService.activateWorkspaceSessionInTransaction,
    ).toHaveBeenCalledWith(
      expect.anything(),
      "refresh-token",
      "user_2",
      "workspace_1",
    );
  });

  it("rejects an authenticated email mismatch without creating membership", async () => {
    const { db, service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");

    await expect(
      service.acceptInvite(
        {
          ...authenticated,
          user: { ...authenticated.user, email: "other@wpptrack.com" },
        },
        { token: "invite-token-1234567890" },
        "refresh-token",
      ),
    ).rejects.toThrow("Convite invalido ou expirado");
    expect(db.members).toHaveLength(0);
    expect(db.invites[0].status).toBe("pending");
  });

  it("activates only the invited workspace without returning another membership", async () => {
    const { authService, service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");
    const multiWorkspaceUser = {
      ...authenticated,
      activeWorkspaceId: "workspace_a",
      workspaces: [
        {
          id: "workspace_a",
          name: "Empresa confidencial A",
          slug: "empresa-a",
          role: "member" as const,
          operationalStatus: "active" as const,
        },
      ],
    };

    const accepted = await service.acceptInvite(
      multiWorkspaceUser,
      { token: "invite-token-1234567890" },
      "refresh-token",
    );

    expect(accepted.workspaceId).toBe("workspace_1");
    expect(JSON.stringify(accepted)).not.toContain("workspace_a");
    expect(JSON.stringify(accepted)).not.toContain("Empresa confidencial A");
    expect(
      authService.activateWorkspaceSessionInTransaction,
    ).toHaveBeenCalledWith(
      expect.anything(),
      "refresh-token",
      "user_2",
      "workspace_1",
    );
  });

  it("creates, verifies and signs in a new invited user", async () => {
    const { authService, db, service, setInviteToken } = createHarness();
    db.invites[0].email = "new@wpptrack.com";
    setInviteToken("invite-token-1234567890");

    const result = await service.acceptInviteForNewUser(
      {
        token: "invite-token-1234567890",
        name: "New Member",
        password: "strong-password-123",
      },
      { ipAddress: "127.0.0.1", userAgent: "Vitest" },
    );

    expect(result.accepted).toMatchObject({
      workspaceId: "workspace_1",
      role: "admin",
      status: "accepted",
    });
    expect(db.users[1]).toMatchObject({
      email: "new@wpptrack.com",
      name: "New Member",
      authProvider: "email",
      emailVerifiedAt: expect.any(Date),
    });
    expect(db.users[1].passwordHash).not.toBe("strong-password-123");
    expect(authService.createSessionForUser).toHaveBeenCalledWith(
      "user_2",
      { ipAddress: "127.0.0.1", userAgent: "Vitest" },
      expect.objectContaining({
        activeWorkspaceId: "workspace_1",
        transaction: expect.anything(),
      }),
    );
  });

  it("allows only one concurrent acceptance", async () => {
    const { service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");

    const results = await Promise.allSettled([
      service.acceptInvite(
        authenticated,
        { token: "invite-token-1234567890" },
        "refresh-token",
      ),
      service.acceptInvite(
        authenticated,
        { token: "invite-token-1234567890" },
        "refresh-token",
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("returns the same generic error for expired or unauthorized invitations", async () => {
    const { db, service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");
    db.invites[0].expiresAt = new Date("2026-07-01T03:00:00.000Z");

    await expect(
      service.acceptInvite(
        authenticated,
        { token: "invite-token-1234567890" },
        "refresh-token",
      ),
    ).rejects.toThrow("Convite invalido ou expirado");
    expect(db.invites[0].status).toBe("expired");

    db.invites[0].status = "pending";
    db.invites[0].expiresAt = new Date("2026-07-09T03:00:00.000Z");
    db.invites[0].role = "owner";
    await expect(
      service.acceptInvite(
        authenticated,
        { token: "invite-token-1234567890" },
        "refresh-token",
      ),
    ).rejects.toThrow("Convite invalido ou expirado");
  });
});
