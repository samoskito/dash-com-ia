-- CreateTable
CREATE TABLE "MetaCampaignDailyInsight" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "metaConversationsStarted" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCampaignDailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignDailyInsight_workspaceId_campaignId_localDate_key"
ON "MetaCampaignDailyInsight"("workspaceId", "campaignId", "localDate");

-- CreateIndex
CREATE INDEX "MetaCampaignDailyInsight_workspaceId_localDate_idx"
ON "MetaCampaignDailyInsight"("workspaceId", "localDate");

-- CreateIndex
CREATE INDEX "MetaCampaignDailyInsight_workspaceId_businessId_adAccountId_localDate_idx"
ON "MetaCampaignDailyInsight"("workspaceId", "businessId", "adAccountId", "localDate");

-- CreateIndex
CREATE INDEX "MetaCampaignDailyInsight_workspaceId_campaignId_localDate_idx"
ON "MetaCampaignDailyInsight"("workspaceId", "campaignId", "localDate");

-- AddForeignKey
ALTER TABLE "MetaCampaignDailyInsight"
ADD CONSTRAINT "MetaCampaignDailyInsight_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
