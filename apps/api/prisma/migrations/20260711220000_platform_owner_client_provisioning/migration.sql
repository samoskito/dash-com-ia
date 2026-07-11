CREATE TYPE "PlatformRole" AS ENUM ('platform_owner', 'platform_operator');

ALTER TABLE "User"
ADD COLUMN "platformRole" "PlatformRole";

ALTER TABLE "AuthSession"
ADD COLUMN "supportWorkspaceId" TEXT,
ADD COLUMN "supportWorkspaceStartedAt" TIMESTAMP(3);

CREATE INDEX "AuthSession_supportWorkspaceId_idx"
ON "AuthSession"("supportWorkspaceId");

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_supportWorkspaceId_fkey"
FOREIGN KEY ("supportWorkspaceId") REFERENCES "Workspace"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
