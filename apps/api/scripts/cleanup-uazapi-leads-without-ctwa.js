// Cleanup leads created by the broken Uazapi path (no CTWA).
// Usage:
//   node scripts/cleanup-uazapi-leads-without-ctwa.js --dry-run
//   node scripts/cleanup-uazapi-leads-without-ctwa.js --execute
//
// Safety:
// - ONLY deletes Lead rows where source = 'uazapi' AND ctwaClid IS NULL
// - Never touches leads with ctwaClid set (Umbler/Gupshup/CTWA OK)
// - Nulls/clears child FKs in safe order before deleting the Lead
// - Prints inventory before any write
// Requires DATABASE_URL. Run from apps/api so @prisma/client resolves.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const mode = process.argv.includes("--execute")
  ? "execute"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error(
    "Uso: node scripts/cleanup-uazapi-leads-without-ctwa.js --dry-run | --execute",
  );
  process.exit(1);
}

async function inventory() {
  const [total, withCtwa, uazapiNoCtwa, uazapiWithCtwa, otherNoCtwa] =
    await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { ctwaClid: { not: null } } }),
      prisma.lead.count({
        where: { source: "uazapi", ctwaClid: null },
      }),
      prisma.lead.count({
        where: { source: "uazapi", ctwaClid: { not: null } },
      }),
      prisma.lead.count({
        where: {
          OR: [{ source: { not: "uazapi" } }, { source: null }],
          ctwaClid: null,
        },
      }),
    ]);

  const sample = await prisma.lead.findMany({
    where: { source: "uazapi", ctwaClid: null },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      workspaceId: true,
      name: true,
      phoneDisplay: true,
      source: true,
      campaignId: true,
      ctwaClid: true,
      createdAt: true,
    },
  });

  console.log("=== INVENTARIO ===");
  console.log({
    totalLeads: total,
    withCtwa,
    uazapiNoCtwa_TO_DELETE: uazapiNoCtwa,
    uazapiWithCtwa_KEEP: uazapiWithCtwa,
    otherSourcesNoCtwa_KEEP: otherNoCtwa,
    mode,
  });
  console.log("amostra (10 mais recentes uazapi sem ctwa):");
  for (const l of sample) {
    console.log(
      "-",
      l.createdAt.toISOString(),
      "| ws=",
      l.workspaceId,
      "| name=",
      l.name || "NULL",
      "| phone=",
      l.phoneDisplay || "NULL",
      "| id=",
      l.id,
    );
  }
  return uazapiNoCtwa;
}

async function clearLeadRefs(leadIds) {
  if (leadIds.length === 0) return;

  // Nullable FKs — null them first (safe even if Restrict elsewhere)
  const nullTargets = [
    "webhookLog",
    "integrationLog",
    "conversionEventLog",
    "diagnosticEvent",
  ];

  for (const model of nullTargets) {
    try {
      if (typeof prisma[model]?.updateMany === "function") {
        const r = await prisma[model].updateMany({
          where: { leadId: { in: leadIds } },
          data: { leadId: null },
        });
        if (r.count) console.log("null", model + ":", r.count);
      }
    } catch (e) {
      console.log("skip null", model, (e.message || "").slice(0, 100));
    }
  }

  // Composite lead relations (workspaceId+leadId) — delete children that Restrict
  // PurchaseReview: SetNull on lead — null via updateMany if possible
  try {
    const r = await prisma.purchaseReview.updateMany({
      where: { leadId: { in: leadIds } },
      data: { leadId: null, leadWorkspaceId: null },
    });
    if (r.count) console.log("null purchaseReview:", r.count);
  } catch (e) {
    console.log("skip purchaseReview", (e.message || "").slice(0, 100));
  }

  // ProviderConversionDecisionAudit: Restrict — delete audits for these leads
  try {
    const r = await prisma.providerConversionDecisionAudit.deleteMany({
      where: { leadId: { in: leadIds } },
    });
    if (r.count) console.log("delete providerConversionDecisionAudit:", r.count);
  } catch (e) {
    console.log(
      "skip providerConversionDecisionAudit",
      (e.message || "").slice(0, 120),
    );
  }
}

async function executeCleanup() {
  const batchSize = 200;
  let totalDeleted = 0;

  for (;;) {
    const batch = await prisma.lead.findMany({
      where: { source: "uazapi", ctwaClid: null },
      select: { id: true },
      take: batchSize,
    });
    if (batch.length === 0) break;

    const ids = batch.map((l) => l.id);
    await prisma.$transaction(async (tx) => {
      // re-bind prisma methods on tx for this batch
      const nullModels = [
        "webhookLog",
        "integrationLog",
        "conversionEventLog",
        "diagnosticEvent",
      ];
      for (const model of nullModels) {
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
        /* optional model shape */
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
          source: "uazapi",
          ctwaClid: null,
        },
      });
      totalDeleted += del.count;
    });

    console.log("batch deleted:", ids.length, "| total:", totalDeleted);
  }

  console.log("OK - total leads uazapi sem ctwa removidos:", totalDeleted);
}

async function main() {
  const toDelete = await inventory();
  if (mode === "dry-run") {
    console.log(
      "DRY-RUN: nenhum lead foi apagado. Rode com --execute para aplicar.",
    );
    return;
  }
  if (toDelete === 0) {
    console.log("Nada a apagar.");
    return;
  }
  console.log("EXECUTANDO limpeza de", toDelete, "leads...");
  await executeCleanup();
  await inventory();
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
