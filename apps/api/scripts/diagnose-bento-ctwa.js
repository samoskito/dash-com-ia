// Read-only diagnose of the Bento Goncalves UAZAPI CTWA -> Lead -> LeadSubmitted
// path. Meta reports paid conversations for Bento but WppTrack "Conversas
// reais" (overview real conversations) sits at ~0 for day 20 and day 21.
//
// Scope: Bento Goncalves ONLY, CTWA/LeadSubmitted path. Does NOT touch XMAX
// tags/labels, does NOT touch Umbler/Gupshup, does NOT write anything.
//
// Usage (Dokploy API container, from /app/apps/api):
//   DATABASE_URL="postgresql://..." node scripts/diagnose-bento-ctwa.js
//
// Optional overrides:
//   WORKSPACE_ID=cmsxluhm90000qhdvvg53joda (default: Bento)
//   LOOKBACK_DAYS=7 (Lead/LeadSubmitted daily breakdown window)
//   WEBHOOK_LOOKBACK_HOURS=48 (WebhookLog window)
//
// Prints ONLY Bento data. No secrets. Phones/tokens are masked.

console.error("BENTO_DIAGNOSE_VERSION=2026-08-21c");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const WORKSPACE_ID = process.env.WORKSPACE_ID || "cmsxluhm90000qhdvvg53joda";
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 7);
const WEBHOOK_LOOKBACK_HOURS = Number(process.env.WEBHOOK_LOOKBACK_HOURS || 48);

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function maskPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function maskToken(value) {
  if (!value) return null;
  return value.length <= 8
    ? "***"
    : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function dayKeySaoPaulo(date) {
  // America/Sao_Paulo, no external tz lib needed for a YYYY-MM-DD bucket key.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function bucketByDay(rows, dateField, extra) {
  const buckets = new Map();
  for (const row of rows) {
    const key = dayKeySaoPaulo(row[dateField]);
    if (!buckets.has(key)) buckets.set(key, { day: key, total: 0 });
    const bucket = buckets.get(key);
    bucket.total += 1;
    if (extra) extra(bucket, row);
  }
  return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
}

async function main() {
  const workspace = await prisma.workspace.findUnique({
    where: { id: WORKSPACE_ID },
    select: { id: true, name: true, slug: true, operationalStatus: true },
  });

  section("Workspace");
  console.log(workspace ?? `NOT FOUND: ${WORKSPACE_ID}`);
  if (!workspace) {
    console.error("Aborting: workspace not found, nothing else to check.");
    process.exitCode = 1;
    return;
  }

  // 1. WhatsApp instances / uazapi connection status fields available in Prisma
  section("WhatsappInstance (uazapi) — Bento");
  const instances = await prisma.whatsappInstance.findMany({
    where: { workspaceId: WORKSPACE_ID, provider: "uazapi" },
    select: {
      id: true,
      name: true,
      provider: true,
      providerInstanceId: true,
      status: true,
      webhookTokenHash: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (instances.length === 0) {
    console.log("NONE — no uazapi WhatsappInstance rows for this workspace.");
  }
  for (const inst of instances) {
    console.log({
      id: inst.id,
      name: inst.name,
      providerInstanceId: inst.providerInstanceId,
      dbStatus: inst.status, // WhatsappInstanceStatus enum: pending_payment|active|disconnected|suspended|error
      hasWebhookTokenHash: Boolean(inst.webhookTokenHash),
      webhookTokenHash: maskToken(inst.webhookTokenHash),
      createdAt: inst.createdAt,
      updatedAt: inst.updatedAt,
    });
  }
  console.log(
    "NOTE: dbStatus / UAZAPI 'CONNECTED' reflect the WhatsApp *session* (socket/QR) only.",
    "They do NOT confirm the provider-side webhook URL/events/token are still configured.",
    "Session can show CONNECTED while webhook delivery to WppTrack is silently broken.",
  );

  // 2. Inbound webhook connection for Bento, if any (Umbler-style channel table;
  // usually empty for pure uazapi CTWA — included for completeness / cross-check).
  section("InboundWebhookChannel — Bento (cross-check only, not the uazapi path)");
  const instanceIds = instances.map((i) => i.id);
  const channels = instanceIds.length
    ? await prisma.inboundWebhookChannel.findMany({
        where: { workspaceId: WORKSPACE_ID, whatsappInstanceId: { in: instanceIds } },
        select: {
          id: true,
          providerChannelId: true,
          connectedPhone: true,
          channelName: true,
          status: true,
          whatsappInstanceId: true,
          lastSeenAt: true,
        },
      })
    : [];
  if (channels.length === 0) {
    console.log("NONE — expected for a pure uazapi instance without an inbound channel row.");
  }
  for (const ch of channels) {
    console.log({ ...ch, connectedPhone: maskPhone(ch.connectedPhone) });
  }

  // 3. WebhookLog counts last N hours by type/summary — this is the key split:
  // if this is ~0, UAZAPI isn't reaching us (auth/config/delivery, not our gate).
  // if this is healthy, the CTWA gate or lead upsert is where it's dying.
  section(`WebhookLog — Bento — last ${WEBHOOK_LOOKBACK_HOURS}h`);
  const webhookSince = new Date(Date.now() - WEBHOOK_LOOKBACK_HOURS * 3600 * 1000);
  const webhookLogs = await prisma.webhookLog.findMany({
    where: { workspaceId: WORKSPACE_ID, source: "uazapi", receivedAt: { gte: webhookSince } },
    select: {
      id: true,
      eventType: true,
      status: true,
      receivedAt: true,
      leadId: true,
      campaignId: true,
      adSetId: true,
      adId: true,
    },
  });
  console.log(`Total uazapi WebhookLog rows: ${webhookLogs.length}`);
  const byEventType = new Map();
  const byStatus = new Map();
  for (const row of webhookLogs) {
    byEventType.set(row.eventType, (byEventType.get(row.eventType) ?? 0) + 1);
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
  }
  console.log("By eventType:", Object.fromEntries(byEventType));
  console.log("By status:", Object.fromEntries(byStatus));
  const withAttribution = webhookLogs.filter((r) => r.campaignId || r.adSetId || r.adId).length;
  console.log(`Rows carrying campaignId/adSetId/adId: ${withAttribution} / ${webhookLogs.length}`);
  if (webhookLogs.length === 0) {
    console.log(
      "=> ZERO WebhookLog rows in window. UAZAPI is not delivering webhooks for this instance",
      "(disabled webhook, wrong URL, rotated token, or events unsubscribed) OR every call is",
      "failing auth (401) before reaching recordWebhookLog — check API access logs for 401s on",
      "/webhooks/uazapi/instances/:id.",
    );
  }

  // 4. Lead counts last N days by day (paid vs unpaid)
  section(`Lead counts by day — Bento — last ${LOOKBACK_DAYS}d`);
  const leadSince = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const leads = await prisma.lead.findMany({
    where: { workspaceId: WORKSPACE_ID, createdAt: { gte: leadSince } },
    select: {
      id: true,
      createdAt: true,
      source: true,
      ctwaClid: true,
      adId: true,
      campaignId: true,
      adSetId: true,
    },
  });
  const leadDays = bucketByDay(leads, "createdAt", (bucket, row) => {
    bucket.paid = (bucket.paid ?? 0) + (row.ctwaClid && row.adId ? 1 : 0);
    bucket.unpaid = (bucket.unpaid ?? 0) + (row.ctwaClid && row.adId ? 0 : 1);
    bucket.missingAdSetId =
      (bucket.missingAdSetId ?? 0) + (row.adId && !row.adSetId ? 1 : 0);
  });
  console.log(leadDays);
  console.log(`Total leads in window: ${leads.length}`);

  // 5. LeadSubmitted counts last N days by day + status
  section(`ConversionEventLog LeadSubmitted — Bento — last ${LOOKBACK_DAYS}d`);
  const events = await prisma.conversionEventLog.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      eventName: "LeadSubmitted",
      createdAt: { gte: leadSince },
    },
    select: {
      id: true,
      createdAt: true,
      status: true,
      sourceTrigger: true,
      adId: true,
      ctwaClid: true,
      attributionStatus: true,
      errorCode: true,
      sentAt: true,
    },
  });
  const eventDays = bucketByDay(events, "createdAt", (bucket, row) => {
    bucket.sent = (bucket.sent ?? 0) + (row.status === "sent" ? 1 : 0);
    bucket.readyToSend =
      (bucket.readyToSend ?? 0) + (row.status === "ready_to_send" ? 1 : 0);
    bucket.other =
      (bucket.other ?? 0) +
      (row.status !== "sent" && row.status !== "ready_to_send" ? 1 : 0);
  });
  console.log(eventDays);
  const statusCounts = new Map();
  for (const row of events) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }
  console.log("Status breakdown (all LeadSubmitted in window):", Object.fromEntries(statusCounts));
  if ([...statusCounts.keys()].some((s) => s === "ready")) {
    console.log(
      "=> WARNING: status 'ready' found — known trap, worker only sends 'ready_to_send'.",
      "See repair-and-enqueue-capi-events.js.",
    );
  }

  // 6. last 20 leads (createdAt, has adId, ctwaClid, campaignId, adSetId, source)
  section("Last 20 leads — Bento");
  const lastLeads = await prisma.lead.findMany({
    where: { workspaceId: WORKSPACE_ID },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      source: true,
      phoneDisplay: true,
      adId: true,
      ctwaClid: true,
      campaignId: true,
      adSetId: true,
    },
  });
  for (const lead of lastLeads) {
    console.log({
      id: lead.id,
      createdAt: lead.createdAt,
      source: lead.source,
      phone: maskPhone(lead.phoneDisplay),
      hasAdId: Boolean(lead.adId),
      hasCtwaClid: Boolean(lead.ctwaClid),
      campaignId: lead.campaignId,
      adSetId: lead.adSetId,
    });
  }
  if (lastLeads.length === 0) console.log("NONE");

  // 7. last 20 conversion events LeadSubmitted
  section("Last 20 LeadSubmitted events — Bento");
  const lastEvents = await prisma.conversionEventLog.findMany({
    where: { workspaceId: WORKSPACE_ID, eventName: "LeadSubmitted" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      status: true,
      sourceTrigger: true,
      adId: true,
      campaignId: true,
      adSetId: true,
      attributionStatus: true,
      errorCode: true,
      errorMessage: true,
      sentAt: true,
    },
  });
  for (const ev of lastEvents) {
    console.log(ev);
  }
  if (lastEvents.length === 0) console.log("NONE");

  // 8. last errors if stored (DiagnosticEvent + errored ConversionEventLog + WebhookLog with errorCode)
  section("Last errors — Bento (DiagnosticEvent, severity error/warning)");
  const diagnosticEvents = await prisma.diagnosticEvent.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      source: "uazapi",
      severity: { in: ["error", "warning"] },
    },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: {
      id: true,
      occurredAt: true,
      eventType: true,
      severity: true,
      status: true,
      title: true,
      message: true,
      errorCode: true,
    },
  });
  if (diagnosticEvents.length === 0) console.log("NONE");
  for (const de of diagnosticEvents) console.log(de);

  section("WebhookLog rows with errorCode — Bento — last 48h");
  const erroredWebhookLogs = await prisma.webhookLog.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      source: "uazapi",
      receivedAt: { gte: webhookSince },
      errorCode: { not: null },
    },
    select: { id: true, receivedAt: true, eventType: true, errorCode: true, errorMessage: true },
  });
  if (erroredWebhookLogs.length === 0) console.log("NONE");
  for (const row of erroredWebhookLogs) console.log(row);

  section("Done");
  console.log(
    "This script is read-only. It does not touch XMAX tags, Umbler, or Gupshup,",
    "and does not write anything to the database.",
  );
}

main()
  .catch((error) => {
    console.error("BENTO_DIAGNOSE_ERROR", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
