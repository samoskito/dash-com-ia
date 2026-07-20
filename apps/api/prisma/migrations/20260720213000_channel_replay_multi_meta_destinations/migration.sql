-- Add channel-scoped replay and many-to-many Meta account destinations without
-- changing existing account defaults or active routes.

CREATE TYPE "MetaAdDestinationAssignmentSource" AS ENUM (
  'automatic',
  'manual'
);

CREATE TABLE "MetaReportingAccountDestination" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reportingAccountId" TEXT NOT NULL,
  "conversionDestinationId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaReportingAccountDestination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetaAdDestinationAssignment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "adId" TEXT NOT NULL,
  "reportingAccountId" TEXT NOT NULL,
  "conversionDestinationId" TEXT NOT NULL,
  "source" "MetaAdDestinationAssignmentSource" NOT NULL DEFAULT 'automatic',
  "detectedPixelId" TEXT,
  "detectedPageId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaAdDestinationAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InboundWebhookReplayBatch"
ADD COLUMN "channelId" TEXT;

ALTER TABLE "MetaAd"
ADD COLUMN "detectedPixelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "detectedPageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

INSERT INTO "MetaReportingAccountDestination" (
  "id",
  "workspaceId",
  "reportingAccountId",
  "conversionDestinationId",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('mrad_', MD5(account."workspaceId" || ':' || account."id" || ':' || destination."id")),
  account."workspaceId",
  account."id",
  destination."id",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "MetaReportingAccount" AS account
JOIN "MetaBusinessConnection" AS business
  ON business."id" = account."businessConnectionId"
 AND business."workspaceId" = account."workspaceId"
JOIN "MetaConversionDestination" AS destination
  ON destination."id" = COALESCE(
    account."conversionDestinationId",
    business."defaultConversionDestinationId"
  )
 AND destination."workspaceId" = account."workspaceId"
ON CONFLICT DO NOTHING;

INSERT INTO "MetaReportingAccountDestination" (
  "id",
  "workspaceId",
  "reportingAccountId",
  "conversionDestinationId",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('mrad_', MD5(route."workspaceId" || ':' || route."metaReportingAccountId" || ':' || route."metaConversionDestinationId")),
  route."workspaceId",
  route."metaReportingAccountId",
  route."metaConversionDestinationId",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "InboundWebhookChannelRoute" AS route
WHERE route."metaReportingAccountId" IS NOT NULL
  AND route."metaConversionDestinationId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "MetaReportingAccountDestination_unique"
ON "MetaReportingAccountDestination"(
  "workspaceId",
  "reportingAccountId",
  "conversionDestinationId"
);

CREATE INDEX "MetaReportingAccountDestination_workspace_account_active_idx"
ON "MetaReportingAccountDestination"("workspaceId", "reportingAccountId", "active");

CREATE INDEX "MetaReportingAccountDestination_workspace_destination_active_idx"
ON "MetaReportingAccountDestination"("workspaceId", "conversionDestinationId", "active");

CREATE INDEX "MetaReportingAccountDestination_createdByUserId_idx"
ON "MetaReportingAccountDestination"("createdByUserId");

CREATE UNIQUE INDEX "MetaAdDestinationAssignment_workspace_ad_key"
ON "MetaAdDestinationAssignment"("workspaceId", "adId");

CREATE INDEX "MetaAdDestinationAssignment_workspace_account_idx"
ON "MetaAdDestinationAssignment"("workspaceId", "reportingAccountId");

CREATE INDEX "MetaAdDestinationAssignment_workspace_destination_idx"
ON "MetaAdDestinationAssignment"("workspaceId", "conversionDestinationId");

CREATE INDEX "MetaAdDestinationAssignment_source_idx"
ON "MetaAdDestinationAssignment"("source");

CREATE INDEX "MetaAdDestinationAssignment_createdByUserId_idx"
ON "MetaAdDestinationAssignment"("createdByUserId");

CREATE INDEX "InboundWebhookReplayBatch_workspace_channel_createdAt_idx"
ON "InboundWebhookReplayBatch"("workspaceId", "channelId", "createdAt");

ALTER TABLE "MetaReportingAccountDestination"
ADD CONSTRAINT "MetaReportingAccountDestination_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaReportingAccountDestination"
ADD CONSTRAINT "MetaReportingAccountDestination_accountId_fkey"
FOREIGN KEY ("workspaceId", "reportingAccountId")
REFERENCES "MetaReportingAccount"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaReportingAccountDestination"
ADD CONSTRAINT "MetaReportingAccountDestination_destinationId_fkey"
FOREIGN KEY ("workspaceId", "conversionDestinationId")
REFERENCES "MetaConversionDestination"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaReportingAccountDestination"
ADD CONSTRAINT "MetaReportingAccountDestination_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MetaAdDestinationAssignment"
ADD CONSTRAINT "MetaAdDestinationAssignment_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaAdDestinationAssignment"
ADD CONSTRAINT "MetaAdDestinationAssignment_adId_fkey"
FOREIGN KEY ("workspaceId", "adId")
REFERENCES "MetaAd"("workspaceId", "adId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaAdDestinationAssignment"
ADD CONSTRAINT "MetaAdDestinationAssignment_accountId_fkey"
FOREIGN KEY ("workspaceId", "reportingAccountId")
REFERENCES "MetaReportingAccount"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaAdDestinationAssignment"
ADD CONSTRAINT "MetaAdDestinationAssignment_destinationId_fkey"
FOREIGN KEY ("workspaceId", "conversionDestinationId")
REFERENCES "MetaConversionDestination"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaAdDestinationAssignment"
ADD CONSTRAINT "MetaAdDestinationAssignment_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookReplayBatch"
ADD CONSTRAINT "InboundWebhookReplayBatch_channelId_fkey"
FOREIGN KEY ("workspaceId", "channelId")
REFERENCES "InboundWebhookChannel"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
