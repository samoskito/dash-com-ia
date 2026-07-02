ALTER TABLE "WhatsappInstance"
ADD COLUMN "providerTokenEncrypted" TEXT,
ADD COLUMN "providerTokenIv" TEXT,
ADD COLUMN "providerTokenTag" TEXT;
