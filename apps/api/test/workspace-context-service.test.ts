import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "../src/auth/session.types";
import { WorkspaceContextService } from "../src/workspaces/workspace-context.service";

function authenticated(
  overrides: Partial<AuthenticatedUser> = {}
): AuthenticatedUser {
  return {
    user: {
      id: "user_1",
      email: "member@wpptrack.com",
      name: "Member",
      authProvider: "email",
      emailVerifiedAt: null,
      platformRole: null
    },
    activeWorkspaceId: "workspace_b",
    workspaces: [
      {
        id: "workspace_a",
        name: "Empresa A",
        slug: "empresa-a",
        role: "member",
        operationalStatus: "active"
      },
      {
        id: "workspace_b",
        name: "Empresa B",
        slug: "empresa-b",
        role: "admin",
        operationalStatus: "active"
      }
    ],
    supportContext: null,
    ...overrides
  };
}

describe("WorkspaceContextService", () => {
  const service = new WorkspaceContextService();

  it("resolves the exact active membership for a multi-workspace user", () => {
    const current = service.getCurrentWorkspace(authenticated());

    expect(current).toMatchObject({
      id: "workspace_b",
      role: "admin",
      accessMode: "member"
    });
  });

  it("does not guess a workspace when a multi-workspace session has no active id", () => {
    expect(() =>
      service.getCurrentWorkspace(authenticated({ activeWorkspaceId: null }))
    ).toThrow(NotFoundException);
  });

  it("lists only real memberships and keeps platform support separate", () => {
    const session = authenticated({
      supportContext: {
        workspaceId: "workspace_customer",
        workspaceName: "Cliente em suporte",
        workspaceSlug: "cliente-suporte",
        operationalStatus: "active",
        startedAt: "2026-07-14T12:00:00.000Z"
      }
    });

    expect(
      service.listMemberships(session).map((workspace) => workspace.id)
    ).toEqual(["workspace_a", "workspace_b"]);
    expect(service.getCurrentWorkspace(session)).toMatchObject({
      id: "workspace_customer",
      accessMode: "platform_support"
    });
  });
});
