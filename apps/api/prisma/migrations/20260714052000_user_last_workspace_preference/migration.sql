-- Remember the user's last selected customer workspace across new sessions.
-- This value is only a preference; application code must still validate a
-- live WorkspaceMember row before using it as an active tenant context.
ALTER TABLE "User"
ADD COLUMN "lastWorkspaceId" TEXT;

-- Preserve the most recent valid selection from existing live sessions.
UPDATE "User" AS user_record
SET "lastWorkspaceId" = (
  SELECT session."activeWorkspaceId"
  FROM "AuthSession" AS session
  INNER JOIN "WorkspaceMember" AS member
    ON member."userId" = session."userId"
   AND member."workspaceId" = session."activeWorkspaceId"
  WHERE session."userId" = user_record."id"
    AND session."activeWorkspaceId" IS NOT NULL
    AND session."revokedAt" IS NULL
    AND session."expiresAt" > CURRENT_TIMESTAMP
  ORDER BY session."createdAt" DESC, session."id" DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM "AuthSession" AS session
  INNER JOIN "WorkspaceMember" AS member
    ON member."userId" = session."userId"
   AND member."workspaceId" = session."activeWorkspaceId"
  WHERE session."userId" = user_record."id"
    AND session."activeWorkspaceId" IS NOT NULL
    AND session."revokedAt" IS NULL
    AND session."expiresAt" > CURRENT_TIMESTAMP
);

CREATE INDEX "User_lastWorkspaceId_idx"
ON "User"("lastWorkspaceId");

ALTER TABLE "User"
ADD CONSTRAINT "User_lastWorkspaceId_fkey"
FOREIGN KEY ("lastWorkspaceId")
REFERENCES "Workspace"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
