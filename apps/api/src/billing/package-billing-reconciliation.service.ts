import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy
} from "@nestjs/common";
import type {
  WorkspaceSubscription,
  WorkspaceSubscriptionContractStatus
} from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  PackageAsaasAdapter,
  type AsaasInvoiceResult,
  type AsaasPaymentResult
} from "./package-asaas.adapter";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { PackageBillingWebhookService } from "./package-billing-webhook.service";

type ReconciliationResult = {
  contracts: number;
  subscriptionsBound: number;
  paymentsChecked: number;
  invoicesChecked: number;
  eventsProcessed: number;
  eventsDuplicated: number;
  failures: number;
};

const RECONCILIABLE_STATUSES: WorkspaceSubscriptionContractStatus[] = [
  "awaiting_payment",
  "active",
  "past_due",
  "grace_period",
  "cancel_at_period_end",
  "suspended"
];

@Injectable()
export class PackageBillingReconciliationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    PackageBillingReconciliationService.name
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(PackageAsaasAdapter)
    private readonly asaas: PackageAsaasAdapter,
    @Inject(PackageBillingWebhookService)
    private readonly webhooks: PackageBillingWebhookService
  ) {}

  onApplicationBootstrap(): void {
    if (
      !this.periodicReconciliationEnabled() ||
      process.env.NODE_ENV === "test"
    ) {
      return;
    }

    const run = () => {
      void this.reconcileAll().catch((error) => {
        this.logger.warn(
          `Asaas reconciliation failed: ${this.errorCode(error)}`
        );
      });
    };
    this.timer = setInterval(
      run,
      this.configuration.asaasReconciliationIntervalMs()
    );
    run();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reconcileAll(): Promise<ReconciliationResult> {
    if (!this.periodicReconciliationEnabled() || this.running) {
      return this.emptyResult();
    }

    this.running = true;
    try {
      const contracts = await this.prisma.workspaceSubscription.findMany({
        where: {
          planNameSnapshot: { not: null },
          contractStatus: { in: RECONCILIABLE_STATUSES },
          OR: [
            { isCurrent: true },
            { contractStatus: "awaiting_payment" }
          ]
        },
        orderBy: { updatedAt: "asc" },
        take: this.configuration.asaasReconciliationBatchSize()
      });

      return this.reconcileContracts(contracts);
    } finally {
      this.running = false;
    }
  }

  async reconcileWorkspace(
    workspaceId: string,
    actorUserId?: string
  ): Promise<ReconciliationResult> {
    const contracts = await this.prisma.workspaceSubscription.findMany({
      where: {
        workspaceId,
        planNameSnapshot: { not: null },
        contractStatus: { in: RECONCILIABLE_STATUSES },
        OR: [
          { isCurrent: true },
          { contractStatus: "awaiting_payment" }
        ]
      },
      orderBy: { createdAt: "desc" }
    });
    const result = await this.reconcileContracts(contracts);

    if (actorUserId) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId,
          actorType: "platform_owner",
          action: "billing.workspace_reconciled",
          targetType: "Workspace",
          targetId: workspaceId,
          resultStatus: result.failures > 0 ? "partial" : "success",
          afterSummary: result
        }
      });
    }

    return result;
  }

  private async reconcileContracts(
    contracts: WorkspaceSubscription[]
  ): Promise<ReconciliationResult> {
    const result = this.emptyResult();
    result.contracts = contracts.length;

    for (const contract of contracts) {
      try {
        const providerSubscriptionId =
          await this.resolveProviderSubscription(contract);
        if (!providerSubscriptionId) {
          result.failures += 1;
          continue;
        }
        if (!contract.asaasSubscriptionId) {
          result.subscriptionsBound += 1;
        }

        const payments = await this.asaas.listSubscriptionPayments(
          providerSubscriptionId
        );
        result.paymentsChecked += payments.length;
        for (const payment of payments) {
          const eventType = this.paymentEventType(payment);
          if (!eventType) {
            continue;
          }
          await this.processSyntheticEvent(
            {
              id: `reconciliation:payment:${payment.id}:${eventType}`,
              event: eventType,
              payment: {
                id: payment.id,
                status: payment.status,
                value: payment.value,
                billingType: payment.billingType,
                dueDate: payment.dueDate,
                paymentDate: payment.paymentDate,
                subscription: providerSubscriptionId,
                externalReference: payment.externalReference
              }
            },
            result
          );
        }

        if (this.configuration.isFiscalEnabled()) {
          const invoices = await this.asaas.listSubscriptionInvoices(
            providerSubscriptionId
          );
          result.invoicesChecked += invoices.length;
          for (const invoice of invoices) {
            const eventType = this.invoiceEventType(invoice);
            if (!eventType) {
              continue;
            }
            await this.processSyntheticEvent(
              {
                id: `reconciliation:invoice:${invoice.id}:${eventType}`,
                event: eventType,
                invoice: {
                  id: invoice.id,
                  status: invoice.status,
                  payment: invoice.paymentId,
                  subscription: providerSubscriptionId,
                  externalReference: invoice.externalReference
                }
              },
              result
            );
          }
        }
      } catch (error) {
        result.failures += 1;
        this.logger.warn(
          `Contract ${contract.id} reconciliation failed: ${this.errorCode(
            error
          )}`
        );
      }
    }

    return result;
  }

  private async resolveProviderSubscription(
    contract: WorkspaceSubscription
  ): Promise<string | null> {
    if (contract.asaasSubscriptionId) {
      return contract.asaasSubscriptionId;
    }

    const externalReference = this.asaas.contractExternalReference(
      contract.workspaceId,
      contract.id
    );
    const providerSubscription =
      await this.asaas.findSubscriptionByExternalReference(
        externalReference
      );
    if (!providerSubscription) {
      return null;
    }

    await this.prisma.$transaction([
      this.prisma.workspaceSubscription.update({
        where: { id: contract.id },
        data: { asaasSubscriptionId: providerSubscription.id }
      }),
      this.prisma.billingContractAudit.create({
        data: {
          workspaceId: contract.workspaceId,
          subscriptionId: contract.id,
          planId: contract.planId,
          actorType: "system",
          action: "contract.provider_subscription_reconciled",
          reason: "Assinatura Asaas recuperada por referencia externa",
          providerReferences: {
            asaasSubscriptionId: providerSubscription.id,
            externalReference
          }
        }
      })
    ]);
    return providerSubscription.id;
  }

  private async processSyntheticEvent(
    event: Record<string, unknown>,
    result: ReconciliationResult
  ): Promise<void> {
    const processed = await this.webhooks.tryProcess(event);
    if (!processed.handled || processed.status === "failed") {
      result.failures += 1;
      return;
    }
    if (processed.status === "duplicate") {
      result.eventsDuplicated += 1;
      return;
    }
    if (processed.status === "processed") {
      result.eventsProcessed += 1;
    }
  }

  private paymentEventType(
    payment: AsaasPaymentResult
  ): string | null {
    switch (payment.status.toUpperCase()) {
      case "CONFIRMED":
        return "PAYMENT_CONFIRMED";
      case "RECEIVED":
      case "RECEIVED_IN_CASH":
        return "PAYMENT_RECEIVED";
      case "OVERDUE":
        return "PAYMENT_OVERDUE";
      case "REFUNDED":
      case "REFUND_REQUESTED":
      case "REFUND_IN_PROGRESS":
        return "PAYMENT_REFUNDED";
      case "CHARGEBACK_REQUESTED":
        return "PAYMENT_CHARGEBACK_REQUESTED";
      case "CHARGEBACK_DISPUTE":
        return "PAYMENT_CHARGEBACK_DISPUTE";
      default:
        return null;
    }
  }

  private invoiceEventType(
    invoice: AsaasInvoiceResult
  ): string | null {
    switch (invoice.status?.toUpperCase()) {
      case "AUTHORIZED":
        return "INVOICE_AUTHORIZED";
      case "SYNCHRONIZED":
        return "INVOICE_SYNCHRONIZED";
      case "SCHEDULED":
      case "PROCESSING":
        return "INVOICE_UPDATED";
      case "CANCELED":
        return "INVOICE_CANCELED";
      case "ERROR":
        return "INVOICE_ERROR";
      default:
        return null;
    }
  }

  private periodicReconciliationEnabled(): boolean {
    return (
      this.configuration.isPackageBillingEnabled() &&
      this.configuration.isAsaasRecurringEnabled() &&
      this.configuration.isLifecycleEnabled() &&
      this.configuration.isAsaasReconciliationEnabled() &&
      this.asaas.isConfigured()
    );
  }

  private emptyResult(): ReconciliationResult {
    return {
      contracts: 0,
      subscriptionsBound: 0,
      paymentsChecked: 0,
      invoicesChecked: 0,
      eventsProcessed: 0,
      eventsDuplicated: 0,
      failures: 0
    };
  }

  private errorCode(error: unknown): string {
    return error instanceof Error ? error.message : "unknown_error";
  }
}
