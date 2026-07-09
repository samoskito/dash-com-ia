-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Lead_workspaceId_ctwaClid_idx" ON "Lead"("workspaceId", "ctwaClid");
