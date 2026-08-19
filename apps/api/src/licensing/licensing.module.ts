import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { GuruLicenseWebhookController } from "./guru-license-webhook.controller";
import { GuruLicenseWebhookService } from "./guru-license-webhook.service";
import { LicenseAccountBindingService } from "./license-account-binding.service";
import { LicenseCryptoService } from "./license-crypto.service";
import { LicenseRateLimitService } from "./license-rate-limit.service";
import { LicensingAdminController } from "./licensing.admin.controller";
import { LicensingController } from "./licensing.controller";
import { LicensingService } from "./licensing.service";

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
