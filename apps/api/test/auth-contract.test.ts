import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { PasswordService } from "../src/auth/password.service";
import type { AuthenticatedUser } from "../src/auth/session.types";

describe("auth contracts", () => {
  it("hashes and verifies passwords", async () => {
    const passwordService = new PasswordService();

    const hash = await passwordService.hash("secret123");

    expect(hash).not.toBe("secret123");
    await expect(passwordService.verify("secret123", hash)).resolves.toBe(true);
    await expect(passwordService.verify("wrong-password", hash)).resolves.toBe(
      false
    );
  });

  it("rejects invalid email login credentials without a database connection", async () => {
    const passwordService = new PasswordService();
    const hash = await passwordService.hash("secret123");
    const prisma = {
      user: {
        findUnique: async () => ({
          id: "user_1",
          email: "owner@wpptrack.com",
          name: "Owner",
          passwordHash: hash,
          authProvider: "email",
          googleId: null,
          emailVerifiedAt: null,
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
          memberships: []
        })
      }
    };
    const authService = new AuthService(prisma as never, passwordService);

    await expect(
      authService.validateEmailLogin({
        email: "OWNER@WPPTRACK.COM",
        password: "wrong-password"
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns authenticated user and workspace memberships", async () => {
    const passwordService = new PasswordService();
    const hash = await passwordService.hash("secret123");
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { email: string } }) => {
          expect(where.email).toBe("owner@wpptrack.com");

          return {
            id: "user_1",
            email: "owner@wpptrack.com",
            name: "Owner",
            passwordHash: hash,
            authProvider: "email",
            googleId: null,
            emailVerifiedAt: null,
            createdAt: new Date("2026-07-01T00:00:00.000Z"),
            updatedAt: new Date("2026-07-01T00:00:00.000Z"),
            memberships: [
              {
                id: "membership_1",
                role: "owner",
                workspace: {
                  id: "workspace_1",
                  name: "WppTrack",
                  slug: "wpptrack"
                }
              }
            ]
          };
        }
      }
    };
    const authService = new AuthService(prisma as never, passwordService);

    const result: AuthenticatedUser = await authService.validateEmailLogin({
      email: " OWNER@WPPTRACK.COM ",
      password: "secret123"
    });

    expect(result.user.email).toBe("owner@wpptrack.com");
    expect(result.workspaces).toEqual([
      {
        id: "workspace_1",
        name: "WppTrack",
        slug: "wpptrack",
        role: "owner"
      }
    ]);
  });
});
