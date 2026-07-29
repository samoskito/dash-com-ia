ALTER TABLE "WebhookLog"
ADD COLUMN "whatsappInstanceId" TEXT;

CREATE INDEX "WebhookLog_workspaceId_whatsappInstanceId_receivedAt_idx"
ON "WebhookLog"("workspaceId", "whatsappInstanceId", "receivedAt");
