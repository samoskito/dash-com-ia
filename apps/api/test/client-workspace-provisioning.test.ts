import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

function createHarness(existingEmail: string | null = null) {
  const auditCreate = vi.fn(async (_args: unknown) => ({}));
  const workspaceCreate = vi.fn(async ({ data }: any) => ({
    id: "workspace_barbieri",
    name: data.name,
    slug: data.slug,
    operationalStatus: "active",
    createdAt: new Date("2026-07-11T18:00:00.000Z")
  }));
  const userCreate = vi.fn(async ({ data }: any) => ({
    id: "user_cliente",
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    createdAt: new Date("2026-07-11T18:00:00.000Z")
  }));
  const workspaceMemberCreate = vi.fn(async () => ({ id: "member_owner" }));
  const prisma: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) =>
        existingEmail && where.email === existingEmail ? { id: "existing" } : null
      ),
      create: userCreate
    },
    workspace: {
      findUnique: vi.fn(async () => null),
      create: workspaceCreate
    },
    workspaceMember: { create: workspaceMemberCreate },
    auditLog: { create: auditCreate }
  };
  prisma.$transaction = vi.fn(async (callback: any) => callback(prisma));
  const passwordService = {
    hash: vi.fn(async () => "hashed-client-password")
  };

  return {
    auditCreate,
    passwordService,
    prisma,
    service: new WorkspacesService(prisma, passwordService as never),
    userCreate,
    workspaceCreate,
    workspaceMemberCreate
  };
}

describe("client workspace provisioning", () => {
  it("creates workspace, verified owner and audit atomically without exposing passwords", async () => {
    const harness = createHarness();

    const result = await harness.service.provisionClientWorkspace(
      {
        workspaceName: "Barbieri",
        ownerName: "Cliente Barbieri",
        ownerEmail: "cliente@barbieri.com.br",
        ownerPassword: "temporary-strong-password"
      },
      "platform_owner"
    );

    expect(result).toMatchObject({
      workspace: { id: "workspace_barbieri", slug: "barbieri" },
      owner: { id: "user_cliente", role: "owner" }
    });
    expect(harness.passwordService.hash).toHaveBeenCalledWith(
      "temporary-strong-password"
    );
    expect(harness.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        passwordHash: "hashed-client-password",
        emailVerifiedAt: expect.any(Date)
      })
    });
    expect(harness.workspaceMemberCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_barbieri",
        userId: "user_cliente",
        role: "owner"
      }
    });
    const auditPayload = harness.auditCreate.mock.calls[0]?.[0];
    expect(JSON.stringify(auditPayload)).not.toContain("temporary-strong-password");
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("rejects an owner email already registered before creating a workspace", async () => {
    const harness = createHarness("cliente@barbieri.com.br");

    await expect(
      harness.service.provisionClientWorkspace(
        {
          workspaceName: "Barbieri",
          ownerName: "Cliente Barbieri",
          ownerEmail: "cliente@barbieri.com.br",
          ownerPassword: "temporary-strong-password"
        },
        "platform_owner"
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.workspaceCreate).not.toHaveBeenCalled();
  });
});
