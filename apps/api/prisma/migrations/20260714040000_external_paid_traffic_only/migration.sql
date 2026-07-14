CREATE TEMP TABLE "_wpptrack_external_organic_leads" (
  "id" TEXT PRIMARY KEY
);

INSERT INTO "_wpptrack_external_organic_leads" ("id")
SELECT DISTINCT l."id"
FROM "Lead" l
WHERE l."source" = 'external_mysql'
  AND NULLIF(BTRIM(l."ctwaClid"), '') IS NULL
  AND EXISTS (
    SELECT 1
    FROM "ExternalIngestionRecord" r
    INNER JOIN "ExternalDataConnector" c ON c."id" = r."connectorId"
    WHERE r."leadId" = l."id"
      AND c."provider" = 'kinbox_mysql'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "ConversionEventLog" e
    WHERE e."leadId" = l."id"
      AND (
        e."sentAt" IS NOT NULL
        OR NULLIF(BTRIM(e."ctwaClid"), '') IS NOT NULL
        OR e."businessSource" = 'paid'
      )
  );

CREATE TEMP TABLE "_wpptrack_external_organic_events" (
  "id" TEXT PRIMARY KEY
);

INSERT INTO "_wpptrack_external_organic_events" ("id")
SELECT e."id"
FROM "ConversionEventLog" e
INNER JOIN "_wpptrack_external_organic_leads" l ON l."id" = e."leadId"
INNER JOIN "ExternalDataConnector" c ON c."id" = e."externalConnectorId"
WHERE c."provider" = 'kinbox_mysql'
  AND e."sentAt" IS NULL
  AND NULLIF(BTRIM(e."ctwaClid"), '') IS NULL
  AND e."businessSource" = 'organic';

DELETE FROM "DiagnosticEvent" d
USING "_wpptrack_external_organic_events" e
WHERE d."conversionEventLogId" = e."id";

DELETE FROM "ExternalIngestionRecord" r
USING "_wpptrack_external_organic_events" e
WHERE r."conversionEventLogId" = e."id";

DELETE FROM "ConversionEventLog" e
USING "_wpptrack_external_organic_events" candidate
WHERE e."id" = candidate."id";

DELETE FROM "ExternalIngestionRecord" r
USING "_wpptrack_external_organic_leads" l,
      "ExternalDataConnector" c
WHERE r."leadId" = l."id"
  AND c."id" = r."connectorId"
  AND c."provider" = 'kinbox_mysql';

DELETE FROM "Lead" l
USING "_wpptrack_external_organic_leads" candidate
WHERE l."id" = candidate."id"
  AND NOT EXISTS (
    SELECT 1
    FROM "ConversionEventLog" e
    WHERE e."leadId" = l."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "ExternalIngestionRecord" r
    WHERE r."leadId" = l."id"
  );

DROP TABLE "_wpptrack_external_organic_events";
DROP TABLE "_wpptrack_external_organic_leads";
