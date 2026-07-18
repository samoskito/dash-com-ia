-- Add bounded canary scopes and safe retry metadata to controlled replay.

CREATE TYPE "InboundWebhookReplaySelection" AS ENUM (
  'canary_1',
  'canary_5',
  'canary_10',
  'remaining'
);

ALTER TABLE "InboundWebhookReplayBatch"
ADD COLUMN "selection" "InboundWebhookReplaySelection" NOT NULL DEFAULT 'remaining',
ADD COLUMN "requestedLimit" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN "retryableFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastRetriedAt" TIMESTAMP(3);

ALTER TABLE "InboundWebhookReplayBatch"
ALTER COLUMN "selection" SET DEFAULT 'canary_1',
ALTER COLUMN "requestedLimit" SET DEFAULT 1;

ALTER TABLE "InboundWebhookReplayItem"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "InboundWebhookReplayBatch_one_active_per_connection_key"
ON "InboundWebhookReplayBatch"("workspaceId", "connectionId")
WHERE "status" IN ('queued', 'processing');
