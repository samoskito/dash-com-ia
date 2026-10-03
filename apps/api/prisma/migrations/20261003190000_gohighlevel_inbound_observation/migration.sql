-- Register the GoHighLevel enum values in their own committed migration.
-- PostgreSQL does not allow a new enum value to be used before commit.

ALTER TYPE "InboundWebhookProvider" ADD VALUE IF NOT EXISTS 'gohighlevel';
ALTER TYPE "DiagnosticSource" ADD VALUE IF NOT EXISTS 'gohighlevel';
