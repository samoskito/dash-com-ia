// Backfill Lead + LeadSubmitted campaignId/adSetId from MetaAd when adId is known.
//
// Usage (from apps/api):
//   node scripts/backfill-lead-attribution-from-meta-ad.js --dry-run
//   node scripts/backfill-lead-attribution-from-meta-ad.js --execute
//
// Optional env:
//   WORKSPACE_ID=cmsxluhm90000qhdvvg53joda
//   LOOKBACK_HOURS=168
//
// Safety:
// - Only touches leads with adId set AND (campaignId null OR adSetId null)
// - Only fills from MetaAd in the same workspace
// - Also patches LeadSubmitted events missing campaign/adSet for those leads

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const mode = process.argv.includes("--execute")
  ? "execute"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error(
    "Uso: node scripts/backfill-lead-attribution-from-meta-ad.js --dry-run | --execute",
  );
  process.exit(1);
}

const WORKSPACE_ID = process.env.WORKSPACE_ID || null;
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS || 168);

async function main() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);
  console.log("=== BACKFILL ATTRIBUTION FROM META AD ===", {
    mode,
    workspaceId: WORKSPACE_ID || "ALL",
    lookbackHours: LOOKBACK_HOURS,
    since: since.toISOString(),
  });

  const leads = await prisma.lead.findMany({
    where: {
      ...(WORKSPACE_ID ? { workspaceId: WORKSPACE_ID } : {}),
      adId: { not: null },
      AND: [
        {
          OR: [{ campaignId: null }, { adSetId: null }],
        },
        {
          OR: [
            { firstMessageAt: { gte: since } },
            { firstMessageAt: null, createdAt: { gte: since } },
            { createdAt: { gte: since } },
          ],
        },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      phoneDisplay: true,
      adId: true,
      adSetId: true,
      campaignId: true,
      ctwaClid: true,
    },
    take: 500,
    orderBy: { createdAt: "desc" },
  });

  console.log("candidates:", leads.length);

  const stats = {
    wouldUpdateLead: 0,
    updatedLead: 0,
    wouldUpdateEvent: 0,
    updatedEvent: 0,
    noMetaAd: 0,
    skipped: 0,
  };

  for (const lead of leads) {
    if (!lead.adId) {
      stats.skipped++;
      continue;
    }

    const ad = await prisma.metaAd.findFirst({
      where: { workspaceId: lead.workspaceId, adId: lead.adId },
      select: { adId: true, adSetId: true, campaignId: true, name: true },
    });

    if (!ad?.campaignId || !ad?.adSetId) {
      stats.noMetaAd++;
      console.log(
        "NO_META",
        lead.name || lead.id,
        "adId=",
        lead.adId,
        "ws=",
        lead.workspaceId,
      );
      continue;
    }

    const needCamp = !lead.campaignId;
    const needAdSet = !lead.adSetId;
    if (!needCamp && !needAdSet) {
      stats.skipped++;
      continue;
    }

    stats.wouldUpdateLead++;
    console.log(
      "LEAD",
      lead.name || "?",
      "|",
      lead.id,
      "| ad=",
      lead.adId,
      "| camp:",
      lead.campaignId || "NULL",
      "->",
      ad.campaignId,
      "| adSet:",
      lead.adSetId || "NULL",
      "->",
      ad.adSetId,
      "| metaAd=",
      ad.name,
    );

    if (mode === "execute") {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          campaignId: lead.campaignId || ad.campaignId,
          adSetId: lead.adSetId || ad.adSetId,
        },
      });
      stats.updatedLead++;
    }

    const events = await prisma.conversionEventLog.findMany({
      where: {
        workspaceId: lead.workspaceId,
        eventName: "LeadSubmitted",
        AND: [
          {
            OR: [{ leadId: lead.id }, { adId: lead.adId }],
          },
          {
            OR: [{ campaignId: null }, { adSetId: null }],
          },
        ],
      },
      select: { id: true, campaignId: true, adSetId: true, adId: true },
      take: 20,
    });

    for (const ev of events) {
      if (ev.campaignId && ev.adSetId) continue;
      stats.wouldUpdateEvent++;
      console.log(
        "  EVENT",
        ev.id,
        "camp:",
        ev.campaignId || "NULL",
        "->",
        ad.campaignId,
        "adSet:",
        ev.adSetId || "NULL",
        "->",
        ad.adSetId,
      );
      if (mode === "execute") {
        await prisma.conversionEventLog.update({
          where: { id: ev.id },
          data: {
            campaignId: ev.campaignId || ad.campaignId,
            adSetId: ev.adSetId || ad.adSetId,
            adId: ev.adId || lead.adId,
          },
        });
        stats.updatedEvent++;
      }
    }
  }

  console.log("=== STATS ===", stats);
  if (mode === "dry-run") {
    console.log("DRY-RUN: nada gravado. Rode com --execute para aplicar.");
  } else {
    console.log("OK - backfill finalizado.");
  }
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
