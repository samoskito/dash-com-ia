import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

type ExistingUser = {
  id: string;
  name: string | null;
  email: string;
};

function createHarness({
  existingUser = null,
  ownerMembershipExists = false
}: {
  existingUser?: ExistingUser | null;
  ownerMembershipExists?: boolean;
} = {}) {
  let workspaceSequence = 0;
  const auditCreate = vi.fn(async (_args: unknown) => ({}));
  const workspaceCreate = vi.fn(async ({ data }: any) => {
    workspaceSequence += 1;

    return {
      id: `workspace_${workspaceSequence}`,
      name: data.name,
      slug: data.slug,
      operationalStatus: "active",
      createdAt: new Date("2026-07-11T18:00:00.000Z")
    };
  });
  const userCreate = vi.fn(async ({ data }: any) => ({
    id: "user_cliente",
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    createdAt: new Date("2026-07-11T18:00:00.000Z")
  }));
  const workspaceMemberCreate = vi.fn(async () => ({ id: "member_owner" }));
  const workspaceMemberFindFirst = vi.fn(async () =>
    ownerMembershipExists ? { id: "member_existing_owner" } : null
  );
  const prisma: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) =>
        existingUser && where.email === existingUser.email ? existingUser : null
      ),
      create: userCreate
    },
    workspace: {
      findUnique: vi.fn(async () => null),
      create: workspaceCreate
    },
    workspaceMember: {
      findFirst: workspaceMemberFindFirst,
      create: workspaceMemberCreate
    },
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
    workspaceMemberCreate,
    workspaceMemberFindFirst
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
      workspace: { id: "workspace_1", slug: "barbieri" },
      owner: { id: "user_cliente", role: "owner" }
    });
    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
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
        workspaceId: "workspace_1",
        userId: "user_cliente",
        role: "owner"
      }
    });
    const auditPayload = harness.auditCreate.mock.calls[0]?.[0];
    expect(JSON.stringify(auditPayload)).not.toContain(
      "temporary-strong-password"
    );
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("requires an initial password only when the email is new", async () => {
    const harness = createHarness();

    await expect(
      harness.service.provisionClientWorkspace(
        {
          workspaceName: "Empresa Nova",
          ownerName: "Novo Responsavel",
          ownerEmail: "novo@empresa.com"
        },
        "platform_owner"
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.workspaceCreate).not.toHaveBeenCalled();
  });

  it("reuses an existing identity without changing name, provider or password", async () => {
    const existingUser = {
      id: "user_existing",
      name: "Responsavel Existente",
      email: "cliente@barbieri.com.br"
    };
    const harness = createHarness({ existingUser });

    const result = await harness.service.provisionClientWorkspace(
      {
        workspaceName: "Nova Empresa",
        ownerName: "Nome que nao deve substituir",
        ownerEmail: existingUser.email,
        ownerPassword: "replacement-password"
      },
      "platform_owner"
    );

    expect(result.owner).toEqual({
      ...existingUser,
      role: "owner"
    });
    expect(harness.passwordService.hash).not.toHaveBeenCalled();
    expect(harness.userCreate).not.toHaveBeenCalled();
    expect(harness.workspaceMemberCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        userId: "user_existing",
        role: "owner"
      }
    });
    expect(harness.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        afterSummary: expect.objectContaining({
          ownerUserId: "user_existing",
          reusedExistingUser: true
        })
      })
    });
  });

  it("allows one existing platform identity to own several customer workspaces", async () => {
    const existingUser = {
      id: "user_multi_company",
      name: "Gestor Multiempresa",
      email: "gestor@grupo.com"
    };
    const harness = createHarness({ existingUser });

    await harness.service.provisionClientWorkspace(
      {
        workspaceName: "Empresa A",
        ownerName: existingUser.name,
        ownerEmail: existingUser.email
      },
      "platform_owner"
    );
    await harness.service.provisionClientWorkspace(
      {
        workspaceName: "Empresa B",
        ownerName: existingUser.name,
        ownerEmail: existingUser.email
      },
      "platform_owner"
    );

    expect(harness.userCreate).not.toHaveBeenCalled();
    expect(harness.workspaceMemberCreate).toHaveBeenNthCalledWith(1, {
      data: {
        workspaceId: "workspace_1",
        userId: existingUser.id,
        role: "owner"
      }
    });
    expect(harness.workspaceMemberCreate).toHaveBeenNthCalledWith(2, {
      data: {
        workspaceId: "workspace_2",
        userId: existingUser.id,
        role: "owner"
      }
    });
  });

  it("rejects a second owner membership inside the provisioning transaction", async () => {
    const harness = createHarness({ ownerMembershipExists: true });

    await expect(
      harness.service.provisionClientWorkspace(
        {
          workspaceName: "Empresa com Owner",
          ownerName: "Novo Responsavel",
          ownerEmail: "owner@empresa.com",
          ownerPassword: "temporary-strong-password"
        },
        "platform_owner"
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.workspaceMemberCreate).not.toHaveBeenCalled();
  });
});
