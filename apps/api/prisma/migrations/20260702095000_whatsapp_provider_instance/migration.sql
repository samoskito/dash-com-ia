-- Store the provider-side WhatsApp instance id after Uazapi provisioning.
ALTER TABLE "WhatsappInstance" ADD COLUMN "providerInstanceId" TEXT;

CREATE INDEX "WhatsappInstance_providerInstanceId_idx" ON "WhatsappInstance"("providerInstanceId");
