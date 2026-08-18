// Repair conversion events that were created by the ops reprocess script with
// wrong status ("ready" / "pending_*") and were never enqueued to CAPI.
//
// Usage (from apps/api):
//   node scripts/repair-and-enqueue-capi-events.js --dry-run
//   node scripts/repair-and-enqueue-capi-events.js --execute
//
// Env:
//   DATABASE_URL (required)
//   REDIS_URL (required for --execute enqueue; defaults redis://localhost:6379)
//   WORKSPACE_ID (optional filter)
//   LOOKBACK_HOURS (default 168)
//
// Safety:
// - Only LeadSubmitted + sourceTrigger auto_lead
// - Only events that have adId + ctwaClid
// - Only statuses that are NOT already sent/error terminal success path:
//   ready | pending_meta_context | pending_attribution | pending_value | ready_to_send (re-queue)
// - Does not touch Umbler/Gupshup decision audits
// - Enqueue uses same jobId scheme as the app (conversion-send:<logId>)

const { createHash } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const mode = process.argv.includes("--execute")
  ? "execute"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error(
    "Uso: node scripts/repair-and-enqueue-capi-events.js --dry-run | --execute",
  );
  process.exit(1);
}

const WORKSPACE_ID = process.env.WORKSPACE_ID || null;
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS || 168);
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_NAME = "conversion-events";

function createBullJobId(prefix, id) {
  // Match apps/api/src/common/queue/job-id.ts if present; fallback stable id
  try {
    const { createBullJobId: real } = require("../dist/common/queue/job-id");
    return real(prefix, id);
  } catch {
    const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    return `${prefix}:${safe}`;
  }
}

async function main() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);
  console.log("=== REPAIR + ENQUEUE CAPI ===", {
    mode,
    workspaceId: WORKSPACE_ID || "ALL",
    lookbackHours: LOOKBACK_HOURS,
    since: since.toISOString(),
    redis: REDIS_URL.replace(/:[^:@/]+@/, ":***@"),
  });

  const events = await prisma.conversionEventLog.findMany({
    where: {
      ...(WORKSPACE_ID ? { workspaceId: WORKSPACE_ID } : {}),
      eventName: "LeadSubmitted",
      sourceTrigger: "auto_lead",
      eventOccurredAt: { gte: since },
      adId: { not: null },
      ctwaClid: { not: null },
      status: {
        in: [
          "ready",
          "ready_to_send",
          "pending_meta_context",
          "pending_attribution",
          "pending_value",
        ],
      },
    },
    select: {
      id: true,
      workspaceId: true,
      leadId: true,
      status: true,
      adId: true,
      adSetId: true,
      campaignId: true,
      ctwaClid: true,
      eventId: true,
      dedupeKey: true,
      errorCode: true,
      eventOccurredAt: true,
      sentAt: true,
    },
    orderBy: { eventOccurredAt: "asc" },
    take: 500,
  });

  console.log("candidates:", events.length);

  const byStatus = {};
  for (const e of events) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  }
  console.log("byStatus:", byStatus);

  const stats = {
    wouldFixStatus: 0,
    fixedStatus: 0,
    wouldEnqueue: 0,
    enqueued: 0,
    skippedNoWorkspace: 0,
    skippedAlreadySent: 0,
    errors: 0,
  };

  let queue = null;
  if (mode === "execute") {
    const { Queue } = require("bullmq");
    const IORedis = require("ioredis");
    const connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    queue = new Queue(QUEUE_NAME, { connection });
  }

  for (const ev of events) {
    if (!ev.workspaceId) {
      stats.skippedNoWorkspace++;
      continue;
    }
    if (ev.sentAt) {
      stats.skippedAlreadySent++;
      continue;
    }

    const needsStatusFix = ev.status !== "ready_to_send";
    if (needsStatusFix) stats.wouldFixStatus++;
    stats.wouldEnqueue++;

    console.log(
      "-",
      ev.eventOccurredAt.toISOString(),
      "|",
      ev.id,
      "| status=",
      ev.status,
      needsStatusFix ? "-> ready_to_send" : "(ok)",
      "| ad=",
      ev.adId,
      "| camp=",
      ev.campaignId || "NULL",
      "| adSet=",
      ev.adSetId || "NULL",
    );

    if (mode !== "execute") continue;

    try {
      if (needsStatusFix) {
        await prisma.conversionEventLog.update({
          where: { id: ev.id },
          data: {
            status: "ready_to_send",
            errorCode: null,
            errorMessage: null,
            // ensure eventId exists for sendReadyEvent
            eventId: ev.eventId || ev.dedupeKey,
          },
        });
        stats.fixedStatus++;
      }

      const jobId = createBullJobId("conversion-send", ev.id);
      const existing = await queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === "completed" || state === "active" || state === "waiting") {
          console.log("  job exists:", state, jobId);
          // still count as enqueued path
          stats.enqueued++;
          continue;
        }
        if (state === "failed" || state === "delayed") {
          await existing.remove().catch(() => undefined);
        }
      }

      await queue.add(
        "send-ready-event",
        {
          conversionEventLogId: ev.id,
          workspaceId: ev.workspaceId,
        },
        {
          jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      stats.enqueued++;
      console.log("  enqueued", jobId);
    } catch (e) {
      stats.errors++;
      console.error("  ERRO", ev.id, e.message);
    }
  }

  if (queue) {
    await queue.close();
  }

  console.log("=== STATS ===", stats);
  if (mode === "dry-run") {
    console.log("DRY-RUN: nada gravado/enfileirado. Rode com --execute.");
  } else {
    console.log(
      "OK - status corrigido e jobs enfileirados. Aguarde o worker processar; confira status sent/error nos eventos.",
    );
  }
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
