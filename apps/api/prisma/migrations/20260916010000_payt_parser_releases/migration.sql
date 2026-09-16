-- Seed Payt parser releases after 'payt' exists on InboundWebhookProvider (prior migration).
INSERT INTO "InboundWebhookParserRelease" (
  "id", "provider", "version", "status", "createdAt", "updatedAt"
) VALUES
  (
    'inbound_parser_payt_v1', 'payt', 'v1', 'observation_only',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'inbound_parser_payt_automation_v1', 'payt', 'automation-v1', 'observation_only',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT ("provider", "version") DO NOTHING;
