-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'active', 'qualified', 'converted', 'lost');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "whatsappInstanceId" TEXT,
    "name" TEXT,
    "phoneDisplay" TEXT,
    "phoneHash" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'active',
    "source" TEXT,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "firstMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_workspaceId_phoneHash_key" ON "Lead"("workspaceId", "phoneHash");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_status_lastMessageAt_idx" ON "Lead"("workspaceId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_campaignId_idx" ON "Lead"("workspaceId", "campaignId");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_adSetId_idx" ON "Lead"("workspaceId", "adSetId");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_adId_idx" ON "Lead"("workspaceId", "adId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_whatsappInstanceId_fkey" FOREIGN KEY ("whatsappInstanceId") REFERENCES "WhatsappInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
