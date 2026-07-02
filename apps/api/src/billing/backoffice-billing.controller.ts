import { Controller, Get, Inject } from "@nestjs/common";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { BillingService } from "./billing.service";

@Controller("backoffice/billing")
export class BackofficeBillingController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(BillingService) private readonly billingService: BillingService
  ) {}

  @Get("charges")
  async listCharges(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.billingService.listBackofficePaymentCharges();
  }
}
