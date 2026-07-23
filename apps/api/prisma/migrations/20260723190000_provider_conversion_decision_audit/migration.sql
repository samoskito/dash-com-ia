-- Persist canonical provider-conversion decisions before any operational side
-- effect. The table is append-only: reevaluation creates a new version.

CREATE TABLE IF NOT EXISTS "ProviderConversionDecisionAudit" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerRuleId" TEXT NOT NULL,
  "sourceDeliveryId" TEXT NOT NULL,
  "channelWorkspaceId" TEXT,
  "channelId" TEXT,
  "leadWorkspaceId" TEXT,
  "leadId" TEXT,
  "supersedesDecisionWorkspaceId" TEXT,
  "supersedesDecisionId" TEXT,
  "decisionCode" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "evaluationKey" TEXT NOT NULL,
  "decisionFingerprint" TEXT NOT NULL,
  "decisionVersion" INTEGER NOT NULL,
  "engineVersion" TEXT NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "contactIdentityHash" TEXT,
  "businessDedupeMode" TEXT,
  "businessDedupeScopeKey" TEXT,
  "businessDedupeWindowSeconds" INTEGER,
  "valueCents" INTEGER,
  "currency" TEXT,
  "normalizedOccurrence" JSONB NOT NULL,
  "ruleSnapshot" JSONB NOT NULL,
  "catalogSnapshot" JSONB,
  "conversionSnapshot" JSONB NOT NULL,
  "leadResolution" JSONB NOT NULL,
  "decisionJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderConversionDecisionAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProviderConversionRuleExecution"
  ADD COLUMN IF NOT EXISTS "providerDecisionWorkspaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerDecisionId" TEXT;

ALTER TABLE "PurchaseReview"
  ADD COLUMN IF NOT EXISTS "providerDecisionWorkspaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerDecisionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_workspace_id_key"
  ON "ProviderConversionDecisionAudit"("workspaceId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_evaluation_key"
  ON "ProviderConversionDecisionAudit"(
    "providerRuleId",
    "occurrenceKey",
    "evaluationKey"
  );

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_version_key"
  ON "ProviderConversionDecisionAudit"(
    "providerRuleId",
    "occurrenceKey",
    "decisionVersion"
  );

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_supersedes_key"
  ON "ProviderConversionDecisionAudit"(
    "supersedesDecisionWorkspaceId",
    "supersedesDecisionId"
  );

CREATE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_workspace_date_idx"
  ON "ProviderConversionDecisionAudit"("workspaceId", "occurredAt");

CREATE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_decision_date_idx"
  ON "ProviderConversionDecisionAudit"(
    "workspaceId",
    "decisionCode",
    "occurredAt"
  );

CREATE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_delivery_idx"
  ON "ProviderConversionDecisionAudit"("sourceDeliveryId");

CREATE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_channel_idx"
  ON "ProviderConversionDecisionAudit"("channelId");

CREATE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_lead_idx"
  ON "ProviderConversionDecisionAudit"("leadId");

CREATE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_dedupe_date_idx"
  ON "ProviderConversionDecisionAudit"(
    "businessDedupeScopeKey",
    "occurredAt"
  );

CREATE INDEX IF NOT EXISTS "ProviderConversionDecisionAudit_supersedes_idx"
  ON "ProviderConversionDecisionAudit"("supersedesDecisionId");

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConversionRuleExecution_decision_key"
  ON "ProviderConversionRuleExecution"(
    "providerDecisionWorkspaceId",
    "providerDecisionId"
  );

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReview_decision_key"
  ON "PurchaseReview"(
    "providerDecisionWorkspaceId",
    "providerDecisionId"
  );

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProviderConversionDecisionAudit_workspaceId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionDecisionAudit"
      ADD CONSTRAINT "ProviderConversionDecisionAudit_workspaceId_fkey"
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
    WHERE conname = 'ProviderConversionDecisionAudit_providerRuleId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionDecisionAudit"
      ADD CONSTRAINT "ProviderConversionDecisionAudit_providerRuleId_fkey"
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
    WHERE conname = 'ProviderConversionDecisionAudit_sourceDeliveryId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionDecisionAudit"
      ADD CONSTRAINT "ProviderConversionDecisionAudit_sourceDeliveryId_fkey"
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
    WHERE conname = 'ProviderConversionDecisionAudit_channelId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionDecisionAudit"
      ADD CONSTRAINT "ProviderConversionDecisionAudit_channelId_fkey"
      FOREIGN KEY ("channelWorkspaceId", "channelId")
      REFERENCES "InboundWebhookChannel"("workspaceId", "id")
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
    WHERE conname = 'ProviderConversionDecisionAudit_leadId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionDecisionAudit"
      ADD CONSTRAINT "ProviderConversionDecisionAudit_leadId_fkey"
      FOREIGN KEY ("leadWorkspaceId", "leadId")
      REFERENCES "Lead"("workspaceId", "id")
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
    WHERE conname = 'ProviderConversionDecisionAudit_supersedesDecisionId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionDecisionAudit"
      ADD CONSTRAINT "ProviderConversionDecisionAudit_supersedesDecisionId_fkey"
      FOREIGN KEY (
        "supersedesDecisionWorkspaceId",
        "supersedesDecisionId"
      )
      REFERENCES "ProviderConversionDecisionAudit"("workspaceId", "id")
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
    WHERE conname = 'ProviderConversionRuleExecution_providerDecisionId_fkey'
  ) THEN
    ALTER TABLE "ProviderConversionRuleExecution"
      ADD CONSTRAINT "ProviderConversionRuleExecution_providerDecisionId_fkey"
      FOREIGN KEY ("providerDecisionWorkspaceId", "providerDecisionId")
      REFERENCES "ProviderConversionDecisionAudit"("workspaceId", "id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PurchaseReview_providerDecisionId_fkey'
  ) THEN
    ALTER TABLE "PurchaseReview"
      ADD CONSTRAINT "PurchaseReview_providerDecisionId_fkey"
      FOREIGN KEY ("providerDecisionWorkspaceId", "providerDecisionId")
      REFERENCES "ProviderConversionDecisionAudit"("workspaceId", "id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION "wpptrack_forbid_provider_conversion_decision_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION
    'ProviderConversionDecisionAudit is append-only; create a new version';
END;
$function$;

DROP TRIGGER IF EXISTS "ProviderConversionDecisionAudit_append_only"
  ON "ProviderConversionDecisionAudit";

CREATE TRIGGER "ProviderConversionDecisionAudit_append_only"
BEFORE UPDATE OR DELETE ON "ProviderConversionDecisionAudit"
FOR EACH ROW
EXECUTE FUNCTION "wpptrack_forbid_provider_conversion_decision_mutation"();
