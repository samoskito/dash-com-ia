import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { QueueModule } from "../common/queue/queue.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { ConversionEventsModule } from "../conversion-events/conversion-events.module";
import { LeadsModule } from "../leads/leads.module";
import { XmaxCredentialEncryptionService } from "./xmax-credential-encryption.service";
import { XmaxIngestService } from "./xmax-ingest.service";
import { XmaxProductionService } from "./xmax-production.service";
import { XmaxWebhookController } from "./xmax-webhook.controller";
import { XmaxAdapter } from "./xmax.adapter";

@Module({
  imports: [
    PrismaModule,
    RuntimeModule,
    LeadsModule,
    ConversionEventsModule,
    QueueModule,
  ],
  controllers: [XmaxWebhookController],
  providers: [
    XmaxAdapter,
    XmaxCredentialEncryptionService,
    XmaxProductionService,
    XmaxIngestService,
  ],
  exports: [
    XmaxAdapter,
    XmaxCredentialEncryptionService,
    XmaxProductionService,
    XmaxIngestService,
  ],
})
export class XmaxModule {}
