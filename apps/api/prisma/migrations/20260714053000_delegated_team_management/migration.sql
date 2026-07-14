-- Delegated team management belongs to an Admin membership. Owners receive
-- that authority from their canonical role and Analysts never receive it.
ALTER TABLE "WorkspaceMember"
ADD COLUMN "canManageMembers" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkspaceMember"
ADD CONSTRAINT "WorkspaceMember_manager_requires_admin_check"
CHECK (NOT "canManageMembers" OR "role" = 'admin');

-- Fail closed if historical data already violates the canonical owner rule.
DO $$
BEGIN
  IF EXISTS (
    SELECT workspace."id"
    FROM "Workspace" AS workspace
    LEFT JOIN "WorkspaceMember" AS member
      ON member."workspaceId" = workspace."id"
    GROUP BY workspace."id"
    HAVING COUNT(member."id") FILTER (WHERE member."role" = 'owner') <> 1
  ) THEN
    RAISE EXCEPTION 'Every workspace must have exactly one owner before delegated team management can be enabled';
  END IF;
END $$;

CREATE UNIQUE INDEX "WorkspaceMember_one_owner_per_workspace_key"
ON "WorkspaceMember"("workspaceId")
WHERE "role" = 'owner';
