CREATE TABLE "ExternalCapiCutover" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "activatedAt" TIMESTAMP(3) NOT NULL,
  "activatedByUserId" TEXT NOT NULL,
  "shadowArchivedRows" INTEGER NOT NULL DEFAULT 0,
  "rolledBackAt" TIMESTAMP(3),
  "rolledBackByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalCapiCutover_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalCapiCutover_connectorId_status_idx"
  ON "ExternalCapiCutover"("connectorId", "status");

CREATE INDEX "ExternalCapiCutover_workspaceId_eventType_activatedAt_idx"
  ON "ExternalCapiCutover"("workspaceId", "eventType", "activatedAt");

CREATE UNIQUE INDEX "ExternalCapiCutover_active_event_key"
  ON "ExternalCapiCutover"("connectorId", "eventType")
  WHERE "status" = 'active';

ALTER TABLE "ExternalCapiCutover"
  ADD CONSTRAINT "ExternalCapiCutover_connectorId_fkey"
  FOREIGN KEY ("connectorId") REFERENCES "ExternalDataConnector"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
