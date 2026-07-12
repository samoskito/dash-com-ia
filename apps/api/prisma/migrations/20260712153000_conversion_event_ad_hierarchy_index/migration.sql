-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ConversionEventLog_workspaceId_adId_idx"
ON "ConversionEventLog"("workspaceId", "adId");
