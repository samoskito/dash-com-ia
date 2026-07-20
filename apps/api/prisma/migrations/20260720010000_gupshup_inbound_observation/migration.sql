-- Register the Gupshup enum values in their own committed migration.
-- PostgreSQL does not allow a new enum value to be used before commit.
-- No existing Umbler connection, route, event or replay state is changed.

ALTER TYPE "InboundWebhookProvider" ADD VALUE IF NOT EXISTS 'gupshup';
ALTER TYPE "DiagnosticSource" ADD VALUE IF NOT EXISTS 'gupshup';
