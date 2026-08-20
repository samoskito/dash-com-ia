#!/usr/bin/env node
/**
 * Cleanup Uazapi organic leads (no CTWA) for ONE workspace only.
 *
 * Usage (Dokploy API container):
 *   WORKSPACE_ID=<id> node scripts/cleanup-uazapi-organics-workspace.js --dry-run
 *   WORKSPACE_ID=<id> node scripts/cleanup-uazapi-organics-workspace.js --execute
 *
 * Or by name (case-insensitive contains):
 *   WORKSPACE_NAME="Kasa da Foto" node scripts/cleanup-uazapi-organics-workspace.js --dry-run
 *
 * Deletes ONLY:
 *   Lead where workspaceId = X AND source = 'uazapi' AND ctwaClid IS NULL
 *
 * Never deletes leads with ctwaClid set.
 * Requires DATABASE_URL. Run from /app/apps/api.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const mode = process.argv.includes("--execute")
  ? "execute"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error(
    'Uso: WORKSPACE_ID=... | WORKSPACE_NAME="..." node scripts/cleanup-uazapi-organics-workspace.js --dry-run | --execute',
  );
  process.exit(1);
}

async function resolveWorkspace() {
  const id = (process.env.WORKSPACE_ID || "").trim();
  const name = (process.env.WORKSPACE_NAME || "").trim();

  if (id) {
    const ws = await prisma.workspace.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!ws) throw new Error("WORKSPACE_ID nao encontrado: " + id);
    return ws;
  }

  if (!name) {
    throw new Error("Informe WORKSPACE_ID ou WORKSPACE_NAME");
  }

  const list = await prisma.workspace.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
    take: 10,
  });
  if (list.length === 0) throw new Error("Nenhum workspace com nome: " + name);
  if (list.length > 1) {
    console.error("Varios workspaces — use WORKSPACE_ID:");
    for (const w of list) console.error("-", w.id, "|", w.name, "|", w.slug);
    throw new Error("Ambiguo");
  }
  return list[0];
}

function organicWhere(workspaceId) {
  return {
    workspaceId,
    source: "uazapi",
    ctwaClid: null,
  };
}

async function inventory(workspaceId) {
  const where = organicWhere(workspaceId);
  const [
    total,
    withCtwa,
    uazapiNoCtwa,
    uazapiWithCtwa,
    otherNoCtwa,
    sample,
  ] = await Promise.all([
    prisma.lead.count({ where: { workspaceId } }),
    prisma.lead.count({
      where: { workspaceId, ctwaClid: { not: null } },
    }),
    prisma.lead.count({ where }),
    prisma.lead.count({
      where: { workspaceId, source: "uazapi", ctwaClid: { not: null } },
    }),
    prisma.lead.count({
      where: {
        workspaceId,
        ctwaClid: null,
        OR: [{ source: { not: "uazapi" } }, { source: null }],
      },
    }),
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        phoneDisplay: true,
        source: true,
        campaignId: true,
        adId: true,
        ctwaClid: true,
        createdAt: true,
      },
    }),
  ]);

  console.log("=== INVENTARIO (workspace scoped) ===");
  console.log(
    JSON.stringify(
      {
        mode,
        totalLeads: total,
        withCtwa_KEEP: withCtwa,
        uazapiNoCtwa_TO_DELETE: uazapiNoCtwa,
        uazapiWithCtwa_KEEP: uazapiWithCtwa,
        otherSourcesNoCtwa_KEEP: otherNoCtwa,
      },
      null,
      2,
    ),
  );
  console.log("amostra organicos uazapi (ate 20):");
  for (const l of sample) {
    console.log(
      JSON.stringify({
        id: l.id,
        createdAt: l.createdAt,
        name: l.name,
        phone: l.phoneDisplay
          ? "***" + String(l.phoneDisplay).slice(-4)
          : null,
        source: l.source,
        campaignId: l.campaignId,
        adId: l.adId,
      }),
    );
  }
  return uazapiNoCtwa;
}

async function executeCleanup(workspaceId) {
  const batchSize = 100;
  let totalDeleted = 0;

  for (;;) {
    const batch = await prisma.lead.findMany({
      where: organicWhere(workspaceId),
      select: { id: true },
      take: batchSize,
    });
    if (batch.length === 0) break;
    const ids = batch.map((l) => l.id);

    await prisma.$transaction(async (tx) => {
      for (const model of [
        "webhookLog",
        "integrationLog",
        "conversionEventLog",
        "diagnosticEvent",
      ]) {
        if (typeof tx[model]?.updateMany === "function") {
          await tx[model].updateMany({
            where: { leadId: { in: ids } },
            data: { leadId: null },
          });
        }
      }
      try {
        await tx.purchaseReview.updateMany({
          where: { leadId: { in: ids } },
          data: { leadId: null, leadWorkspaceId: null },
        });
      } catch {
        /* optional */
      }
      try {
        await tx.providerConversionDecisionAudit.deleteMany({
          where: { leadId: { in: ids } },
        });
      } catch {
        /* optional */
      }

      const del = await tx.lead.deleteMany({
        where: {
          id: { in: ids },
          workspaceId,
          source: "uazapi",
          ctwaClid: null,
        },
      });
      totalDeleted += del.count;
    });

    console.log("batch deleted:", ids.length, "| total:", totalDeleted);
  }

  console.log("OK - removidos:", totalDeleted);
}

async function main() {
  const ws = await resolveWorkspace();
  console.log(
    JSON.stringify({
      workspace: ws,
      filter: "source=uazapi AND ctwaClid IS NULL",
    }),
  );

  const toDelete = await inventory(ws.id);
  if (mode === "dry-run") {
    console.log(
      "DRY-RUN: nada apagado. Se os numeros baterem (ex. ~13 organicos), rode com --execute apos autorizado.",
    );
    return;
  }
  if (toDelete === 0) {
    console.log("Nada a apagar.");
    return;
  }
  console.log("EXECUTANDO limpeza de", toDelete, "leads no workspace", ws.id);
  await executeCleanup(ws.id);
  await inventory(ws.id);
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
