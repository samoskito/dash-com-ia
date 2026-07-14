-- Keep the customer workspace selected by each authentication session.
ALTER TABLE "AuthSession"
ADD COLUMN "activeWorkspaceId" TEXT;

-- Live sessions are backfilled only when the user has exactly one valid
-- membership. Revoked, expired and multi-workspace sessions remain unselected.
UPDATE "AuthSession" AS session
SET "activeWorkspaceId" = (
  SELECT member."workspaceId"
  FROM "WorkspaceMember" AS member
  WHERE member."userId" = session."userId"
  ORDER BY member."createdAt" ASC, member."id" ASC
  LIMIT 1
)
WHERE session."activeWorkspaceId" IS NULL
  AND session."revokedAt" IS NULL
  AND session."expiresAt" > CURRENT_TIMESTAMP
  AND (
    SELECT COUNT(*)
    FROM "WorkspaceMember" AS membership_count
    WHERE membership_count."userId" = session."userId"
  ) = 1;

CREATE INDEX "AuthSession_activeWorkspaceId_idx"
ON "AuthSession"("activeWorkspaceId");

CREATE INDEX "AuthSession_userId_activeWorkspaceId_idx"
ON "AuthSession"("userId", "activeWorkspaceId");

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_activeWorkspaceId_fkey"
FOREIGN KEY ("activeWorkspaceId")
REFERENCES "Workspace"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
