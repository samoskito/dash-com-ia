#!/usr/bin/env node
/**
 * Backend diagnosis for Dr. Hernia XMAX + conversion funnel (no secrets/phones full).
 *
 * Usage (Dokploy API container):
 *   cd /app/apps/api && node scripts/diagnose-dr-hernia-conversions.js
 *   cd /app/apps/api && PHONES="5511999999999,5541999999999" node scripts/diagnose-dr-hernia-conversions.js
 *
 * Optional env:
 *   INGRESS_ID   default cmt0t7kvv0000o25mefvu6fzx
 *   HOURS        lookback window (default 48)
 *   PHONES       comma-separated digits (with or without +) to inspect
 */
const { createHash } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const INGRESS_ID = process.env.INGRESS_ID || "cmt0t7kvv0000o25mefvu6fzx";
const HOURS = Math.max(1, Number(process.env.HOURS || 48));
const BENTO_ACCOUNT = "cmt04979c0001ox3k1iqcbey9";
const BENTO_WS = "cmsxluhm90000qhdvvg53joda";

const QUEUE_LABEL = {
  10: "Foz",
  11: "Caxias",
  12: "Bento",
  13: "Chapeco",
  14: "Xanxere",
  16: "Canoas",
  42: "Farroupilha",
  43: "Nova Prata",
};

function maskPhone(digits) {
  if (!digits || digits.length < 8) return "(short)";
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

function phoneHash(digits) {
  // Same as production hashNormalizedPhone: sha256 of normalized digits
  return createHash("sha256").update(digits, "utf8").digest("hex");
}

function normalizeDigits(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  // BR national 10/11 → prefix 55
  if ((d.length === 10 || d.length === 11) && !d.startsWith("55")) return `55${d}`;
  return d;
}

async function main() {
  const since = new Date(Date.now() - HOURS * 60 * 60 * 1000);
  const out = { generatedAt: new Date().toISOString(), hours: HOURS, since: since.toISOString() };

  // --- Ingress ---
  const ingress = await prisma.xmaxIngress.findUnique({
    where: { id: INGRESS_ID },
    select: {
      id: true,
      label: true,
      status: true,
      lastWebhookAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  out.ingress = ingress;
  const ingressStaleMin = ingress?.lastWebhookAt
    ? Math.round((Date.now() - new Date(ingress.lastWebhookAt).getTime()) / 60000)
    : null;
  out.ingressHealth = {
    ok: Boolean(ingress && ingress.status === "active"),
    minutesSinceLastWebhook: ingressStaleMin,
    stale: ingressStaleMin == null ? true : ingressStaleMin > 180,
  };

  // --- Accounts ---
  const accounts = await prisma.xmaxAccount.findMany({
    where: {
      OR: [{ ingressId: INGRESS_ID }, { id: BENTO_ACCOUNT }, { workspaceId: BENTO_WS }],
    },
    select: {
      id: true,
      workspaceId: true,
      displayName: true,
      queueId: true,
      queueName: true,
      status: true,
      shadowMode: true,
      capiSendEnabled: true,
      lastWebhookAt: true,
      lastSuccessfulGetContact: true,
      lastErrorCode: true,
      purchaseValueCents: true,
      qualifiedLeadTagId: true,
      purchaseTagId: true,
      updatedAt: true,
    },
    orderBy: { queueId: "asc" },
  });

  // de-dupe by id
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const accountList = [...byId.values()].sort((a, b) =>
    String(a.queueId).localeCompare(String(b.queueId), "en", { numeric: true }),
  );

  out.accounts = accountList.map((a) => {
    const mins = a.lastWebhookAt
      ? Math.round((Date.now() - new Date(a.lastWebhookAt).getTime()) / 60000)
      : null;
    const getContactMins = a.lastSuccessfulGetContact
      ? Math.round((Date.now() - new Date(a.lastSuccessfulGetContact).getTime()) / 60000)
      : null;
    return {
      unit: QUEUE_LABEL[a.queueId] || a.displayName || a.queueName || a.queueId,
      queueId: a.queueId,
      accountId: a.id,
      workspaceId: a.workspaceId,
      status: a.status,
      mode: a.shadowMode ? "shadow" : a.capiSendEnabled ? "production" : "prod_flags_off",
      shadowMode: a.shadowMode,
      capiSendEnabled: a.capiSendEnabled,
      lastWebhookAt: a.lastWebhookAt,
      minutesSinceWebhook: mins,
      lastSuccessfulGetContact: a.lastSuccessfulGetContact,
      minutesSinceGetContact: getContactMins,
      lastErrorCode: a.lastErrorCode,
      purchaseValueCents: a.purchaseValueCents,
      tags: { ql: a.qualifiedLeadTagId, purchase: a.purchaseTagId },
      isBento: a.id === BENTO_ACCOUNT || a.queueId === "12",
      webhookStale: mins == null ? true : mins > 180,
      getContactStale: getContactMins == null ? true : getContactMins > 180,
    };
  });

  const bento = out.accounts.find((a) => a.isBento) || null;
  out.bento = bento;

  // --- Shadow events last window (all linked accounts) ---
  const accountIds = accountList.map((a) => a.id);
  const shadows = accountIds.length
    ? await prisma.xmaxShadowEvent.findMany({
        where: { accountId: { in: accountIds }, createdAt: { gte: since } },
        select: {
          accountId: true,
          eventName: true,
          status: true,
          reasonCode: true,
          createdAt: true,
          phoneHash: true,
          contactId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

  const reasonCounts = {};
  const byAccount = {};
  for (const s of shadows) {
    const key = `${s.status}|${s.reasonCode || "-"}|${s.eventName || "-"}`;
    reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    const acc = byAccount[s.accountId] || (byAccount[s.accountId] = { total: 0, reasons: {} });
    acc.total += 1;
    acc.reasons[key] = (acc.reasons[key] || 0) + 1;
  }
  out.xmaxShadowSummary = {
    total: shadows.length,
    reasonCounts,
    byAccount: Object.fromEntries(
      Object.entries(byAccount).map(([id, v]) => {
        const acc = accountList.find((a) => a.id === id);
        return [
          id,
          {
            unit: QUEUE_LABEL[acc?.queueId] || acc?.displayName || id.slice(0, 8),
            queueId: acc?.queueId,
            ...v,
          },
        ];
      }),
    ),
    recent: shadows.slice(0, 25).map((s) => {
      const acc = accountList.find((a) => a.id === s.accountId);
      return {
        at: s.createdAt,
        unit: QUEUE_LABEL[acc?.queueId] || acc?.queueId,
        eventName: s.eventName,
        status: s.status,
        reasonCode: s.reasonCode,
        contactId: s.contactId,
        phoneHash8: s.phoneHash ? s.phoneHash.slice(0, 8) : null,
      };
    }),
  };

  // --- Workspace conversion health (all Dr Hernia workspaces) ---
  const workspaceIds = [...new Set(accountList.map((a) => a.workspaceId))];
  out.workspaces = [];

  for (const workspaceId of workspaceIds) {
    const unitAcc = accountList.filter((a) => a.workspaceId === workspaceId);
    const unitLabel = unitAcc.map((a) => QUEUE_LABEL[a.queueId] || a.queueId).join(",");

    const [leadCount, leadsPaid, eventsByName, rules, recentEvents] = await Promise.all([
      prisma.lead.count({ where: { workspaceId, createdAt: { gte: since } } }),
      prisma.lead.count({
        where: {
          workspaceId,
          createdAt: { gte: since },
          AND: [{ adId: { not: null } }, { ctwaClid: { not: null } }],
        },
      }),
      prisma.conversionEventLog.groupBy({
        by: ["eventName", "status"],
        where: { workspaceId, eventOccurredAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.conversionRule.findMany({
        where: { workspaceId, active: true },
        select: {
          id: true,
          name: true,
          eventName: true,
          triggerType: true,
          triggerValue: true,
          defaultValueCents: true,
        },
        take: 40,
      }),
      prisma.conversionEventLog.findMany({
        where: { workspaceId, eventOccurredAt: { gte: since } },
        orderBy: { eventOccurredAt: "desc" },
        take: 15,
        select: {
          eventName: true,
          status: true,
          eventOccurredAt: true,
          valueCents: true,
          phoneHash: true,
          source: true,
        },
      }),
    ]);

    // Provider rules (message / automation) for IC visibility
    const providerRules = await prisma.providerConversionRuleConfig.findMany({
      where: { workspaceId, removedAt: null },
      select: {
        id: true,
        mode: true,
        productionActivatedAt: true,
        messageTriggerPhrases: true,
        conversionRule: {
          select: {
            name: true,
            eventName: true,
            triggerType: true,
            active: true,
            defaultValueCents: true,
          },
        },
        connection: {
          select: { provider: true, displayName: true, status: true },
        },
      },
      take: 40,
    });

    const eventMatrix = {};
    for (const row of eventsByName) {
      const k = row.eventName;
      if (!eventMatrix[k]) eventMatrix[k] = {};
      eventMatrix[k][row.status] = row._count._all;
    }

    out.workspaces.push({
      workspaceId,
      units: unitLabel,
      isBento: workspaceId === BENTO_WS,
      leadsCreated: leadCount,
      leadsPaidCreated: leadsPaid,
      organicOrUnpaidCreated: Math.max(0, leadCount - leadsPaid),
      conversionEvents: eventMatrix,
      activeLegacyRules: rules.map((r) => ({
        name: r.name,
        eventName: r.eventName,
        triggerType: r.triggerType,
        triggerValue: r.triggerValue,
        valueCents: r.defaultValueCents,
      })),
      providerRules: providerRules.map((r) => ({
        name: r.conversionRule.name,
        eventName: r.conversionRule.eventName,
        triggerType: r.conversionRule.triggerType,
        active: r.conversionRule.active,
        mode: r.mode,
        productionActivatedAt: r.productionActivatedAt,
        provider: r.connection.provider,
        connection: r.connection.displayName,
        connectionStatus: r.connection.status,
        phrases: r.messageTriggerPhrases,
        valueCents: r.conversionRule.defaultValueCents,
      })),
      recentEvents: recentEvents.map((e) => ({
        at: e.eventOccurredAt,
        eventName: e.eventName,
        status: e.status,
        source: e.source,
        valueCents: e.valueCents,
        phoneHash8: e.phoneHash ? e.phoneHash.slice(0, 8) : null,
      })),
    });
  }

  // --- Phone lookups (optional) ---
  const phoneRaw = (process.env.PHONES || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  out.phoneLookups = [];
  for (const raw of phoneRaw) {
    const digits = normalizeDigits(raw);
    if (!digits) continue;
    const hash = phoneHash(digits);
    const leads = await prisma.lead.findMany({
      where: { phoneHash: hash, workspaceId: { in: workspaceIds } },
      select: {
        id: true,
        workspaceId: true,
        adId: true,
        ctwaClid: true,
        campaignId: true,
        createdAt: true,
        firstMessageAt: true,
      },
      take: 10,
    });
    const events = await prisma.conversionEventLog.findMany({
      where: { phoneHash: hash, workspaceId: { in: workspaceIds } },
      orderBy: { eventOccurredAt: "desc" },
      take: 20,
      select: {
        workspaceId: true,
        eventName: true,
        status: true,
        eventOccurredAt: true,
        valueCents: true,
        source: true,
      },
    });
    const xmaxShadows = await prisma.xmaxShadowEvent.findMany({
      where: {
        OR: [{ phoneHash: hash }, { phoneNormalized: digits }],
        accountId: { in: accountIds },
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
    out.phoneLookups.push({
      phoneMasked: maskPhone(digits),
      digitsLen: digits.length,
      phoneHash8: hash.slice(0, 8),
      leads: leads.map((l) => ({
        workspaceId: l.workspaceId,
        unit:
          accountList.find((a) => a.workspaceId === l.workspaceId)?.queueId ||
          null,
        paid: Boolean(l.adId && l.ctwaClid),
        adId: l.adId ? "set" : null,
        ctwaClid: l.ctwaClid ? "set" : null,
        createdAt: l.createdAt,
        firstMessageAt: l.firstMessageAt,
      })),
      conversionEvents: events,
      xmaxEvents: xmaxShadows.map((s) => ({
        unit: QUEUE_LABEL[accountList.find((a) => a.id === s.accountId)?.queueId],
        ...s,
      })),
    });
  }

  // --- Findings (auto) ---
  const findings = [];
  if (!ingress) findings.push("CRITICO: ingress Dr.Hernia nao encontrado");
  else if (out.ingressHealth.stale)
    findings.push(
      `ALERTA: ingress sem webhook ha ${out.ingressHealth.minutesSinceLastWebhook} min — XMAX pode nao estar batendo na URL global`,
    );

  if (bento) {
    if (bento.status !== "active")
      findings.push(`CRITICO Bento: status=${bento.status}`);
    if (bento.lastErrorCode)
      findings.push(`CRITICO Bento: lastErrorCode=${bento.lastErrorCode}`);
    if (bento.webhookStale)
      findings.push(
        `ALERTA Bento: lastWebhookAt stale (${bento.minutesSinceWebhook} min) — tags XMAX desta fila nao estao chegando`,
      );
    if (bento.getContactStale)
      findings.push(
        `ALERTA Bento: getContact stale (${bento.minutesSinceGetContact} min)`,
      );
    if (bento.mode !== "production")
      findings.push(`INFO Bento: mode=${bento.mode} (esperado production)`);
  } else {
    findings.push("CRITICO: conta Bento nao encontrada");
  }

  for (const ws of out.workspaces) {
    const ls = ws.conversionEvents.LeadSubmitted || {};
    const ql = ws.conversionEvents.QualifiedLead || {};
    const ic = ws.conversionEvents.InitiateCheckout || {};
    const lsTotal = Object.values(ls).reduce((a, b) => a + b, 0);
    const qlTotal = Object.values(ql).reduce((a, b) => a + b, 0);
    const icTotal = Object.values(ic).reduce((a, b) => a + b, 0);
    if (ws.isBento && ws.leadsPaidCreated === 0 && lsTotal === 0) {
      findings.push(
        "Bento: 0 leads pagos + 0 LeadSubmitted na janela — bate com Meta>0 e Conversas reais=0 (CTWA/WhatsApp tracking quebrado ou leads sem adId+ctwaClid)",
      );
    }
    if (qlTotal === 0) {
      findings.push(
        `${ws.units}: 0 QualifiedLead em ConversionEventLog na janela (tag XMAX shadow-only OU paid-only descartou OU dedup)`,
      );
    }
    if (icTotal === 0) {
      const hasIcRule = ws.providerRules.some(
        (r) => r.eventName === "InitiateCheckout" && r.active,
      );
      findings.push(
        `${ws.units}: 0 InitiateCheckout na janela` +
          (hasIcRule
            ? " (existe regra IC ativa — checar match de frase / connection production / paid lead)"
            : " (sem regra IC ativa neste workspace)"),
      );
    }
  }

  const discardedPaid = Object.entries(out.xmaxShadowSummary.reasonCounts)
    .filter(([k]) => k.includes("no_paid_lead") || k.includes("paid_attribution"))
    .reduce((a, [, n]) => a + n, 0);
  if (discardedPaid > 0) {
    findings.push(
      `XMAX: ${discardedPaid} eventos descartados por paid-only (tag chegou, mas lead sem CTWA na base)`,
    );
  }
  const noTag = Object.entries(out.xmaxShadowSummary.reasonCounts)
    .filter(([k]) => k.includes("no_mapped_tag"))
    .reduce((a, [, n]) => a + n, 0);
  if (noTag > 0) {
    findings.push(`XMAX: ${noTag} eventos sem tag mapeada (55/56) no getContact`);
  }

  out.findings = findings;

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("DIAGNOSE_FAILED", err && err.message ? err.message : err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
