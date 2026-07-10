-- CreateIndex
CREATE INDEX "Lead_workspaceId_firstMessageAt_idx"
ON "Lead"("workspaceId", "firstMessageAt");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_createdAt_idx"
ON "Lead"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "MetaReportingAccount_workspaceId_active_businessId_adAccountId_idx"
ON "MetaReportingAccount"("workspaceId", "active", "businessId", "adAccountId");

-- CreateIndex
CREATE INDEX "MetaCampaign_workspaceId_businessId_adAccountId_whatsappClassification_idx"
ON "MetaCampaign"("workspaceId", "businessId", "adAccountId", "whatsappClassification");

-- CreateIndex
CREATE INDEX "MetaAdSet_workspaceId_businessId_adAccountId_whatsappClassification_idx"
ON "MetaAdSet"("workspaceId", "businessId", "adAccountId", "whatsappClassification");

-- CreateIndex
CREATE INDEX "MetaAdSet_workspaceId_status_idx"
ON "MetaAdSet"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "MetaAd_workspaceId_businessId_adAccountId_whatsappClassification_idx"
ON "MetaAd"("workspaceId", "businessId", "adAccountId", "whatsappClassification");

-- CreateIndex
CREATE INDEX "MetaAd_workspaceId_status_idx"
ON "MetaAd"("workspaceId", "status");
