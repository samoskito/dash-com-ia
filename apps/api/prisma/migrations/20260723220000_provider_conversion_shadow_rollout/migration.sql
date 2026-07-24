-- Add a channel-scoped conversion-engine rollout mode and append-only shadow
-- comparison evidence. Existing channels stay on the legacy evaluator.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ProviderConversionEngineMode'
  ) THEN
    CREATE TYPE "ProviderConversionEngineMode" AS ENUM (
      'legacy',
      'shadow',
      'canonical'
    );
  END IF;
END
$migration$;

ALTER TABLE "InboundWebhookChannel"
  ADD COLUMN IF NOT EXISTS "conversionEngineMode"
    "ProviderConversionEngineMode" NOT NULL DEFAULT 'legacy';

CREATE TABLE IF NOT EXISTS "ProviderConversionShadowComparison" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerRuleId" TEXT NOT NULL,
  "sourceDeliveryId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "comparisonFingerprint" TEXT NOT NULL,
  "authoritativeEngine" "ProviderConversionEngineMode" NOT NULL,
  "legacyEngineVersion" TEXT,
  "legacyDecisionCode" TEXT,
  "legacyReasonCode" TEXT,
  "legacyDecision" JSONB,
  "canonicalEngineVersion" TEXT,
  "canonicalDecisionCode" TEXT,
  "canonicalReasonCode" TEXT,
  "canonicalDecision" JSONB,
  "matches" BOOLEAN NOT NULL,
  "mismatchCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderConversionShadowComparison_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "ProviderConversionShadowComparison_workspace_id_key"
  ON "ProviderConversionShadowComparison"("workspaceId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS
  "ProviderConversionShadowComparison_occurrence_fingerprint_key"
  ON "ProviderConversionShadowComparison"(
    "providerRuleId",
    "occurrenceKey",
    "comparisonFingerprint"
  );

CREATE INDEX IF NOT EXISTS
  "ProviderConversionShadowComparison_workspace_match_date_idx"
  ON "ProviderConversionShadowComparison"(
    "workspaceId",
    "matches",
    "createdAt"
  );

CREATE INDEX IF NOT EXISTS
  "ProviderConversionShadowComparison_channel_date_idx"
  ON "ProviderConversionShadowComparison"(
    "workspaceId",
    "channelId",
    "createdAt"
  );

CREATE INDEX IF NOT EXISTS
  "ProviderConversionShadowComparison_mismatch_date_idx"
  ON "ProviderConversionShadowComparison"(
    "workspaceId",
    "mismatchCode",
    "createdAt"
  );

CREATE INDEX IF NOT EXISTS
  "ProviderConversionShadowComparison_delivery_idx"
  ON "ProviderConversionShadowComparison"("sourceDeliveryId");

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProviderConversionShadowComparison_workspaceId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionShadowComparison"
      ADD CONSTRAINT "ProviderConversionShadowComparison_workspaceId_fkey"
      FOREIGN KEY ("workspaceId")
      REFERENCES "Workspace"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProviderConversionShadowComparison_providerRuleId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionShadowComparison"
      ADD CONSTRAINT
        "ProviderConversionShadowComparison_providerRuleId_fkey"
      FOREIGN KEY ("workspaceId", "providerRuleId")
      REFERENCES "ProviderConversionRuleConfig"("workspaceId", "id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProviderConversionShadowComparison_sourceDeliveryId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionShadowComparison"
      ADD CONSTRAINT
        "ProviderConversionShadowComparison_sourceDeliveryId_fkey"
      FOREIGN KEY ("workspaceId", "sourceDeliveryId")
      REFERENCES "InboundWebhookDelivery"("workspaceId", "id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProviderConversionShadowComparison_channelId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionShadowComparison"
      ADD CONSTRAINT "ProviderConversionShadowComparison_channelId_fkey"
      FOREIGN KEY ("workspaceId", "channelId")
      REFERENCES "InboundWebhookChannel"("workspaceId", "id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION
  "wpptrack_forbid_provider_conversion_shadow_comparison_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION
    'ProviderConversionShadowComparison is append-only';
END;
$function$;

DROP TRIGGER IF EXISTS
  "ProviderConversionShadowComparison_forbid_update"
  ON "ProviderConversionShadowComparison";

CREATE TRIGGER "ProviderConversionShadowComparison_forbid_update"
BEFORE UPDATE ON "ProviderConversionShadowComparison"
FOR EACH ROW
EXECUTE FUNCTION
  "wpptrack_forbid_provider_conversion_shadow_comparison_mutation"();

DROP TRIGGER IF EXISTS
  "ProviderConversionShadowComparison_forbid_delete"
  ON "ProviderConversionShadowComparison";

CREATE TRIGGER "ProviderConversionShadowComparison_forbid_delete"
BEFORE DELETE ON "ProviderConversionShadowComparison"
FOR EACH ROW
EXECUTE FUNCTION
  "wpptrack_forbid_provider_conversion_shadow_comparison_mutation"();
