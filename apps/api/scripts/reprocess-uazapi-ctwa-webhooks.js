// Reprocess Uazapi WebhookLog rows that contain CTWA but were parsed with the old
// broken parser (name/campaign/ctwaClid lost).
//
// Usage (from apps/api):
//   node scripts/reprocess-uazapi-ctwa-webhooks.js --dry-run
//   node scripts/reprocess-uazapi-ctwa-webhooks.js --execute
//
// Safety:
// - Only source=uazapi WebhookLog rows whose summaryPayload text contains "ctwa"
// - Only inbound non-group messages with a recoverable phone + ctwaClid
// - Upserts Lead (fills name/ctwa/ad fields) and creates LeadSubmitted if missing
// - Idempotent: LeadSubmitted uses the same dedupeKey as production
// - Does NOT touch Umbler/Gupshup/inbound pipelines
//
// Requires DATABASE_URL. Run from /app/apps/api so @prisma/client resolves.

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
    "Uso: node scripts/reprocess-uazapi-ctwa-webhooks.js --dry-run | --execute",
  );
  process.exit(1);
}

const LOOKBACK_HOURS = Number(process.env.REPROCESS_LOOKBACK_HOURS || 72);

function firstString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function normalizePhoneIdentity(phone) {
  const digits = phone?.replace(/\D/g, "");
  if (!digits || digits.length < 10 || digits.length > 15) return undefined;
  return digits;
}

function hashPhoneIdentity(phone) {
  const n = normalizePhoneIdentity(phone);
  return n ? createHash("sha256").update(n).digest("hex") : undefined;
}

function getExternalAdReply(body, message) {
  const content = recordValue(message?.content);
  const contentContext = recordValue(content?.contextInfo);
  const messageContext = recordValue(message?.contextInfo);
  const bodyContext = recordValue(body.contextInfo);
  return (
    recordValue(contentContext?.externalAdReply) ??
    recordValue(messageContext?.externalAdReply) ??
    recordValue(bodyContext?.externalAdReply)
  );
}

function parseUazapi(body) {
  const message = recordValue(body.message);
  const chat = recordValue(body.chat);
  const externalAdReply = getExternalAdReply(body, message);
  const phoneRaw =
    firstString(body.phone) ||
    firstString(chat?.phone) ||
    firstString(message?.chatid) ||
    firstString(chat?.wa_chatid);
  const phone = phoneRaw
    ? phoneRaw.replace(/@s\.whatsapp\.net$/i, "").replace(/@lid$/i, "")
    : undefined;
  const contactName =
    firstString(body.name) ||
    firstString(body.contactName) ||
    firstString(body.pushName) ||
    firstString(recordValue(body.contact)?.name) ||
    firstString(chat?.wa_name) ||
    firstString(chat?.name);
  const ctwaClid =
    firstString(body.ctwa_clid) ||
    firstString(body.ctwaClid) ||
    firstString(externalAdReply?.ctwaClid);
  const adId =
    firstString(body.adId) ||
    firstString(body.ad_id) ||
    firstString(body.sourceId) ||
    firstString(body.source_id) ||
    firstString(externalAdReply?.sourceID);
  const campaignId =
    firstString(body.campaignId) ||
    firstString(body.campaign_id) ||
    firstString(body.utm_campaign);
  const adSetId =
    firstString(body.adSetId) ||
    firstString(body.adsetId) ||
    firstString(body.ad_set_id);
  const ctwaSourceUrl =
    firstString(body.ctwaSourceUrl) ||
    firstString(body.source_url) ||
    firstString(externalAdReply?.sourceUrl);
  const externalEventId =
    firstString(body.id) ||
    firstString(body.eventId) ||
    firstString(message?.id);
  const isGroupChat =
    typeof chat?.wa_isGroup === "boolean" ? chat.wa_isGroup : undefined;
  const fromMe = message ? message.fromMe === true : undefined;

  return {
    phone,
    phoneHash: hashPhoneIdentity(phone),
    contactName,
    ctwaClid,
    adId,
    campaignId,
    adSetId,
    ctwaSourceUrl,
    externalEventId,
    isGroupChat,
    fromMe,
    hasMessage: Boolean(message),
  };
}

function formatPhone(phone) {
  const n = normalizePhoneIdentity(phone);
  if (!n) return null;
  if (n.length === 13 && n.startsWith("55")) {
    return `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 9)}-${n.slice(9)}`;
  }
  if (n.length === 12 && n.startsWith("55")) {
    return `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 8)}-${n.slice(8)}`;
  }
  return `+${n}`;
}

async function loadCandidates() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);
  // Use raw SQL for JSON text search (same as diagnostics)
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT id, "workspaceId", "whatsappInstanceId", "receivedAt", "summaryPayload"
    FROM "WebhookLog"
    WHERE source = 'uazapi'
      AND "receivedAt" >= $1
      AND "summaryPayload"::text ILIKE '%ctwa%'
    ORDER BY "receivedAt" ASC
    `,
    since,
  );
  return rows;
}

async function main() {
  console.log("=== REPROCESS UAZAPI CTWA ===");
  console.log({ mode, lookbackHours: LOOKBACK_HOURS });

  const rows = await loadCandidates();
  console.log("webhookLogs candidatos:", rows.length);

  const stats = {
    skippedNoPayload: 0,
    skippedNoCtwa: 0,
    skippedNoPhone: 0,
    skippedGroup: 0,
    skippedOutbound: 0,
    skippedNoWorkspace: 0,
    wouldUpsert: 0,
    upserted: 0,
    eventCreated: 0,
    eventDuplicate: 0,
    errors: 0,
  };

  const preview = [];

  for (const row of rows) {
    const body = row.summaryPayload;
    if (!body || typeof body !== "object") {
      stats.skippedNoPayload++;
      continue;
    }
    const parsed = parseUazapi(body);
    if (!parsed.ctwaClid) {
      stats.skippedNoCtwa++;
      continue;
    }
    if (!parsed.phoneHash || !parsed.phone) {
      stats.skippedNoPhone++;
      continue;
    }
    if (parsed.isGroupChat === true) {
      stats.skippedGroup++;
      continue;
    }
    if (parsed.hasMessage && parsed.fromMe === true) {
      stats.skippedOutbound++;
      continue;
    }
    if (!row.workspaceId) {
      stats.skippedNoWorkspace++;
      continue;
    }

    const item = {
      logId: row.id,
      workspaceId: row.workspaceId,
      whatsappInstanceId: row.whatsappInstanceId,
      receivedAt: row.receivedAt,
      name: parsed.contactName || null,
      phone: parsed.phone,
      phoneHash: parsed.phoneHash,
      ctwaClid: parsed.ctwaClid,
      adId: parsed.adId || null,
      campaignId: parsed.campaignId || null,
      adSetId: parsed.adSetId || null,
      ctwaSourceUrl: parsed.ctwaSourceUrl || null,
      externalEventId: parsed.externalEventId || null,
    };

    if (preview.length < 8) preview.push(item);
    stats.wouldUpsert++;

    if (mode !== "execute") continue;

    try {
      const lead = await prisma.lead.upsert({
        where: {
          workspaceId_phoneHash: {
            workspaceId: item.workspaceId,
            phoneHash: item.phoneHash,
          },
        },
        create: {
          workspaceId: item.workspaceId,
          whatsappInstanceId: item.whatsappInstanceId || null,
          name: item.name,
          phoneDisplay: formatPhone(item.phone),
          phoneHash: item.phoneHash,
          status: "active",
          source: "uazapi",
          labels: [],
          campaignId: item.campaignId,
          adSetId: item.adSetId,
          adId: item.adId,
          ctwaClid: item.ctwaClid,
          ctwaSourceUrl: item.ctwaSourceUrl,
          firstMessageAt: item.receivedAt,
          lastMessageAt: item.receivedAt,
        },
        update: {
          whatsappInstanceId: item.whatsappInstanceId || undefined,
          name: item.name || undefined,
          phoneDisplay: formatPhone(item.phone) || undefined,
          source: "uazapi",
          campaignId: item.campaignId || undefined,
          adSetId: item.adSetId || undefined,
          adId: item.adId || undefined,
          ctwaClid: item.ctwaClid,
          ctwaSourceUrl: item.ctwaSourceUrl || undefined,
          lastMessageAt: item.receivedAt,
        },
      });
      stats.upserted++;

      const subject = lead.id;
      const dedupeKey = [
        item.workspaceId,
        subject,
        "auto_lead",
        "LeadSubmitted",
        item.adId ?? "missing_ad",
      ].join(":");

      const existing = await prisma.conversionEventLog.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });
      if (existing) {
        stats.eventDuplicate++;
      } else {
        await prisma.conversionEventLog.create({
          data: {
            workspaceId: item.workspaceId,
            leadId: lead.id,
            phoneHash: item.phoneHash,
            eventOccurredAt: item.receivedAt,
            customerIdentityKey: item.phoneHash,
            businessSource: "paid",
            purchaseKind: null,
            sourceTrigger: "auto_lead",
            eventName: "LeadSubmitted",
            status: item.adId ? "ready" : "pending_attribution",
            pixelId: null,
            eventId: dedupeKey,
            campaignId: item.campaignId,
            adSetId: item.adSetId,
            adId: item.adId,
            ctwaClid: item.ctwaClid,
            attributionStatus: item.adId ? "attributed" : "missing_ad_id",
            dedupeKey,
            valueCents: null,
            currency: null,
            contentName: null,
            errorCode: item.adId ? null : "missing_ad_id",
            errorMessage: item.adId
              ? null
              : "Evento automatico sem adId resolvido",
          },
        });
        stats.eventCreated++;
      }
    } catch (e) {
      stats.errors++;
      console.error("ERRO log", item.logId, e.message);
    }
  }

  console.log("=== PREVIEW (ate 8) ===");
  for (const p of preview) {
    console.log(
      "-",
      p.receivedAt?.toISOString?.() || p.receivedAt,
      "| name=",
      p.name || "NULL",
      "| phone=",
      p.phone,
      "| ad=",
      p.adId || "NULL",
      "| camp=",
      p.campaignId || "NULL",
      "| ctwa=",
      p.ctwaClid.slice(0, 16) + "...",
      "| ws=",
      p.workspaceId,
    );
  }
  console.log("=== STATS ===");
  console.log(stats);
  if (mode === "dry-run") {
    console.log(
      "DRY-RUN: nada foi gravado. Rode com --execute para aplicar.",
    );
  } else {
    console.log("OK - reprocess finalizado.");
  }
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
