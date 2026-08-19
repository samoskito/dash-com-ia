import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { GuruLicenseWebhookController } from "./guru-license-webhook.controller";
import { GuruLicenseWebhookService } from "./guru-license-webhook.service";
import { LicenseAccountBindingService } from "./license-account-binding.service";
import { LicenseCryptoService } from "./license-crypto.service";
import { LicenseDeliverySecretService } from "./license-delivery-secret.service";
import { LicenseNotificationService } from "./license-notification.service";
import { LicenseRateLimitService } from "./license-rate-limit.service";
import { LicenseWhatsappNotifier } from "./license-whatsapp.notifier";
import { LicensingAdminController } from "./licensing.admin.controller";
import { LicensingController } from "./licensing.controller";
import { LicensingService } from "./licensing.service";

// EmailModule is @Global(); EmailQueueService is optional on LicenseNotificationService.
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    LicensingController,
    GuruLicenseWebhookController,
    LicensingAdminController,
  ],
  providers: [
    LicenseCryptoService,
    LicenseAccountBindingService,
    LicenseRateLimitService,
    LicenseDeliverySecretService,
    LicenseWhatsappNotifier,
    LicenseNotificationService,
    LicensingService,
    GuruLicenseWebhookService,
  ],
  exports: [
    LicensingService,
    LicenseCryptoService,
    LicenseAccountBindingService,
    LicenseDeliverySecretService,
    LicenseNotificationService,
  ],
})
export class LicensingModule {}
