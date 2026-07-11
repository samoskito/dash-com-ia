import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";

describe("platform user management", () => {
  it("creates an internal operator without returning or auditing its password", async () => {
    const auditCreate = vi.fn(async (_args: unknown) => ({}));
    const userCreate = vi.fn(async ({ data }: any) => ({
      id: "operator_1",
      name: data.name,
      email: data.email,
      platformRole: data.platformRole,
      createdAt: new Date("2026-07-11T18:00:00.000Z")
    }));
    const service = new AuthService(
      {
        user: {
          findUnique: vi.fn(async () => null),
          create: userCreate
        },
        auditLog: { create: auditCreate }
      } as never,
      { hash: vi.fn(async () => "hashed-password") } as never,
      {}
    );

    const result = await service.provisionPlatformUser(
      {
        name: "Operador",
        email: "operador@wpptrack.com",
        password: "temporary-strong-password",
        role: "platform_operator"
      },
      "platform_owner"
    );

    expect(result).toMatchObject({
      id: "operator_1",
      role: "platform_operator"
    });
    expect(userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        passwordHash: "hashed-password",
        platformRole: "platform_operator"
      })
    });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(
      "temporary-strong-password"
    );
  });

  it("does not let the platform owner remove their own global authority", async () => {
    const service = new AuthService(
      {
        user: {
          findUnique: vi.fn(async () => ({
            id: "platform_owner",
            name: "Owner",
            email: "owner@wpptrack.com",
            platformRole: "platform_owner",
            createdAt: new Date("2026-07-11T18:00:00.000Z")
          }))
        }
      } as never,
      {} as never,
      {}
    );

    await expect(
      service.updatePlatformUserRole(
        "platform_owner",
        { role: "platform_operator" },
        "platform_owner"
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
