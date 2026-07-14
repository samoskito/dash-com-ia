import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";

type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  authProvider: string;
  googleId: string | null;
  emailVerifiedAt: Date | null;
  platformRole: null;
  lastWorkspaceId: string | null;
};

type TokenRecord = {
  id: string;
  userId: string;
  workspaceId: string | null;
  type: "account_activation";
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

function createHarness() {
  const workspace = {
    id: "workspace_client",
    name: "Empresa Cliente",
    slug: "empresa-cliente",
    operationalStatus: "active",
  };
  const user: UserRecord = {
    id: "user_owner",
    email: "owner@empresa.com",
    name: "Owner Cliente",
    passwordHash: null,
    authProvider: "email",
    googleId: null,
    emailVerifiedAt: null,
    platformRole: null,
    lastWorkspaceId: null,
  };
  const member = {
    id: "member_owner",
    workspaceId: workspace.id,
    userId: user.id,
    role: "owner",
    canManageMembers: false,
    createdAt: new Date("2026-07-14T12:00:00.000Z"),
  };
  const db = {
    user,
    member,
    tokens: [] as TokenRecord[],
    sessions: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>,
    queuedEmails: [] as Array<any>,
  };

  const prisma: any = {
    workspaceMember: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (
          db.member.userId !== where.userId ||
          db.member.workspaceId !== where.workspaceId ||
          db.member.role !== where.role
        ) {
          return null;
        }

        return {
          user: {
            id: db.user.id,
            email: db.user.email,
            name: db.user.name,
            passwordHash: db.user.passwordHash,
          },
          workspace,
        };
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const composite = where.workspaceId_userId;

        return composite.workspaceId === db.member.workspaceId &&
          composite.userId === db.member.userId
          ? { id: db.member.id, role: db.member.role }
          : null;
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        if (where.id !== db.user.id) {
          return null;
        }

        if (!include?.memberships) {
          return { ...db.user };
        }

        return {
          ...db.user,
          memberships: [
            {
              role: db.member.role,
              canManageMembers: db.member.canManageMembers,
              workspace,
            },
          ],
        };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (
          where.id !== db.user.id ||
          (where.passwordHash === null && db.user.passwordHash !== null)
        ) {
          return { count: 0 };
        }

        Object.assign(db.user, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        if (where.id !== db.user.id) {
          throw new Error("User not found");
        }

        Object.assign(db.user, data);
        return { ...db.user };
      }),
    },
    authActionToken: {
      create: vi.fn(async ({ data }: any) => {
        const token: TokenRecord = {
          id: `token_${db.tokens.length + 1}`,
          ...data,
          usedAt: null,
          createdAt: new Date(),
        };
        db.tokens.push(token);
        return token;
      }),
      findFirst: vi.fn(async ({ where, select }: any) => {
        const token =
          db.tokens.find(
            (token) =>
              token.type === where.type &&
              token.tokenHash === where.tokenHash &&
              (where.usedAt === undefined || token.usedAt === where.usedAt) &&
              (where.expiresAt?.gt === undefined ||
                token.expiresAt.getTime() > where.expiresAt.gt.getTime()),
          ) ?? null;

        return token && select?.user
          ? { ...token, user: { passwordHash: db.user.passwordHash } }
          : token;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;

        db.tokens = db.tokens.map((token) => {
          const matches =
            (where.id === undefined || token.id === where.id) &&
            (where.userId === undefined || token.userId === where.userId) &&
            (where.workspaceId === undefined ||
              token.workspaceId === where.workspaceId) &&
            (where.type === undefined || token.type === where.type) &&
            (where.tokenHash === undefined ||
              token.tokenHash === where.tokenHash) &&
            (where.usedAt === undefined || token.usedAt === where.usedAt) &&
            (where.expiresAt?.gt === undefined ||
              token.expiresAt.getTime() > where.expiresAt.gt.getTime());

          if (!matches) {
            return token;
          }

          count += 1;
          return { ...token, ...data };
        });

        return { count };
      }),
    },
    authSession: {
      create: vi.fn(async ({ data }: any) => {
        const session = { id: `session_${db.sessions.length + 1}`, ...data };
        db.sessions.push(session);
        return session;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        db.auditLogs.push(data);
        return data;
      }),
    },
  };
  prisma.$transaction = vi.fn(async (callback: any) => callback(prisma));

  const passwordService = {
    hash: vi.fn(async () => "new-password-hash"),
    verify: vi.fn(),
  };
  const emailQueue = {
    isEnabled: vi.fn(() => true),
    enqueue: vi.fn(async (input: any) => {
      db.queuedEmails.push(input);
      return { status: "queued" };
    }),
  };
  const service = new AuthService(
    prisma,
    passwordService as never,
    { NODE_ENV: "production" },
    globalThis.fetch,
    emailQueue as never,
  );

  return { db, emailQueue, passwordService, prisma, service, workspace };
}

function activationToken(harness: ReturnType<typeof createHarness>, index = 0) {
  return harness.db.queuedEmails[index].envelope.data.token as string;
}

describe("client owner account activation", () => {
  it("stores only a hashed workspace-scoped token and queues the activation email", async () => {
    const harness = createHarness();

    const result = await harness.service.issueClientOwnerActivation({
      userId: harness.db.user.id,
      workspaceId: harness.workspace.id,
    });
    const rawToken = activationToken(harness);

    expect(result).toEqual({ mode: "activation", delivery: "email_queued" });
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(harness.db.tokens[0]).toMatchObject({
      userId: harness.db.user.id,
      workspaceId: harness.workspace.id,
      type: "account_activation",
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
    });
    expect(harness.db.tokens[0].tokenHash).not.toBe(rawToken);
    expect(harness.db.queuedEmails[0]).toMatchObject({
      workspaceId: harness.workspace.id,
      envelope: {
        template: "client_owner_activation",
        to: { address: harness.db.user.email, name: harness.db.user.name },
        data: { workspaceName: harness.workspace.name },
      },
    });
  });

  it("activates password, verification, session and bound workspace together", async () => {
    const harness = createHarness();
    await harness.service.issueClientOwnerActivation({
      userId: harness.db.user.id,
      workspaceId: harness.workspace.id,
    });
    const rawToken = activationToken(harness);

    const result = await harness.service.activateProvisionedAccount(
      { token: rawToken, password: "strong-new-password" },
      { ipAddress: "127.0.0.1", userAgent: "Vitest" },
    );

    expect(result.ok).toBe(true);
    expect(result.session.activeWorkspaceId).toBe(harness.workspace.id);
    expect(harness.db.user.passwordHash).toBe("new-password-hash");
    expect(harness.db.user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(harness.db.user.lastWorkspaceId).toBe(harness.workspace.id);
    expect(harness.db.tokens[0].usedAt).toBeInstanceOf(Date);
    expect(harness.db.sessions).toHaveLength(1);
    expect(harness.db.sessions[0]).toMatchObject({
      userId: harness.db.user.id,
      activeWorkspaceId: harness.workspace.id,
      ipAddress: "127.0.0.1",
    });
    expect(JSON.stringify(harness.db.auditLogs)).not.toContain(rawToken);
  });

  it("rotates a previous link and rejects used or superseded activation", async () => {
    const harness = createHarness();
    await harness.service.issueClientOwnerActivation({
      userId: harness.db.user.id,
      workspaceId: harness.workspace.id,
    });
    const first = activationToken(harness, 0);
    await harness.service.issueClientOwnerActivation({
      userId: harness.db.user.id,
      workspaceId: harness.workspace.id,
    });
    const second = activationToken(harness, 1);

    await expect(
      harness.service.activateProvisionedAccount({
        token: first,
        password: "strong-new-password",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      harness.service.activateProvisionedAccount({
        token: second,
        password: "strong-new-password",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      harness.service.activateProvisionedAccount({
        token: second,
        password: "another-strong-password",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects expired links and links whose owner membership was removed", async () => {
    const expired = createHarness();
    await expired.service.issueClientOwnerActivation({
      userId: expired.db.user.id,
      workspaceId: expired.workspace.id,
    });
    const expiredToken = activationToken(expired);
    expired.db.tokens[0].expiresAt = new Date("2000-01-01T00:00:00.000Z");

    await expect(
      expired.service.activateProvisionedAccount({
        token: expiredToken,
        password: "strong-new-password",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(expired.passwordService.hash).not.toHaveBeenCalled();

    const unauthorized = createHarness();
    await unauthorized.service.issueClientOwnerActivation({
      userId: unauthorized.db.user.id,
      workspaceId: unauthorized.workspace.id,
    });
    const unauthorizedToken = activationToken(unauthorized);
    unauthorized.db.member.role = "member";

    await expect(
      unauthorized.service.activateProvisionedAccount({
        token: unauthorizedToken,
        password: "strong-new-password",
      }),
    ).rejects.toMatchObject({
      message: "Link de ativacao invalido ou expirado",
    });
    expect(unauthorized.passwordService.hash).not.toHaveBeenCalled();
  });

  it("allows only one concurrent activation to create a session", async () => {
    const harness = createHarness();
    await harness.service.issueClientOwnerActivation({
      userId: harness.db.user.id,
      workspaceId: harness.workspace.id,
    });
    const token = activationToken(harness);

    const results = await Promise.allSettled([
      harness.service.activateProvisionedAccount({
        token,
        password: "strong-new-password",
      }),
      harness.service.activateProvisionedAccount({
        token,
        password: "strong-new-password",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(harness.db.sessions).toHaveLength(1);
  });
});
