import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { LicenseAccountBindingService } from "./license-account-binding.service";
import { LicenseCryptoService } from "./license-crypto.service";
import { LicensingService } from "./licensing.service";

@Module({
  imports: [PrismaModule],
  providers: [
    LicenseCryptoService,
    LicenseAccountBindingService,
    LicensingService,
  ],
  exports: [
    LicensingService,
    LicenseCryptoService,
    LicenseAccountBindingService,
  ],
})
export class LicensingModule {}
