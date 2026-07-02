CREATE TYPE "WorkspaceOperationalStatus" AS ENUM ('active', 'blocked');

ALTER TABLE "Workspace"
ADD COLUMN "operationalStatus" "WorkspaceOperationalStatus" NOT NULL DEFAULT 'active';

CREATE INDEX "Workspace_operationalStatus_idx" ON "Workspace"("operationalStatus");
