import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const authenticated = {
  user: {
    id: "user_2",
    email: "admin@wpptrack.com",
    name: "Admin",
    authProvider: "email",
    emailVerifiedAt: null
  },
  workspaces: []
};

type FakePrisma = {
  workspaceMember: {
    findMany: () => Promise<never[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  workspaceInvite: {
    create: () => Promise<never>;
    findUnique: (args: { where: { tokenHash: string } }) => Promise<Record<string, unknown> | null>;
    update: (args: { data: Record<string, unknown>; where: { id: string } }) => Promise<Record<string, unknown>>;
  };
  $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};

function createHarness() {
  const now = new Date("2026-07-02T03:00:00.000Z");
  const db = {
    invites: [
      {
        id: "invite_1",
        workspaceId: "workspace_1",
        email: "admin@wpptrack.com",
        role: "admin",
        status: "pending",
        tokenHash: "placeholder",
        expiresAt: new Date("2026-07-09T03:00:00.000Z"),
        acceptedAt: null,
        createdAt: now
      }
    ],
    members: [] as Array<Record<string, unknown>>
  };
  const prisma: FakePrisma = {
    workspaceMember: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const member = {
          id: `member_${db.members.length + 1}`,
          createdAt: now,
          ...data
        };
        db.members.push(member);
        return member;
      }
    },
    workspaceInvite: {
      create: async () => {
        throw new Error("not used");
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        db.invites.find((invite) => invite.tokenHash === where.tokenHash) ?? null,
      update: async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => {
        const index = db.invites.findIndex((invite) => invite.id === where.id);
        db.invites[index] = {
          ...db.invites[index],
          ...data
        };
        return db.invites[index];
      }
    },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
      callback(prisma)
  };
  const service = new WorkspacesService(prisma as never);

  return {
    db,
    service,
    setInviteToken(token: string) {
      db.invites[0].tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");
    }
  };
}

describe("workspace invite service", () => {
  it("accepts a pending invite and creates a workspace membership", async () => {
    const { db, service, setInviteToken } = createHarness();
    setInviteToken("invite-token-1234567890");

    const result = await service.acceptInvite(authenticated, {
      token: "invite-token-1234567890"
    });

    expect(result).toEqual({
      workspaceId: "workspace_1",
      memberId: "member_1",
      role: "admin",
      status: "accepted"
    });
    expect(db.members[0]).toMatchObject({
      workspaceId: "workspace_1",
      userId: "user_2",
      role: "admin"
    });
    expect(db.invites[0]).toMatchObject({
      status: "accepted"
    });
  });
});
