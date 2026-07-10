-- AlterTable
ALTER TABLE "ConversionEventLog"
ADD COLUMN "eventOccurredAt" TIMESTAMP(3),
ADD COLUMN "customerIdentityKey" TEXT,
ADD COLUMN "businessSource" TEXT NOT NULL DEFAULT 'paid',
ADD COLUMN "purchaseKind" TEXT;

-- Backfill reporting fields for existing logs.
UPDATE "ConversionEventLog"
SET
  "eventOccurredAt" = COALESCE("sentAt", "createdAt"),
  "customerIdentityKey" = "phoneHash",
  "businessSource" = 'paid';

-- Keep occurrence timestamps required for reporting windows.
ALTER TABLE "ConversionEventLog"
ALTER COLUMN "eventOccurredAt" SET NOT NULL,
ALTER COLUMN "eventOccurredAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ConversionEventLog_workspaceId_eventOccurredAt_idx"
ON "ConversionEventLog"("workspaceId", "eventOccurredAt");

-- CreateIndex
CREATE INDEX "ConversionEventLog_workspaceId_eventName_eventOccurredAt_idx"
ON "ConversionEventLog"("workspaceId", "eventName", "eventOccurredAt");
