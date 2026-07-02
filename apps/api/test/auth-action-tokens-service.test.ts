import { createHash } from "node:crypto";
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

type FakePrisma = {
  user: {
    findUnique: (args: { where: { email?: string; id?: string } }) => Promise<Record<string, unknown> | null>;
    update: (args: { data: Record<string, unknown>; where: { id: string } }) => Promise<Record<string, unknown>>;
  };
  authActionToken: {
    create: (args: { data: Omit<TokenRecord, "id" | "createdAt" | "usedAt"> }) => Promise<TokenRecord>;
    findFirst: (args: { where: Partial<TokenRecord> }) => Promise<TokenRecord | null>;
    update: (args: { data: Record<string, unknown>; where: { id: string } }) => Promise<TokenRecord>;
  };
  $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};

function createHarness() {
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
        memberships: []
      }
    ],
    tokens: [] as TokenRecord[]
  };
  const prisma: FakePrisma = {
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
        db.users.find(
          (user) =>
            (where.email !== undefined && user.email === where.email) ||
            (where.id !== undefined && user.id === where.id)
        ) ?? null,
      update: async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => {
        const index = db.users.findIndex((user) => user.id === where.id);
        db.users[index] = {
          ...db.users[index],
          ...data,
          updatedAt: now
        };
        return db.users[index];
      }
    },
    authActionToken: {
      create: async ({ data }: { data: Omit<TokenRecord, "id" | "createdAt" | "usedAt"> }) => {
        const token = {
          id: `token_${db.tokens.length + 1}`,
          ...data,
          usedAt: null,
          createdAt: now
        };
        db.tokens.push(token);
        return token;
      },
      findFirst: async ({ where }: { where: Partial<TokenRecord> }) =>
        db.tokens.find((token) =>
          Object.entries(where).every(([key, value]) => token[key as keyof TokenRecord] === value)
        ) ?? null,
      update: async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => {
        const index = db.tokens.findIndex((token) => token.id === where.id);
        db.tokens[index] = {
          ...db.tokens[index],
          ...data
        };
        return db.tokens[index];
      }
    },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
      callback(prisma)
  };

  return {
    db,
    service: new AuthService(prisma as never, new PasswordService(), {
      AUTH_EXPOSE_DEV_TOKENS: "true"
    }),
    hashToken(token: string) {
      return createHash("sha256").update(token).digest("hex");
    }
  };
}

describe("auth action token service", () => {
  it("creates password reset token and resets the password", async () => {
    const { db, service } = createHarness();

    const request = await service.requestPasswordReset({
      email: " USER@WPPTRACK.COM "
    });
    const result = await service.resetPassword({
      token: request.devToken!,
      password: "new-strong-password"
    });

    expect(request.ok).toBe(true);
    expect(request.devToken).toEqual(expect.any(String));
    expect(result).toEqual({ ok: true });
    expect(db.users[0].passwordHash).not.toBe("old-hash");
    expect(db.tokens[0].usedAt).toBeInstanceOf(Date);
  });

  it("creates and confirms email verification token", async () => {
    const { db, service } = createHarness();

    const request = await service.requestEmailVerificationForUser("user_1");
    const result = await service.confirmEmailVerification({
      token: request.devToken!
    });

    expect(result.ok).toBe(true);
    expect(result.emailVerifiedAt).toEqual(expect.any(String));
    expect(db.users[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(db.tokens[0].type).toBe("email_verification");
  });
});
