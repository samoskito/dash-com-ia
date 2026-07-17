-- OAuth advanced routing is opt-in. Existing workspaces keep their current
-- principal destination and legacy execution until explicitly activated.

ALTER TABLE "MetaIntegration"
  ADD COLUMN "primaryConversionDestinationId" TEXT,
  ADD COLUMN "advancedRoutingEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "MetaIntegration" AS integration
SET "primaryConversionDestinationId" = (
  SELECT destination."id"
  FROM "MetaConversionDestination" AS destination
  WHERE destination."workspaceId" = integration."workspaceId"
  ORDER BY destination."updatedAt" DESC
  LIMIT 1
);

CREATE INDEX "MetaIntegration_primaryConversionDestinationId_idx"
ON "MetaIntegration"("primaryConversionDestinationId");

CREATE INDEX "MetaIntegration_advancedRoutingEnabled_idx"
ON "MetaIntegration"("advancedRoutingEnabled");

ALTER TABLE "MetaIntegration"
ADD CONSTRAINT "MetaIntegration_primaryConversionDestinationId_fkey"
FOREIGN KEY ("primaryConversionDestinationId")
REFERENCES "MetaConversionDestination"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
