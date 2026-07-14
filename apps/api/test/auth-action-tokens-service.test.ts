import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { PasswordService } from "../src/auth/password.service";

type TokenRecord = {
  id: string;
  userId: string;
  type: "password_reset" | "email_verification";
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type SessionRecord = {
  id: string;
  userId: string;
  refreshHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  activeWorkspaceId: string | null;
  supportWorkspaceId: string | null;
  supportWorkspaceStartedAt: Date | null;
  createdAt: Date;
};

type AuditLogRecord = {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  actorType: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  sourceIp: string | null;
  resultStatus: string;
  beforeSummary?: unknown;
  afterSummary?: unknown;
  createdAt: Date;
};

type FakePrisma = {
  user: {
    findUnique: (args: {
      where: { email?: string; id?: string };
    }) => Promise<Record<string, unknown> | null>;
    update: (args: {
      data: Record<string, unknown>;
      where: { id: string };
    }) => Promise<Record<string, unknown>>;
  };
  authActionToken: {
    create: (args: {
      data: Omit<TokenRecord, "id" | "createdAt" | "usedAt">;
    }) => Promise<TokenRecord>;
    findFirst: (args: {
      where: Partial<TokenRecord>;
    }) => Promise<TokenRecord | null>;
    update: (args: {
      data: Record<string, unknown>;
      where: { id: string };
    }) => Promise<TokenRecord>;
    updateMany: (args: {
      data: Partial<TokenRecord>;
      where: Partial<Omit<TokenRecord, "expiresAt">> & {
        expiresAt?: { gt?: Date };
      };
    }) => Promise<{ count: number }>;
  };
  authSession: {
    updateMany: (args: {
      data: Partial<SessionRecord>;
      where: Partial<Omit<SessionRecord, "expiresAt">> & {
        expiresAt?: { gt?: Date };
      };
    }) => Promise<{ count: number }>;
  };
  auditLog: {
    create: (args: {
      data: Omit<AuditLogRecord, "id" | "createdAt">;
    }) => Promise<AuditLogRecord>;
    count: (args: unknown) => Promise<number>;
  };
  $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};

function createHarness(
  options: {
    emailEnabled?: boolean;
    env?: Record<string, string | undefined>;
  } = {},
) {
  const now = new Date("2026-07-02T03:00:00.000Z");
  const db = {
    users: [
      {
        id: "user_1",
        email: "user@wpptrack.com",
        name: "User",
        passwordHash: "old-hash",
        authProvider: "email",
        googleId: null,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
        memberships: [],
      },
    ],
    tokens: [] as TokenRecord[],
    sessions: [
      {
        id: "session_1",
        userId: "user_1",
        refreshHash: "refresh_hash_1",
        userAgent: "Vitest",
        ipAddress: "127.0.0.1",
        expiresAt: new Date("2026-08-01T03:00:00.000Z"),
        revokedAt: null,
        activeWorkspaceId: null,
        supportWorkspaceId: null,
        supportWorkspaceStartedAt: null,
        createdAt: now,
      },
    ] as SessionRecord[],
    auditLogs: [] as AuditLogRecord[],
    queuedEmails: [] as Array<Record<string, unknown>>,
  };
  const prisma: FakePrisma = {
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
      update: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const index = db.users.findIndex((user) => user.id === where.id);
        db.users[index] = {
          ...db.users[index],
          ...data,
          updatedAt: now,
        };
        return db.users[index];
      },
    },
    authActionToken: {
      create: async ({
        data,
      }: {
        data: Omit<TokenRecord, "id" | "createdAt" | "usedAt">;
      }) => {
        const token = {
          id: `token_${db.tokens.length + 1}`,
          ...data,
          usedAt: null,
          createdAt: now,
        };
        db.tokens.push(token);
        return token;
      },
      findFirst: async ({ where }: { where: Partial<TokenRecord> }) =>
        db.tokens.find((token) =>
          Object.entries(where).every(
            ([key, value]) => token[key as keyof TokenRecord] === value,
          ),
        ) ?? null,
      update: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => {
        const index = db.tokens.findIndex((token) => token.id === where.id);
        db.tokens[index] = {
          ...db.tokens[index],
          ...data,
        };
        return db.tokens[index];
      },
      updateMany: async ({ data, where }) => {
        let count = 0;

        db.tokens = db.tokens.map((token) => {
          const matches =
            (where.id === undefined || token.id === where.id) &&
            (where.userId === undefined || token.userId === where.userId) &&
            (where.type === undefined || token.type === where.type) &&
            (where.tokenHash === undefined ||
              token.tokenHash === where.tokenHash) &&
            (where.usedAt === undefined || token.usedAt === where.usedAt) &&
            (where.expiresAt?.gt === undefined ||
              token.expiresAt.getTime() > where.expiresAt.gt.getTime());

          if (matches) {
            count += 1;

            return {
              ...token,
              ...data,
            };
          }

          return token;
        });

        return { count };
      },
    },
    authSession: {
      updateMany: async ({ data, where }) => {
        let count = 0;

        db.sessions = db.sessions.map((session) => {
          const matches =
            (where.id === undefined || session.id === where.id) &&
            (where.userId === undefined || session.userId === where.userId) &&
            (where.refreshHash === undefined ||
              session.refreshHash === where.refreshHash) &&
            (where.revokedAt === undefined ||
              session.revokedAt === where.revokedAt) &&
            (where.expiresAt?.gt === undefined ||
              session.expiresAt.getTime() > where.expiresAt.gt.getTime());

          if (matches) {
            count += 1;
            return {
              ...session,
              ...data,
            };
          }

          return session;
        });

        return { count };
      },
    },
    auditLog: {
      create: async ({ data }) => {
        const auditLog = {
          id: `audit_${db.auditLogs.length + 1}`,
          ...data,
          createdAt: new Date(),
        };

        db.auditLogs.push(auditLog);
        return auditLog;
      },
      count: async (args) => {
        const { where } = args as {
          where: {
            action?: string;
            createdAt?: { gte?: Date };
            OR?: Array<{ targetId?: string; sourceIp?: string | null }>;
          };
        };

        return db.auditLogs.filter((auditLog) => {
          if (where.action && auditLog.action !== where.action) {
            return false;
          }
          if (
            where.createdAt?.gte &&
            auditLog.createdAt.getTime() < where.createdAt.gte.getTime()
          ) {
            return false;
          }
          if (where.OR?.length) {
            return where.OR.some((condition) => {
              if (
                condition.targetId !== undefined &&
                auditLog.targetId === condition.targetId
              ) {
                return true;
              }
              if (
                condition.sourceIp !== undefined &&
                auditLog.sourceIp === condition.sourceIp
              ) {
                return true;
              }

              return false;
            });
          }

          return true;
        }).length;
      },
    },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
      callback(prisma),
  };

  const emailQueue = options.emailEnabled
    ? {
        isEnabled: () => true,
        enqueue: async (input: Record<string, unknown>) => {
          db.queuedEmails.push(input);
          return { jobId: `email_${db.queuedEmails.length}` };
        },
      }
    : undefined;

  return {
    db,
    service: new AuthService(
      prisma as never,
      new PasswordService(),
      {
        AUTH_EXPOSE_DEV_TOKENS: "true",
        ...options.env,
      },
      globalThis.fetch,
      emailQueue as never,
    ),
    hashToken(token: string) {
      return createHash("sha256").update(token).digest("hex");
    },
  };
}

describe("auth action token service", () => {
  it("keeps production reset responses indistinguishable while queuing eligible email", async () => {
    const { db, service } = createHarness({
      emailEnabled: true,
      env: { NODE_ENV: "production" },
    });

    const known = await service.requestPasswordReset({
      email: "user@wpptrack.com",
    });
    const unknown = await service.requestPasswordReset({
      email: "unknown@wpptrack.com",
    });

    expect(known).toEqual({
      ok: true,
      delivery: "email_queued",
      devToken: null,
    });
    expect(unknown).toEqual(known);
    expect(db.queuedEmails).toHaveLength(1);
    expect(db.queuedEmails[0]).toMatchObject({
      action: { type: "AuthActionToken", id: "token_1" },
      envelope: {
        to: { address: "user@wpptrack.com", name: "User" },
        template: "password_reset",
      },
    });
  });

  it("creates password reset token and resets the password", async () => {
    const { db, service } = createHarness();

    const request = await service.requestPasswordReset({
      email: " USER@WPPTRACK.COM ",
    });
    const result = await service.resetPassword({
      token: request.devToken!,
      password: "new-strong-password",
    });

    expect(request.ok).toBe(true);
    expect(request.devToken).toEqual(expect.any(String));
    expect(result).toEqual({ ok: true });
    expect(db.users[0].passwordHash).not.toBe("old-hash");
    expect(db.tokens[0].usedAt).toBeInstanceOf(Date);
    expect(db.sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        actorUserId: "user_1",
        actorType: "user",
        action: "auth.password_reset_confirmed",
        targetType: "User",
        targetId: "user_1",
        resultStatus: "success",
      }),
    );
  });

  it("audits password reset requests without storing raw email", async () => {
    const { db, service } = createHarness();

    const request = await service.requestPasswordReset(
      {
        email: " USER@WPPTRACK.COM ",
      },
      {
        ipAddress: "127.0.0.1",
        userAgent: "Vitest",
      },
    );

    const audit = db.auditLogs.find(
      (auditLog) => auditLog.action === "auth.password_reset_requested",
    );

    expect(request.devToken).toEqual(expect.any(String));
    expect(audit).toMatchObject({
      actorUserId: "user_1",
      actorType: "user",
      targetType: "AuthIdentity",
      sourceIp: "127.0.0.1",
      resultStatus: "queued",
    });
    expect(audit?.targetId).not.toBe("user@wpptrack.com");
    expect(JSON.stringify(audit)).not.toContain("USER@WPPTRACK.COM");
  });

  it("invalidates previous active action tokens before issuing a new one", async () => {
    const { db, service } = createHarness();

    const first = await service.requestPasswordReset({
      email: "user@wpptrack.com",
    });
    const second = await service.requestPasswordReset({
      email: "user@wpptrack.com",
    });

    await expect(
      service.resetPassword({
        token: first.devToken!,
        password: "new-strong-password",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resetPassword({
        token: second.devToken!,
        password: "newer-strong-password",
      }),
    ).resolves.toEqual({ ok: true });
    expect(db.tokens).toHaveLength(2);
    expect(db.tokens[0].usedAt).toBeInstanceOf(Date);
    expect(db.tokens[1].usedAt).toBeInstanceOf(Date);
  });

  it("does not create unlimited password reset tokens for repeated requests", async () => {
    const { db, service } = createHarness();

    for (let index = 0; index < 3; index += 1) {
      await service.requestPasswordReset(
        {
          email: "user@wpptrack.com",
        },
        {
          ipAddress: "127.0.0.1",
        },
      );
    }

    const throttled = await service.requestPasswordReset(
      {
        email: "user@wpptrack.com",
      },
      {
        ipAddress: "127.0.0.1",
      },
    );

    expect(throttled).toEqual({
      ok: true,
      delivery: "not_configured",
      devToken: null,
    });
    expect(db.tokens).toHaveLength(3);
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        action: "auth.password_reset_requested",
        resultStatus: "rate_limited",
      }),
    );
  });

  it("creates and confirms email verification token", async () => {
    const { db, service } = createHarness();

    const request = await service.requestEmailVerificationForUser("user_1");
    const result = await service.confirmEmailVerification({
      token: request.devToken!,
    });

    expect(result.ok).toBe(true);
    expect(result.emailVerifiedAt).toEqual(expect.any(String));
    expect(db.users[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(db.tokens[0].type).toBe("email_verification");
  });

  it("queues verification email without exposing a production token", async () => {
    const { db, service } = createHarness({
      emailEnabled: true,
      env: { NODE_ENV: "production" },
    });

    const request = await service.requestEmailVerificationForUser("user_1");

    expect(request).toEqual({
      ok: true,
      delivery: "email_queued",
      devToken: null,
    });
    expect(db.queuedEmails).toHaveLength(1);
    expect(db.queuedEmails[0]).toMatchObject({
      envelope: {
        to: { address: "user@wpptrack.com", name: "User" },
        template: "email_verification",
      },
    });
  });
});
