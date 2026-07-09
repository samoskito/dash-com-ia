-- CreateTable
CREATE TABLE "MetaAssetSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "snapshotKey" TEXT NOT NULL,
    "businessId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "businesses" JSONB NOT NULL,
    "adAccounts" JSONB NOT NULL,
    "pixels" JSONB NOT NULL,
    "pages" JSONB NOT NULL,
    "syncError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAssetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAssetSnapshot_workspaceId_snapshotKey_key" ON "MetaAssetSnapshot"("workspaceId", "snapshotKey");

-- CreateIndex
CREATE INDEX "MetaAssetSnapshot_workspaceId_businessId_idx" ON "MetaAssetSnapshot"("workspaceId", "businessId");

-- AddForeignKey
ALTER TABLE "MetaAssetSnapshot" ADD CONSTRAINT "MetaAssetSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
