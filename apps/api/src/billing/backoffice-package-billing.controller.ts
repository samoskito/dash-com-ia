import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  legacyBillingBackfillApplyInputSchema,
  whatsappPackagePlanCreateInputSchema,
  whatsappPackagePlanUpdateInputSchema,
  platformFiscalSettingsInputSchema,
  workspacePackageAssignmentInputSchema,
  workspaceSubscriptionContractStatuses,
} from "@wpptrack/shared";
import type { WorkspaceSubscriptionContractStatus } from "@prisma/client";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { PackageContractService } from "./package-contract.service";
import { PackageBillingReconciliationService } from "./package-billing-reconciliation.service";
import { PackageFiscalService } from "./package-fiscal.service";
import { PackagePlanService } from "./package-plan.service";
import { LegacyBillingBackfillService } from "./legacy-billing-backfill.service";

@Controller("backoffice/billing")
export class BackofficePackageBillingController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(PackagePlanService)
    private readonly packagePlans: PackagePlanService,
    @Inject(PackageContractService)
    private readonly contracts: PackageContractService,
    @Inject(PackageFiscalService)
    private readonly fiscal: PackageFiscalService,
    @Inject(PackageBillingReconciliationService)
    private readonly reconciliation: PackageBillingReconciliationService,
    @Inject(LegacyBillingBackfillService)
    private readonly legacyBackfill: LegacyBillingBackfillService,
  ) {}

  @Get("package-plans")
  async listPlans(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.packagePlans.listBackofficePlans();
  }

  @Post("package-plans")
  async createPlan(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const operator =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed = whatsappPackagePlanCreateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Dados do pacote invalidos");
    }

    return this.packagePlans.createPlan(parsed.data, operator.id);
  }

  @Patch("package-plans/:id")
  async updatePlan(
    @AuthToken() refreshToken: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const operator =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed = whatsappPackagePlanUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Dados do pacote invalidos");
    }

    return this.packagePlans.updatePlan(id, parsed.data, operator.id);
  }

  @Get("package-contracts")
  async listContracts(
    @AuthToken() refreshToken: string,
    @Query("workspaceId") workspaceId?: string,
    @Query("status") status?: string,
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const normalizedStatus = status?.trim();
    if (
      normalizedStatus &&
      !workspaceSubscriptionContractStatuses.includes(
        normalizedStatus as WorkspaceSubscriptionContractStatus,
      )
    ) {
      throw new BadRequestException("Status de contrato invalido");
    }

    return this.contracts.listBackofficeContracts({
      workspaceId: workspaceId?.trim() || undefined,
      status:
        (normalizedStatus as WorkspaceSubscriptionContractStatus | undefined) ??
        undefined,
    });
  }

  @Post("package-contracts/:workspaceId/assign")
  async assignPlan(
    @AuthToken() refreshToken: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    const operator =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed = workspacePackageAssignmentInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Atribuicao de pacote invalida");
    }

    return this.contracts.assignPlan(
      workspaceId,
      parsed.data.planId,
      operator.id,
      parsed.data.reason,
    );
  }

  @Post("package-contracts/:workspaceId/reconcile")
  async reconcileWorkspace(
    @AuthToken() refreshToken: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    const operator =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    return this.reconciliation.reconcileWorkspace(
      workspaceId,
      operator.id,
    );
  }

  @Get("legacy-backfill")
  async previewLegacyBackfill(
    @AuthToken() refreshToken: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.legacyBackfill.preview(
      workspaceId?.trim() ? [workspaceId.trim()] : undefined,
    );
  }

  @Post("legacy-backfill/apply")
  async applyLegacyBackfill(
    @AuthToken() refreshToken: string,
    @Body() body: unknown,
  ) {
    const operator =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed = legacyBillingBackfillApplyInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Confirmacao do backfill invalida");
    }

    return this.legacyBackfill.apply(parsed.data, operator.id);
  }

  @Get("fiscal-settings")
  async getFiscalSettings(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformOwner(refreshToken);
    return this.fiscal.getSettings();
  }

  @Get("invoices/actionable")
  async listActionableInvoices(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);
    return this.fiscal.listActionableInvoices();
  }

  @Post("invoices/:invoiceId/retry")
  async retryInvoice(
    @AuthToken() refreshToken: string,
    @Param("invoiceId") invoiceId: string,
  ) {
    const operator =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    return {
      retried: await this.fiscal.retryInvoice(invoiceId, operator.id),
    };
  }

  @Patch("fiscal-settings")
  async saveFiscalSettings(
    @AuthToken() refreshToken: string,
    @Body() body: unknown,
  ) {
    const operator =
      await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed = platformFiscalSettingsInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Configuracao fiscal invalida");
    }

    return this.fiscal.saveSettings(parsed.data, operator.id);
  }
}
