import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import {
  backofficeSubscriptionPlanCreateInputSchema,
  backofficeSubscriptionPlanUpdateInputSchema
} from "@wpptrack/shared";
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

  @Get("plans")
  async listPlans(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.billingService.listBackofficeSubscriptionPlans();
  }

  @Post("plans")
  async createPlan(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const operator =
      await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const parsed = backofficeSubscriptionPlanCreateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.billingService.createBackofficeSubscriptionPlan(
      parsed.data,
      operator.id
    );
  }

  @Patch("plans/:id")
  async updatePlan(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const operator =
      await this.platformAdminService.assertPlatformAdmin(refreshToken);
    const parsed = backofficeSubscriptionPlanUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.billingService.updateBackofficeSubscriptionPlan(
      id,
      parsed.data,
      operator.id
    );
  }

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
