CREATE TABLE "FunnelStageConfiguration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "defaultValueCents" INTEGER,
    "defaultCurrency" TEXT,
    "defaultContentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelStageConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FunnelStageConfiguration_workspaceId_eventName_key"
ON "FunnelStageConfiguration"("workspaceId", "eventName");

CREATE INDEX "FunnelStageConfiguration_workspaceId_position_idx"
ON "FunnelStageConfiguration"("workspaceId", "position");

ALTER TABLE "FunnelStageConfiguration"
ADD CONSTRAINT "FunnelStageConfiguration_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
