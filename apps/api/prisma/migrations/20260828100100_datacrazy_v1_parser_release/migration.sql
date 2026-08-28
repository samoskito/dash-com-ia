-- Seed the observation-only parser only after the enum value has committed.
INSERT INTO "InboundWebhookParserRelease" (
  "id",
  "provider",
  "version",
  "status",
  "createdAt",
  "updatedAt"
) VALUES (
  'inbound_parser_datacrazy_v1',
  'datacrazy',
  'v1',
  'observation_only',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("provider", "version") DO NOTHING;
