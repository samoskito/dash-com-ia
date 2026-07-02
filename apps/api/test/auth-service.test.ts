import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { PasswordService } from "../src/auth/password.service";

type DbUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  authProvider: "email" | "google";
  googleId: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DbWorkspace = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

type DbMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  createdAt: Date;
};

type DbSession = {
  id: string;
  userId: string;
  refreshHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

type FakePrisma = {
  $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
  user: {
    findUnique: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
  workspace: {
    findUnique: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
  workspaceMember: {
    create: (args: unknown) => Promise<unknown>;
  };
  authSession: {
    create: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

function createHarness() {
  const db = {
    users: [] as DbUser[],
    workspaces: [] as DbWorkspace[],
    members: [] as DbMember[],
    sessions: [] as DbSession[]
  };

  const includeMemberships = (user: DbUser) => ({
    ...user,
    memberships: db.members
      .filter((member) => member.userId === user.id)
      .map((member) => ({
        ...member,
        workspace: db.workspaces.find(
          (workspace) => workspace.id === member.workspaceId
        )
      }))
  });

  const prisma: FakePrisma = {
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
      callback(prisma),
    user: {
      findUnique: async (args) => {
        const { where } = args as { where: { email?: string; id?: string } };
        const user = db.users.find(
          (candidate) =>
            (where.email !== undefined && candidate.email === where.email) ||
            (where.id !== undefined && candidate.id === where.id)
        );

        return user ? includeMemberships(user) : null;
      },
      create: async (args) => {
        const { data } = args as {
          data: { email: string; name: string; passwordHash: string };
        };
        const now = new Date("2026-07-02T03:00:00.000Z");
        const user: DbUser = {
          id: `user_${db.users.length + 1}`,
          email: data.email,
          name: data.name,
          passwordHash: data.passwordHash,
          authProvider: "email",
          googleId: null,
          emailVerifiedAt: null,
          createdAt: now,
          updatedAt: now
        };

        db.users.push(user);
        return user;
      }
    },
    workspace: {
      findUnique: async (args) => {
        const { where } = args as { where: { slug: string } };
        return (
          db.workspaces.find((workspace) => workspace.slug === where.slug) ??
          null
        );
      },
      create: async (args) => {
        const { data } = args as { data: { name: string; slug: string } };
        const now = new Date("2026-07-02T03:00:00.000Z");
        const workspace: DbWorkspace = {
          id: `workspace_${db.workspaces.length + 1}`,
          name: data.name,
          slug: data.slug,
          createdAt: now,
          updatedAt: now
        };

        db.workspaces.push(workspace);
        return workspace;
      }
    },
    workspaceMember: {
      create: async (args) => {
        const { data } = args as {
          data: { workspaceId: string; userId: string; role: "owner" };
        };
        const member: DbMember = {
          id: `member_${db.members.length + 1}`,
          workspaceId: data.workspaceId,
          userId: data.userId,
          role: data.role,
          createdAt: new Date("2026-07-02T03:00:00.000Z")
        };

        db.members.push(member);
        return member;
      }
    },
    authSession: {
      create: async (args) => {
        const { data } = args as {
        data: {
          userId: string;
          refreshHash: string;
          userAgent?: string | null;
          ipAddress?: string | null;
          expiresAt: Date;
        };
      };
        const session: DbSession = {
          id: `session_${db.sessions.length + 1}`,
          userId: data.userId,
          refreshHash: data.refreshHash,
          userAgent: data.userAgent ?? null,
          ipAddress: data.ipAddress ?? null,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date("2026-07-02T03:00:00.000Z")
        };

        db.sessions.push(session);
        return session;
      },
      findUnique: async (args) => {
        const { where } = args as { where: { refreshHash: string } };
        const session =
          db.sessions.find(
            (candidate) => candidate.refreshHash === where.refreshHash
          ) ?? null;
        const user = session
          ? db.users.find((candidate) => candidate.id === session.userId)
          : null;

        return session && user
          ? {
              ...session,
              user: includeMemberships(user)
            }
          : null;
      },
      updateMany: async (args) => {
        const { where, data } = args as {
        where: { refreshHash: string; revokedAt: null };
        data: { revokedAt: Date };
      };
        let count = 0;

        db.sessions = db.sessions.map((session) => {
          if (
            session.refreshHash === where.refreshHash &&
            session.revokedAt === where.revokedAt
          ) {
            count += 1;
            return { ...session, revokedAt: data.revokedAt };
          }

          return session;
        });

        return { count };
      }
    }
  };

  return {
    db,
    service: new AuthService(prisma as never, new PasswordService())
  };
}

describe("auth service session lifecycle", () => {
  it("registers an email user as workspace owner and creates a refresh session", async () => {
    const { db, service } = createHarness();

    const result = await service.register(
      {
        name: "Samuel Choairy",
        email: " SAMUEL@WPPTRACK.COM ",
        password: "strong-password",
        workspaceName: "Comunidade NOD"
      },
      {
        userAgent: "Vitest",
        ipAddress: "127.0.0.1"
      }
    );

    expect(result.user.email).toBe("samuel@wpptrack.com");
    expect(result.workspaces).toEqual([
      {
        id: "workspace_1",
        name: "Comunidade NOD",
        slug: "comunidade-nod",
        role: "owner"
      }
    ]);
    expect(result.refreshToken).toHaveLength(64);
    expect(db.users[0]?.passwordHash).not.toBe("strong-password");
    expect(db.sessions[0]?.refreshHash).not.toBe(result.refreshToken);
    expect(db.sessions[0]?.userAgent).toBe("Vitest");
    expect(db.sessions[0]?.ipAddress).toBe("127.0.0.1");
  });

  it("rejects duplicate email registration", async () => {
    const { service } = createHarness();

    await service.register({
      name: "Samuel Choairy",
      email: "samuel@wpptrack.com",
      password: "strong-password",
      workspaceName: "Comunidade NOD"
    });

    await expect(
      service.register({
        name: "Samuel",
        email: " SAMUEL@WPPTRACK.COM ",
        password: "another-password",
        workspaceName: "Outra Empresa"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("logs in with email credentials and resolves the session from refresh token", async () => {
    const { service } = createHarness();
    await service.register({
      name: "Samuel Choairy",
      email: "samuel@wpptrack.com",
      password: "strong-password",
      workspaceName: "Comunidade NOD"
    });

    const login = await service.login({
      email: "SAMUEL@WPPTRACK.COM",
      password: "strong-password"
    });
    const me = await service.getSession(login.refreshToken);

    expect(login.user.email).toBe("samuel@wpptrack.com");
    expect(me.user.email).toBe("samuel@wpptrack.com");
    expect(me.workspaces[0]?.role).toBe("owner");
  });

  it("revokes refresh sessions on logout", async () => {
    const { service } = createHarness();
    await service.register({
      name: "Samuel Choairy",
      email: "samuel@wpptrack.com",
      password: "strong-password",
      workspaceName: "Comunidade NOD"
    });
    const login = await service.login({
      email: "samuel@wpptrack.com",
      password: "strong-password"
    });

    await service.logout(login.refreshToken);

    await expect(service.getSession(login.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });
});
