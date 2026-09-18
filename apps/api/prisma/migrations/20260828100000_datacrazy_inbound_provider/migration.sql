-- Add the provider enum in its own committed migration. Existing provider data is unchanged.
ALTER TYPE "InboundWebhookProvider" ADD VALUE IF NOT EXISTS 'datacrazy';
ALTER TYPE "DiagnosticSource" ADD VALUE IF NOT EXISTS 'datacrazy';
