-- Add reusable message triggers and an append-only purchase review domain.
-- Existing provider rules keep their current behavior until explicitly updated.

ALTER TYPE "ConversionTriggerType"
ADD VALUE IF NOT EXISTS 'message_phrase';

CREATE TYPE "ProviderConversionMessageAuthorScope" AS ENUM (
  'team',
  'contact',
  'both'
);

CREATE TYPE "PurchaseReviewStatus" AS ENUM (
  'recognized',
  'awaiting_data',
  'review_required',
  'approved',
  'sent',
  'duplicate',
  'rejected',
  'failed',
  'corrected_after_send'
);

CREATE TYPE "PurchaseReviewSourceType" AS ENUM (
  'provider_message',
  'provider_automation'
);

ALTER TABLE "ProviderConversionRuleConfig"
ADD COLUMN "messageTriggerPhrases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "messageAuthorScope" "ProviderConversionMessageAuthorScope";

ALTER TABLE "ProviderConversionRuleConfig"
ADD CONSTRAINT "ProviderConversionRuleConfig_triggerPhrases_count_check"
CHECK (cardinality("messageTriggerPhrases") <= 20);

CREATE UNIQUE INDEX "ProviderConversionRuleExecution_workspaceId_id_key"
ON "ProviderConversionRuleExecution"("workspaceId", "id");

CREATE UNIQUE INDEX "Lead_workspaceId_id_key"
ON "Lead"("workspaceId", "id");

CREATE TABLE "PurchaseReview" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerRuleId" TEXT NOT NULL,
  "sourceDeliveryId" TEXT NOT NULL,
  "channelWorkspaceId" TEXT,
  "channelId" TEXT,
  "providerExecutionWorkspaceId" TEXT,
  "providerExecutionId" TEXT,
  "externalOccurrenceKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "contactIdentityHash" TEXT,
  "sourceType" "PurchaseReviewSourceType" NOT NULL,
  "messageAuthorType" TEXT,
  "matchedTriggerPhrase" TEXT,
  "status" "PurchaseReviewStatus" NOT NULL,
  "classificationCode" TEXT NOT NULL,
  "reasonCode" TEXT,
  "observedPaymentValueCents" INTEGER,
  "calculatedValueCents" INTEGER,
  "effectiveValueCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "leadWorkspaceId" TEXT,
  "leadId" TEXT,
  "conversionEventLogId" TEXT,
  "decisionReason" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReview_channel_pair_check"
    CHECK (("channelWorkspaceId" IS NULL) = ("channelId" IS NULL)),
  CONSTRAINT "PurchaseReview_channel_workspace_check"
    CHECK ("channelWorkspaceId" IS NULL OR "channelWorkspaceId" = "workspaceId"),
  CONSTRAINT "PurchaseReview_execution_pair_check"
    CHECK (("providerExecutionWorkspaceId" IS NULL) = ("providerExecutionId" IS NULL)),
  CONSTRAINT "PurchaseReview_execution_workspace_check"
    CHECK ("providerExecutionWorkspaceId" IS NULL OR "providerExecutionWorkspaceId" = "workspaceId"),
  CONSTRAINT "PurchaseReview_lead_pair_check"
    CHECK (("leadWorkspaceId" IS NULL) = ("leadId" IS NULL)),
  CONSTRAINT "PurchaseReview_lead_workspace_check"
    CHECK ("leadWorkspaceId" IS NULL OR "leadWorkspaceId" = "workspaceId"),
  CONSTRAINT "PurchaseReview_values_check"
    CHECK (
      ("observedPaymentValueCents" IS NULL OR "observedPaymentValueCents" > 0) AND
      ("calculatedValueCents" IS NULL OR "calculatedValueCents" > 0) AND
      ("effectiveValueCents" IS NULL OR "effectiveValueCents" > 0)
    ),
  CONSTRAINT "PurchaseReview_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PurchaseReview_version_check" CHECK ("version" > 0)
);

CREATE TABLE "PurchaseReviewItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "purchaseReviewId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "catalogVariantWorkspaceId" TEXT,
  "catalogVariantId" TEXT,
  "attributeValues" JSONB NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitValueCents" INTEGER,
  "subtotalValueCents" INTEGER,
  "contentName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseReviewItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReviewItem_variant_pair_check"
    CHECK (("catalogVariantWorkspaceId" IS NULL) = ("catalogVariantId" IS NULL)),
  CONSTRAINT "PurchaseReviewItem_variant_workspace_check"
    CHECK ("catalogVariantWorkspaceId" IS NULL OR "catalogVariantWorkspaceId" = "workspaceId"),
  CONSTRAINT "PurchaseReviewItem_position_check" CHECK ("position" > 0),
  CONSTRAINT "PurchaseReviewItem_quantity_check" CHECK ("quantity" BETWEEN 1 AND 100),
  CONSTRAINT "PurchaseReviewItem_values_check"
    CHECK (
      ("unitValueCents" IS NULL) = ("subtotalValueCents" IS NULL) AND
      (
        "unitValueCents" IS NULL OR
        (
          "unitValueCents" > 0 AND
          "subtotalValueCents" = "unitValueCents" * "quantity"
        )
      )
    )
);

CREATE TABLE "PurchaseValueAdjustment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "purchaseReviewId" TEXT NOT NULL,
  "conversionEventLogId" TEXT NOT NULL,
  "previousValueCents" INTEGER NOT NULL,
  "effectiveValueCents" INTEGER NOT NULL,
  "actorUserId" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseValueAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseValueAdjustment_values_check"
    CHECK ("previousValueCents" > 0 AND "effectiveValueCents" > 0)
);

CREATE UNIQUE INDEX "PurchaseReview_workspaceId_id_key"
ON "PurchaseReview"("workspaceId", "id");

CREATE UNIQUE INDEX "PurchaseReview_providerExecutionId_key"
ON "PurchaseReview"("providerExecutionId");

CREATE UNIQUE INDEX "PurchaseReview_providerExecutionWorkspaceId_providerExecutionId_key"
ON "PurchaseReview"("providerExecutionWorkspaceId", "providerExecutionId");

CREATE UNIQUE INDEX "PurchaseReview_conversionEventLogId_key"
ON "PurchaseReview"("conversionEventLogId");

CREATE UNIQUE INDEX "PurchaseReview_providerRuleId_externalOccurrenceKey_key"
ON "PurchaseReview"("providerRuleId", "externalOccurrenceKey");

CREATE INDEX "PurchaseReview_workspaceId_status_occurredAt_idx"
ON "PurchaseReview"("workspaceId", "status", "occurredAt");

CREATE INDEX "PurchaseReview_workspaceId_contactIdentityHash_occurredAt_idx"
ON "PurchaseReview"("workspaceId", "contactIdentityHash", "occurredAt");

CREATE INDEX "PurchaseReview_sourceDeliveryId_idx"
ON "PurchaseReview"("sourceDeliveryId");

CREATE INDEX "PurchaseReview_channelId_idx"
ON "PurchaseReview"("channelId");

CREATE INDEX "PurchaseReview_leadId_idx"
ON "PurchaseReview"("leadId");

CREATE INDEX "PurchaseReview_conversionEventLogId_idx"
ON "PurchaseReview"("conversionEventLogId");

CREATE UNIQUE INDEX "PurchaseReviewItem_purchaseReviewId_position_key"
ON "PurchaseReviewItem"("purchaseReviewId", "position");

CREATE INDEX "PurchaseReviewItem_workspaceId_purchaseReviewId_idx"
ON "PurchaseReviewItem"("workspaceId", "purchaseReviewId");

CREATE INDEX "PurchaseReviewItem_catalogVariantId_idx"
ON "PurchaseReviewItem"("catalogVariantId");

CREATE INDEX "PurchaseValueAdjustment_workspaceId_conversionEventLogId_createdAt_idx"
ON "PurchaseValueAdjustment"("workspaceId", "conversionEventLogId", "createdAt");

CREATE INDEX "PurchaseValueAdjustment_purchaseReviewId_createdAt_idx"
ON "PurchaseValueAdjustment"("purchaseReviewId", "createdAt");

CREATE INDEX "PurchaseValueAdjustment_actorUserId_idx"
ON "PurchaseValueAdjustment"("actorUserId");

ALTER TABLE "PurchaseReview"
ADD CONSTRAINT "PurchaseReview_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReview_providerRuleId_fkey"
FOREIGN KEY ("workspaceId", "providerRuleId")
REFERENCES "ProviderConversionRuleConfig"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReview_sourceDeliveryId_fkey"
FOREIGN KEY ("workspaceId", "sourceDeliveryId")
REFERENCES "InboundWebhookDelivery"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReview_channelId_fkey"
FOREIGN KEY ("channelWorkspaceId", "channelId")
REFERENCES "InboundWebhookChannel"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReview_providerExecutionId_fkey"
FOREIGN KEY ("providerExecutionWorkspaceId", "providerExecutionId")
REFERENCES "ProviderConversionRuleExecution"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReview_leadId_fkey"
FOREIGN KEY ("leadWorkspaceId", "leadId")
REFERENCES "Lead"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReview_conversionEventLogId_fkey"
FOREIGN KEY ("conversionEventLogId") REFERENCES "ConversionEventLog"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReview_decidedByUserId_fkey"
FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseReviewItem"
ADD CONSTRAINT "PurchaseReviewItem_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReviewItem_purchaseReviewId_fkey"
FOREIGN KEY ("workspaceId", "purchaseReviewId")
REFERENCES "PurchaseReview"("workspaceId", "id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseReviewItem_catalogVariantId_fkey"
FOREIGN KEY ("catalogVariantWorkspaceId", "catalogVariantId")
REFERENCES "ConversionCatalogVariant"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseValueAdjustment"
ADD CONSTRAINT "PurchaseValueAdjustment_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseValueAdjustment_purchaseReviewId_fkey"
FOREIGN KEY ("workspaceId", "purchaseReviewId")
REFERENCES "PurchaseReview"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseValueAdjustment_conversionEventLogId_fkey"
FOREIGN KEY ("conversionEventLogId") REFERENCES "ConversionEventLog"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PurchaseValueAdjustment_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
