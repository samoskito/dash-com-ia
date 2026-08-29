-- Additive only. Do not apply from this change set; deployment owns migration execution.
ALTER TYPE "DiagnosticSource" ADD VALUE IF NOT EXISTS 'guimo';
CREATE TABLE "GuimoIntegration" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'blocked',
  "webhookSecretHash" TEXT NOT NULL,
  "webhookVersion" TEXT NOT NULL DEFAULT 'v1',
  "crmHeadersEncrypted" TEXT,
  "crmHeadersIv" TEXT,
  "crmHeadersTag" TEXT,
  "qualifiedStageId" TEXT,
  "qualifiedStageName" TEXT,
  "purchaseStageId" TEXT,
  "purchaseStageName" TEXT,
  "purchaseCurrency" TEXT,
  "purchaseValueUnit" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuimoIntegration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GuimoWebhookEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "eventType" TEXT,
  "negotiationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "stageName" TEXT NOT NULL,
  "previousStageId" TEXT,
  "previousStageName" TEXT,
  "jobId" TEXT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "GuimoWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GuimoWebhookRateLimit" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuimoWebhookRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuimoIntegration_webhookSecretHash_key" ON "GuimoIntegration"("webhookSecretHash");
CREATE UNIQUE INDEX "GuimoWebhookEvent_dedupeKey_key" ON "GuimoWebhookEvent"("dedupeKey");
CREATE UNIQUE INDEX "GuimoWebhookRateLimit_integrationId_key" ON "GuimoWebhookRateLimit"("integrationId");
CREATE INDEX "GuimoIntegration_workspaceId_status_idx" ON "GuimoIntegration"("workspaceId", "status");
CREATE INDEX "GuimoWebhookEvent_workspaceId_status_createdAt_idx" ON "GuimoWebhookEvent"("workspaceId", "status", "createdAt");
CREATE INDEX "GuimoWebhookEvent_integrationId_createdAt_idx" ON "GuimoWebhookEvent"("integrationId", "createdAt");
CREATE INDEX "GuimoWebhookRateLimit_workspaceId_windowStartedAt_idx" ON "GuimoWebhookRateLimit"("workspaceId", "windowStartedAt");
ALTER TABLE "GuimoIntegration" ADD CONSTRAINT "GuimoIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuimoWebhookEvent" ADD CONSTRAINT "GuimoWebhookEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuimoWebhookEvent" ADD CONSTRAINT "GuimoWebhookEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "GuimoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuimoWebhookRateLimit" ADD CONSTRAINT "GuimoWebhookRateLimit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuimoWebhookRateLimit" ADD CONSTRAINT "GuimoWebhookRateLimit_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "GuimoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
