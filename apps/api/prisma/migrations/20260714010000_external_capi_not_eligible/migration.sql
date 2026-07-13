UPDATE "ConversionEventLog"
SET
  "status" = 'not_eligible',
  "errorCode" = NULL,
  "errorMessage" = NULL
WHERE "externalConnectorId" IS NOT NULL
  AND "status" = 'pending_meta_context'
  AND NULLIF(BTRIM("ctwaClid"), '') IS NULL;
