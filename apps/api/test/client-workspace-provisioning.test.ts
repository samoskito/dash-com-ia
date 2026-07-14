import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

type ExistingUser = {
  id: string;
  name: string | null;
  email: string;
  passwordHash: string | null;
};

function createHarness({
  existingUser = null,
  ownerMembershipExists = false,
  activationDelivery = {
    mode: "activation" as const,
    delivery: "email_queued" as const
  }
}: {
  existingUser?: ExistingUser | null;
  ownerMembershipExists?: boolean;
  activationDelivery?: {
    mode: "activation";
    delivery: "email_queued" | "failed" | "not_configured";
  };
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
    emailVerifiedAt: data.emailVerifiedAt,
    createdAt: new Date("2026-07-11T18:00:00.000Z")
  }));
  const workspaceMemberCreate = vi.fn(async () => ({
    id: "member_owner",
    createdAt: new Date("2026-07-11T18:00:00.000Z")
  }));
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
  const issueClientOwnerActivation = vi.fn(async () => activationDelivery);
  const authService = { issueClientOwnerActivation };
  const enqueue = vi.fn(async () => ({ status: "queued" }));
  const emailQueue = {
    isEnabled: vi.fn(() => true),
    enqueue
  };

  return {
    auditCreate,
    authService,
    emailQueue,
    enqueue,
    issueClientOwnerActivation,
    passwordService,
    prisma,
    service: new WorkspacesService(
      prisma,
      passwordService as never,
      undefined,
      undefined,
      authService as never,
      emailQueue as never
    ),
    userCreate,
    workspaceCreate,
    workspaceMemberCreate,
    workspaceMemberFindFirst
  };
}

describe("client workspace provisioning", () => {
  it("creates an unverified owner and queues a one-time activation without an initial password", async () => {
    const harness = createHarness();

    const result = await harness.service.provisionClientWorkspace(
      {
        workspaceName: "Barbieri",
        ownerName: "Cliente Barbieri",
        ownerEmail: "cliente@barbieri.com.br"
      },
      "platform_owner"
    );

    expect(result).toMatchObject({
      workspace: { id: "workspace_1", slug: "barbieri" },
      owner: { id: "user_cliente", role: "owner" },
      access: { mode: "activation", delivery: "email_queued" }
    });
    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
    expect(harness.passwordService.hash).not.toHaveBeenCalled();
    expect(harness.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        passwordHash: null,
        emailVerifiedAt: null
      })
    });
    expect(harness.workspaceMemberCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        userId: "user_cliente",
        role: "owner"
      }
    });
    expect(harness.issueClientOwnerActivation).toHaveBeenCalledWith({
      userId: "user_cliente",
      workspaceId: "workspace_1"
    });
    expect(JSON.stringify(harness.auditCreate.mock.calls)).not.toContain("cliente@barbieri.com.br");
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("keeps a provisioned workspace available when activation delivery fails", async () => {
    const harness = createHarness({
      activationDelivery: { mode: "activation", delivery: "failed" }
    });

    const result = await harness.service.provisionClientWorkspace(
      {
        workspaceName: "Empresa Nova",
        ownerName: "Novo Responsavel",
        ownerEmail: "novo@empresa.com"
      },
      "platform_owner"
    );

    expect(result.access).toEqual({ mode: "activation", delivery: "failed" });
    expect(harness.workspaceCreate).toHaveBeenCalledOnce();
    expect(harness.workspaceMemberCreate).toHaveBeenCalledOnce();
  });

  it("reuses an existing identity and sends a notice without changing credentials", async () => {
    const existingUser = {
      id: "user_existing",
      name: "Responsavel Existente",
      email: "cliente@barbieri.com.br",
      passwordHash: "existing-password-hash"
    };
    const harness = createHarness({ existingUser });

    const result = await harness.service.provisionClientWorkspace(
      {
        workspaceName: "Nova Empresa",
        ownerName: "Nome que nao deve substituir",
        ownerEmail: existingUser.email
      },
      "platform_owner"
    );

    expect(result.owner).toEqual({
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      role: "owner"
    });
    expect(result.access).toEqual({
      mode: "existing_account",
      delivery: "email_queued"
    });
    expect(harness.passwordService.hash).not.toHaveBeenCalled();
    expect(harness.userCreate).not.toHaveBeenCalled();
    expect(harness.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        action: expect.objectContaining({
          type: "WorkspaceMember",
          id: "member_owner"
        }),
        envelope: expect.objectContaining({
          template: "workspace_access_granted",
          to: { address: existingUser.email, name: existingUser.name }
        })
      })
    );
    expect(harness.issueClientOwnerActivation).not.toHaveBeenCalled();
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
      email: "gestor@grupo.com",
      passwordHash: "existing-password-hash"
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
    expect(harness.enqueue).toHaveBeenCalledTimes(2);
  });

  it("rejects a second owner membership inside the provisioning transaction", async () => {
    const harness = createHarness({ ownerMembershipExists: true });

    await expect(
      harness.service.provisionClientWorkspace(
        {
          workspaceName: "Empresa com Owner",
          ownerName: "Novo Responsavel",
          ownerEmail: "owner@empresa.com"
        },
        "platform_owner"
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.workspaceMemberCreate).not.toHaveBeenCalled();
  });
});
