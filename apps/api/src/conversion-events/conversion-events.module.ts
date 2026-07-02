import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { INTEGRATION_ENV } from "../integrations/integration.types";
import { MetaTokenEncryptionService } from "../integrations/meta/meta-token-encryption.service";
import { ConversionEventsService } from "./conversion-events.service";
import { MetaCapiAdapter } from "./meta-capi.adapter";

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: MetaCapiAdapter,
      useFactory: () => new MetaCapiAdapter()
    },
    {
      provide: INTEGRATION_ENV,
      useValue: process.env
    },
    MetaTokenEncryptionService,
    ConversionEventsService
  ],
  exports: [ConversionEventsService]
})
export class ConversionEventsModule {}
