import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ClientSwapRateLimitService } from "../src/workspaces/client-swap/client-swap-rate-limit.service";
import {
  CLIENT_SWAP_COMPLETED_ACTION,
  CLIENT_SWAP_CURSOR_DELEGATE,
  CLIENT_SWAP_RESTRICT_EDGES,
  CLIENT_SWAP_WIPE_DELEGATES,
  ClientSwapService,
  hashClientSwapIdempotencyKey,
} from "../src/workspaces/client-swap/client-swap.service";

const workspaceId = "workspace_1";
const actorUserId = "user_owner";
const memberUserId = "user_member";
const idempotencyKey = "swap-key-1";
const idempotencyKeyHash = hashClientSwapIdempotencyKey(idempotencyKey);

function createHarness(options: {
  recentSwap?: { id: string; createdAt: Date } | null;
  completedSwap?: { afterSummary: unknown } | null;
  slugCollisions?: string[];
  deleteFailures?: Partial<Record<string, Error>>;
  rateLimitStorageError?: Error;
} = {}) {
  const deleted: Record<string, number> = {};
  const remaining: Record<string, number> = {};
  const slugHits = new Set(options.slugCollisions ?? []);
  const workspace = {
    id: workspaceId,
    name: "Cliente Atual",
    slug: "cliente-atual",
    operationalStatus: "active" as const,
    members: [{ userId: actorUserId, role: "owner" }],
    subscriptions: [{ contractStatus: "active", isCurrent: true }],
  };

  const delegates = Object.fromEntries(
    CLIENT_SWAP_WIPE_DELEGATES.map((name) => {
      remaining[name] = 0;
      return [
        name,
        {
          deleteMany: vi.fn(async () => {
            if (options.deleteFailures?.[name]) {
              throw options.deleteFailures[name];
            }
            deleted[name] = (deleted[name] ?? 0) + 1;
            remaining[name] = 0;
            return { count: name === "lead" ? 3 : 1 };
          }),
          count: vi.fn(async () => remaining[name] ?? 0),
        },
      ];
    }),
  );

  const auditLogs: Array<Record<string, unknown>> = [];
  const prisma: any = {
    ...delegates,
    $executeRaw: vi.fn(async () => undefined),
    externalDataConnector: {
      ...delegates.externalDataConnector,
      findMany: vi.fn(async () => [{ id: "connector_1" }]),
    },
    workspace: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        if (where.id === workspaceId) {
          const memberFilter = include?.members?.where?.userId;
          return {
            ...workspace,
            members: memberFilter
              ? workspace.members.filter((member) => member.userId === memberFilter)
              : workspace.members,
          };
        }
        if (where.slug && slugHits.has(where.slug)) {
          return { id: "workspace_other" };
        }
        return null;
      }),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(workspace, data);
        return workspace;
      }),
    },
    workspaceMember: {
      findMany: vi.fn(async () => [
        { userId: actorUserId },
        { userId: memberUserId },
      ]),
    },
    authSession: {
      updateMany: vi.fn(async () => ({ count: 2 })),
    },
    auditLog: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where?.beforeSummary) {
          return options.completedSwap ?? null;
        }
        if (options.rateLimitStorageError) {
          throw options.rateLimitStorageError;
        }
        return options.recentSwap ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      }),
    },
  };
  prisma.$transaction = vi.fn(async (callback: any) => callback(prisma));

  const service = new ClientSwapService(
    prisma,
    new ClientSwapRateLimitService(),
  );

  return { auditLogs, deleted, prisma, service, workspace };
}

describe("client swap service", () => {
  it("wipes every camelCase delegate, audits success, and revokes all member sessions", async () => {
    const harness = createHarness();

    const result = await harness.service.swap(
      workspaceId,
      actorUserId,
      { confirm: true, newClientName: "Novo Cliente" },
      idempotencyKey,
    );

    expect(result.success).toBe(true);
    expect(result.replayed).toBeUndefined();
    expect(result.workspace.name).toBe("Novo Cliente");
    expect(result.workspace.slug).toBe("novo-cliente");

    for (const delegate of CLIENT_SWAP_WIPE_DELEGATES) {
      expect(harness.prisma[delegate].deleteMany).toHaveBeenCalledTimes(1);
      expect(result.wipedCounts[delegate]).toBeGreaterThan(0);
    }

    expect(harness.prisma.externalSyncCursor.deleteMany).toHaveBeenCalledWith({
      where: { connectorId: { in: ["connector_1"] } },
    });
    expect(harness.prisma.lead.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId },
    });

    expect(harness.prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: { in: [actorUserId, memberUserId] },
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });

    expect(harness.auditLogs).toHaveLength(1);
    expect(harness.auditLogs[0]).toMatchObject({
      action: CLIENT_SWAP_COMPLETED_ACTION,
      actorType: "user",
      actorUserId: actorUserId,
      resultStatus: "success",
      beforeSummary: { idempotencyKeyHash },
    });
    expect(JSON.stringify(harness.auditLogs[0])).not.toContain(idempotencyKey);
    expect(harness.prisma.$executeRaw).toHaveBeenCalled();
  });

  it("includes operational logs in the wipe list", () => {
    expect(CLIENT_SWAP_WIPE_DELEGATES).toEqual(
      expect.arrayContaining([
        "webhookLog",
        "integrationLog",
        "diagnosticEvent",
        "jobAttempt",
        CLIENT_SWAP_CURSOR_DELEGATE,
      ]),
    );
  });

  it("deletes Restrict children before their parents", () => {
    const sequence = [...CLIENT_SWAP_WIPE_DELEGATES];

    for (const [child, parent] of CLIENT_SWAP_RESTRICT_EDGES) {
      expect(sequence.indexOf(child)).toBeGreaterThanOrEqual(0);
      expect(sequence.indexOf(parent)).toBeGreaterThanOrEqual(0);
      expect(sequence.indexOf(child)).toBeLessThan(sequence.indexOf(parent));
    }
  });

  it("refuses confirm !== true without wiping", async () => {
    const harness = createHarness();

    await expect(
      harness.service.swap(
        workspaceId,
        actorUserId,
        { confirm: false } as never,
        idempotencyKey,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.prisma.lead.deleteMany).not.toHaveBeenCalled();
    expect(harness.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 429 when another swap exists inside the 24h window", async () => {
    const harness = createHarness({
      recentSwap: { id: "audit_recent", createdAt: new Date() },
    });

    await expect(
      harness.service.swap(
        workspaceId,
        actorUserId,
        { confirm: true },
        idempotencyKey,
      ),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({
        code: "client_swap_rate_limited",
        message: "Limite de troca de cliente atingido.",
      }),
    });
    expect(harness.prisma.lead.deleteMany).not.toHaveBeenCalled();
  });

  it("fails closed when rate-limit storage throws", async () => {
    const harness = createHarness({
      rateLimitStorageError: new Error("audit storage unavailable"),
    });

    await expect(
      harness.service.swap(
        workspaceId,
        actorUserId,
        { confirm: true },
        idempotencyKey,
      ),
    ).rejects.toThrow("Nao foi possivel concluir a troca de cliente");
    expect(harness.prisma.lead.deleteMany).not.toHaveBeenCalled();
    expect(harness.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("replays a completed idempotency key without wiping again", async () => {
    const harness = createHarness({
      completedSwap: {
        afterSummary: {
          wipedCounts: { lead: 3 },
          workspace: {
            id: workspaceId,
            name: "Novo Cliente",
            slug: "novo-cliente",
            operationalStatus: "active",
          },
        },
      },
    });

    const result = await harness.service.swap(
      workspaceId,
      actorUserId,
      { confirm: true },
      idempotencyKey,
    );

    expect(result).toEqual({
      success: true,
      replayed: true,
      wipedCounts: { lead: 3 },
      workspace: {
        id: workspaceId,
        name: "Novo Cliente",
        slug: "novo-cliente",
        operationalStatus: "active",
      },
    });
    expect(harness.prisma.lead.deleteMany).not.toHaveBeenCalled();
    expect(harness.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("aborts the transaction when a model delete fails", async () => {
    const harness = createHarness({
      deleteFailures: { lead: new Error("fk violation") },
    });

    const err = await harness.service
      .swap(workspaceId, actorUserId, { confirm: true }, idempotencyKey)
      .catch((error: unknown) => error);

    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect((err as Error).message).toBe(
      "Nao foi possivel concluir a troca de cliente",
    );
    expect((err as Error).message).not.toContain("fk violation");
    expect(harness.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("uses a deterministic unique slug suffix on collision", async () => {
    const harness = createHarness({
      slugCollisions: ["novo-cliente"],
    });

    const result = await harness.service.swap(
      workspaceId,
      actorUserId,
      { confirm: true, newClientName: "Novo Cliente" },
      idempotencyKey,
    );

    expect(result.workspace.slug).toBe("novo-cliente-2");
    expect(harness.prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: workspaceId },
      data: { name: "Novo Cliente", slug: "novo-cliente-2" },
    });
  });

  it("maps unexpected unique violations to a constant 409", async () => {
    const harness = createHarness();
    harness.prisma.workspace.update.mockRejectedValue({ code: "P2002" });

    await expect(
      harness.service.swap(
        workspaceId,
        actorUserId,
        { confirm: true, newClientName: "Novo Cliente" },
        idempotencyKey,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("stores only the idempotency key hash in audit summaries", async () => {
    const harness = createHarness();

    await harness.service.swap(
      workspaceId,
      actorUserId,
      { confirm: true },
      idempotencyKey,
    );

    const payload = JSON.stringify(harness.auditLogs);
    expect(payload).toContain(idempotencyKeyHash);
    expect(payload).not.toContain(idempotencyKey);
    expect(payload.toLowerCase()).not.toContain("password");
  });

  it("throws when leftover rows remain after deleteMany", async () => {
    const harness = createHarness();
    harness.prisma.lead.count.mockResolvedValue(1);

    await expect(
      harness.service.swap(
        workspaceId,
        actorUserId,
        { confirm: true },
        idempotencyKey,
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(harness.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("audits platform_admin and skips membership when actorType is platform_admin", async () => {
    const harness = createHarness();
    const platformOwnerId = "user_platform_owner";

    const result = await harness.service.swap(
      workspaceId,
      platformOwnerId,
      { confirm: true },
      idempotencyKey,
      "platform_admin",
    );

    expect(result.success).toBe(true);
    expect(harness.auditLogs).toHaveLength(1);
    expect(harness.auditLogs[0]).toMatchObject({
      action: CLIENT_SWAP_COMPLETED_ACTION,
      actorType: "platform_admin",
      actorUserId: platformOwnerId,
    });
    expect(harness.prisma.lead.deleteMany).toHaveBeenCalled();
  });
});
