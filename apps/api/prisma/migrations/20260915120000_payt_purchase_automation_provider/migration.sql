-- Payt is an observation-only purchase automation provider in this phase.
-- This migration is intentionally not applied by the implementation workflow.
ALTER TYPE "InboundWebhookProvider" ADD VALUE IF NOT EXISTS 'payt';

-- The connection release permits configuring an authenticated Payt endpoint.
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
