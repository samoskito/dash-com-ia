import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { ConversionEventsService } from "./conversion-events.service";

@Module({
  imports: [PrismaModule],
  providers: [ConversionEventsService],
  exports: [ConversionEventsService]
})
export class ConversionEventsModule {}
