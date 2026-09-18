// Seed the XMAX global ingress + per-queue accounts for Dr. Hernia (X3c).
//
// Usage (from apps/api):
//   node scripts/seed-xmax-dr-hernia-queues.js --dry-run   (default)
//   node scripts/seed-xmax-dr-hernia-queues.js --execute
//
// What it does:
//   1. Create/ensure one XmaxIngress labeled "Dr. Hernia" (idempotent by label).
//      On creation, prints the webhook URL path and the plaintext secret ONCE.
//   2. Fix the Bento account: queueId "10" -> "12" (it was seeded wrong),
//      set queueName, link ingressId. Never touches shadowMode/capiSendEnabled/
//      status — Bento is live in production today and must not flip to shadow.
//   3. Upsert shadow XmaxAccount rows for the other 7 queues (Hernandarias is
//      intentionally excluded — not connected yet). New rows copy the
//      encrypted apiKey ciphertext straight from Bento (same tenant, same
//      encryption key — no plaintext is ever read or written) unless
//      XMAX_API_KEY overrides it.
//
// Optional env:
//   WEBHOOK_SECRET               plaintext ingress secret (else one is generated)
//   BENTO_ACCOUNT_ID              default cmt04979c0001ox3k1iqcbey9
//   XMAX_API_KEY                  plaintext override — re-encrypted, never logged
//   XMAX_BASE_URL                 override baseUrl for the 7 new accounts (else Bento's)
//   XMAX_API_KEY_ENCRYPTION_KEY / META_TOKEN_ENCRYPTION_KEY   required only if XMAX_API_KEY is set
//
// Safety:
//   - Dry-run by default; --execute required to write.
//   - Refuses to write if (ingressId, queueId) would collide across workspaces.
//   - Never logs apiKey plaintext, at any point, in either mode.

const { PrismaClient } = require("@prisma/client");
const { randomBytes, createHash, createCipheriv } = require("node:crypto");

const prisma = new PrismaClient();

const mode = process.argv.includes("--execute") ? "execute" : "dry-run";

const INGRESS_LABEL = "Dr. Hernia";
const BENTO_ACCOUNT_ID =
  process.env.BENTO_ACCOUNT_ID || "cmt04979c0001ox3k1iqcbey9";
// CRITICAL: Bento's queue is 12, NOT 10. The live account was seeded wrong.
const BENTO_QUEUE_ID = "12";
const BENTO_UNIT = "Bento Gonçalves";

// Canonical queue map (Samuel 2026-08-20) — source of truth. Hernandarias is
// intentionally excluded (not connected yet; DDI 595 when it is).
const QUEUE_MAP = [
  {
    queueId: "10",
    unit: "Foz do Iguaçu",
    workspaceId: "cmsr3w5gxpywjqo2e8frh4ix5",
  },
  {
    queueId: "11",
    unit: "Caxias do Sul",
    workspaceId: "cmsr3shnbpytjqo2espqmqriz",
  },
  { queueId: BENTO_QUEUE_ID, unit: BENTO_UNIT, workspaceId: "cmsxluhm90000qhdvvg53joda" },
  {
    queueId: "13",
    unit: "Chapecó",
    workspaceId: "cmsr3vquepyw6qo2eaekb3uat",
  },
  {
    queueId: "14",
    unit: "Xanxerê",
    workspaceId: "cmsr3vbhspyvtqo2ed8u71zuu",
  },
  { queueId: "16", unit: "Canoas", workspaceId: "cmsr3u52opyuvqo2eoi548n4u" },
  {
    queueId: "42",
    unit: "Farroupilha",
    workspaceId: "cmsr3t6elpytxqo2emgxfe6ke",
  },
  {
    queueId: "43",
    unit: "Nova Prata",
    workspaceId: "cmsr3uq7tpyv8qo2eez5a4n6j",
  },
];

const QUALIFIED_LEAD_TAG_IDS = ["55"];
const PURCHASE_TAG_IDS = ["56"];
const PURCHASE_VALUE_CENTS = 300000;
const DEFAULT_COUNTRY_CODE = "55";
const XMAX_AAD = Buffer.from("wpptrack:xmax-account:v1", "utf8");

function hashSecret(secret) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Mirrors XmaxCredentialEncryptionService.encrypt() exactly. */
function encryptApiKey(apiKey, keyMaterial) {
  const key = createHash("sha256").update(keyMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(XMAX_AAD);
  const encrypted = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  return {
    apiKeyEncrypted: encrypted.toString("base64"),
    apiKeyIv: iv.toString("base64"),
    apiKeyTag: cipher.getAuthTag().toString("base64"),
  };
}

async function main() {
  console.log("=== SEED XMAX DR HERNIA QUEUES ===", { mode });

  const bento = await prisma.xmaxAccount.findUnique({
    where: { id: BENTO_ACCOUNT_ID },
  });
  if (!bento) {
    throw new Error(
      `Bento account not found: ${BENTO_ACCOUNT_ID}. Aborting — refusing to guess.`,
    );
  }
  const bentoMapEntry = QUEUE_MAP.find((q) => q.queueId === BENTO_QUEUE_ID);
  if (bento.workspaceId !== bentoMapEntry.workspaceId) {
    throw new Error(
      `SANITY: Bento account workspaceId ${bento.workspaceId} does not match canonical map ${bentoMapEntry.workspaceId}. Aborting.`,
    );
  }
  console.log("Bento account found:", {
    id: bento.id,
    workspaceId: bento.workspaceId,
    currentQueueId: bento.queueId,
    shadowMode: bento.shadowMode,
    capiSendEnabled: bento.capiSendEnabled,
  });

  // --- 1) Ingress ---------------------------------------------------------
  let ingress = await prisma.xmaxIngress.findFirst({
    where: { label: INGRESS_LABEL },
  });

  if (!ingress) {
    const ingressSecretPlaintext =
      process.env.WEBHOOK_SECRET || randomBytes(24).toString("hex");
    console.log(`INGRESS: "${INGRESS_LABEL}" does not exist yet — will create.`);
    if (mode === "execute") {
      ingress = await prisma.xmaxIngress.create({
        data: {
          label: INGRESS_LABEL,
          webhookSecretHash: hashSecret(ingressSecretPlaintext),
          status: "active",
        },
      });
      console.log("INGRESS CREATED:", ingress.id);
      console.log("Webhook URL path: /webhooks/xmax/ingress/" + ingress.id);
      console.log(
        "Webhook secret (SAVE THIS NOW — shown once, never stored in plaintext):",
        ingressSecretPlaintext,
      );
    } else {
      console.log(
        "DRY-RUN: would create ingress and print URL + secret once, on --execute.",
      );
    }
  } else {
    console.log("INGRESS: already exists", {
      id: ingress.id,
      status: ingress.status,
    });
    console.log("Webhook URL path: /webhooks/xmax/ingress/" + ingress.id);
    console.log("(secret unchanged — it is only ever shown once, at creation)");
  }

  // --- 2) Fix Bento: queueId 10 -> 12, queueName, ingressId link ---------
  // Never touch shadowMode / capiSendEnabled / status — Bento is production.
  if (bento.queueId !== BENTO_QUEUE_ID) {
    console.log(
      `BENTO FIX: queueId "${bento.queueId}" -> "${BENTO_QUEUE_ID}" (was wrong in DB — CRITICAL)`,
    );
  } else {
    console.log("BENTO: queueId already correct (12)");
  }
  if (bento.ingressId && ingress && bento.ingressId !== ingress.id) {
    throw new Error(
      `REFUSING: Bento already linked to a different ingress (${bento.ingressId}).`,
    );
  }

  if (mode === "execute") {
    await prisma.xmaxAccount.update({
      where: { id: bento.id },
      data: {
        queueId: BENTO_QUEUE_ID,
        queueName: BENTO_UNIT,
        ingressId: ingress.id,
      },
    });
    console.log(
      "BENTO: updated (queueId/queueName/ingressId only — shadowMode/capiSendEnabled/status untouched)",
    );
  } else {
    console.log(
      "DRY-RUN: would update Bento's queueId/queueName/ingressId only.",
    );
  }

  // --- 3) Upsert shadow accounts for the other 7 queues -------------------
  const others = QUEUE_MAP.filter((q) => q.queueId !== BENTO_QUEUE_ID);
  const overrideApiKey = process.env.XMAX_API_KEY || null;
  const baseUrl = process.env.XMAX_BASE_URL || bento.baseUrl;

  let newAccountCredFields;
  if (overrideApiKey) {
    const keyMaterial =
      process.env.XMAX_API_KEY_ENCRYPTION_KEY || process.env.META_TOKEN_ENCRYPTION_KEY;
    if (!keyMaterial) {
      throw new Error(
        "XMAX_API_KEY override given but no XMAX_API_KEY_ENCRYPTION_KEY/META_TOKEN_ENCRYPTION_KEY in env.",
      );
    }
    newAccountCredFields = encryptApiKey(overrideApiKey, keyMaterial);
    console.log(
      "CREDENTIALS: using XMAX_API_KEY override (re-encrypted; plaintext never logged).",
    );
  } else {
    newAccountCredFields = {
      apiKeyEncrypted: bento.apiKeyEncrypted,
      apiKeyIv: bento.apiKeyIv,
      apiKeyTag: bento.apiKeyTag,
    };
    console.log(
      "CREDENTIALS: copying Bento's encrypted apiKey ciphertext (same tenant) — plaintext never read or written.",
    );
  }

  const summary = [];
  for (const q of others) {
    if (ingress) {
      const clash = await prisma.xmaxAccount.findFirst({
        where: { ingressId: ingress.id, queueId: q.queueId },
      });
      if (clash && clash.workspaceId !== q.workspaceId) {
        throw new Error(
          `REFUSING: queueId ${q.queueId} already routes to workspace ${clash.workspaceId}, not ${q.workspaceId} (${q.unit}).`,
        );
      }
    }

    const existing = await prisma.xmaxAccount.findFirst({
      where: { workspaceId: q.workspaceId, queueId: q.queueId },
    });

    const shadowConfig = {
      queueName: q.unit,
      shadowMode: true,
      capiSendEnabled: false,
      qualifiedLeadTagIds: QUALIFIED_LEAD_TAG_IDS,
      purchaseTagIds: PURCHASE_TAG_IDS,
      purchaseValueCents: PURCHASE_VALUE_CENTS,
      defaultCountryCode: DEFAULT_COUNTRY_CODE,
      status: "active",
      ...(ingress ? { ingressId: ingress.id } : {}),
    };

    if (existing) {
      console.log(
        `UNIT ${q.unit} (queue ${q.queueId}): account exists (${existing.id}) — will update shadow config + ingress link.`,
      );
      summary.push({ unit: q.unit, queueId: q.queueId, action: "update", accountId: existing.id });
      if (mode === "execute") {
        await prisma.xmaxAccount.update({
          where: { id: existing.id },
          data: shadowConfig,
        });
      }
    } else {
      console.log(
        `UNIT ${q.unit} (queue ${q.queueId}): no account yet — will create shadow account.`,
      );
      summary.push({ unit: q.unit, queueId: q.queueId, action: "create" });
      if (mode === "execute") {
        // Per-account webhookSecretHash is required by schema but unused in
        // practice — these units are only reachable via the global ingress.
        const unusedPerAccountSecret = randomBytes(24).toString("hex");
        await prisma.xmaxAccount.create({
          data: {
            workspaceId: q.workspaceId,
            displayName: `XMAX — ${q.unit}`,
            baseUrl,
            queueId: q.queueId,
            ...newAccountCredFields,
            webhookSecretHash: hashSecret(unusedPerAccountSecret),
            purchaseCurrency: "BRL",
            ...shadowConfig,
          },
        });
      }
    }
  }

  console.log("=== SUMMARY ===");
  for (const row of summary) {
    console.log(" -", row.unit, "| queue", row.queueId, "|", row.action, row.accountId || "");
  }

  if (mode === "dry-run") {
    console.log("DRY-RUN: nothing written. Re-run with --execute to apply.");
  } else {
    console.log("OK — seed applied.");
  }
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
