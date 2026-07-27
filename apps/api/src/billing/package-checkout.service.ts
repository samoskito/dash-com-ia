import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import type { WorkspacePackageCheckoutDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageAsaasAdapter } from "./package-asaas.adapter";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { PackageContractService } from "./package-contract.service";
import { PackagePlanService } from "./package-plan.service";

@Injectable()
export class PackageCheckoutService {
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
      ? await this.asaas.updateCustomer(
          profile.asaasCustomerId,
          workspaceId,
          profile
        )
      : await this.asaas.createCustomer(workspaceId, profile);
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
    const checkout = await this.asaas.createRecurringCheckout({
      workspaceId,
      subscriptionId: assignment.subscriptionId,
      planName: plan.name,
      monthlyPriceCents: plan.monthlyPriceCents,
      profile,
      customerCityId: customer.cityId
    });

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
}
