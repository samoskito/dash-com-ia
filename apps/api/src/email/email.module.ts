import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RuntimeModule } from "../common/runtime/runtime.module";
import { EmailConfigurationService } from "./email-configuration.service";
import { EmailActionStatusService } from "./email-action-status.service";
import { EmailDeliveryAuditService } from "./email-delivery-audit.service";
import { EmailEnvelopeCryptoService } from "./email-envelope-crypto.service";
import { EmailHealthService } from "./email-health.service";
import { EmailMessageRenderer } from "./email-message.renderer";
import { EmailProcessor } from "./email.processor";
import { EmailQueueService } from "./email-queue.service";
import { createEmailTransport, EMAIL_TRANSPORT } from "./email.transport";
import { EMAIL_DELIVERY_QUEUE } from "./email.types";

@Global()
@Module({
  imports: [
    PrismaModule,
    RuntimeModule,
    BullModule.registerQueue({
      name: EMAIL_DELIVERY_QUEUE,
    }),
  ],
  providers: [
    EmailConfigurationService,
    EmailActionStatusService,
    EmailEnvelopeCryptoService,
    EmailMessageRenderer,
    EmailDeliveryAuditService,
    EmailQueueService,
    EmailProcessor,
    EmailHealthService,
    {
      provide: EMAIL_TRANSPORT,
      inject: [EmailConfigurationService],
      useFactory: createEmailTransport,
    },
  ],
  exports: [
    EmailConfigurationService,
    EmailEnvelopeCryptoService,
    EmailMessageRenderer,
    EmailQueueService,
    EmailHealthService,
  ],
})
export class EmailModule {}
