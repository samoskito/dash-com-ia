import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { ConversionEventsService } from "./conversion-events.service";
import { MetaCapiAdapter } from "./meta-capi.adapter";

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: MetaCapiAdapter,
      useFactory: () => new MetaCapiAdapter()
    },
    ConversionEventsService
  ],
  exports: [ConversionEventsService]
})
export class ConversionEventsModule {}
