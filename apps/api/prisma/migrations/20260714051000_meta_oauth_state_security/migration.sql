CREATE TABLE "MetaOAuthState" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MetaOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaOAuthState_stateHash_key"
ON "MetaOAuthState"("stateHash");

CREATE INDEX "MetaOAuthState_workspaceId_consumedAt_expiresAt_idx"
ON "MetaOAuthState"("workspaceId", "consumedAt", "expiresAt");

CREATE INDEX "MetaOAuthState_userId_consumedAt_expiresAt_idx"
ON "MetaOAuthState"("userId", "consumedAt", "expiresAt");

ALTER TABLE "MetaOAuthState"
ADD CONSTRAINT "MetaOAuthState_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "Workspace"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "MetaOAuthState"
ADD CONSTRAINT "MetaOAuthState_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
