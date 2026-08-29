import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  type BillingInvoice,
  type SubscriptionPlan,
  type WhatsappSeat,
  type WorkspaceBillingProfile,
  type WorkspaceSubscription,
  type WorkspaceSubscriptionContractStatus,
} from "@prisma/client";
import type {
  BillingInvoiceDto,
  WorkspaceBillingProfileDto,
  WorkspaceBillingProfileInputDto,
  WorkspacePackageAssignmentDto,
  WorkspacePackageBillingStateDto,
  WorkspacePackageSubscriptionDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import {
  assertDowngradeCapacity,
  contractAllowsWhatsappAccess,
  effectiveWhatsappCapacity,
  seatConsumesCapacity,
} from "./package-billing.policy";
import { PackagePlanService } from "./package-plan.service";
import { WhatsappSeatService } from "./whatsapp-seat.service";

type TransactionClient = Prisma.TransactionClient;

type ContractWithRelations = WorkspaceSubscription & {
  items?: Array<{
    id: string;
    key: string;
    nameSnapshot: string;
    quantity: number;
    capacityPerUnit: number;
    monthlyPriceCentsPerUnit: number;
    status: string;
    providerSyncStatus: string;
    paymentCharge: { status: string; amountCents: number } | null;
  }>;
};

@Injectable()
export class PackageContractService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackagePlanService)
    private readonly packagePlans: PackagePlanService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(WhatsappSeatService)
    private readonly seats: WhatsappSeatService,
  ) {}

  async getWorkspaceBillingState(
    workspaceId: string,
  ): Promise<WorkspacePackageBillingStateDto> {
    const [
      profile,
      currentContract,
      pendingContract,
      availablePlans,
      invoices,
    ] = await Promise.all([
      this.prisma.workspaceBillingProfile.findUnique({
        where: { workspaceId },
      }),
      this.prisma.workspaceSubscription.findFirst({
        where: {
          workspaceId,
          isCurrent: true,
          planNameSnapshot: { not: null },
        },
        include: {
          plan: true,
          whatsappSeats: true,
          items: {
            where: { status: { in: ["pending_payment", "active"] } },
            include: {
              paymentCharge: { select: { status: true, amountCents: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.workspaceSubscription.findFirst({
        where: {
          workspaceId,
          isCurrent: false,
          contractStatus: {
            in: ["draft", "awaiting_payment"],
          },
          planNameSnapshot: { not: null },
        },
        include: {
          plan: true,
          whatsappSeats: true,
          items: {
            where: { status: { in: ["pending_payment", "active"] } },
            include: {
              paymentCharge: { select: { status: true, amountCents: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.packagePlans.listPublicPlans(),
      this.prisma.billingInvoice.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const contract = currentContract ?? pendingContract;
    const seats = currentContract?.whatsappSeats ?? [];
    const occupied = seats.filter((seat) =>
      seatConsumesCapacity(seat.status),
    ).length;
    const capacity = currentContract
      ? this.effectiveCapacity(currentContract)
      : 0;

    return {
      profile: profile ? this.mapProfile(profile) : null,
      contract: contract ? this.mapSubscription(contract, occupied) : null,
      availablePlans,
      seats: {
        capacity,
        occupied,
        available: Math.max(0, capacity - occupied),
        reserved: seats.filter((seat) => seat.status === "reserved").length,
        active: seats.filter((seat) => seat.status === "active").length,
        suspended: seats.filter((seat) => seat.status === "suspended").length,
      },
      invoices: invoices.map((invoice) => this.mapInvoice(invoice)),
      enforcementEnabled: this.configuration.isEnforcementEnabled(),
      capabilities: {
        packageBilling: this.configuration.isPackageBillingEnabled(),
        recurringCheckout: this.configuration.isAsaasRecurringEnabled(),
        lifecycle: this.configuration.isLifecycleEnabled(),
        automaticInvoices: this.configuration.isFiscalEnabled(),
        uazapiProvisioning: this.configuration.isUazapiProvisioningEnabled(),
        externalChannelEnforcement:
          this.configuration.isExternalChannelEnforcementEnabled(),
      },
    };
  }

  async upsertBillingProfile(
    workspaceId: string,
    input: WorkspaceBillingProfileInputDto,
  ): Promise<WorkspaceBillingProfileDto> {
    const profile = await this.prisma.workspaceBillingProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        ...input,
        status: "incomplete",
      },
      update: {
        ...input,
        status: "incomplete",
        validatedAt: null,
        validationErrorCode: null,
      },
    });

    return this.mapProfile(profile);
  }

  async assignPlan(
    workspaceId: string,
    planId: string,
    actorUserId: string,
    reason: string,
    actorType = "platform_owner",
  ): Promise<WorkspacePackageAssignmentDto> {
    const plan = await this.packagePlans.getPackagePlan(planId);

    if (!plan.active) {
      throw new ConflictException("Plano inativo");
    }

    const created = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockWorkspace(transaction, workspaceId);
        const occupied = await this.countWorkspaceOccupiedSeats(
          transaction,
          workspaceId,
        );
        const capacity = this.requiredCapacity(plan);
        assertDowngradeCapacity(capacity, occupied);

        const immediate =
          plan.kind === "exempt" || plan.kind === "legacy_protected";
        const contractStatus: WorkspaceSubscriptionContractStatus =
          plan.kind === "exempt"
            ? "exempt"
            : plan.kind === "legacy_protected"
              ? "legacy_protected"
              : "draft";

        const previous = immediate
          ? await transaction.workspaceSubscription.findFirst({
              where: { workspaceId, isCurrent: true },
              orderBy: { createdAt: "desc" },
            })
          : null;

        if (immediate) {
          await transaction.workspaceSubscription.updateMany({
            where: { workspaceId, isCurrent: true },
            data: {
              isCurrent: false,
              endedAt: new Date(),
            },
          });
        } else {
          await transaction.workspaceSubscription.updateMany({
            where: {
              workspaceId,
              isCurrent: false,
              contractStatus: { in: ["draft", "awaiting_payment"] },
              planNameSnapshot: { not: null },
            },
            data: {
              contractStatus: "canceled",
              status: "cancelled",
              canceledAt: new Date(),
              endedAt: new Date(),
            },
          });
        }

        const subscription = await transaction.workspaceSubscription.create({
          data: {
            workspaceId,
            planId: plan.id,
            status: this.legacyStatus(contractStatus),
            activeInstances: occupied,
            contractStatus,
            isCurrent: immediate,
            planNameSnapshot: plan.name,
            planVersionSnapshot: plan.version,
            monthlyPriceCentsSnapshot: this.requiredMonthlyPrice(plan),
            includedWhatsappNumbersSnapshot: capacity,
            assignedAt: new Date(),
            assignedByUserId: actorUserId,
            assignmentReason: reason,
            activatedAt: immediate ? new Date() : null,
            fiscalStatus: plan.kind === "exempt" ? "not_configured" : undefined,
          },
        });

        if (immediate) {
          await this.seats.bindWorkspaceSeatsToContract(
            transaction,
            workspaceId,
            subscription.id,
            "special_plan_assigned",
            new Date(),
          );
        }

        await transaction.billingContractAudit.create({
          data: {
            workspaceId,
            subscriptionId: subscription.id,
            planId: plan.id,
            actorUserId,
            actorType,
            action: "contract.plan_assigned",
            reason,
            beforeSnapshot: previous
              ? this.contractSnapshot(previous)
              : undefined,
            afterSnapshot: this.contractSnapshot(subscription),
          },
        });

        return subscription;
      },
      { isolationLevel: "Serializable" },
    );

    return {
      workspaceId,
      subscriptionId: created.id,
      status: created.contractStatus,
      plan: this.packagePlans.mapPlan(plan),
      assignedAt: (created.assignedAt ?? created.createdAt).toISOString(),
    };
  }

  async markAwaitingPayment(
    subscriptionId: string,
    references: {
      customerId: string;
      checkoutId: string;
      checkoutUrl: string;
      checkoutExpiresAt: Date | null;
    },
  ): Promise<WorkspaceSubscription> {
    return this.prisma.workspaceSubscription.update({
      where: { id: subscriptionId },
      data: {
        contractStatus: "awaiting_payment",
        status: "pending",
        asaasCustomerId: references.customerId,
        asaasCheckoutId: references.checkoutId,
        asaasCheckoutUrl: references.checkoutUrl,
        asaasCheckoutExpiresAt: references.checkoutExpiresAt,
      },
    });
  }

  async activatePaidContract(input: {
    subscriptionId: string;
    asaasSubscriptionId: string;
    billingMethod: "credit_card" | "pix";
    periodStart: Date;
    periodEnd: Date;
    providerPaymentId: string;
  }): Promise<WorkspaceSubscription> {
    return this.prisma.$transaction(
      async (transaction) => {
        let pending = await transaction.workspaceSubscription.findUnique({
          where: { id: input.subscriptionId },
        });

        if (!pending) {
          throw new NotFoundException("Contrato nao encontrado");
        }

        await this.lockWorkspace(transaction, pending.workspaceId);
        pending =
          (await transaction.workspaceSubscription.findUnique({
            where: { id: input.subscriptionId },
          })) ?? pending;

        const existingPeriodStart = pending.currentPeriodStart?.getTime();
        const incomingPeriodStart = input.periodStart.getTime();
        const olderPayment =
          existingPeriodStart !== undefined &&
          existingPeriodStart > incomingPeriodStart;
        const sameActivePeriod =
          existingPeriodStart === incomingPeriodStart &&
          (pending.contractStatus === "active" ||
            pending.contractStatus === "cancel_at_period_end");

        if (olderPayment || sameActivePeriod) {
          if (!pending.asaasSubscriptionId) {
            pending = await transaction.workspaceSubscription.update({
              where: { id: pending.id },
              data: {
                asaasSubscriptionId: input.asaasSubscriptionId,
              },
            });
          }
          return pending;
        }

        const occupied = await this.countWorkspaceOccupiedSeats(
          transaction,
          pending.workspaceId,
        );
        assertDowngradeCapacity(
          pending.includedWhatsappNumbersSnapshot ?? 0,
          occupied,
        );

        await transaction.workspaceSubscription.updateMany({
          where: {
            workspaceId: pending.workspaceId,
            isCurrent: true,
            id: { not: pending.id },
          },
          data: {
            isCurrent: false,
            endedAt: input.periodStart,
          },
        });

        const activated = await transaction.workspaceSubscription.update({
          where: { id: pending.id },
          data: {
            contractStatus: "active",
            status: "active",
            isCurrent: true,
            asaasSubscriptionId: input.asaasSubscriptionId,
            billingMethod: input.billingMethod,
            currentPeriodStart: input.periodStart,
            currentPeriodEnd: input.periodEnd,
            accessEndsAt: null,
            graceEndsAt: null,
            activatedAt: pending.activatedAt ?? new Date(),
            suspendedAt: null,
            lastPaymentConfirmedAt: new Date(),
          },
        });

        await this.seats.bindWorkspaceSeatsToContract(
          transaction,
          pending.workspaceId,
          pending.id,
          "payment_confirmed",
          input.periodStart,
        );

        await transaction.billingContractAudit.create({
          data: {
            workspaceId: pending.workspaceId,
            subscriptionId: pending.id,
            planId: pending.planId,
            actorType: "provider",
            action: "contract.payment_confirmed",
            reason: "Pagamento recorrente confirmado pelo Asaas",
            beforeSnapshot: this.contractSnapshot(pending),
            afterSnapshot: this.contractSnapshot(activated),
            providerReferences: {
              paymentId: input.providerPaymentId,
              subscriptionId: input.asaasSubscriptionId,
            },
          },
        });

        return activated;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async getCurrentAccessContract(
    workspaceId: string,
    now = new Date(),
  ): Promise<WorkspaceSubscription> {
    const contract = await this.prisma.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        isCurrent: true,
        planNameSnapshot: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });

    if (
      !contract ||
      !contractAllowsWhatsappAccess(
        contract.contractStatus,
        now,
        contract.accessEndsAt,
      )
    ) {
      throw new ConflictException("Workspace sem contrato com acesso ativo");
    }

    return contract;
  }

  async listBackofficeContracts(filters: {
    workspaceId?: string;
    status?: WorkspaceSubscriptionContractStatus;
  }) {
    const contracts = await this.prisma.workspaceSubscription.findMany({
      where: {
        workspaceId: filters.workspaceId,
        contractStatus: filters.status,
        planNameSnapshot: { not: null },
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        whatsappSeats: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return contracts.map((contract) => ({
      workspace: contract.workspace,
      contract: this.mapSubscription(
        contract,
        contract.whatsappSeats.filter((seat) =>
          seatConsumesCapacity(seat.status),
        ).length,
      ),
    }));
  }

  mapProfile(profile: WorkspaceBillingProfile): WorkspaceBillingProfileDto {
    return {
      id: profile.id,
      workspaceId: profile.workspaceId,
      payerType: profile.payerType as "individual" | "company",
      payerName: profile.payerName,
      taxId: profile.taxId,
      billingEmail: profile.billingEmail,
      phone: profile.phone,
      postalCode: profile.postalCode,
      addressLine: profile.addressLine,
      addressNumber: profile.addressNumber,
      addressComplement: profile.addressComplement,
      district: profile.district,
      city: profile.city,
      state: profile.state,
      status: profile.status,
      asaasCustomerId: profile.asaasCustomerId,
      validatedAt: profile.validatedAt?.toISOString() ?? null,
      validationErrorCode: profile.validationErrorCode,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  mapSubscription(
    contract: ContractWithRelations,
    occupiedWhatsappNumbers: number,
  ): WorkspacePackageSubscriptionDto {
    return {
      id: contract.id,
      workspaceId: contract.workspaceId,
      planId: contract.planId,
      status: contract.contractStatus,
      planName: contract.planNameSnapshot ?? "Plano sem nome",
      planVersion: contract.planVersionSnapshot ?? 1,
      monthlyPriceCents: contract.monthlyPriceCentsSnapshot ?? 0,
      includedWhatsappNumbers: this.effectiveCapacity(contract),
      occupiedWhatsappNumbers,
      billingMethod: contract.billingMethod,
      currentPeriodStart: contract.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: contract.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: contract.graceEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: contract.cancelAtPeriodEnd,
      accessEndsAt: contract.accessEndsAt?.toISOString() ?? null,
      fiscalStatus: contract.fiscalStatus,
      items: (contract.items ?? []).map((item) => ({
        id: item.id,
        key: item.key,
        name: item.nameSnapshot,
        quantity: item.quantity,
        capacity: item.capacityPerUnit * item.quantity,
        monthlyPriceCents: item.monthlyPriceCentsPerUnit * item.quantity,
        status: item.status === "active" ? "active" : "pending_payment",
        providerSyncStatus:
          item.providerSyncStatus as WorkspacePackageSubscriptionDto["items"][number]["providerSyncStatus"],
      })),
    };
  }

  mapInvoice(invoice: BillingInvoice): BillingInvoiceDto {
    return {
      id: invoice.id,
      workspaceId: invoice.workspaceId,
      subscriptionId: invoice.subscriptionId,
      paymentChargeId: invoice.paymentChargeId,
      providerInvoiceId: invoice.providerInvoiceId,
      providerPaymentId: invoice.providerPaymentId,
      status: invoice.status,
      amountCents: invoice.amountCents,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      authorizedAt: invoice.authorizedAt?.toISOString() ?? null,
      canceledAt: invoice.canceledAt?.toISOString() ?? null,
      lastErrorCode: invoice.lastErrorCode,
      lastAttemptAt: invoice.lastAttemptAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
    };
  }

  private async countWorkspaceOccupiedSeats(
    transaction: TransactionClient,
    workspaceId: string,
  ): Promise<number> {
    return transaction.whatsappSeat.count({
      where: {
        workspaceId,
        status: { in: ["reserved", "active", "suspended"] },
      },
    });
  }

  private effectiveCapacity(contract: ContractWithRelations): number {
    return effectiveWhatsappCapacity(
      contract.includedWhatsappNumbersSnapshot ?? 0,
      contract.items ?? [],
    );
  }

  private async lockWorkspace(
    transaction: TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`,
    );
  }

  private requiredCapacity(plan: SubscriptionPlan): number {
    if (plan.includedWhatsappNumbers === null) {
      throw new ConflictException("Plano sem capacidade configurada");
    }

    return plan.includedWhatsappNumbers;
  }

  private requiredMonthlyPrice(plan: SubscriptionPlan): number {
    if (plan.monthlyPriceCents === null) {
      throw new ConflictException("Plano sem mensalidade configurada");
    }

    return plan.monthlyPriceCents;
  }

  private legacyStatus(status: WorkspaceSubscriptionContractStatus): string {
    if (
      status === "active" ||
      status === "exempt" ||
      status === "legacy_protected"
    ) {
      return "active";
    }

    if (status === "canceled") {
      return "cancelled";
    }

    return "pending";
  }

  private contractSnapshot(
    contract: WorkspaceSubscription,
  ): Prisma.InputJsonObject {
    return {
      id: contract.id,
      workspaceId: contract.workspaceId,
      planId: contract.planId,
      contractStatus: contract.contractStatus,
      isCurrent: contract.isCurrent,
      planNameSnapshot: contract.planNameSnapshot,
      planVersionSnapshot: contract.planVersionSnapshot,
      monthlyPriceCentsSnapshot: contract.monthlyPriceCentsSnapshot,
      includedWhatsappNumbersSnapshot: contract.includedWhatsappNumbersSnapshot,
      currentPeriodStart: contract.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: contract.currentPeriodEnd?.toISOString() ?? null,
      accessEndsAt: contract.accessEndsAt?.toISOString() ?? null,
    };
  }
}
