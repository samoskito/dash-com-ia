-- Add Asaas customer link used when creating real payment charges.
ALTER TABLE "Workspace" ADD COLUMN "asaasCustomerId" TEXT;

CREATE INDEX "Workspace_asaasCustomerId_idx" ON "Workspace"("asaasCustomerId");
