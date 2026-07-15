-- Add the normalized manual-connection model beside the legacy OAuth tables.
-- Existing MetaIntegration rows and their runtime path are intentionally untouched.

CREATE TYPE "MetaCredentialSource" AS ENUM (
  'oauth',
  'manual'
);

CREATE TYPE "MetaCredentialStatus" AS ENUM (
  'pending',
  'active',
  'validation_required',
  'expired',
  'revoked',
  'error',
  'paused'
);

CREATE TYPE "MetaBusinessConnectionStatus" AS ENUM (
  'pending',
  'active',
  'validation_required',
  'token_expired',
  'missing_permission',
  'destination_invalid',
  'error',
  'paused'
);

CREATE TABLE "MetaCredential" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "source" "MetaCredentialSource" NOT NULL,
  "label" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "tokenIv" TEXT NOT NULL,
  "tokenTag" TEXT NOT NULL,
  "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
  "fingerprint" TEXT NOT NULL,
  "tokenLast4" TEXT NOT NULL,
  "tokenType" TEXT,
  "scopes" TEXT[] NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "status" "MetaCredentialStatus" NOT NULL DEFAULT 'pending',
  "lastValidatedAt" TIMESTAMP(3),
  "validationError" TEXT,
  "createdByUserId" TEXT,
  "rotatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaCredential_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MetaConversionDestination"
  ADD COLUMN "label" TEXT,
  ADD COLUMN "ownerBusinessManagerId" TEXT,
  ADD COLUMN "createdByUserId" TEXT;

DROP INDEX IF EXISTS "MetaConversionDestination_workspaceId_key";

CREATE TABLE "MetaBusinessConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "businessManagerId" TEXT NOT NULL,
  "businessManagerName" TEXT NOT NULL,
  "status" "MetaBusinessConnectionStatus" NOT NULL DEFAULT 'pending',
  "defaultConversionDestinationId" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "validationError" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaBusinessConnection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MetaReportingAccount"
  ADD COLUMN "businessConnectionId" TEXT,
  ADD COLUMN "conversionDestinationId" TEXT;

ALTER TABLE "ConversionEventLog"
  ADD COLUMN "metaBusinessConnectionId" TEXT,
  ADD COLUMN "metaConversionDestinationId" TEXT;

CREATE UNIQUE INDEX "MetaCredential_workspaceId_fingerprint_key"
ON "MetaCredential"("workspaceId", "fingerprint");

CREATE INDEX "MetaCredential_workspaceId_source_status_idx"
ON "MetaCredential"("workspaceId", "source", "status");

CREATE INDEX "MetaCredential_workspaceId_createdAt_idx"
ON "MetaCredential"("workspaceId", "createdAt");

CREATE INDEX "MetaCredential_createdByUserId_idx"
ON "MetaCredential"("createdByUserId");

CREATE UNIQUE INDEX "MetaBusinessConnection_workspaceId_businessManagerId_key"
ON "MetaBusinessConnection"("workspaceId", "businessManagerId");

CREATE INDEX "MetaBusinessConnection_workspaceId_status_idx"
ON "MetaBusinessConnection"("workspaceId", "status");

CREATE INDEX "MetaBusinessConnection_credentialId_idx"
ON "MetaBusinessConnection"("credentialId");

CREATE INDEX "MetaBusinessConnection_defaultConversionDestinationId_idx"
ON "MetaBusinessConnection"("defaultConversionDestinationId");

CREATE INDEX "MetaBusinessConnection_createdByUserId_idx"
ON "MetaBusinessConnection"("createdByUserId");

CREATE UNIQUE INDEX "MetaConversionDestination_workspaceId_pixelId_pageId_key"
ON "MetaConversionDestination"("workspaceId", "pixelId", "pageId");

CREATE INDEX "MetaConversionDestination_workspaceId_status_idx"
ON "MetaConversionDestination"("workspaceId", "status");

CREATE INDEX "MetaConversionDestination_ownerBusinessManagerId_idx"
ON "MetaConversionDestination"("ownerBusinessManagerId");

CREATE INDEX "MetaConversionDestination_createdByUserId_idx"
ON "MetaConversionDestination"("createdByUserId");

CREATE INDEX "MetaReportingAccount_workspaceId_businessConnectionId_active_idx"
ON "MetaReportingAccount"("workspaceId", "businessConnectionId", "active");

CREATE INDEX "MetaReportingAccount_businessConnectionId_idx"
ON "MetaReportingAccount"("businessConnectionId");

CREATE INDEX "MetaReportingAccount_conversionDestinationId_idx"
ON "MetaReportingAccount"("conversionDestinationId");

CREATE INDEX "ConversionEventLog_workspaceId_metaBusinessConnectionId_idx"
ON "ConversionEventLog"("workspaceId", "metaBusinessConnectionId");

CREATE INDEX "ConversionEventLog_workspaceId_metaConversionDestinationId_idx"
ON "ConversionEventLog"("workspaceId", "metaConversionDestinationId");

ALTER TABLE "MetaCredential"
ADD CONSTRAINT "MetaCredential_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaCredential"
ADD CONSTRAINT "MetaCredential_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MetaConversionDestination"
ADD CONSTRAINT "MetaConversionDestination_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MetaBusinessConnection"
ADD CONSTRAINT "MetaBusinessConnection_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaBusinessConnection"
ADD CONSTRAINT "MetaBusinessConnection_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "MetaCredential"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaBusinessConnection"
ADD CONSTRAINT "MetaBusinessConnection_defaultConversionDestinationId_fkey"
FOREIGN KEY ("defaultConversionDestinationId") REFERENCES "MetaConversionDestination"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MetaBusinessConnection"
ADD CONSTRAINT "MetaBusinessConnection_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MetaReportingAccount"
ADD CONSTRAINT "MetaReportingAccount_businessConnectionId_fkey"
FOREIGN KEY ("businessConnectionId") REFERENCES "MetaBusinessConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MetaReportingAccount"
ADD CONSTRAINT "MetaReportingAccount_conversionDestinationId_fkey"
FOREIGN KEY ("conversionDestinationId") REFERENCES "MetaConversionDestination"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversionEventLog"
ADD CONSTRAINT "ConversionEventLog_metaBusinessConnectionId_fkey"
FOREIGN KEY ("metaBusinessConnectionId") REFERENCES "MetaBusinessConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversionEventLog"
ADD CONSTRAINT "ConversionEventLog_metaConversionDestinationId_fkey"
FOREIGN KEY ("metaConversionDestinationId") REFERENCES "MetaConversionDestination"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
