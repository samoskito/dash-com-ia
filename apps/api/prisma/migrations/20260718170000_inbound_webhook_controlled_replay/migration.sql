-- Add platform-owner controlled replay without changing observation ingestion.

CREATE TYPE "InboundWebhookReplayStatus" AS ENUM (
  'queued',
  'processing',
  'completed',
  'completed_with_failures',
  'failed'
);

CREATE TYPE "InboundWebhookReplayItemStatus" AS ENUM (
  'queued',
  'processing',
  'materialized',
  'duplicate',
  'skipped',
  'failed'
);

CREATE UNIQUE INDEX "InboundWebhookEvent_workspaceId_id_key"
ON "InboundWebhookEvent"("workspaceId", "id");

CREATE TABLE "InboundWebhookReplayBatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "status" "InboundWebhookReplayStatus" NOT NULL DEFAULT 'queued',
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "materializedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookReplayBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundWebhookReplayItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" "InboundWebhookReplayItemStatus" NOT NULL DEFAULT 'queued',
  "leadId" TEXT,
  "conversionEventLogId" TEXT,
  "errorCode" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookReplayItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundWebhookReplayBatch_workspaceId_id_key"
ON "InboundWebhookReplayBatch"("workspaceId", "id");

CREATE INDEX "InboundWebhookReplayBatch_connectionId_createdAt_idx"
ON "InboundWebhookReplayBatch"("connectionId", "createdAt");

CREATE INDEX "InboundWebhookReplayBatch_workspaceId_status_createdAt_idx"
ON "InboundWebhookReplayBatch"("workspaceId", "status", "createdAt");

CREATE INDEX "InboundWebhookReplayBatch_requestedByUserId_idx"
ON "InboundWebhookReplayBatch"("requestedByUserId");

CREATE UNIQUE INDEX "InboundWebhookReplayItem_eventId_key"
ON "InboundWebhookReplayItem"("eventId");

CREATE UNIQUE INDEX "InboundWebhookReplayItem_workspaceId_eventId_key"
ON "InboundWebhookReplayItem"("workspaceId", "eventId");

CREATE INDEX "InboundWebhookReplayItem_batchId_status_idx"
ON "InboundWebhookReplayItem"("batchId", "status");

CREATE INDEX "InboundWebhookReplayItem_workspaceId_status_createdAt_idx"
ON "InboundWebhookReplayItem"("workspaceId", "status", "createdAt");

CREATE INDEX "InboundWebhookReplayItem_leadId_idx"
ON "InboundWebhookReplayItem"("leadId");

CREATE INDEX "InboundWebhookReplayItem_conversionEventLogId_idx"
ON "InboundWebhookReplayItem"("conversionEventLogId");

ALTER TABLE "InboundWebhookReplayBatch"
ADD CONSTRAINT "InboundWebhookReplayBatch_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookReplayBatch"
ADD CONSTRAINT "InboundWebhookReplayBatch_connectionId_fkey"
FOREIGN KEY ("workspaceId", "connectionId")
REFERENCES "InboundWebhookConnection"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookReplayBatch"
ADD CONSTRAINT "InboundWebhookReplayBatch_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookReplayItem"
ADD CONSTRAINT "InboundWebhookReplayItem_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookReplayItem"
ADD CONSTRAINT "InboundWebhookReplayItem_batchId_fkey"
FOREIGN KEY ("workspaceId", "batchId")
REFERENCES "InboundWebhookReplayBatch"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookReplayItem"
ADD CONSTRAINT "InboundWebhookReplayItem_eventId_fkey"
FOREIGN KEY ("workspaceId", "eventId")
REFERENCES "InboundWebhookEvent"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
