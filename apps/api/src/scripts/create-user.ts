import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      continue;
    }

    if (key === "--email") {
      parsed.email = value;
      continue;
    }

    if (key === "--password") {
      parsed.password = value;
      continue;
    }

    if (key === "--name") {
      parsed.name = value;
      continue;
    }

    if (key === "--workspace") {
      parsed.workspace = value;
      continue;
    }

    if (key === "--slug") {
      parsed.slug = value;
      continue;
    }

    if (key === "--role") {
      parsed.role = value;
      continue;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email || !args.password) {
    throw new Error(
      "Uso: pnpm --filter @wpptrack/api create-user -- --email email@dominio.com --password senha-forte --name \"Nome\" --workspace \"Minha Agencia\" [--role owner|admin|member]"
    );
  }

  const email = args.email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(args.password, 12);
  const name = args.name?.trim() || args.email.split("@")[0];
  const workspaceName = args.workspace?.trim() || `${args.name?.split("@")[0] || "User"}'s Workspace`;
  const workspaceSlug = args.slug
    ? args.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    : (args.workspace || "workspace").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 50);
  const role = (args.role as "owner" | "admin" | "member") || "owner";

  try {
    // Check if user exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      console.log(`Usuário já existe: ${user.id} (${user.email})`);
      if (!user.passwordHash) {
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await bcrypt.hash(args.password, 12), emailVerifiedAt: new Date() },
        });
        console.log(`Senha definida para usuário existente (não tinha senha)`);
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await bcrypt.hash(args.password, 12) },
        });
        console.log(`Senha redefinida para usuário existente`);
      }
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name: args.name?.trim() || email.split("@")[0],
          passwordHash: await bcrypt.hash(args.password, 12),
          authProvider: "email",
          emailVerifiedAt: new Date(),
        },
      });
      console.log(`Usuário criado: ${user.id} (${user.email})`);
    }

    // Check/create workspace
    const workspaceSlug = args.slug
      ? args.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      : (args.workspace || "workspace").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 50);
    
    let workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: { name: args.workspace?.trim() || "Workspace", slug: workspaceSlug },
      });
      console.log(`Workspace criado: ${workspace.name} (${workspace.id})`);
    } else {
      console.log(`Workspace já existe: ${workspace.name} (${workspace.id})`);
    }

    // Create membership
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    });

    if (!existingMember) {
      const member = await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner",
        },
      });
      console.log(`Membro criado: owner no workspace ${workspace.name}`);
    } else {
      console.log(`Usuário já é membro do workspace`);
    }

    console.log(JSON.stringify({
      ok: true,
      email: args.email,
      userId: user.id,
      workspaceId: workspace.id,
      role: "owner",
    }, null, 2));

  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});