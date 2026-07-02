CREATE TABLE "MetaIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "encryptedAccessToken" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "tokenTag" TEXT NOT NULL,
    "tokenType" TEXT,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastConnectedAt" TIMESTAMP(3),
    "selectedBusinessId" TEXT,
    "selectedAdAccountId" TEXT,
    "selectedPixelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaIntegration_workspaceId_key" ON "MetaIntegration"("workspaceId");
CREATE INDEX "MetaIntegration_status_idx" ON "MetaIntegration"("status");
CREATE INDEX "MetaIntegration_selectedBusinessId_idx" ON "MetaIntegration"("selectedBusinessId");
CREATE INDEX "MetaIntegration_selectedAdAccountId_idx" ON "MetaIntegration"("selectedAdAccountId");
CREATE INDEX "MetaIntegration_selectedPixelId_idx" ON "MetaIntegration"("selectedPixelId");

ALTER TABLE "MetaIntegration" ADD CONSTRAINT "MetaIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
