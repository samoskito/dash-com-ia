-- AlterEnum
ALTER TYPE "DiagnosticSource" ADD VALUE IF NOT EXISTS 'external_mysql';

-- AlterTable
ALTER TABLE "ConversionEventLog"
ADD COLUMN "valueSource" TEXT,
ADD COLUMN "externalConnectorId" TEXT,
ADD COLUMN "sourceEventId" TEXT;

-- CreateTable
CREATE TABLE "ExternalDataConnector" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "sslMode" TEXT NOT NULL DEFAULT 'required',
    "credentialsEncrypted" TEXT NOT NULL,
    "credentialsIv" TEXT NOT NULL,
    "credentialsTag" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shadowMode" BOOLEAN NOT NULL DEFAULT true,
    "capiSendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "purchaseAverageValueCents" INTEGER,
    "defaultCurrency" TEXT DEFAULT 'BRL',
    "lastConnectionTestAt" TIMESTAMP(3),
    "lastConnectionStatus" TEXT,
    "lastSyncStartedAt" TIMESTAMP(3),
    "lastSyncCompletedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalDataConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSyncCursor" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "lastExternalId" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIngestionRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "externalRowId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT,
    "status" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "leadId" TEXT,
    "conversionEventLogId" TEXT,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "summaryPayload" JSONB,
    "firstReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIngestionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversionEventLog_externalConnectorId_sourceEventId_idx"
ON "ConversionEventLog"("externalConnectorId", "sourceEventId");

-- CreateIndex
CREATE INDEX "ExternalDataConnector_workspaceId_status_idx"
ON "ExternalDataConnector"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ExternalDataConnector_syncEnabled_status_updatedAt_idx"
ON "ExternalDataConnector"("syncEnabled", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSyncCursor_connectorId_stream_key"
ON "ExternalSyncCursor"("connectorId", "stream");

-- CreateIndex
CREATE INDEX "ExternalSyncCursor_connectorId_lastSyncedAt_idx"
ON "ExternalSyncCursor"("connectorId", "lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIngestionRecord_dedupeKey_key"
ON "ExternalIngestionRecord"("dedupeKey");

-- CreateIndex
CREATE INDEX "ExternalIngestionRecord_connectorId_stream_externalRowId_idx"
ON "ExternalIngestionRecord"("connectorId", "stream", "externalRowId");

-- CreateIndex
CREATE INDEX "ExternalIngestionRecord_workspaceId_status_occurredAt_idx"
ON "ExternalIngestionRecord"("workspaceId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "ExternalIngestionRecord_conversionEventLogId_idx"
ON "ExternalIngestionRecord"("conversionEventLogId");

-- AddForeignKey
ALTER TABLE "ConversionEventLog"
ADD CONSTRAINT "ConversionEventLog_externalConnectorId_fkey"
FOREIGN KEY ("externalConnectorId") REFERENCES "ExternalDataConnector"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDataConnector"
ADD CONSTRAINT "ExternalDataConnector_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSyncCursor"
ADD CONSTRAINT "ExternalSyncCursor_connectorId_fkey"
FOREIGN KEY ("connectorId") REFERENCES "ExternalDataConnector"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIngestionRecord"
ADD CONSTRAINT "ExternalIngestionRecord_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIngestionRecord"
ADD CONSTRAINT "ExternalIngestionRecord_connectorId_fkey"
FOREIGN KEY ("connectorId") REFERENCES "ExternalDataConnector"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
