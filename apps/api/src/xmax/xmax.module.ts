import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { XmaxCredentialEncryptionService } from "./xmax-credential-encryption.service";
import { XmaxIngestService } from "./xmax-ingest.service";
import { XmaxWebhookController } from "./xmax-webhook.controller";
import { XmaxAdapter } from "./xmax.adapter";

@Module({
  imports: [PrismaModule, RuntimeModule],
  controllers: [XmaxWebhookController],
  providers: [
    XmaxAdapter,
    XmaxCredentialEncryptionService,
    XmaxIngestService,
  ],
  exports: [
    XmaxAdapter,
    XmaxCredentialEncryptionService,
    XmaxIngestService,
  ],
})
export class XmaxModule {}
