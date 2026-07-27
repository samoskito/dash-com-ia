import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy
} from "@nestjs/common";
import type { WorkspaceSubscription } from "@prisma/client";
import type { WorkspaceSubscriptionCancellationDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageAsaasAdapter } from "./package-asaas.adapter";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { addDays } from "./package-billing.policy";
import { WhatsappSeatService } from "./whatsapp-seat.service";

@Injectable()
export class PackageSubscriptionLifecycleService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    PackageSubscriptionLifecycleService.name
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(PackageAsaasAdapter)
    private readonly asaas: PackageAsaasAdapter,
    @Inject(WhatsappSeatService)
    private readonly seats: WhatsappSeatService
  ) {}

  onApplicationBootstrap(): void {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isLifecycleEnabled() ||
      process.env.NODE_ENV === "test"
    ) {
      return;
    }

    const run = () => {
      void this.reconcileDueContracts().catch((error) => {
        this.logger.warn(
          `Package billing reconciliation failed: ${this.errorCode(error)}`
        );
      });
    };

    this.timer = setInterval(
      run,
      this.configuration.reconciliationIntervalMs()
    );
    run();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async requestCancellation(
    workspaceId: string,
    actorUserId: string,
    reason: string | null
  ): Promise<WorkspaceSubscriptionCancellationDto> {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isLifecycleEnabled()
    ) {
      throw new ConflictException(
        "Cancelamento de assinatura ainda nao habilitado"
      );
    }

    const contract = await this.prisma.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        isCurrent: true,
        planNameSnapshot: { not: null }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!contract) {
      throw new ConflictException("Workspace sem assinatura ativa");
    }
    if (
      contract.contractStatus === "exempt" ||
      contract.contractStatus === "legacy_protected"
    ) {
      throw new ConflictException(
        "Este contrato deve ser alterado pelo suporte da plataforma"
      );
    }
    if (contract.contractStatus === "canceled") {
      return this.mapCancellation(contract);
    }
    if (contract.cancelAtPeriodEnd && contract.cancellationRequestedAt) {
      return this.mapCancellation(contract);
    }
    if (!contract.currentPeriodEnd) {
      throw new ConflictException(
        "Periodo pago ainda nao confirmado; tente novamente apos a conciliacao"
      );
    }

    const requestedAt = new Date();
    const accessEndsAt = contract.currentPeriodEnd;

    if (contract.asaasSubscriptionId && !contract.recurrenceStoppedAt) {
      await this.asaas.removeSubscription(contract.asaasSubscriptionId);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const canceled = await transaction.workspaceSubscription.update({
        where: { id: contract.id },
        data: {
          contractStatus: "cancel_at_period_end",
          status: "active",
          cancelAtPeriodEnd: true,
          cancellationRequestedAt: requestedAt,
          cancellationReason: reason,
          accessEndsAt,
          recurrenceStoppedAt: requestedAt
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId,
          subscriptionId: contract.id,
          planId: contract.planId,
          actorUserId,
          actorType: "user",
          action: "contract.cancellation_requested",
          reason,
          beforeSnapshot: this.snapshot(contract),
          afterSnapshot: this.snapshot(canceled)
        }
      });

      return canceled;
    });

    return this.mapCancellation(updated);
  }

  async markPaymentOverdue(
    subscriptionId: string,
    providerPaymentId: string
  ): Promise<WorkspaceSubscription> {
    const contract = await this.prisma.workspaceSubscription.findUnique({
      where: { id: subscriptionId }
    });
    if (!contract) {
      throw new ConflictException("Contrato nao encontrado");
    }
    if (
      contract.contractStatus === "exempt" ||
      contract.contractStatus === "legacy_protected" ||
      contract.contractStatus === "canceled"
    ) {
      return contract;
    }

    const graceEndsAt = addDays(
      new Date(),
      this.configuration.gracePeriodDays()
    );
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.workspaceSubscription.update({
        where: { id: contract.id },
        data: {
          contractStatus: "grace_period",
          status: "past_due",
          graceEndsAt,
          accessEndsAt: graceEndsAt
        }
      });
      await transaction.billingContractAudit.create({
        data: {
          workspaceId: contract.workspaceId,
          subscriptionId: contract.id,
          planId: contract.planId,
          actorType: "provider",
          action: "contract.payment_overdue",
          reason: "Pagamento recorrente vencido no Asaas",
          beforeSnapshot: this.snapshot(contract),
          afterSnapshot: this.snapshot(updated),
          providerReferences: { paymentId: providerPaymentId }
        }
      });
      return updated;
    });
  }

  async reconcileDueContracts(now = new Date()): Promise<{
    canceled: number;
    expiredReservations: number;
    suspended: number;
  }> {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isLifecycleEnabled() ||
      this.running
    ) {
      return { canceled: 0, expiredReservations: 0, suspended: 0 };
    }

    this.running = true;
    try {
      const expiredReservations = await this.seats.expireAllReservations(now);

      const graceContracts = await this.prisma.workspaceSubscription.findMany({
        where: {
          isCurrent: true,
          contractStatus: "grace_period",
          graceEndsAt: { lte: now }
        },
        select: { id: true }
      });
      const cancelingContracts =
        await this.prisma.workspaceSubscription.findMany({
          where: {
            isCurrent: true,
            contractStatus: "cancel_at_period_end",
            accessEndsAt: { lte: now }
          },
          select: { id: true }
        });

      for (const contract of graceContracts) {
        await this.suspendContract(contract.id, now);
      }
      for (const contract of cancelingContracts) {
        await this.endCanceledContract(contract.id, now);
      }

      return {
        canceled: cancelingContracts.length,
        expiredReservations,
        suspended: graceContracts.length
      };
    } finally {
      this.running = false;
    }
  }

  private async suspendContract(
    subscriptionId: string,
    now: Date
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const contract = await transaction.workspaceSubscription.update({
        where: { id: subscriptionId },
        data: {
          contractStatus: "suspended",
          status: "past_due",
          suspendedAt: now,
          accessEndsAt: now
        }
      });
      await this.seats.suspendSubscriptionSeats(
        transaction,
        subscriptionId,
        "grace_period_expired",
        now
      );
      await transaction.billingContractAudit.create({
        data: {
          workspaceId: contract.workspaceId,
          subscriptionId,
          planId: contract.planId,
          actorType: "system",
          action: "contract.grace_expired",
          reason: "Carencia de pagamento encerrada",
          afterSnapshot: this.snapshot(contract)
        }
      });
    });
  }

  private async endCanceledContract(
    subscriptionId: string,
    now: Date
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const contract = await transaction.workspaceSubscription.update({
        where: { id: subscriptionId },
        data: {
          contractStatus: "canceled",
          status: "cancelled",
          isCurrent: false,
          canceledAt: now,
          endedAt: now,
          accessEndsAt: now
        }
      });
      await this.seats.suspendSubscriptionSeats(
        transaction,
        subscriptionId,
        "contract_canceled",
        now
      );
      await transaction.billingContractAudit.create({
        data: {
          workspaceId: contract.workspaceId,
          subscriptionId,
          planId: contract.planId,
          actorType: "system",
          action: "contract.cancellation_effective",
          reason: "Periodo contratado encerrado",
          afterSnapshot: this.snapshot(contract)
        }
      });
    });
  }

  private mapCancellation(
    contract: WorkspaceSubscription
  ): WorkspaceSubscriptionCancellationDto {
    return {
      workspaceId: contract.workspaceId,
      subscriptionId: contract.id,
      status: contract.contractStatus,
      requestedAt: (
        contract.cancellationRequestedAt ?? new Date()
      ).toISOString(),
      accessEndsAt: contract.accessEndsAt?.toISOString() ?? null
    };
  }

  private snapshot(contract: WorkspaceSubscription) {
    return {
      id: contract.id,
      contractStatus: contract.contractStatus,
      isCurrent: contract.isCurrent,
      graceEndsAt: contract.graceEndsAt?.toISOString() ?? null,
      accessEndsAt: contract.accessEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: contract.cancelAtPeriodEnd
    };
  }

  private errorCode(error: unknown): string {
    return error instanceof Error ? error.name : "unknown_error";
  }
}
