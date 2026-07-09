-- CreateEnum
CREATE TYPE "MetaAssetSyncStatus" AS ENUM ('pending', 'syncing', 'synced', 'error');

-- CreateEnum
CREATE TYPE "MetaConversionDestinationStatus" AS ENUM ('needs_configuration', 'configured', 'error');

-- CreateEnum
CREATE TYPE "MetaWhatsappClassification" AS ENUM ('auto_whatsapp', 'creative_whatsapp', 'detected_by_leads', 'manual_include', 'manual_exclude', 'needs_review', 'not_whatsapp');

-- AlterTable
ALTER TABLE "ConversionEventLog" ADD COLUMN     "pageId" TEXT;

-- AlterTable
ALTER TABLE "MetaAd" ADD COLUMN     "adAccountId" TEXT,
ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "callToActionType" TEXT,
ADD COLUMN     "classificationOverride" "MetaWhatsappClassification",
ADD COLUMN     "classificationSource" TEXT,
ADD COLUMN     "creativeId" TEXT,
ADD COLUMN     "destinationType" TEXT,
ADD COLUMN     "whatsappClassification" "MetaWhatsappClassification" NOT NULL DEFAULT 'not_whatsapp';

-- AlterTable
ALTER TABLE "MetaAdSet" ADD COLUMN     "adAccountId" TEXT,
ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "classificationOverride" "MetaWhatsappClassification",
ADD COLUMN     "classificationSource" TEXT,
ADD COLUMN     "destinationType" TEXT,
ADD COLUMN     "whatsappClassification" "MetaWhatsappClassification" NOT NULL DEFAULT 'not_whatsapp';

-- AlterTable
ALTER TABLE "MetaCampaign" ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "classificationOverride" "MetaWhatsappClassification",
ADD COLUMN     "classificationSource" TEXT,
ADD COLUMN     "whatsappClassification" "MetaWhatsappClassification" NOT NULL DEFAULT 'not_whatsapp';

-- CreateTable
CREATE TABLE "MetaConversionDestination" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "pixelName" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "status" "MetaConversionDestinationStatus" NOT NULL DEFAULT 'configured',
    "lastValidatedAt" TIMESTAMP(3),
    "validationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConversionDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaReportingAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT NOT NULL,
    "currency" TEXT,
    "timezoneName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncStatus" "MetaAssetSyncStatus" NOT NULL DEFAULT 'pending',
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaReportingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaConversionDestination_workspaceId_key" ON "MetaConversionDestination"("workspaceId");

-- CreateIndex
CREATE INDEX "MetaConversionDestination_pixelId_idx" ON "MetaConversionDestination"("pixelId");

-- CreateIndex
CREATE INDEX "MetaConversionDestination_pageId_idx" ON "MetaConversionDestination"("pageId");

-- CreateIndex
CREATE INDEX "MetaReportingAccount_workspaceId_active_idx" ON "MetaReportingAccount"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "MetaReportingAccount_businessId_idx" ON "MetaReportingAccount"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaReportingAccount_workspaceId_adAccountId_key" ON "MetaReportingAccount"("workspaceId", "adAccountId");

-- AddForeignKey
ALTER TABLE "MetaConversionDestination" ADD CONSTRAINT "MetaConversionDestination_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaReportingAccount" ADD CONSTRAINT "MetaReportingAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
