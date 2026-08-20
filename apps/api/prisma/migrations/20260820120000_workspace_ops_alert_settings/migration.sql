-- CreateTable
CREATE TABLE "WorkspaceOpsAlertSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "alertPhoneE164" TEXT,
    "disconnectAlerts" BOOLEAN NOT NULL DEFAULT true,
    "webhookSilenceAlerts" BOOLEAN NOT NULL DEFAULT true,
    "silenceThresholdHours" INTEGER NOT NULL DEFAULT 24,
    "debounceHours" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceOpsAlertSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceOpsAlertDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceOpsAlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceOpsAlertSettings_workspaceId_key" ON "WorkspaceOpsAlertSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceOpsAlertDelivery_workspaceId_alertKey_createdAt_idx" ON "WorkspaceOpsAlertDelivery"("workspaceId", "alertKey", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceOpsAlertDelivery_workspaceId_createdAt_idx" ON "WorkspaceOpsAlertDelivery"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceOpsAlertSettings" ADD CONSTRAINT "WorkspaceOpsAlertSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceOpsAlertDelivery" ADD CONSTRAINT "WorkspaceOpsAlertDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
