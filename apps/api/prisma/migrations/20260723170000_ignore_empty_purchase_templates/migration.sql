-- Empty purchase templates are conversation scaffolding, not purchases.
-- Keep the raw webhook payload for audit, but remove derived empty reviews
-- from the operational queue.

WITH "empty_reviews" AS (
  SELECT
    review."id",
    review."workspaceId",
    review."providerExecutionId"
  FROM "PurchaseReview" AS review
  WHERE review."sourceType" = 'provider_message'::"PurchaseReviewSourceType"
    AND review."status" = 'awaiting_data'::"PurchaseReviewStatus"
    AND review."calculatedValueCents" IS NULL
    AND review."effectiveValueCents" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "PurchaseReviewItem" AS item
      WHERE item."workspaceId" = review."workspaceId"
        AND item."purchaseReviewId" = review."id"
        AND jsonb_typeof(item."attributeValues") = 'array'
        AND jsonb_array_length(item."attributeValues") > 0
    )
),
"updated_reviews" AS (
  UPDATE "PurchaseReview" AS review
  SET
    "status" = 'rejected'::"PurchaseReviewStatus",
    "reasonCode" = 'empty_template_ignored',
    "decisionReason" = 'Template sem dados de compra ignorado automaticamente',
    "decidedAt" = COALESCE(review."decidedAt", CURRENT_TIMESTAMP),
    "version" = review."version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "empty_reviews"
  WHERE review."id" = "empty_reviews"."id"
    AND review."workspaceId" = "empty_reviews"."workspaceId"
  RETURNING review."providerExecutionId", review."workspaceId"
)
UPDATE "ProviderConversionRuleExecution" AS execution
SET
  "status" = 'blocked'::"ProviderConversionExecutionStatus",
  "reasonCode" = 'empty_template_ignored',
  "processedAt" = COALESCE(execution."processedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "updated_reviews"
WHERE execution."id" = "updated_reviews"."providerExecutionId"
  AND execution."workspaceId" = "updated_reviews"."workspaceId"
  AND execution."status" IN (
    'observed'::"ProviderConversionExecutionStatus",
    'eligible'::"ProviderConversionExecutionStatus",
    'blocked'::"ProviderConversionExecutionStatus",
    'failed'::"ProviderConversionExecutionStatus"
  );
