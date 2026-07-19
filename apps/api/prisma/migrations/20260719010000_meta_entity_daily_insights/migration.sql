-- CreateTable
CREATE TABLE "MetaAdSetDailyInsight" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "metaConversationsStarted" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdSetDailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdDailyInsight" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "metaConversationsStarted" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdDailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdSetDailyInsight_workspaceId_adSetId_localDate_key"
ON "MetaAdSetDailyInsight"("workspaceId", "adSetId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdSetDailyInsight_workspaceId_localDate_idx"
ON "MetaAdSetDailyInsight"("workspaceId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdSetDailyInsight_workspaceId_businessId_adAccountId_localDate_idx"
ON "MetaAdSetDailyInsight"("workspaceId", "businessId", "adAccountId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdSetDailyInsight_workspaceId_campaignId_localDate_idx"
ON "MetaAdSetDailyInsight"("workspaceId", "campaignId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdSetDailyInsight_workspaceId_adSetId_localDate_idx"
ON "MetaAdSetDailyInsight"("workspaceId", "adSetId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdSetDailyInsight_workspaceId_localDate_impressions_idx"
ON "MetaAdSetDailyInsight"("workspaceId", "localDate", "impressions");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdDailyInsight_workspaceId_adId_localDate_key"
ON "MetaAdDailyInsight"("workspaceId", "adId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdDailyInsight_workspaceId_localDate_idx"
ON "MetaAdDailyInsight"("workspaceId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdDailyInsight_workspaceId_businessId_adAccountId_localDate_idx"
ON "MetaAdDailyInsight"("workspaceId", "businessId", "adAccountId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdDailyInsight_workspaceId_campaignId_localDate_idx"
ON "MetaAdDailyInsight"("workspaceId", "campaignId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdDailyInsight_workspaceId_adSetId_localDate_idx"
ON "MetaAdDailyInsight"("workspaceId", "adSetId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdDailyInsight_workspaceId_adId_localDate_idx"
ON "MetaAdDailyInsight"("workspaceId", "adId", "localDate");

-- CreateIndex
CREATE INDEX "MetaAdDailyInsight_workspaceId_localDate_impressions_idx"
ON "MetaAdDailyInsight"("workspaceId", "localDate", "impressions");

-- CreateIndex
CREATE INDEX "MetaCampaignDailyInsight_workspaceId_localDate_impressions_idx"
ON "MetaCampaignDailyInsight"("workspaceId", "localDate", "impressions");

-- AddForeignKey
ALTER TABLE "MetaAdSetDailyInsight"
ADD CONSTRAINT "MetaAdSetDailyInsight_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdDailyInsight"
ADD CONSTRAINT "MetaAdDailyInsight_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
