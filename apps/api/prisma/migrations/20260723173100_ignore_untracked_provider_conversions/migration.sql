-- A conversion without a paid lead in this workspace is outside the product
-- scope. Preserve its raw delivery for internal audit, but remove unsent
-- derived records from customer-facing operational queues.

WITH "untracked_executions" AS (
  SELECT
    execution."id",
    execution."workspaceId",
    execution."sourceDeliveryId"
  FROM "ProviderConversionRuleExecution" AS execution
  WHERE execution."leadId" IS NULL
    AND execution."conversionEventLogId" IS NULL
    AND COALESCE(execution."reasonCode", '') <> 'empty_template_ignored'
    AND NOT EXISTS (
      SELECT 1
      FROM "Lead" AS lead
      WHERE lead."workspaceId" = execution."workspaceId"
        AND lead."phoneHash" = execution."contactIdentityHash"
    )
    AND execution."status" IN (
      'observed'::"ProviderConversionExecutionStatus",
      'eligible'::"ProviderConversionExecutionStatus",
      'blocked'::"ProviderConversionExecutionStatus",
      'failed'::"ProviderConversionExecutionStatus"
    )
),
"closed_reviews" AS (
  UPDATE "PurchaseReview" AS review
  SET
    "status" = 'rejected'::"PurchaseReviewStatus",
    "reasonCode" = 'ignored_untracked_lead',
    "decisionReason" = 'Contato fora da base de leads pagos rastreados',
    "decidedAt" = COALESCE(review."decidedAt", CURRENT_TIMESTAMP),
    "version" = review."version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "untracked_executions"
  WHERE review."workspaceId" = "untracked_executions"."workspaceId"
    AND review."providerExecutionId" = "untracked_executions"."id"
    AND review."leadId" IS NULL
    AND review."conversionEventLogId" IS NULL
    AND review."status" IN (
      'recognized'::"PurchaseReviewStatus",
      'awaiting_data'::"PurchaseReviewStatus",
      'review_required'::"PurchaseReviewStatus",
      'failed'::"PurchaseReviewStatus"
    )
  RETURNING review."id"
),
"closed_executions" AS (
  UPDATE "ProviderConversionRuleExecution" AS execution
  SET
    "status" = 'blocked'::"ProviderConversionExecutionStatus",
    "reasonCode" = 'ignored_untracked_lead',
    "processedAt" = COALESCE(execution."processedAt", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "untracked_executions"
  WHERE execution."workspaceId" = "untracked_executions"."workspaceId"
    AND execution."id" = "untracked_executions"."id"
  RETURNING
    execution."workspaceId",
    execution."sourceDeliveryId"
)
UPDATE "InboundWebhookDelivery" AS delivery
SET
  "classification" = 'ignored_untracked_lead'::"InboundWebhookEventClassification",
  "routingErrorCode" = NULL,
  "normalizedSummary" =
    COALESCE(delivery."normalizedSummary", '{}'::jsonb) ||
    jsonb_build_object(
      'executionStatus', 'ignored',
      'reasonCode', 'ignored_untracked_lead',
      'paidLeadResolved', false
    ),
  "processedAt" = COALESCE(delivery."processedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "closed_executions"
WHERE delivery."workspaceId" = "closed_executions"."workspaceId"
  AND delivery."id" = "closed_executions"."sourceDeliveryId";
