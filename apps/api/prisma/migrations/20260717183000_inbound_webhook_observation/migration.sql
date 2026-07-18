-- Add the provider-aware inbound webhook observation model.
-- Existing integrations, leads, Meta rows and conversion paths remain untouched.

CREATE TYPE "InboundWebhookProvider" AS ENUM (
  'umbler'
);

CREATE TYPE "InboundWebhookParserReleaseStatus" AS ENUM (
  'observation_only',
  'certified',
  'retired'
);

CREATE TYPE "InboundWebhookConnectionStatus" AS ENUM (
  'observation',
  'production',
  'paused'
);

CREATE TYPE "InboundWebhookChannelStatus" AS ENUM (
  'discovered',
  'active',
  'paused'
);

CREATE TYPE "InboundWebhookDeliveryStatus" AS ENUM (
  'pending',
  'queued',
  'processing',
  'processed',
  'failed'
);

CREATE TYPE "InboundWebhookEventClassification" AS ENUM (
  'eligible_route_resolved',
  'eligible_route_unresolved',
  'ignored_no_ctwa',
  'ignored_outbound',
  'ignored_private',
  'unsupported_event',
  'invalid_payload'
);

ALTER TYPE "DiagnosticSource" ADD VALUE 'umbler';

CREATE TABLE "InboundWebhookParserRelease" (
  "id" TEXT NOT NULL,
  "provider" "InboundWebhookProvider" NOT NULL,
  "version" TEXT NOT NULL,
  "status" "InboundWebhookParserReleaseStatus" NOT NULL DEFAULT 'observation_only',
  "certifiedByUserId" TEXT,
  "certifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookParserRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundWebhookConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" "InboundWebhookProvider" NOT NULL,
  "displayName" TEXT NOT NULL,
  "parserReleaseId" TEXT NOT NULL,
  "secretHash" TEXT,
  "status" "InboundWebhookConnectionStatus" NOT NULL DEFAULT 'observation',
  "createdByUserId" TEXT,
  "lastDeliveryAt" TIMESTAMP(3),
  "lastSuccessfulParseAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundWebhookChannel" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerChannelId" TEXT NOT NULL,
  "connectedPhone" TEXT NOT NULL,
  "channelName" TEXT,
  "status" "InboundWebhookChannelStatus" NOT NULL DEFAULT 'discovered',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundWebhookChannelRoute" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "routeKey" TEXT NOT NULL,
  "metaBusinessConnectionWorkspaceId" TEXT,
  "metaBusinessConnectionId" TEXT,
  "metaReportingAccountWorkspaceId" TEXT,
  "metaReportingAccountId" TEXT,
  "metaConversionDestinationWorkspaceId" TEXT,
  "metaConversionDestinationId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "validationStatus" TEXT NOT NULL DEFAULT 'pending',
  "validationErrorCode" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookChannelRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundWebhookDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "provider" "InboundWebhookProvider" NOT NULL,
  "ingressKey" TEXT NOT NULL,
  "externalDeliveryId" TEXT,
  "providerEventType" TEXT,
  "parserVersion" TEXT NOT NULL,
  "status" "InboundWebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
  "classification" "InboundWebhookEventClassification",
  "firstReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "providerAttempt" INTEGER,
  "encryptedPayload" TEXT,
  "payloadIv" TEXT,
  "payloadTag" TEXT,
  "encryptionKeyVersion" INTEGER,
  "payloadExpiresAt" TIMESTAMP(3) NOT NULL,
  "normalizedSummary" JSONB,
  "parseErrorCode" TEXT,
  "routingErrorCode" TEXT,
  "queuedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundWebhookEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "provider" "InboundWebhookProvider" NOT NULL,
  "externalEventId" TEXT,
  "externalMessageId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "contactIdentityHash" TEXT,
  "adId" TEXT,
  "hasCtwa" BOOLEAN NOT NULL DEFAULT false,
  "classification" "InboundWebhookEventClassification" NOT NULL,
  "classificationReason" TEXT,
  "resolvedBusinessConnectionWorkspaceId" TEXT,
  "resolvedBusinessConnectionId" TEXT,
  "resolvedReportingAccountWorkspaceId" TEXT,
  "resolvedReportingAccountId" TEXT,
  "resolvedConversionDestinationWorkspaceId" TEXT,
  "resolvedConversionDestinationId" TEXT,
  "normalizedSummary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundWebhookParserRelease_provider_version_key"
ON "InboundWebhookParserRelease"("provider", "version");

CREATE INDEX "InboundWebhookParserRelease_provider_status_idx"
ON "InboundWebhookParserRelease"("provider", "status");

CREATE INDEX "InboundWebhookParserRelease_certifiedByUserId_idx"
ON "InboundWebhookParserRelease"("certifiedByUserId");

CREATE INDEX "InboundWebhookConnection_workspaceId_removedAt_idx"
ON "InboundWebhookConnection"("workspaceId", "removedAt");

CREATE INDEX "InboundWebhookConnection_workspaceId_provider_status_idx"
ON "InboundWebhookConnection"("workspaceId", "provider", "status");

CREATE INDEX "InboundWebhookConnection_parserReleaseId_idx"
ON "InboundWebhookConnection"("parserReleaseId");

CREATE INDEX "InboundWebhookConnection_createdByUserId_idx"
ON "InboundWebhookConnection"("createdByUserId");

CREATE UNIQUE INDEX "InboundWebhookConnection_workspaceId_id_key"
ON "InboundWebhookConnection"("workspaceId", "id");

CREATE UNIQUE INDEX "InboundWebhookChannel_identity_key"
ON "InboundWebhookChannel"("connectionId", "organizationId", "providerChannelId");

CREATE UNIQUE INDEX "InboundWebhookChannel_workspaceId_id_key"
ON "InboundWebhookChannel"("workspaceId", "id");

CREATE INDEX "InboundWebhookChannel_workspaceId_connectionId_status_idx"
ON "InboundWebhookChannel"("workspaceId", "connectionId", "status");

CREATE INDEX "InboundWebhookChannel_workspaceId_connectedPhone_idx"
ON "InboundWebhookChannel"("workspaceId", "connectedPhone");

CREATE UNIQUE INDEX "InboundWebhookChannelRoute_channel_route_key"
ON "InboundWebhookChannelRoute"("channelId", "routeKey");

CREATE INDEX "InboundWebhookChannelRoute_workspaceId_channelId_active_idx"
ON "InboundWebhookChannelRoute"("workspaceId", "channelId", "active");

CREATE INDEX "InboundWebhookChannelRoute_workspace_business_active_idx"
ON "InboundWebhookChannelRoute"("workspaceId", "metaBusinessConnectionId", "active");

CREATE INDEX "InboundWebhookChannelRoute_metaReportingAccountId_idx"
ON "InboundWebhookChannelRoute"("metaReportingAccountId");

CREATE INDEX "InboundWebhookChannelRoute_metaConversionDestinationId_idx"
ON "InboundWebhookChannelRoute"("metaConversionDestinationId");

CREATE INDEX "InboundWebhookChannelRoute_createdByUserId_idx"
ON "InboundWebhookChannelRoute"("createdByUserId");

CREATE UNIQUE INDEX "InboundWebhookDelivery_connection_ingress_key"
ON "InboundWebhookDelivery"("connectionId", "ingressKey");

CREATE UNIQUE INDEX "InboundWebhookDelivery_workspaceId_id_key"
ON "InboundWebhookDelivery"("workspaceId", "id");

CREATE INDEX "InboundWebhookDelivery_workspaceId_status_createdAt_idx"
ON "InboundWebhookDelivery"("workspaceId", "status", "createdAt");

CREATE INDEX "InboundWebhookDelivery_workspaceId_payloadExpiresAt_idx"
ON "InboundWebhookDelivery"("workspaceId", "payloadExpiresAt");

CREATE INDEX "InboundWebhookDelivery_connectionId_lastReceivedAt_idx"
ON "InboundWebhookDelivery"("connectionId", "lastReceivedAt");

CREATE INDEX "InboundWebhookDelivery_payloadExpiresAt_idx"
ON "InboundWebhookDelivery"("payloadExpiresAt");

CREATE INDEX "InboundWebhookDelivery_recovery_idx"
ON "InboundWebhookDelivery"("status", "lastReceivedAt", "queuedAt");

CREATE INDEX "InboundWebhookDelivery_externalDeliveryId_idx"
ON "InboundWebhookDelivery"("externalDeliveryId");

CREATE UNIQUE INDEX "InboundWebhookEvent_connection_dedupe_key"
ON "InboundWebhookEvent"("connectionId", "dedupeKey");

CREATE INDEX "InboundWebhookEvent_workspace_classification_occurred_idx"
ON "InboundWebhookEvent"("workspaceId", "classification", "occurredAt");

CREATE INDEX "InboundWebhookEvent_workspaceId_adId_idx"
ON "InboundWebhookEvent"("workspaceId", "adId");

CREATE INDEX "InboundWebhookEvent_deliveryId_idx"
ON "InboundWebhookEvent"("deliveryId");

CREATE INDEX "InboundWebhookEvent_channelId_occurredAt_idx"
ON "InboundWebhookEvent"("channelId", "occurredAt");

CREATE INDEX "InboundWebhookEvent_resolvedBusinessConnectionId_idx"
ON "InboundWebhookEvent"("resolvedBusinessConnectionId");

CREATE INDEX "InboundWebhookEvent_resolvedReportingAccountId_idx"
ON "InboundWebhookEvent"("resolvedReportingAccountId");

CREATE INDEX "InboundWebhookEvent_resolvedConversionDestinationId_idx"
ON "InboundWebhookEvent"("resolvedConversionDestinationId");

-- Existing Meta rows are not changed. Their global IDs already guarantee that
-- these tenant identities are unique; the indexes make them FK targets.
CREATE UNIQUE INDEX "MetaBusinessConnection_workspaceId_id_key"
ON "MetaBusinessConnection"("workspaceId", "id");

CREATE UNIQUE INDEX "MetaReportingAccount_workspaceId_id_key"
ON "MetaReportingAccount"("workspaceId", "id");

CREATE UNIQUE INDEX "MetaConversionDestination_workspaceId_id_key"
ON "MetaConversionDestination"("workspaceId", "id");

ALTER TABLE "InboundWebhookParserRelease"
ADD CONSTRAINT "InboundWebhookParserRelease_certifiedByUserId_fkey"
FOREIGN KEY ("certifiedByUserId")
REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookConnection"
ADD CONSTRAINT "InboundWebhookConnection_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookConnection"
ADD CONSTRAINT "InboundWebhookConnection_parserReleaseId_fkey"
FOREIGN KEY ("parserReleaseId")
REFERENCES "InboundWebhookParserRelease"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookConnection"
ADD CONSTRAINT "InboundWebhookConnection_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId")
REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannel"
ADD CONSTRAINT "InboundWebhookChannel_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannel"
ADD CONSTRAINT "InboundWebhookChannel_connectionId_fkey"
FOREIGN KEY ("workspaceId", "connectionId")
REFERENCES "InboundWebhookConnection"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_channelId_fkey"
FOREIGN KEY ("workspaceId", "channelId")
REFERENCES "InboundWebhookChannel"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_metaBusinessConnectionId_fkey"
FOREIGN KEY ("metaBusinessConnectionWorkspaceId", "metaBusinessConnectionId")
REFERENCES "MetaBusinessConnection"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_metaReportingAccountId_fkey"
FOREIGN KEY ("metaReportingAccountWorkspaceId", "metaReportingAccountId")
REFERENCES "MetaReportingAccount"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_metaConversionDestinationId_fkey"
FOREIGN KEY ("metaConversionDestinationWorkspaceId", "metaConversionDestinationId")
REFERENCES "MetaConversionDestination"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId")
REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookDelivery"
ADD CONSTRAINT "InboundWebhookDelivery_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookDelivery"
ADD CONSTRAINT "InboundWebhookDelivery_connectionId_fkey"
FOREIGN KEY ("workspaceId", "connectionId")
REFERENCES "InboundWebhookConnection"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_connectionId_fkey"
FOREIGN KEY ("workspaceId", "connectionId")
REFERENCES "InboundWebhookConnection"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_deliveryId_fkey"
FOREIGN KEY ("workspaceId", "deliveryId")
REFERENCES "InboundWebhookDelivery"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_channelId_fkey"
FOREIGN KEY ("workspaceId", "channelId")
REFERENCES "InboundWebhookChannel"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_resolvedBusinessConnectionId_fkey"
FOREIGN KEY ("resolvedBusinessConnectionWorkspaceId", "resolvedBusinessConnectionId")
REFERENCES "MetaBusinessConnection"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_resolvedReportingAccountId_fkey"
FOREIGN KEY ("resolvedReportingAccountWorkspaceId", "resolvedReportingAccountId")
REFERENCES "MetaReportingAccount"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_resolvedConversionDestinationId_fkey"
FOREIGN KEY ("resolvedConversionDestinationWorkspaceId", "resolvedConversionDestinationId")
REFERENCES "MetaConversionDestination"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_business_workspace_check"
CHECK (
  (
    "metaBusinessConnectionWorkspaceId" IS NULL
    AND "metaBusinessConnectionId" IS NULL
  )
  OR (
    "metaBusinessConnectionWorkspaceId" IS NOT NULL
    AND "metaBusinessConnectionWorkspaceId" = "workspaceId"
    AND "metaBusinessConnectionId" IS NOT NULL
  )
);

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_reporting_workspace_check"
CHECK (
  (
    "metaReportingAccountWorkspaceId" IS NULL
    AND "metaReportingAccountId" IS NULL
  )
  OR (
    "metaReportingAccountWorkspaceId" IS NOT NULL
    AND "metaReportingAccountWorkspaceId" = "workspaceId"
    AND "metaReportingAccountId" IS NOT NULL
  )
);

ALTER TABLE "InboundWebhookChannelRoute"
ADD CONSTRAINT "InboundWebhookChannelRoute_destination_workspace_check"
CHECK (
  (
    "metaConversionDestinationWorkspaceId" IS NULL
    AND "metaConversionDestinationId" IS NULL
  )
  OR (
    "metaConversionDestinationWorkspaceId" IS NOT NULL
    AND "metaConversionDestinationWorkspaceId" = "workspaceId"
    AND "metaConversionDestinationId" IS NOT NULL
  )
);

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_business_workspace_check"
CHECK (
  (
    "resolvedBusinessConnectionWorkspaceId" IS NULL
    AND "resolvedBusinessConnectionId" IS NULL
  )
  OR (
    "resolvedBusinessConnectionWorkspaceId" IS NOT NULL
    AND "resolvedBusinessConnectionWorkspaceId" = "workspaceId"
    AND "resolvedBusinessConnectionId" IS NOT NULL
  )
);

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_reporting_workspace_check"
CHECK (
  (
    "resolvedReportingAccountWorkspaceId" IS NULL
    AND "resolvedReportingAccountId" IS NULL
  )
  OR (
    "resolvedReportingAccountWorkspaceId" IS NOT NULL
    AND "resolvedReportingAccountWorkspaceId" = "workspaceId"
    AND "resolvedReportingAccountId" IS NOT NULL
  )
);

ALTER TABLE "InboundWebhookEvent"
ADD CONSTRAINT "InboundWebhookEvent_destination_workspace_check"
CHECK (
  (
    "resolvedConversionDestinationWorkspaceId" IS NULL
    AND "resolvedConversionDestinationId" IS NULL
  )
  OR (
    "resolvedConversionDestinationWorkspaceId" IS NOT NULL
    AND "resolvedConversionDestinationWorkspaceId" = "workspaceId"
    AND "resolvedConversionDestinationId" IS NOT NULL
  )
);

INSERT INTO "InboundWebhookParserRelease" (
  "id",
  "provider",
  "version",
  "status",
  "createdAt",
  "updatedAt"
) VALUES (
  'inbound_parser_umbler_v1',
  'umbler',
  'v1',
  'observation_only',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("provider", "version") DO NOTHING;
