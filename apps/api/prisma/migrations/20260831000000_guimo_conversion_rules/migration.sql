-- Additive only. Do not apply from this change set; deployment owns migration execution.
CREATE TABLE "GuimoConversionRule" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "stageName" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "valueMode" TEXT NOT NULL DEFAULT 'dynamic',
  "fixedValueCents" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuimoConversionRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuimoConversionRule_integrationId_stageName_eventName_key"
ON "GuimoConversionRule"("integrationId", "stageName", "eventName");
CREATE INDEX "GuimoConversionRule_integrationId_idx" ON "GuimoConversionRule"("integrationId");
CREATE INDEX "GuimoConversionRule_workspaceId_idx" ON "GuimoConversionRule"("workspaceId");

ALTER TABLE "GuimoConversionRule" ADD CONSTRAINT "GuimoConversionRule_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuimoConversionRule" ADD CONSTRAINT "GuimoConversionRule_integrationId_fkey"
FOREIGN KEY ("integrationId") REFERENCES "GuimoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
