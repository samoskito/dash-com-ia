import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { GuruLicenseWebhookController } from "./guru-license-webhook.controller";
import { GuruLicenseWebhookService } from "./guru-license-webhook.service";
import { LicenseAccountBindingService } from "./license-account-binding.service";
import { LicenseCryptoService } from "./license-crypto.service";
import { LicenseRateLimitService } from "./license-rate-limit.service";
import { LicensingController } from "./licensing.controller";
import { LicensingService } from "./licensing.service";

@Module({
  imports: [PrismaModule],
  controllers: [LicensingController, GuruLicenseWebhookController],
  providers: [
    LicenseCryptoService,
    LicenseAccountBindingService,
    LicenseRateLimitService,
    LicensingService,
    GuruLicenseWebhookService,
  ],
  exports: [
    LicensingService,
    LicenseCryptoService,
    LicenseAccountBindingService,
  ],
})
export class LicensingModule {}
