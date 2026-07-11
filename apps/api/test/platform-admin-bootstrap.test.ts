import { describe, expect, it } from "vitest";
import {
  bootstrapPlatformAdminUser,
  type PlatformAdminBootstrapInput
} from "../src/auth/platform-admin-bootstrap";

type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  platformRole: "platform_owner" | null;
  memberships: Array<{ workspaceId: string; role: "owner" }>;
};

function createHarness() {
  const users: UserRecord[] = [];
  const workspaces: Array<{ id: string; name: string; slug: string }> = [];
  const prisma: {
    $transaction: <T>(callback: (tx: typeof prisma) => Promise<T>) => Promise<T>;
    user: {
      findUnique: (args: unknown) => Promise<UserRecord | null>;
      create: (args: unknown) => Promise<UserRecord>;
      update: (args: unknown) => Promise<UserRecord>;
    };
    workspace: {
      findUnique: (args: unknown) => Promise<{ id: string; name: string; slug: string } | null>;
      create: (args: unknown) => Promise<{ id: string; name: string; slug: string }>;
    };
    workspaceMember: {
      create: (args: unknown) => Promise<{ id: string; workspaceId: string }>;
    }
  } = {} as never;

  prisma.$transaction = async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
    callback(prisma);
  prisma.user = {
    findUnique: async (args: unknown) => {
      const { where } = args as { where: { email: string } };
      return users.find((user) => user.email === where.email) ?? null;
    },
    create: async (args: unknown) => {
      const { data } = args as {
        data: { email: string; name: string; passwordHash: string };
      };
      const user: UserRecord = {
        id: `user_${users.length + 1}`,
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        platformRole: "platform_owner",
        memberships: []
      };
      users.push(user);

      return user;
    },
    update: async (args: unknown) => {
      const { where, data } = args as {
        where: { id: string };
        data: { name: string; passwordHash: string };
      };
      const user = users.find((candidate) => candidate.id === where.id);

      if (!user) {
        throw new Error("User not found");
      }

      user.name = data.name;
      user.passwordHash = data.passwordHash;
      user.platformRole = "platform_owner";

      return user;
    }
  };
  prisma.workspace = {
    findUnique: async (args: unknown) => {
      const { where } = args as { where: { slug: string } };
      return workspaces.find((workspace) => workspace.slug === where.slug) ?? null;
    },
    create: async (args: unknown) => {
      const { data } = args as { data: { name: string; slug: string } };
      const workspace = {
        id: `workspace_${workspaces.length + 1}`,
        name: data.name,
        slug: data.slug
      };
      workspaces.push(workspace);

      return workspace;
    }
  };
  prisma.workspaceMember = {
    create: async (args: unknown) => {
      const { data } = args as {
        data: { workspaceId: string; userId: string; role: "owner" };
      };
      const user = users.find((candidate) => candidate.id === data.userId);

      if (!user) {
        throw new Error("User not found");
      }

      user.memberships.push({
        workspaceId: data.workspaceId,
        role: data.role
      });

      return {
        id: `member_${user.memberships.length}`,
        workspaceId: data.workspaceId
      };
    }
  };
  const passwordService = {
    hash: async (password: string) => `hashed:${password}`
  };
  const input: PlatformAdminBootstrapInput = {
    email: " DONO@WPPTRACK.COM ",
    password: "strong-password",
    name: "Dono SaaS",
    workspaceName: "WppTrack Plataforma"
  };

  return { input, passwordService, prisma, users, workspaces };
}

describe("platform admin bootstrap", () => {
  it("creates a verified owner user with a platform workspace", async () => {
    const { input, passwordService, prisma, users, workspaces } = createHarness();

    const result = await bootstrapPlatformAdminUser(
      prisma as never,
      input,
      passwordService as never
    );

    expect(result).toMatchObject({
      email: "dono@wpptrack.com",
      createdUser: true,
      createdWorkspace: true
    });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: "dono@wpptrack.com",
      passwordHash: "hashed:strong-password",
      platformRole: "platform_owner",
      memberships: [{ workspaceId: "workspace_1", role: "owner" }]
    });
    expect(workspaces[0]).toMatchObject({
      name: "WppTrack Plataforma",
      slug: "wpptrack-plataforma"
    });
  });

  it("updates an existing user password without duplicating its workspace", async () => {
    const { input, passwordService, prisma, users, workspaces } = createHarness();

    await bootstrapPlatformAdminUser(prisma as never, input, passwordService as never);
    const result = await bootstrapPlatformAdminUser(
      prisma as never,
      {
        ...input,
        password: "new-strong-password",
        name: "Dono Atualizado"
      },
      passwordService as never
    );

    expect(result).toMatchObject({
      email: "dono@wpptrack.com",
      createdUser: false,
      createdWorkspace: false
    });
    expect(users).toHaveLength(1);
    expect(workspaces).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: "Dono Atualizado",
      passwordHash: "hashed:new-strong-password"
    });
  });
});
