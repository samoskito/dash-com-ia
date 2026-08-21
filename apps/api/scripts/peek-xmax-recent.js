#!/usr/bin/env node
/**
 * Peek recent XMAX activity for Bento (or ACCOUNT_ID / WORKSPACE_ID).
 * Does NOT print secrets or full phone — only hashes/status/reason.
 *
 *   cd /app/apps/api && node scripts/peek-xmax-recent.js
 *   ACCOUNT_ID=... node scripts/peek-xmax-recent.js
 */
const { PrismaClient } = require("@prisma/client");

const BENTO_WS = "cmsxluhm90000qhdvvg53joda";
const BENTO_ACCOUNT = "cmt04979c0001ox3k1iqcbey9";

async function main() {
  const prisma = new PrismaClient();
  const accountId = process.env.ACCOUNT_ID || BENTO_ACCOUNT;
  const workspaceId = process.env.WORKSPACE_ID || BENTO_WS;
  try {
    const account = await prisma.xmaxAccount.findFirst({
      where: { id: accountId },
      select: {
        id: true,
        workspaceId: true,
        displayName: true,
        queueId: true,
        status: true,
        shadowMode: true,
        capiSendEnabled: true,
        lastWebhookAt: true,
        lastSuccessfulGetContact: true,
        lastErrorCode: true,
        updatedAt: true,
      },
    });
    console.log("=== account ===");
    console.log(JSON.stringify(account, null, 2));

    const shadows = await prisma.xmaxShadowEvent.findMany({
      where: { accountId, workspaceId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        contactId: true,
        eventName: true,
        status: true,
        reasonCode: true,
        tagIds: true,
        phoneHash: true,
        phoneNormalized: true,
        rawSummary: true,
        createdAt: true,
      },
    });
    console.log("=== last 15 shadow events ===");
    for (const row of shadows) {
      // Mask phone if present — keep only last 4 digits
      const phone = row.phoneNormalized
        ? `***${String(row.phoneNormalized).slice(-4)}`
        : null;
      console.log(
        JSON.stringify({
          id: row.id,
          contactId: row.contactId,
          eventName: row.eventName,
          status: row.status,
          reasonCode: row.reasonCode,
          tagIds: row.tagIds,
          phone,
          phoneHashPrefix: row.phoneHash
            ? String(row.phoneHash).slice(0, 10)
            : null,
          rawSummary: row.rawSummary,
          createdAt: row.createdAt,
        }),
      );
    }
    console.log(
      JSON.stringify({
        note: "Queue_id/Queue_name are NOT stored in shadow rawSummary today — only in the live webhook body. Capture from XMAX/n8n if missing here.",
        count: shadows.length,
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
