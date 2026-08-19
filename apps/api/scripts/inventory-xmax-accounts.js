#!/usr/bin/env node
/**
 * Inventory XmaxAccount rows for Dr. Hernia workspaces (or all xmax accounts).
 *
 * Usage (Dokploy API container, 1 line):
 *   cd /app/apps/api && node scripts/inventory-xmax-accounts.js
 *   cd /app/apps/api && node scripts/inventory-xmax-accounts.js --all
 *
 * Never prints apiKey / webhook secrets.
 */
const { PrismaClient } = require("@prisma/client");

const DR_HERNIA_WORKSPACES = [
  { name: "Bento", id: "cmsxluhm90000qhdvvg53joda" },
  { name: "Canoas", id: "cmsr3u52opyuvqo2eoi548n4u" },
  { name: "Caxias", id: "cmsr3shnbpytjqo2espqmqriz" },
  { name: "Chapeco", id: "cmsr3vquepyw6qo2eaekb3uat" },
  { name: "Farroupilha", id: "cmsr3t6elpytxqo2emgxfe6ke" },
  { name: "Foz", id: "cmsr3w5gxpywjqo2e8frh4ix5" },
  { name: "Hernandarias", id: "cmsr3wq0fpyx4qo2ehxfckzo2" },
  { name: "Nova Prata", id: "cmsr3uq7tpyv8qo2eez5a4n6j" },
  { name: "Xanxere", id: "cmsr3vbhspyvtqo2ed8u71zuu" },
];

async function main() {
  const all = process.argv.includes("--all");
  const prisma = new PrismaClient();
  try {
    const workspaceIds = all
      ? undefined
      : DR_HERNIA_WORKSPACES.map((w) => w.id);

    const accounts = await prisma.xmaxAccount.findMany({
      where: workspaceIds ? { workspaceId: { in: workspaceIds } } : undefined,
      select: {
        id: true,
        workspaceId: true,
        displayName: true,
        status: true,
        shadowMode: true,
        capiSendEnabled: true,
        baseUrl: true,
        queueId: true,
        defaultCountryCode: true,
        qualifiedLeadTagIds: true,
        purchaseTagIds: true,
        purchaseValueCents: true,
        purchaseCurrency: true,
        lastWebhookAt: true,
        lastSuccessfulGetContact: true,
        lastErrorCode: true,
        createdAt: true,
      },
      orderBy: [{ workspaceId: "asc" }, { createdAt: "asc" }],
    });

    const accountsByWs = new Map();
    for (const a of accounts) {
      const list = accountsByWs.get(a.workspaceId) ?? [];
      list.push(a);
      accountsByWs.set(a.workspaceId, list);
    }
    const nameById = new Map(DR_HERNIA_WORKSPACES.map((w) => [w.id, w.name]));

    if (!all) {
      console.log("=== Dr. Hernia XMAX inventory ===");
      for (const w of DR_HERNIA_WORKSPACES) {
        const list = accountsByWs.get(w.id) ?? [];
        if (list.length === 0) {
          console.log(
            JSON.stringify({
              unit: w.name,
              workspaceId: w.id,
              xmax: null,
              status: "MISSING_ACCOUNT",
            }),
          );
          continue;
        }
        for (const a of list) {
          console.log(
            JSON.stringify({
              unit: w.name,
              workspaceId: w.id,
              accountId: a.id,
              displayName: a.displayName,
              status: a.status,
              shadowMode: a.shadowMode,
              capiSendEnabled: a.capiSendEnabled,
              queueId: a.queueId,
              tags: { ql: a.qualifiedLeadTagIds, purchase: a.purchaseTagIds },
              purchaseValueCents: a.purchaseValueCents,
              lastWebhookAt: a.lastWebhookAt,
              lastSuccessfulGetContact: a.lastSuccessfulGetContact,
              lastErrorCode: a.lastErrorCode,
              webhookPath: `/webhooks/xmax/accounts/${a.id}`,
            }),
          );
        }
      }
      const present = DR_HERNIA_WORKSPACES.filter((w) =>
        accountsByWs.has(w.id),
      ).length;
      console.log(
        JSON.stringify({
          summary: {
            units: DR_HERNIA_WORKSPACES.length,
            withXmaxAccount: present,
            missing: DR_HERNIA_WORKSPACES.length - present,
            accountRows: accounts.length,
            liveProduction: accounts.filter(
              (a) => a.shadowMode === false && a.capiSendEnabled === true,
            ).length,
          },
        }),
      );
    } else {
      console.log(
        JSON.stringify(
          accounts.map((a) => ({
            ...a,
            unitHint: nameById.get(a.workspaceId) ?? null,
            webhookPath: `/webhooks/xmax/accounts/${a.id}`,
          })),
          null,
          2,
        ),
      );
      console.log(JSON.stringify({ total: accounts.length }));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
