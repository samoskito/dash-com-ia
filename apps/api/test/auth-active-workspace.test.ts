import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";

function liveSession() {
  return {
    id: "session_1",
    userId: "user_1",
    activeWorkspaceId: "workspace_a",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000)
  };
}

describe("active workspace session context", () => {
  it("persists a workspace only when the user has a membership", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const auditCreate = vi.fn(async () => ({ id: "audit_1" }));
    const prisma = {
      authSession: {
        findUnique: vi.fn(async () => liveSession()),
        updateMany
      },
      workspaceMember: {
        findUnique: vi.fn(async () => ({ workspaceId: "workspace_b" }))
      },
      auditLog: { create: auditCreate }
    };
    const service = new AuthService(prisma as never, {} as never, {});

    await service.setActiveWorkspace("refresh-token", "workspace_b");

    expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: {
          workspaceId: "workspace_b",
          userId: "user_1"
        }
      },
      select: { workspaceId: true }
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "session_1", userId: "user_1" }),
        data: { activeWorkspaceId: "workspace_b" }
      })
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_b",
        actorUserId: "user_1",
        action: "workspace.active_changed",
        targetId: "workspace_b"
      })
    });
  });

  it("updates only the current session when the same user has two sessions", async () => {
    const findSession = vi
      .fn()
      .mockResolvedValueOnce({ ...liveSession(), id: "session_a" })
      .mockResolvedValueOnce({ ...liveSession(), id: "session_b" });
    const updates: Array<{ id: string; activeWorkspaceId: string }> = [];
    const prisma = {
      authSession: {
        findUnique: findSession,
        updateMany: vi.fn(async ({ where, data }) => {
          updates.push({
            id: where.id,
            activeWorkspaceId: data.activeWorkspaceId
          });
          return { count: 1 };
        })
      },
      workspaceMember: {
        findUnique: vi.fn(async ({ where }) => ({
          workspaceId: where.workspaceId_userId.workspaceId
        }))
      }
    };
    const service = new AuthService(prisma as never, {} as never, {});

    await service.setActiveWorkspace("refresh-token-a", "workspace_b");
    await service.setActiveWorkspace("refresh-token-b", "workspace_a");

    expect(updates).toEqual([
      { id: "session_a", activeWorkspaceId: "workspace_b" },
      { id: "session_b", activeWorkspaceId: "workspace_a" }
    ]);
  });

  it("clears customer and support context when logging out", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      authSession: {
        findUnique: vi.fn(async () => ({
          ...liveSession(),
          supportWorkspaceId: "workspace_support",
          supportWorkspaceStartedAt: new Date(),
          supportWorkspace: null,
          user: {
            id: "user_1",
            email: "member@wpptrack.com",
            name: "Member",
            passwordHash: "hash",
            memberships: [
              {
                role: "member",
                workspace: {
                  id: "workspace_a",
                  name: "Empresa A",
                  slug: "empresa-a",
                  operationalStatus: "active"
                }
              }
            ]
          }
        })),
        updateMany
      }
    };
    const service = new AuthService(prisma as never, {} as never, {});

    await service.logout("refresh-token");

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        refreshHash: expect.any(String),
        revokedAt: null
      },
      data: {
        revokedAt: expect.any(Date),
        activeWorkspaceId: null,
        supportWorkspaceId: null,
        supportWorkspaceStartedAt: null
      }
    });
  });

  it("returns the same generic response for unknown and unauthorized workspaces", async () => {
    const prisma = {
      authSession: {
        findUnique: vi.fn(async () => liveSession())
      },
      workspaceMember: {
        findUnique: vi.fn(async () => null)
      }
    };
    const service = new AuthService(prisma as never, {} as never, {});

    const responses: unknown[] = [];

    for (const workspaceId of ["workspace_secret", "workspace_missing"]) {
      try {
        await service.setActiveWorkspace("refresh-token", workspaceId);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        responses.push((error as NotFoundException).getResponse());
      }
    }

    expect(responses).toEqual([
      {
        statusCode: 404,
        message: "Workspace nao encontrado",
        error: "Not Found"
      },
      {
        statusCode: 404,
        message: "Workspace nao encontrado",
        error: "Not Found"
      }
    ]);
  });

  it("rejects an expired session before checking workspace membership", async () => {
    const membershipLookup = vi.fn();
    const prisma = {
      authSession: {
        findUnique: vi.fn(async () => ({
          ...liveSession(),
          expiresAt: new Date(Date.now() - 1)
        }))
      },
      workspaceMember: { findUnique: membershipLookup }
    };
    const service = new AuthService(prisma as never, {} as never, {});

    await expect(
      service.setActiveWorkspace("refresh-token", "workspace_b")
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(membershipLookup).not.toHaveBeenCalled();
  });

  it("re-resolves a removed active membership on the next session read", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      authSession: {
        findUnique: vi.fn(async () => ({
          ...liveSession(),
          activeWorkspaceId: "workspace_removed",
          supportWorkspace: null,
          supportWorkspaceStartedAt: null,
          user: {
            id: "user_1",
            email: "member@wpptrack.com",
            name: "Member",
            passwordHash: "hash",
            authProvider: "email",
            emailVerifiedAt: null,
            platformRole: null,
            memberships: [
              {
                role: "member",
                workspace: {
                  id: "workspace_a",
                  name: "Empresa A",
                  slug: "empresa-a",
                  operationalStatus: "active"
                }
              }
            ]
          }
        })),
        updateMany
      }
    };
    const service = new AuthService(prisma as never, {} as never, {});

    const session = await service.getSession("refresh-token");

    expect(session.activeWorkspaceId).toBe("workspace_a");
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "session_1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) }
      },
      data: { activeWorkspaceId: "workspace_a" }
    });
  });

  it("does not silently choose the first membership for a multi-workspace session", async () => {
    const prisma = {
      authSession: {
        findUnique: vi.fn(async () => ({
          ...liveSession(),
          activeWorkspaceId: null,
          supportWorkspace: null,
          supportWorkspaceStartedAt: null,
          user: {
            id: "user_1",
            email: "member@wpptrack.com",
            name: "Member",
            passwordHash: "hash",
            memberships: [
              {
                role: "member",
                workspace: {
                  id: "workspace_a",
                  name: "Empresa A",
                  slug: "empresa-a",
                  operationalStatus: "active"
                }
              },
              {
                role: "admin",
                workspace: {
                  id: "workspace_b",
                  name: "Empresa B",
                  slug: "empresa-b",
                  operationalStatus: "active"
                }
              }
            ]
          }
        })),
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };
    const service = new AuthService(prisma as never, {} as never, {});

    const session = await service.getSession("refresh-token");

    expect(session.activeWorkspaceId).toBeNull();
  });
});
