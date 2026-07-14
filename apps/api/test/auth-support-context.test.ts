import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";

function sessionRecord(platformRole: "platform_owner" | null) {
  return {
    id: "session_1",
    activeWorkspaceId: "workspace_platform",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    supportWorkspaceStartedAt: new Date("2026-07-11T18:00:00.000Z"),
    supportWorkspace: {
      id: "workspace_barbieri",
      name: "Barbieri",
      slug: "barbieri",
      operationalStatus: "active"
    },
    user: {
      id: "user_1",
      email: "owner@wpptrack.com",
      name: "Owner",
      passwordHash: "hash",
      authProvider: "email",
      emailVerifiedAt: new Date(),
      platformRole,
      memberships: [
        {
          role: "owner",
          workspace: {
            id: "workspace_platform",
            name: "WppTrack Plataforma",
            slug: "wpptrack-plataforma",
            operationalStatus: "active"
          }
        }
      ]
    }
  };
}

describe("auth support workspace context", () => {
  it("keeps support context separate from real workspace memberships", async () => {
    const prisma = {
      authSession: {
        findUnique: vi.fn(async () => sessionRecord("platform_owner"))
      }
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {}
    );

    const authenticated = await service.getSession("refresh-token");

    expect(authenticated.user.platformRole).toBe("platform_owner");
    expect(authenticated.activeWorkspaceId).toBe("workspace_platform");
    expect(authenticated.workspaces.map((workspace) => workspace.id)).toEqual([
      "workspace_platform"
    ]);
    expect(authenticated.supportContext).toEqual({
      workspaceId: "workspace_barbieri",
      workspaceName: "Barbieri",
      workspaceSlug: "barbieri",
      operationalStatus: "active",
      startedAt: "2026-07-11T18:00:00.000Z"
    });
  });

  it("ignores a support workspace stored for a customer user", async () => {
    const prisma = {
      authSession: {
        findUnique: vi.fn(async () => sessionRecord(null))
      }
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {}
    );

    const authenticated = await service.getSession("refresh-token");

    expect(authenticated.user.platformRole).toBeNull();
    expect(authenticated.activeWorkspaceId).toBe("workspace_platform");
    expect(authenticated.workspaces.map((workspace) => workspace.id)).toEqual([
      "workspace_platform"
    ]);
    expect(authenticated.supportContext).toBeNull();
  });

  it("updates only a live authentication session", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const service = new AuthService(
      { authSession: { updateMany } } as never,
      {} as never,
      {}
    );

    await service.setSupportWorkspace("refresh-token", "workspace_barbieri");

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        refreshHash: expect.any(String),
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) }
      },
      data: {
        supportWorkspaceId: "workspace_barbieri",
        supportWorkspaceStartedAt: expect.any(Date)
      }
    });
  });
});
