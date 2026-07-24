-- Normalize legacy purchase-review rows to the canonical business semantics.
-- Raw webhook deliveries, decision audits and Meta event history are preserved.

UPDATE "PurchaseReview" AS review
SET
  "status" = 'rejected'::"PurchaseReviewStatus",
  "reasonCode" = 'ignored_untracked_lead',
  "decisionReason" = COALESCE(
    review."decisionReason",
    'Contato fora da base de leads pagos rastreados'
  ),
  "decidedAt" = COALESCE(review."decidedAt", CURRENT_TIMESTAMP),
  "version" = review."version" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE review."leadId" IS NULL
  AND review."conversionEventLogId" IS NULL
  AND COALESCE(review."reasonCode", '') NOT IN (
    'empty_template_ignored',
    'ignored_untracked_lead'
  )
  AND review."status" IN (
    'recognized'::"PurchaseReviewStatus",
    'awaiting_data'::"PurchaseReviewStatus",
    'review_required'::"PurchaseReviewStatus",
    'failed'::"PurchaseReviewStatus"
  );

UPDATE "PurchaseReview" AS review
SET
  "status" = 'review_required'::"PurchaseReviewStatus",
  "classificationCode" = 'review_required',
  "reasonCode" = CASE
    WHEN review."reasonCode" IN ('matched', 'awaiting_data')
      THEN 'legacy_actionable_review'
    ELSE review."reasonCode"
  END,
  "version" = review."version" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE review."leadId" IS NOT NULL
  AND review."conversionEventLogId" IS NULL
  AND review."status" IN (
    'recognized'::"PurchaseReviewStatus",
    'awaiting_data'::"PurchaseReviewStatus"
  )
  AND (
    review."effectiveValueCents" > 0
    OR EXISTS (
      SELECT 1
      FROM "PurchaseReviewItem" AS item
      WHERE item."workspaceId" = review."workspaceId"
        AND item."purchaseReviewId" = review."id"
        AND (
          item."catalogVariantId" IS NOT NULL
          OR (
            jsonb_typeof(item."attributeValues") = 'array'
            AND jsonb_array_length(item."attributeValues") > 0
          )
        )
    )
  );
