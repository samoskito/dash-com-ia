import { PrismaClient } from "@prisma/client";
import { bootstrapPlatformAdminUser } from "../auth/platform-admin-bootstrap";
import { loadLocalEnv } from "../config/load-env";

type ParsedArgs = {
  email?: string;
  password?: string;
  name?: string;
  workspaceName?: string;
};

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email || !args.password) {
    throw new Error(
      "Uso: pnpm --filter @wpptrack/api platform-admin:create -- --email email@dominio.com --password senha-forte --name \"Nome\""
    );
  }

  const prisma = new PrismaClient();

  try {
    const result = await bootstrapPlatformAdminUser(prisma as never, {
      email: args.email,
      password: args.password,
      name: args.name ?? args.email.split("@")[0] ?? "Administrador",
      workspaceName: args.workspaceName
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          email: result.email,
          userId: result.userId,
          workspaceId: result.workspaceId,
          platformRole: result.platformRole,
          createdUser: result.createdUser,
          createdWorkspace: result.createdWorkspace,
          authorization: "persistent_platform_owner"
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      continue;
    }

    if (key === "--email") {
      parsed.email = value;
      index += 1;
      continue;
    }

    if (key === "--password") {
      parsed.password = value;
      index += 1;
      continue;
    }

    if (key === "--name") {
      parsed.name = value;
      index += 1;
      continue;
    }

    if (key === "--workspace") {
      parsed.workspaceName = value;
      index += 1;
    }
  }

  return parsed;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
