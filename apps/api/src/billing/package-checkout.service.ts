import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
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
    if (
      !plan.active ||
      plan.kind !== "standard" ||
      plan.visibility !== "public" ||
      plan.monthlyPriceCents === null
    ) {
      throw new ConflictException("Plano indisponivel para contratacao");
    }
    const monthlyPriceCents = plan.monthlyPriceCents;

    const reusable = await this.prisma.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        planId,
        contractStatus: "awaiting_payment",
        asaasCheckoutId: { not: null },
        asaasCheckoutUrl: { not: null },
        asaasCheckoutExpiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    if (reusable?.asaasCheckoutId && reusable.asaasCheckoutUrl) {
      return {
        workspaceId,
        subscriptionId: reusable.id,
        checkoutId: reusable.asaasCheckoutId,
        checkoutUrl: reusable.asaasCheckoutUrl,
        status: "awaiting_payment"
      };
    }

    const resumable = await this.prisma.workspaceSubscription.findFirst({
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

    const profile = await this.prisma.workspaceBillingProfile.findUnique({
      where: { workspaceId }
    });
    if (!profile) {
      throw new ConflictException(
        "Complete os dados de cobranca antes de assinar"
      );
    }

    const customer = profile.asaasCustomerId
      ? await this.executeAsaas("update_customer", () =>
          this.asaas.updateCustomer(
            profile.asaasCustomerId!,
            workspaceId,
            profile
          )
        )
      : await this.executeAsaas("create_customer", () =>
          this.asaas.createCustomer(workspaceId, profile)
        );
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

    const assignment = resumable
      ? { subscriptionId: resumable.id }
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

  private async executeAsaas<T>(
    operation: string,
    action: () => Promise<T>
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
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
