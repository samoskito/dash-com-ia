-- DropIndex
DROP INDEX "WebhookLog_idempotencyKey_idx";

-- DropIndex
DROP INDEX "ConversionEventLog_dedupeKey_idx";

-- CreateIndex
CREATE UNIQUE INDEX "WebhookLog_idempotencyKey_key" ON "WebhookLog"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionEventLog_dedupeKey_key" ON "ConversionEventLog"("dedupeKey");
