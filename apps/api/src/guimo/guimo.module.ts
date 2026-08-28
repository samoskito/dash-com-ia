import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { QueueModule } from "../common/queue/queue.module";
import { ConversionEventsModule } from "../conversion-events/conversion-events.module";
import { AuthModule } from "../auth/auth.module";
import { GuimoAdapter } from "./guimo.adapter";
import { GuimoController } from "./guimo.controller";
import { GuimoService } from "./guimo.service";
import { GuimoWebhookProcessor } from "./guimo-webhook.processor";
import { GuimoWebhookQueueService } from "./guimo-webhook-queue.service";
import { GuimoWebhookRateLimitService } from "./guimo-webhook-rate-limit.service";
@Module({ imports: [PrismaModule, QueueModule, ConversionEventsModule, AuthModule], controllers: [GuimoController], providers: [GuimoAdapter, GuimoService, GuimoWebhookQueueService, GuimoWebhookRateLimitService, GuimoWebhookProcessor] })
export class GuimoModule {}
