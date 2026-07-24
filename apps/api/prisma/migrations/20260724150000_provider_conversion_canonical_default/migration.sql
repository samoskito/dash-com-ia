-- New provider channels use the canonical conversion engine by default.
-- Existing channel rows retain their current mode.

ALTER TABLE "InboundWebhookChannel"
  ALTER COLUMN "conversionEngineMode"
  SET DEFAULT 'canonical'::"ProviderConversionEngineMode";
