import { PrismaClient, type WorkspaceRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const ALLOWED_ROLES = new Set<WorkspaceRole>(["owner", "admin", "member"]);

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--force") {
      parsed.force = "true";
      continue;
    }

    if (!token?.startsWith("--")) {
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      continue;
    }

    parsed[token.slice(2)] = value;
    index += 1;
  }

  return parsed;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .substring(0, 50);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email || !args.password) {
    throw new Error(
      'Uso: pnpm --filter @wpptrack/api create-user -- --email email@dominio.com --password senha-forte --name "Nome" --workspace "Minha Agencia" [--role owner|admin|member] [--force]',
    );
  }

  const email = args.email.toLowerCase().trim();
  const name = args.name?.trim() || email.split("@")[0];
  const workspaceName = args.workspace?.trim() || `${name}'s Workspace`;
  const workspaceSlug = args.slug
    ? slugify(args.slug.trim())
    : slugify(args.workspace || "workspace");
  const requestedRole = (args.role as WorkspaceRole | undefined) || "owner";

  if (!ALLOWED_ROLES.has(requestedRole)) {
    throw new Error("Role invalida. Use owner, admin ou member.");
  }

  const prisma = new PrismaClient();

  try {
    const passwordHash = await bcrypt.hash(args.password, 12);
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      if (user.passwordHash && args.force !== "true") {
        throw new Error(
          "Usuario ja possui senha. Use --force para redefinir.",
        );
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          authProvider: "email",
          emailVerifiedAt: new Date(),
        },
      });
    }

    let workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: { name: workspaceName, slug: workspaceSlug },
      });
    }

    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
      },
    });

    if (!existingMember) {
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: requestedRole,
        },
      });
    }

    console.log(
      JSON.stringify({
        ok: true,
        userId: user.id,
        workspaceId: workspace.id,
        role: existingMember?.role ?? requestedRole,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao criar usuario");
  process.exit(1);
});
