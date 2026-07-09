-- AlterTable
ALTER TABLE "ConversionEventLog" ADD COLUMN     "contentName" TEXT,
ADD COLUMN     "ctwaClid" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "customData" JSONB,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "valueCents" INTEGER;

-- AlterTable
ALTER TABLE "ConversionRule" ADD COLUMN     "defaultContentName" TEXT,
ADD COLUMN     "defaultCurrency" TEXT,
ADD COLUMN     "defaultItems" JSONB,
ADD COLUMN     "defaultValueCents" INTEGER;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "ctwaClid" TEXT,
ADD COLUMN     "ctwaSourceUrl" TEXT;

-- CreateIndex
CREATE INDEX "Lead_workspaceId_ctwaClid_idx" ON "Lead"("workspaceId", "ctwaClid");
