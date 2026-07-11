import { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "../config/load-env";

type ParsedArgs = {
  email?: string;
};

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    throw new Error(
      "Uso: pnpm --filter @wpptrack/api platform-owner:promote -- --email email@dominio.com"
    );
  }

  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        platformRole: true
      }
    });

    if (!user) {
      throw new Error(`Usuario nao encontrado: ${email}`);
    }

    const changed = user.platformRole !== "platform_owner";

    if (changed) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { platformRole: "platform_owner" }
        });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorType: "system_cli",
            action: "platform.owner_promoted",
            targetType: "user",
            targetId: user.id,
            resultStatus: "success",
            beforeSummary: {
              platformRole: user.platformRole ?? "none"
            },
            afterSummary: {
              platformRole: "platform_owner"
            }
          }
        });
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          email: user.email,
          userId: user.id,
          platformRole: "platform_owner",
          changed,
          passwordPreserved: true
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
    if (args[index] === "--email" && args[index + 1]) {
      parsed.email = args[index + 1];
      index += 1;
    }
  }

  return parsed;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
