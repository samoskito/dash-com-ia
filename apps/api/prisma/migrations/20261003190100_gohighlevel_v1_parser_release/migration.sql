-- Seed the observation-only parser after the GoHighLevel enum values are committed.

INSERT INTO "InboundWebhookParserRelease" (
  "id",
  "provider",
  "version",
  "status",
  "createdAt",
  "updatedAt"
) VALUES (
  'inbound_parser_gohighlevel_v1',
  'gohighlevel',
  'v1',
  'observation_only',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("provider", "version") DO NOTHING;
