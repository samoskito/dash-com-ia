import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { UazapiConversionBridgeService } from "./uazapi-conversion-bridge.service";

/**
 * The bridge only depends on Prisma, so it lives in its own module: billing
 * needs it to retire the inbound connection of a removed NOD number without
 * pulling the whole InboundWebhooksModule (queues + controllers) into
 * BillingModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [UazapiConversionBridgeService],
  exports: [UazapiConversionBridgeService],
})
export class UazapiConversionBridgeModule {}
