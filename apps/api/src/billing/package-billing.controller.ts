import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Delete,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  workspaceBillingProfileInputSchema,
  workspacePackageCheckoutInputSchema,
  workspaceSubscriptionCancellationInputSchema,
  uazapiPackageProvisionInputSchema,
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { PackageCheckoutService } from "./package-checkout.service";
import { PackageContractService } from "./package-contract.service";
import { PackagePlanService } from "./package-plan.service";
import { PackageSubscriptionLifecycleService } from "./package-subscription-lifecycle.service";
import { PackageUazapiProvisioningService } from "./package-uazapi-provisioning.service";
import { WhatsappSeatService } from "./whatsapp-seat.service";

@Controller("billing/package")
export class PackageBillingController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(PackagePlanService)
    private readonly packagePlans: PackagePlanService,
    @Inject(PackageContractService)
    private readonly contracts: PackageContractService,
    @Inject(PackageCheckoutService)
    private readonly checkout: PackageCheckoutService,
    @Inject(PackageSubscriptionLifecycleService)
    private readonly lifecycle: PackageSubscriptionLifecycleService,
    @Inject(PackageUazapiProvisioningService)
    private readonly uazapiProvisioning: PackageUazapiProvisioningService,
    @Inject(WhatsappSeatService)
    private readonly seats: WhatsappSeatService,
  ) {}

  @Get("plans")
  async listPlans(@AuthToken() refreshToken: string) {
    await this.getCurrentWorkspaceContext(refreshToken);
    return this.packagePlans.listPublicPlans();
  }

  @Get("state")
  async getState(@AuthToken() refreshToken: string) {
    const { workspaceId } = await this.getCurrentWorkspaceContext(refreshToken);
    return this.contracts.getWorkspaceBillingState(workspaceId);
  }

  @Get("seats")
  async listSeats(@AuthToken() refreshToken: string) {
    const { workspaceId } = await this.getCurrentWorkspaceContext(refreshToken);
    return this.seats.listWorkspaceSeats(workspaceId);
  }

  @Put("profile")
  async saveProfile(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const parsed = workspaceBillingProfileInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Dados de cobranca invalidos");
    }

    const { canManageBilling, workspaceId } =
      await this.getCurrentWorkspaceContext(refreshToken);
    if (!canManageBilling) {
      throw new ForbiddenException("Sem permissao para gerenciar cobranca");
    }

    return this.contracts.upsertBillingProfile(workspaceId, parsed.data);
  }

  @Post("checkout")
  async createCheckout(
    @AuthToken() refreshToken: string,
    @Body() body: unknown,
  ) {
    const parsed = workspacePackageCheckoutInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Plano invalido para contratacao");
    }

    const { canManageBilling, userId, workspaceId } =
      await this.getCurrentWorkspaceContext(refreshToken);
    if (!canManageBilling) {
      throw new ForbiddenException("Sem permissao para gerenciar cobranca");
    }

    return this.checkout.createCheckout(
      workspaceId,
      parsed.data.planId,
      userId,
    );
  }

  @Delete("subscription")
  async cancelSubscription(
    @AuthToken() refreshToken: string,
    @Body() body: unknown,
  ) {
    const parsed = workspaceSubscriptionCancellationInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Confirmacao de cancelamento invalida");
    }

    const { canManageBilling, userId, workspaceId } =
      await this.getCurrentWorkspaceContext(refreshToken);
    if (!canManageBilling) {
      throw new ForbiddenException("Sem permissao para gerenciar cobranca");
    }

    return this.lifecycle.requestCancellation(
      workspaceId,
      userId,
      parsed.data.reason ?? null,
    );
  }

  @Post("uazapi/instances")
  async provisionUazapi(
    @AuthToken() refreshToken: string,
    @Body() body: unknown,
  ) {
    const parsed = uazapiPackageProvisionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Nome da conexao invalido");
    }

    const { canManageIntegrations, userId, workspaceId } =
      await this.getCurrentWorkspaceContext(refreshToken);
    if (!canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.uazapiProvisioning.provision(
      workspaceId,
      parsed.data.instanceName,
      userId,
    );
  }

  @Get("uazapi/instances/:whatsappInstanceId/status")
  async getUazapiProvisioningStatus(
    @AuthToken() refreshToken: string,
    @Param("whatsappInstanceId") whatsappInstanceId: string,
  ) {
    const { canManageIntegrations, userId, workspaceId } =
      await this.getCurrentWorkspaceContext(refreshToken);
    if (!canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.uazapiProvisioning.getProvisioningStatus(
      workspaceId,
      whatsappInstanceId,
      userId,
    );
  }

  @Post("uazapi/instances/:whatsappInstanceId/refresh-qr")
  async refreshUazapiProvisioningQr(
    @AuthToken() refreshToken: string,
    @Param("whatsappInstanceId") whatsappInstanceId: string,
  ) {
    const { canManageIntegrations, userId, workspaceId } =
      await this.getCurrentWorkspaceContext(refreshToken);
    if (!canManageIntegrations) {
      throw new ForbiddenException("Sem permissao para gerenciar integracoes");
    }

    return this.uazapiProvisioning.refreshProvisioningQr(
      workspaceId,
      whatsappInstanceId,
      userId,
    );
  }

  private async getCurrentWorkspaceContext(refreshToken: string): Promise<{
    canManageBilling: boolean;
    canManageIntegrations: boolean;
    userId: string;
    workspaceId: string;
  }> {
    const authenticated = await this.authService.getSession(refreshToken);
    const workspace = this.workspacesService.getCurrentWorkspace(authenticated);

    return {
      canManageBilling: workspace.permissions.canManageBilling,
      canManageIntegrations: workspace.permissions.canManageIntegrations,
      userId: authenticated.user.id,
      workspaceId: workspace.id,
    };
  }
}
