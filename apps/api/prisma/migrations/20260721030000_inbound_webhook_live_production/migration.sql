-- Add an explicit live-production boundary and durable event materialization.
-- Existing observed deliveries remain replay-only because activation timestamps
-- start as NULL and no production items are backfilled.

CREATE TYPE "InboundWebhookProductionItemStatus" AS ENUM (
  'queued',
  'processing',
  'materialized',
  'duplicate',
  'failed'
);

ALTER TABLE "InboundWebhookConnection"
ADD COLUMN "productionActivatedAt" TIMESTAMP(3);

ALTER TABLE "InboundWebhookChannel"
ADD COLUMN "productionActivatedAt" TIMESTAMP(3);

CREATE TABLE "InboundWebhookProductionItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" "InboundWebhookProductionItemStatus" NOT NULL DEFAULT 'queued',
  "leadId" TEXT,
  "conversionEventLogId" TEXT,
  "errorCode" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookProductionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundWebhookProductionItem_eventId_key"
ON "InboundWebhookProductionItem"("eventId");

CREATE UNIQUE INDEX "InboundWebhookProductionItem_workspace_event_key"
ON "InboundWebhookProductionItem"("workspaceId", "eventId");

CREATE INDEX "InboundWebhookProductionItem_workspace_status_createdAt_idx"
ON "InboundWebhookProductionItem"("workspaceId", "status", "createdAt");

CREATE INDEX "InboundWebhookProductionItem_recovery_idx"
ON "InboundWebhookProductionItem"("status", "lastAttemptedAt", "queuedAt");

CREATE INDEX "InboundWebhookProductionItem_leadId_idx"
ON "InboundWebhookProductionItem"("leadId");

CREATE INDEX "InboundWebhookProductionItem_conversionEventLogId_idx"
ON "InboundWebhookProductionItem"("conversionEventLogId");

ALTER TABLE "InboundWebhookProductionItem"
ADD CONSTRAINT "InboundWebhookProductionItem_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookProductionItem"
ADD CONSTRAINT "InboundWebhookProductionItem_eventId_fkey"
FOREIGN KEY ("workspaceId", "eventId")
REFERENCES "InboundWebhookEvent"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
