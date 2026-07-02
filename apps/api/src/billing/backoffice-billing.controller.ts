import { Controller, Get, Inject, Query } from "@nestjs/common";
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
  async listCharges(
    @AuthToken() refreshToken: string,
    @Query("status") status?: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.billingService.listBackofficePaymentCharges({
      status: this.cleanQueryParam(status),
      workspaceId: this.cleanQueryParam(workspaceId)
    });
  }

  private cleanQueryParam(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
  }
}
