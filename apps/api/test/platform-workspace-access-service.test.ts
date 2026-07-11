import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlatformWorkspaceAccessService } from "../src/workspaces/platform-workspace-access.service";

describe("platform workspace access service", () => {
  it("stores support access in the current session and audits it", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const authService = {
      setSupportWorkspace: vi.fn(async () => undefined),
      getSession: vi.fn()
    };
    const prisma = {
      workspace: {
        findUnique: vi.fn(async () => ({
          id: "workspace_barbieri",
          name: "Barbieri",
          slug: "barbieri"
        }))
      },
      auditLog: { create: auditCreate }
    };
    const service = new PlatformWorkspaceAccessService(
      prisma as never,
      authService as never
    );

    const result = await service.start("refresh", "workspace_barbieri", {
      id: "platform_owner",
      email: "owner@wpptrack.com",
      role: "platform_owner"
    });

    expect(result).toMatchObject({
      workspaceId: "workspace_barbieri",
      workspaceName: "Barbieri"
    });
    expect(authService.setSupportWorkspace).toHaveBeenCalledWith(
      "refresh",
      "workspace_barbieri"
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "platform_support.started",
        actorUserId: "platform_owner",
        workspaceId: "workspace_barbieri"
      })
    });
  });

  it("does not create support access for a missing workspace", async () => {
    const authService = { setSupportWorkspace: vi.fn() };
    const service = new PlatformWorkspaceAccessService(
      {
        workspace: { findUnique: vi.fn(async () => null) },
        auditLog: { create: vi.fn() }
      } as never,
      authService as never
    );

    await expect(
      service.start("refresh", "missing", {
        id: "platform_owner",
        email: "owner@wpptrack.com",
        role: "platform_owner"
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(authService.setSupportWorkspace).not.toHaveBeenCalled();
  });

  it("clears the support workspace and audits the previous context", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const authService = {
      getSession: vi.fn(async () => ({
        user: { id: "platform_owner" },
        workspaces: [],
        supportContext: {
          workspaceId: "workspace_barbieri",
          workspaceName: "Barbieri",
          workspaceSlug: "barbieri",
          startedAt: "2026-07-11T18:00:00.000Z"
        }
      })),
      setSupportWorkspace: vi.fn(async () => undefined)
    };
    const service = new PlatformWorkspaceAccessService(
      {
        workspace: { findUnique: vi.fn() },
        auditLog: { create: auditCreate }
      } as never,
      authService as never
    );

    await expect(
      service.stop("refresh", {
        id: "platform_owner",
        email: "owner@wpptrack.com",
        role: "platform_owner"
      })
    ).resolves.toEqual({ ok: true });
    expect(authService.setSupportWorkspace).toHaveBeenCalledWith("refresh", null);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "platform_support.ended" })
    });
  });
});
