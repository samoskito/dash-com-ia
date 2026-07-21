import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import {
  INBOUND_WEBHOOK_PRODUCTION_QUEUE,
  INBOUND_WEBHOOK_QUEUE,
} from "../common/queue/queue.constants";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { BackofficeInboundWebhooksController } from "./backoffice-inbound-webhooks.controller";
import { BackofficeInboundWebhooksService } from "./backoffice-inbound-webhooks.service";
import { InboundWebhookChannelRoutesService } from "./inbound-webhook-channel-routes.service";
import { InboundWebhookConnectionsController } from "./inbound-webhook-connections.controller";
import { InboundWebhookConnectionsService } from "./inbound-webhook-connections.service";
import { InboundWebhookDiagnosticsService } from "./inbound-webhook-diagnostics.service";
import { InboundWebhookIngestionService } from "./inbound-webhook-ingestion.service";
import { InboundWebhookMaintenanceService } from "./inbound-webhook-maintenance.service";
import { InboundWebhookMetaRouteReaderService } from "./inbound-webhook-meta-route-reader.service";
import { InboundWebhookObservationService } from "./inbound-webhook-observation.service";
import { InboundWebhookPayloadEncryptionService } from "./inbound-webhook-payload-encryption.service";
import { InboundWebhookProductionIntakeService } from "./inbound-webhook-production-intake.service";
import { InboundWebhookProductionQueueService } from "./inbound-webhook-production-queue.service";
import { InboundWebhookProcessor } from "./inbound-webhook.processor";
import { InboundWebhookPublicController } from "./inbound-webhook-public.controller";
import { InboundWebhookQueueService } from "./inbound-webhook-queue.service";
import { InboundWebhookParserRegistry } from "./providers/inbound-webhook-parser.registry";

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    RuntimeModule,
    WorkspacesModule,
    BullModule.registerQueue({
      name: INBOUND_WEBHOOK_QUEUE,
    }),
    BullModule.registerQueue({
      name: INBOUND_WEBHOOK_PRODUCTION_QUEUE,
    }),
  ],
  controllers: [
    BackofficeInboundWebhooksController,
    InboundWebhookConnectionsController,
    InboundWebhookPublicController,
  ],
  providers: [
    BackofficeInboundWebhooksService,
    InboundWebhookChannelRoutesService,
    InboundWebhookConnectionsService,
    InboundWebhookDiagnosticsService,
    InboundWebhookIngestionService,
    InboundWebhookMaintenanceService,
    InboundWebhookMetaRouteReaderService,
    InboundWebhookObservationService,
    InboundWebhookPayloadEncryptionService,
    InboundWebhookProductionIntakeService,
    InboundWebhookProductionQueueService,
    InboundWebhookProcessor,
    InboundWebhookQueueService,
    InboundWebhookParserRegistry,
  ],
  exports: [
    InboundWebhookChannelRoutesService,
    InboundWebhookConnectionsService,
    InboundWebhookPayloadEncryptionService,
    InboundWebhookProductionIntakeService,
    InboundWebhookProductionQueueService,
    InboundWebhookParserRegistry,
  ],
})
export class InboundWebhooksModule {}
