#!/usr/bin/env node
/**
 * Diagnose XMAX ingress + all Dr Hernia accounts after global URL switch.
 *
 *   cd /app/apps/api && node scripts/peek-xmax-ingress-status.js
 */
const { PrismaClient } = require("@prisma/client");

const INGRESS_ID = process.env.INGRESS_ID || "cmt0t7kvv0000o25mefvu6fzx";
const BENTO_ACCOUNT = "cmt04979c0001ox3k1iqcbey9";

async function main() {
  const prisma = new PrismaClient();
  try {
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
    console.log("=== ingress ===");
    console.log(JSON.stringify(ingress, null, 2));

    const accounts = await prisma.xmaxAccount.findMany({
      where: { ingressId: INGRESS_ID },
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
        updatedAt: true,
      },
      orderBy: { queueId: "asc" },
    });
    console.log("=== accounts linked to ingress (" + accounts.length + ") ===");
    for (const a of accounts) {
      console.log(
        JSON.stringify({
          queueId: a.queueId,
          queueName: a.queueName,
          accountId: a.id,
          displayName: a.displayName,
          shadowMode: a.shadowMode,
          capiSendEnabled: a.capiSendEnabled,
          lastWebhookAt: a.lastWebhookAt,
          lastSuccessfulGetContact: a.lastSuccessfulGetContact,
          lastErrorCode: a.lastErrorCode,
          isBento: a.id === BENTO_ACCOUNT,
        }),
      );
    }

    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const shadows = await prisma.xmaxShadowEvent.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        accountId: true,
        workspaceId: true,
        contactId: true,
        eventName: true,
        status: true,
        reasonCode: true,
        tagIds: true,
        createdAt: true,
      },
    });
    console.log("=== shadow events last 2h (" + shadows.length + ") ===");
    for (const s of shadows) {
      const acc = accounts.find((a) => a.id === s.accountId);
      console.log(
        JSON.stringify({
          createdAt: s.createdAt,
          queueId: acc?.queueId ?? null,
          unit: acc?.queueName ?? acc?.displayName ?? null,
          contactId: s.contactId,
          eventName: s.eventName,
          status: s.status,
          reasonCode: s.reasonCode,
          tagIds: s.tagIds,
        }),
      );
    }

    console.log(
      JSON.stringify({
        howto: {
          if_ingress_lastWebhookAt_null:
            "Request never authenticated on ingress (wrong URL/token) OR body discarded before route (no Queue_id). Check API logs for xmax_ingress.queue_unresolved / 404.",
          if_ingress_ok_but_account_null:
            "Queue_id missing or not matching any account.queueId",
          smoke_http:
            "curl -sS -o /tmp/xmax_smoke.out -w '%{http_code}' -X POST 'https://wpptrack-api.rastrack.app/webhooks/xmax/ingress/" +
            INGRESS_ID +
            "?token=YOUR_SECRET' -H 'Content-Type: application/json' -d '{\"Contact_Id\":999001,\"Queue_id\":\"12\",\"Queue_name\":\"Bento Goncalves\"}'",
        },
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
