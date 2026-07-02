ALTER TABLE "MetaIntegration"
  ADD COLUMN "capiAccessTokenEncrypted" TEXT,
  ADD COLUMN "capiTokenIv" TEXT,
  ADD COLUMN "capiTokenTag" TEXT;
