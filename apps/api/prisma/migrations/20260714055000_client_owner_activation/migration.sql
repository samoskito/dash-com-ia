ALTER TYPE "AuthActionTokenType" ADD VALUE 'account_activation';

ALTER TABLE "AuthActionToken"
ADD COLUMN "workspaceId" TEXT;

CREATE INDEX "AuthActionToken_workspaceId_type_usedAt_idx"
ON "AuthActionToken"("workspaceId", "type", "usedAt");

ALTER TABLE "AuthActionToken"
ADD CONSTRAINT "AuthActionToken_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
