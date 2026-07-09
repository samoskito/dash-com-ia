import type { WorkspaceRole } from "@prisma/client";
import { PasswordService } from "./password.service";

type BootstrapUser = {
  id: string;
  email: string;
  memberships?: Array<{
    workspaceId: string;
    role: WorkspaceRole;
  }>;
};

type BootstrapPrisma = {
  $transaction: <T>(callback: (tx: BootstrapPrisma) => Promise<T>) => Promise<T>;
  user: {
    findUnique: (args: unknown) => Promise<BootstrapUser | null>;
    create: (args: unknown) => Promise<BootstrapUser>;
    update: (args: unknown) => Promise<BootstrapUser>;
  };
  workspace: {
    findUnique: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<{ id: string; name: string; slug: string }>;
  };
  workspaceMember: {
    create: (args: unknown) => Promise<{ id: string; workspaceId: string }>;
  };
};

export type PlatformAdminBootstrapInput = {
  email: string;
  password: string;
  name: string;
  workspaceName?: string;
};

export type PlatformAdminBootstrapResult = {
  email: string;
  userId: string;
  workspaceId: string;
  createdUser: boolean;
  createdWorkspace: boolean;
};

export async function bootstrapPlatformAdminUser(
  prisma: BootstrapPrisma,
  input: PlatformAdminBootstrapInput,
  passwordService = new PasswordService()
): Promise<PlatformAdminBootstrapResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const workspaceName = (input.workspaceName ?? "WppTrack Plataforma").trim();

  if (!email || input.password.length < 8 || name.length < 2) {
    throw new Error("Informe email valido, senha com 8+ caracteres e nome.");
  }

  const passwordHash = await passwordService.hash(input.password);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      include: { memberships: true }
    });

    if (existing) {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          authProvider: "email",
          emailVerifiedAt: new Date()
        },
        include: { memberships: true }
      });
      const membership = updated.memberships?.[0] ?? existing.memberships?.[0];

      if (membership) {
        return {
          email,
          userId: updated.id,
          workspaceId: membership.workspaceId,
          createdUser: false,
          createdWorkspace: false
        };
      }

      const workspace = await createBootstrapWorkspace(tx, workspaceName);
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: updated.id,
          role: "owner"
        }
      });

      return {
        email,
        userId: updated.id,
        workspaceId: workspace.id,
        createdUser: false,
        createdWorkspace: true
      };
    }

    const workspace = await createBootstrapWorkspace(tx, workspaceName);
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerifiedAt: new Date()
      },
      include: { memberships: true }
    });
    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner"
      }
    });

    return {
      email,
      userId: user.id,
      workspaceId: workspace.id,
      createdUser: true,
      createdWorkspace: true
    };
  });
}

async function createBootstrapWorkspace(
  prisma: BootstrapPrisma,
  workspaceName: string
) {
  const slug = await resolveWorkspaceSlug(prisma, workspaceName);

  return prisma.workspace.create({
    data: {
      name: workspaceName,
      slug
    }
  });
}

async function resolveWorkspaceSlug(
  prisma: BootstrapPrisma,
  workspaceName: string
): Promise<string> {
  const baseSlug = slugify(workspaceName);
  let candidate = baseSlug;
  let suffix = 2;

  while (
    await prisma.workspace.findUnique({
      where: { slug: candidate }
    })
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}
