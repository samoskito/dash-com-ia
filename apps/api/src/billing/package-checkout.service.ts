import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import type { WorkspaceBillingProfile } from "@prisma/client";
import type { WorkspacePackageCheckoutDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  PackageAsaasAdapter,
  PackageAsaasError
} from "./package-asaas.adapter";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { PackageContractService } from "./package-contract.service";
import { PackagePlanService } from "./package-plan.service";

@Injectable()
export class PackageCheckoutService {
  private readonly logger = new Logger(PackageCheckoutService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(PackageAsaasAdapter)
    private readonly asaas: PackageAsaasAdapter,
    @Inject(PackagePlanService)
    private readonly plans: PackagePlanService,
    @Inject(PackageContractService)
    private readonly contracts: PackageContractService
  ) {}

  async createCheckout(
    workspaceId: string,
    planId: string,
    actorUserId: string
  ): Promise<WorkspacePackageCheckoutDto> {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isAsaasRecurringEnabled()
    ) {
      throw new ServiceUnavailableException(
        "Checkout recorrente ainda nao habilitado"
      );
    }

    const plan = await this.plans.getPackagePlan(planId);
    const assignedContract = await this.prisma.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        planId,
        isCurrent: false,
        contractStatus: {
          in: ["draft", "awaiting_payment"]
        },
        asaasSubscriptionId: null
      },
      orderBy: { createdAt: "desc" }
    });
    const publicSelfServicePlan =
      plan.kind === "standard" && plan.visibility === "public";
    const assignedPrivatePlan =
      plan.visibility === "private" &&
      (plan.kind === "standard" || plan.kind === "custom") &&
      plan.monthlyPriceCents !== null &&
      plan.monthlyPriceCents > 0 &&
      Boolean(assignedContract);

    if (
      !plan.active ||
      plan.monthlyPriceCents === null ||
      (!publicSelfServicePlan && !assignedPrivatePlan)
    ) {
      throw new ConflictException("Plano indisponivel para contratacao");
    }
    const monthlyPriceCents = plan.monthlyPriceCents;

    if (
      assignedContract?.contractStatus === "awaiting_payment" &&
      assignedContract.asaasCheckoutId &&
      assignedContract.asaasCheckoutUrl &&
      assignedContract.asaasCheckoutExpiresAt &&
      assignedContract.asaasCheckoutExpiresAt.getTime() > Date.now()
    ) {
      return {
        workspaceId,
        subscriptionId: assignedContract.id,
        checkoutId: assignedContract.asaasCheckoutId,
        checkoutUrl: assignedContract.asaasCheckoutUrl,
        status: "awaiting_payment"
      };
    }

    const profile = await this.prisma.workspaceBillingProfile.findUnique({
      where: { workspaceId }
    });
    if (!profile) {
      throw new ConflictException(
        "Complete os dados de cobranca antes de assinar"
      );
    }

    const customer = await this.resolveCustomer(workspaceId, profile);
    const customerId = customer.id;

    await this.prisma.workspaceBillingProfile.update({
      where: { id: profile.id },
      data: {
        asaasCustomerId: customerId,
        status: "valid",
        validatedAt: new Date(),
        validationErrorCode: null
      }
    });

    const assignment = assignedContract
      ? { subscriptionId: assignedContract.id }
      : await this.contracts.assignPlan(
          workspaceId,
          planId,
          actorUserId,
          "Contratacao iniciada pelo cliente",
          "user"
        );
    const checkout = await this.executeAsaas(
      "create_recurring_checkout",
      () =>
        this.asaas.createRecurringCheckout({
          workspaceId,
          subscriptionId: assignment.subscriptionId,
          planName: plan.name,
          monthlyPriceCents,
          profile,
          customerCityId: customer.cityId
        })
    );

    await this.contracts.markAwaitingPayment(assignment.subscriptionId, {
      customerId,
      checkoutId: checkout.id,
      checkoutUrl: checkout.link,
      checkoutExpiresAt: checkout.expiresAt
    });

    return {
      workspaceId,
      subscriptionId: assignment.subscriptionId,
      checkoutId: checkout.id,
      checkoutUrl: checkout.link,
      status: "awaiting_payment"
    };
  }

  private async resolveCustomer(
    workspaceId: string,
    profile: WorkspaceBillingProfile
  ) {
    if (profile.asaasCustomerId) {
      return this.executeAsaas("update_customer", () =>
        this.asaas.updateCustomer(
          profile.asaasCustomerId!,
          workspaceId,
          profile
        )
      );
    }

    const existing = await this.executeAsaas(
      "find_customer_by_reference",
      () => this.asaas.findCustomerByExternalReference(workspaceId)
    );
    if (existing) {
      return existing;
    }

    try {
      return await this.asaas.createCustomer(workspaceId, profile);
    } catch (error) {
      if (
        error instanceof PackageAsaasError &&
        error.retryable
      ) {
        const recovered = await this.executeAsaas(
          "recover_customer_after_create",
          () => this.asaas.findCustomerByExternalReference(workspaceId)
        );
        if (recovered) {
          return recovered;
        }
      }

      return this.throwAsaasFailure("create_customer", error);
    }
  }

  private async executeAsaas<T>(
    operation: string,
    action: () => Promise<T>
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      return this.throwAsaasFailure(operation, error);
    }
  }

  private throwAsaasFailure(operation: string, error: unknown): never {
    if (!(error instanceof PackageAsaasError)) {
      throw error;
    }

    const description = this.sanitizeProviderDescription(
      error.description
    );
    this.logger.error(
      JSON.stringify({
        event: "asaas_package_checkout_failed",
        operation,
        code: error.code,
        statusCode: error.statusCode,
        retryable: error.retryable,
        description
      })
    );

    throw new BadGatewayException(
      description
        ? `O Asaas recusou a operacao (${error.code}): ${description}`
        : `O Asaas recusou a operacao (${error.code})`
    );
  }

  private sanitizeProviderDescription(value: string | null): string | null {
    if (!value) {
      return null;
    }

    return value
      .replace(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
        "[email]"
      )
      .replace(/\b\d{5,}\b/g, "[numero]")
      .slice(0, 500);
  }
}
