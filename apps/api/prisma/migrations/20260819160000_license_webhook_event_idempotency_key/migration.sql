-- DropIndex
DROP INDEX "LicenseWebhookEvent_provider_externalTransactionId_key";

-- CreateIndex
CREATE UNIQUE INDEX "LicenseWebhookEvent_provider_eventType_externalTransactionId_key" ON "LicenseWebhookEvent"("provider", "eventType", "externalTransactionId");
