-- CreateEnum
CREATE TYPE "ConversionTriggerType" AS ENUM ('keyword', 'whatsapp_label');

-- CreateEnum
CREATE TYPE "ConversionMatchMode" AS ENUM ('contains', 'exact');

-- CreateTable
CREATE TABLE "ConversionRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" "ConversionTriggerType" NOT NULL,
    "triggerValue" TEXT NOT NULL,
    "matchMode" "ConversionMatchMode" NOT NULL DEFAULT 'contains',
    "eventName" TEXT NOT NULL,
    "pixelId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversionRule_workspaceId_active_idx" ON "ConversionRule"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "ConversionRule_workspaceId_triggerType_triggerValue_idx" ON "ConversionRule"("workspaceId", "triggerType", "triggerValue");

-- AddForeignKey
ALTER TABLE "ConversionRule" ADD CONSTRAINT "ConversionRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
