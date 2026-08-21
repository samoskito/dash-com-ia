#!/usr/bin/env node
/**
 * Mass phone lookup across Dr. Hernia workspaces (read-only).
 * Answers: is this number in WppTrack? paid (CTWA)? which unit? any conversion/XMAX?
 *
 * Dokploy (API container):
 *   cd /app/apps/api && PHONES="55...,55..." node scripts/lookup-dr-hernia-phones.js
 *
 * Optional:
 *   PHONES_FILE=/tmp/phones.txt   one number per line
 *   WORKSPACE_IDS=id1,id2         override (default: all XMAX Dr.Hernia units)
 *
 * No secrets. Phones masked in output.
 */
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { PrismaClient } = require("@prisma/client");

console.error("LOOKUP_DR_HERNIA_PHONES_VERSION=2026-08-21f");

const prisma = new PrismaClient();

const DEFAULT_WS = [
  "cmsr3w5gxpywjqo2e8frh4ix5", // Foz 10
  "cmsr3shnbpytjqo2espqmqriz", // Caxias 11
  "cmsxluhm90000qhdvvg53joda", // Bento 12
  "cmsr3vquepyw6qo2eaekb3uat", // Chapeco 13
  "cmsr3vbhspyvtqo2ed8u71zuu", // Xanxere 14
  "cmsr3u52opyuvqo2eoi548n4u", // Canoas 16
  "cmsr3t6elpytxqo2emgxfe6ke", // Farroupilha 42
  "cmsr3uq7tpyv8qo2eez5a4n6j", // Nova Prata 43
];

const UNIT_BY_WS = {
  cmsr3w5gxpywjqo2e8frh4ix5: "Foz",
  cmsr3shnbpytjqo2espqmqriz: "Caxias",
  cmsxluhm90000qhdvvg53joda: "Bento",
  cmsr3vquepyw6qo2eaekb3uat: "Chapeco",
  cmsr3vbhspyvtqo2ed8u71zuu: "Xanxere",
  cmsr3u52opyuvqo2eoi548n4u: "Canoas",
  cmsr3t6elpytxqo2emgxfe6ke: "Farroupilha",
  cmsr3uq7tpyv8qo2eez5a4n6j: "Nova Prata",
};

function digitsOnly(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function mask(digits) {
  if (!digits || digits.length < 8) return "(short)";
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

function hashDigits(digits) {
  return createHash("sha256").update(digits, "utf8").digest("hex");
}

/**
 * BR phone variants: with/without country 55, with/without mobile 9th digit.
 * Production stores sha256 of normalized digits (typically 55+DDD+number).
 */
function candidateDigits(raw) {
  let d = digitsOnly(raw);
  if (!d) return [];
  const set = new Set();

  const add = (x) => {
    if (x && x.length >= 10 && x.length <= 15) set.add(x);
  };

  add(d);
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) add(`55${d}`);
  if (d.startsWith("55") && d.length >= 12) add(d.slice(2));

  // 55 + DDD + 9 + 8digits (13) ↔ 55 + DDD + 8digits (12)
  const with55 = d.startsWith("55") ? d : `55${d}`;
  if (with55.length === 13 && with55[4] === "9") {
    add(with55.slice(0, 4) + with55.slice(5)); // drop 9
  }
  if (with55.length === 12) {
    add(with55.slice(0, 4) + "9" + with55.slice(4)); // insert 9
  }

  return [...set];
}

function loadPhones() {
  const fromEnv = (process.env.PHONES || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.PHONES_FILE) {
    const file = readFileSync(process.env.PHONES_FILE, "utf8");
    for (const line of file.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith("#")) fromEnv.push(t);
    }
  }
  return fromEnv;
}

async function main() {
  const phones = loadPhones();
  if (phones.length === 0) {
    console.error(
      "PHONES vazio. Exemplo:\n  PHONES=\"555499989238,5554996146149\" node scripts/lookup-dr-hernia-phones.js",
    );
    process.exitCode = 2;
    return;
  }

  const workspaceIds = (process.env.WORKSPACE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ws = workspaceIds.length ? workspaceIds : DEFAULT_WS;

  const accounts = await prisma.xmaxAccount.findMany({
    where: { workspaceId: { in: ws } },
    select: { id: true, workspaceId: true, queueId: true, displayName: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const rows = [];
  let paid = 0;
  let unpaid = 0;
  let missing = 0;
  let withXmax = 0;

  for (const raw of phones) {
    const variants = candidateDigits(raw);
    const hashes = variants.map(hashDigits);
    const hashSet = [...new Set(hashes)];

    const leads =
      hashSet.length === 0
        ? []
        : await prisma.lead.findMany({
            where: { phoneHash: { in: hashSet }, workspaceId: { in: ws } },
            select: {
              id: true,
              workspaceId: true,
              source: true,
              adId: true,
              ctwaClid: true,
              campaignId: true,
              adSetId: true,
              createdAt: true,
              firstMessageAt: true,
              phoneDisplay: true,
            },
            take: 20,
          });

    const events =
      hashSet.length === 0
        ? []
        : await prisma.conversionEventLog.findMany({
            where: { phoneHash: { in: hashSet }, workspaceId: { in: ws } },
            orderBy: { eventOccurredAt: "desc" },
            take: 30,
            select: {
              workspaceId: true,
              eventName: true,
              status: true,
              eventOccurredAt: true,
              sourceTrigger: true,
              valueCents: true,
            },
          });

    const xmaxEvents =
      hashSet.length === 0 || accountIds.length === 0
        ? []
        : await prisma.xmaxShadowEvent.findMany({
            where: {
              accountId: { in: accountIds },
              OR: [
                { phoneHash: { in: hashSet } },
                { phoneNormalized: { in: variants } },
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              accountId: true,
              eventName: true,
              status: true,
              reasonCode: true,
              createdAt: true,
              contactId: true,
            },
          });

    const isPaid = leads.some((l) => l.adId && l.ctwaClid);
    const isUnpaidLead = leads.length > 0 && !isPaid;
    if (leads.length === 0) missing += 1;
    else if (isPaid) paid += 1;
    else unpaid += 1;
    if (xmaxEvents.length) withXmax += 1;

    const primaryDigits = variants[0] || digitsOnly(raw);

    rows.push({
      inputMasked: mask(primaryDigits),
      variantsTried: variants.map(mask),
      verdict:
        leads.length === 0
          ? "NOT_IN_PLATFORM"
          : isPaid
            ? "PAID_CTWA"
            : "LEAD_WITHOUT_CTWA",
      leads: leads.map((l) => ({
        unit: UNIT_BY_WS[l.workspaceId] || l.workspaceId.slice(0, 8),
        workspaceId: l.workspaceId,
        source: l.source,
        paid: Boolean(l.adId && l.ctwaClid),
        hasAdId: Boolean(l.adId),
        hasCtwaClid: Boolean(l.ctwaClid),
        hasCampaignId: Boolean(l.campaignId),
        hasAdSetId: Boolean(l.adSetId),
        createdAt: l.createdAt,
        firstMessageAt: l.firstMessageAt,
      })),
      conversionEvents: events.map((e) => ({
        unit: UNIT_BY_WS[e.workspaceId] || e.workspaceId.slice(0, 8),
        eventName: e.eventName,
        status: e.status,
        at: e.eventOccurredAt,
        source: e.sourceTrigger,
        valueCents: e.valueCents,
      })),
      xmaxEvents: xmaxEvents.map((x) => {
        const acc = accounts.find((a) => a.id === x.accountId);
        return {
          unit: acc ? UNIT_BY_WS[acc.workspaceId] || acc.queueId : "?",
          eventName: x.eventName,
          status: x.status,
          reasonCode: x.reasonCode,
          at: x.createdAt,
          contactId: x.contactId,
        };
      }),
    });
  }

  const summary = {
    total: phones.length,
    paidCtwa: paid,
    leadWithoutCtwa: unpaid,
    notInPlatform: missing,
    withXmaxShadow: withXmax,
  };

  console.log(
    JSON.stringify(
      {
        version: "2026-08-21f",
        generatedAt: new Date().toISOString(),
        summary,
        legend: {
          PAID_CTWA: "lead na plataforma com adId+ctwaClid (trafego pago atribuivel)",
          LEAD_WITHOUT_CTWA: "lead existe mas sem CTWA (organico / gate)",
          NOT_IN_PLATFORM: "nenhum lead nas unidades Dr.Hernia (variantes 9o digito testadas)",
        },
        rows,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error("LOOKUP_FAILED", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
