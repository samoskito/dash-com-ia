ALTER TABLE "ConversionEventLog"
  ADD COLUMN "sourcePayload" JSONB,
  ADD COLUMN "providerRequestPayload" JSONB;
