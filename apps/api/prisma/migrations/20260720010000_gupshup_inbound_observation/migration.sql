-- Register Gupshup as an observation-only inbound webhook provider.
-- No existing Umbler connection, route, event or replay state is changed.

ALTER TYPE "InboundWebhookProvider" ADD VALUE IF NOT EXISTS 'gupshup';
ALTER TYPE "DiagnosticSource" ADD VALUE IF NOT EXISTS 'gupshup';

INSERT INTO "InboundWebhookParserRelease" (
  "id",
  "provider",
  "version",
  "status",
  "createdAt",
  "updatedAt"
) VALUES (
  'inbound_parser_gupshup_v1',
  'gupshup',
  'v1',
  'observation_only',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("provider", "version") DO NOTHING;
