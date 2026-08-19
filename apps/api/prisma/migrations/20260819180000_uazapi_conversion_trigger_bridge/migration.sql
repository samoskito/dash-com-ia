-- U2c: bridge UAZAPI/NOD WhatsApp instances into the same inbound webhook
-- conversion-trigger center used by Umbler/Gupshup (message_phrase rules).

ALTER TYPE "InboundWebhookProvider"
ADD VALUE IF NOT EXISTS 'uazapi';

ALTER TABLE "InboundWebhookChannel"
ADD COLUMN "whatsappInstanceId" TEXT;

CREATE UNIQUE INDEX "InboundWebhookChannel_whatsappInstanceId_key"
ON "InboundWebhookChannel"("whatsappInstanceId");

ALTER TABLE "InboundWebhookChannel"
ADD CONSTRAINT "InboundWebhookChannel_whatsappInstanceId_fkey"
FOREIGN KEY ("whatsappInstanceId") REFERENCES "WhatsappInstance"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
