import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

function createHarness(passwordHash: string | null) {
  const member = {
    id: "member_owner",
    createdAt: new Date("2026-07-14T12:00:00.000Z"),
    workspace: {
      id: "workspace_client",
      name: "Empresa Cliente",
    },
    user: {
      id: "user_owner",
      name: "Owner Cliente",
      email: "owner@empresa.com",
      passwordHash,
    },
  };
  const auditCreate = vi.fn(async () => ({}));
  const workspaceMemberFindFirst = vi.fn(async ({ where }: any) =>
    where.workspaceId === member.workspace.id &&
    where.userId === member.user.id &&
    where.role === "owner"
      ? member
      : null,
  );
  const prisma: any = {
    workspaceMember: { findFirst: workspaceMemberFindFirst },
    auditLog: { create: auditCreate },
  };
  const issueClientOwnerActivation = vi.fn(async () => ({
    mode: "activation" as const,
    delivery: "email_queued" as const,
  }));
  const enqueue = vi.fn(async () => ({ status: "queued" }));
  const service = new WorkspacesService(
    prisma,
    undefined,
    undefined,
    undefined,
    { issueClientOwnerActivation } as never,
    { isEnabled: () => true, enqueue } as never,
  );

  return {
    auditCreate,
    enqueue,
    issueClientOwnerActivation,
    member,
    service,
    workspaceMemberFindFirst,
  };
}

describe("client owner access resend", () => {
  it("rotates activation only for the explicitly scoped owner membership", async () => {
    const harness = createHarness(null);

    const result = await harness.service.resendClientOwnerAccess(
      harness.member.workspace.id,
      harness.member.user.id,
      "platform_owner",
    );

    expect(result).toEqual({
      ok: true,
      access: { mode: "activation", delivery: "email_queued" },
    });
    expect(harness.issueClientOwnerActivation).toHaveBeenCalledWith({
      userId: harness.member.user.id,
      workspaceId: harness.member.workspace.id,
    });
    expect(harness.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: harness.member.workspace.id,
        actorUserId: "platform_owner",
        action: "workspace.client_owner_access_resent",
        targetId: harness.member.id,
      }),
    });
  });

  it("sends an access notice instead of rotating credentials for an existing account", async () => {
    const harness = createHarness("existing-password-hash");

    const result = await harness.service.resendClientOwnerAccess(
      harness.member.workspace.id,
      harness.member.user.id,
      "platform_owner",
    );

    expect(result.access).toEqual({
      mode: "existing_account",
      delivery: "email_queued",
    });
    expect(harness.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: harness.member.workspace.id,
        action: expect.objectContaining({
          type: "WorkspaceMember",
          id: harness.member.id,
        }),
        envelope: expect.objectContaining({
          template: "workspace_access_granted",
        }),
      }),
    );
    expect(harness.issueClientOwnerActivation).not.toHaveBeenCalled();
  });

  it("does not reveal whether an owner belongs to a different workspace", async () => {
    const harness = createHarness(null);

    await expect(
      harness.service.resendClientOwnerAccess(
        "workspace_other",
        harness.member.user.id,
        "platform_owner",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.issueClientOwnerActivation).not.toHaveBeenCalled();
    expect(harness.enqueue).not.toHaveBeenCalled();
  });
});
