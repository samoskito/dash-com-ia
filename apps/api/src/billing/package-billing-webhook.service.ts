import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  Prisma,
  type BillingInvoiceStatus,
  type WorkspaceSubscription
} from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  PackageAsaasAdapter,
  PackageAsaasError,
  type AsaasPaymentResult
} from "./package-asaas.adapter";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { PackageContractService } from "./package-contract.service";
import { PackageFiscalService } from "./package-fiscal.service";
import { PackageSubscriptionLifecycleService } from "./package-subscription-lifecycle.service";

type JsonRecord = Record<string, unknown>;

export type PackageBillingWebhookResult = {
  handled: boolean;
  status?: "processed" | "ignored" | "duplicate" | "failed";
  code?: string;
  workspaceId?: string;
};

type ResolvedContext = {
  contract: WorkspaceSubscription;
  eventType: string;
  externalReference: string | null;
  providerEventId: string;
  resource: JsonRecord;
  resourceId: string | null;
  resourceType: "invoice" | "payment" | "subscription" | "unknown";
};

@Injectable()
export class PackageBillingWebhookService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(PackageAsaasAdapter)
    private readonly asaas: PackageAsaasAdapter,
    @Inject(PackageContractService)
    private readonly contracts: PackageContractService,
    @Inject(PackageSubscriptionLifecycleService)
    private readonly lifecycle: PackageSubscriptionLifecycleService,
    @Inject(PackageFiscalService)
    private readonly fiscal: PackageFiscalService
  ) {}

  async tryProcess(body: JsonRecord): Promise<PackageBillingWebhookResult> {
    if (!this.configuration.isPackageBillingEnabled()) {
      return { handled: false };
    }

    const context = await this.resolveContext(body);
    if (!context) {
      return { handled: false };
    }

    const providerEvent = await this.registerEvent(context, body);
    if (!providerEvent) {
      return {
        handled: true,
        status: "duplicate",
        workspaceId: context.contract.workspaceId
      };
    }

    try {
      const processed = await this.processContext(context);
      await this.prisma.billingProviderEvent.update({
        where: { id: providerEvent.id },
        data: {
          status: processed ? "processed" : "ignored",
          processedAt: new Date(),
          processingAttempts: { increment: 1 },
          lastErrorCode: null,
          lastErrorMessage: null
        }
      });

      return {
        handled: true,
        status: processed ? "processed" : "ignored",
        workspaceId: context.contract.workspaceId
      };
    } catch (error) {
      const code = this.errorCode(error);
      await this.prisma.billingProviderEvent.update({
        where: { id: providerEvent.id },
        data: {
          status: "failed",
          processingAttempts: { increment: 1 },
          lastErrorCode: code,
          lastErrorMessage: code
        }
      });

      return {
        handled: true,
        status: "failed",
        code,
        workspaceId: context.contract.workspaceId
      };
    }
  }

  private async resolveContext(
    body: JsonRecord
  ): Promise<ResolvedContext | null> {
    const eventType =
      this.optionalString(body, "event")?.toUpperCase() ?? "UNKNOWN";
    const resource = this.resource(body);
    const resourceType = this.resourceType(body);
    const resourceId = this.optionalString(resource, "id");
    const providerEventId =
      this.optionalString(body, "id") ??
      this.optionalString(body, "eventId") ??
      this.hashEvent(eventType, resourceType, resourceId, body);
    const externalReference =
      this.optionalString(resource, "externalReference") ??
      this.optionalString(body, "externalReference");
    const parsedReference =
      this.asaas.parseContractExternalReference(externalReference);
    const asaasSubscriptionId =
      this.relationId(resource.subscription) ??
      (resourceType === "subscription" ? resourceId : null);
    const asaasCheckoutId = this.relationId(resource.checkoutSession);

    let contract = parsedReference
      ? await this.prisma.workspaceSubscription.findFirst({
          where: {
            id: parsedReference.subscriptionId,
            workspaceId: parsedReference.workspaceId,
            planNameSnapshot: { not: null }
          }
        })
      : null;

    if (!contract && asaasSubscriptionId) {
      contract = await this.prisma.workspaceSubscription.findFirst({
        where: {
          asaasSubscriptionId,
          planNameSnapshot: { not: null }
        }
      });
    }

    if (!contract && asaasCheckoutId) {
      contract = await this.prisma.workspaceSubscription.findFirst({
        where: {
          asaasCheckoutId,
          planNameSnapshot: { not: null }
        }
      });
    }

    if (!contract && resourceType === "invoice") {
      const paymentId =
        this.relationId(resource.payment) ??
        this.optionalString(resource, "payment");
      if (paymentId) {
        const invoice = await this.prisma.billingInvoice.findFirst({
          where: {
            provider: "asaas",
            providerPaymentId: paymentId
          },
          include: { subscription: true }
        });
        contract = invoice?.subscription ?? null;
      }
    }

    if (!contract) {
      return null;
    }

    return {
      contract,
      eventType,
      externalReference,
      providerEventId,
      resource,
      resourceId,
      resourceType
    };
  }

  private async registerEvent(
    context: ResolvedContext,
    body: JsonRecord
  ) {
    try {
      return await this.prisma.billingProviderEvent.create({
        data: {
          workspaceId: context.contract.workspaceId,
          subscriptionId: context.contract.id,
          provider: "asaas",
          providerEventId: context.providerEventId,
          eventType: context.eventType,
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          externalReference: context.externalReference,
          status: "processing",
          payloadRedacted: this.redactedPayload(body, context)
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.billingProviderEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider: "asaas",
              providerEventId: context.providerEventId
            }
          }
        });
        if (!existing) {
          return null;
        }

        const staleProcessingBefore = new Date(Date.now() - 5 * 60 * 1000);
        const canRetry =
          existing.status === "failed" ||
          (existing.status === "processing" &&
            existing.updatedAt <= staleProcessingBefore);
        if (!canRetry) {
          return null;
        }

        const claimed = await this.prisma.billingProviderEvent.updateMany({
          where: {
            id: existing.id,
            OR: [
              { status: "failed" },
              {
                status: "processing",
                updatedAt: { lte: staleProcessingBefore }
              }
            ]
          },
          data: {
            status: "processing",
            processedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            payloadRedacted: this.redactedPayload(body, context)
          }
        });

        if (claimed.count === 0) {
          return null;
        }

        return this.prisma.billingProviderEvent.findUnique({
          where: { id: existing.id }
        });
      }
      throw error;
    }
  }

  private async processContext(context: ResolvedContext): Promise<boolean> {
    if (context.resourceType === "invoice") {
      return this.processInvoice(context);
    }

    if (context.resourceType === "subscription") {
      return this.processSubscription(context);
    }

    if (context.resourceType !== "payment" || !context.resourceId) {
      return false;
    }

    if (
      context.eventType === "PAYMENT_CONFIRMED" ||
      context.eventType === "PAYMENT_RECEIVED"
    ) {
      await this.confirmPayment(context);
      return true;
    }
    if (context.eventType === "PAYMENT_OVERDUE") {
      await this.upsertCharge(context, "pending");
      await this.lifecycle.markPaymentOverdue(
        context.contract.id,
        context.resourceId
      );
      return true;
    }
    if (context.eventType === "PAYMENT_DELETED") {
      await this.upsertCharge(context, "canceled");
      await this.lifecycle.markPaymentDeleted(
        context.contract.id,
        context.resourceId
      );
      return true;
    }
    if (
      context.eventType === "PAYMENT_REFUNDED" ||
      context.eventType === "PAYMENT_CHARGEBACK_REQUESTED" ||
      context.eventType === "PAYMENT_CHARGEBACK_DISPUTE"
    ) {
      await this.upsertCharge(context, "canceled");
      await this.lifecycle.markPaymentOverdue(
        context.contract.id,
        context.resourceId
      );
      return true;
    }

    return false;
  }

  private async confirmPayment(context: ResolvedContext): Promise<void> {
    const payment = await this.paymentDetails(context);
    const providerSubscriptionId =
      payment.subscriptionId ??
      context.contract.asaasSubscriptionId ??
      (
        await this.asaas.findSubscriptionByExternalReference(
          this.asaas.contractExternalReference(
            context.contract.workspaceId,
            context.contract.id
          )
        )
      )?.id ??
      null;

    if (!providerSubscriptionId) {
      throw new PackageAsaasError(
        "asaas_subscription_not_resolved",
        null,
        false
      );
    }

    const periodStart = this.paymentPeriodStart(payment);
    const periodEnd = this.addMonth(periodStart);
    const charge = await this.upsertCharge(context, "paid", payment);
    const contract = await this.contracts.activatePaidContract({
      subscriptionId: context.contract.id,
      asaasSubscriptionId: providerSubscriptionId,
      billingMethod: this.billingMethod(payment.billingType),
      periodStart,
      periodEnd,
      providerPaymentId: payment.id
    });

    await this.fiscal.configureAfterPayment({
      contract,
      paymentChargeId: charge.id,
      providerPaymentId: payment.id,
      amountCents: charge.amountCents
    });
  }

  private async processSubscription(
    context: ResolvedContext
  ): Promise<boolean> {
    if (!context.resourceId) {
      return false;
    }
    if (
      context.eventType !== "SUBSCRIPTION_CREATED" &&
      context.eventType !== "SUBSCRIPTION_UPDATED"
    ) {
      return false;
    }

    await this.prisma.workspaceSubscription.update({
      where: { id: context.contract.id },
      data: { asaasSubscriptionId: context.resourceId }
    });
    return true;
  }

  private async processInvoice(context: ResolvedContext): Promise<boolean> {
    if (!context.resourceId) {
      return false;
    }
    const providerPaymentId =
      this.relationId(context.resource.payment) ??
      this.optionalString(context.resource, "payment");
    const status = this.invoiceStatus(context.eventType);
    if (!status) {
      return false;
    }

    return this.fiscal.recordInvoiceEvent({
      providerInvoiceId: context.resourceId,
      providerPaymentId,
      status,
      issuedAt:
        status === "issued" || status === "authorized" ? new Date() : null,
      authorizedAt: status === "authorized" ? new Date() : null,
      canceledAt: status === "canceled" ? new Date() : null
    });
  }

  private async paymentDetails(
    context: ResolvedContext
  ): Promise<AsaasPaymentResult> {
    const inline = this.mapInlinePayment(context.resource);
    if (
      inline.subscriptionId ||
      inline.externalReference ||
      !this.asaas.isConfigured()
    ) {
      return inline;
    }
    return this.asaas.getPayment(inline.id);
  }

  private async upsertCharge(
    context: ResolvedContext,
    status: "paid" | "pending" | "canceled",
    payment?: AsaasPaymentResult
  ) {
    const paymentId = payment?.id ?? context.resourceId;
    if (!paymentId) {
      throw new PackageAsaasError(
        "asaas_payment_id_missing",
        null,
        false
      );
    }
    const existing = await this.prisma.paymentCharge.findFirst({
      where: {
        provider: "asaas",
        externalChargeId: paymentId,
        subscriptionId: context.contract.id
      }
    });
    const amountCents = Math.max(
      0,
      Math.round(
        (payment?.value ??
          this.optionalNumber(context.resource, "value") ??
          (context.contract.monthlyPriceCentsSnapshot ?? 0) / 100) * 100
      )
    );
    const data = {
      status,
      amountCents,
      paidAt:
        status === "paid"
          ? this.optionalDate(payment?.paymentDate) ?? new Date()
          : null,
      dueAt: this.optionalDate(
        payment?.dueDate ??
          this.optionalString(context.resource, "dueDate")
      )
    } as const;

    if (existing) {
      return this.prisma.paymentCharge.update({
        where: { id: existing.id },
        data
      });
    }

    return this.prisma.paymentCharge.create({
      data: {
        workspaceId: context.contract.workspaceId,
        subscriptionId: context.contract.id,
        provider: "asaas",
        externalChargeId: paymentId,
        description: `Assinatura ${context.contract.planNameSnapshot ?? "WppTrack"}`,
        ...data
      }
    });
  }

  private mapInlinePayment(resource: JsonRecord): AsaasPaymentResult {
    return {
      id: this.requiredString(resource, "id"),
      status: this.optionalString(resource, "status") ?? "UNKNOWN",
      value: this.optionalNumber(resource, "value") ?? 0,
      billingType: this.optionalString(resource, "billingType"),
      dueDate: this.optionalString(resource, "dueDate"),
      paymentDate:
        this.optionalString(resource, "paymentDate") ??
        this.optionalString(resource, "clientPaymentDate"),
      subscriptionId: this.relationId(resource.subscription),
      externalReference: this.optionalString(resource, "externalReference")
    };
  }

  private resource(body: JsonRecord): JsonRecord {
    for (const key of ["payment", "subscription", "invoice"]) {
      const value = body[key];
      if (this.isRecord(value)) {
        return value;
      }
    }
    return body;
  }

  private resourceType(
    body: JsonRecord
  ): "invoice" | "payment" | "subscription" | "unknown" {
    if (this.isRecord(body.invoice)) return "invoice";
    if (this.isRecord(body.payment)) return "payment";
    if (this.isRecord(body.subscription)) return "subscription";
    return "unknown";
  }

  private redactedPayload(
    body: JsonRecord,
    context: ResolvedContext
  ): Prisma.InputJsonObject {
    return {
      eventId: context.providerEventId,
      eventType: context.eventType,
      dateCreated: this.optionalString(body, "dateCreated"),
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      externalReference: context.externalReference,
      status: this.optionalString(context.resource, "status"),
      value: this.optionalNumber(context.resource, "value")
    };
  }

  private invoiceStatus(eventType: string): BillingInvoiceStatus | null {
    if (
      eventType === "INVOICE_AUTHORIZED" ||
      eventType === "INVOICE_SYNCHRONIZED"
    ) {
      return "authorized";
    }
    if (eventType === "INVOICE_CREATED" || eventType === "INVOICE_UPDATED") {
      return "issued";
    }
    if (eventType === "INVOICE_CANCELED") return "canceled";
    if (eventType === "INVOICE_ERROR") return "failed";
    return null;
  }

  private billingMethod(
    value: string | null
  ): "credit_card" | "pix" {
    return value?.toUpperCase() === "PIX" ? "pix" : "credit_card";
  }

  private paymentPeriodStart(payment: AsaasPaymentResult): Date {
    return (
      this.optionalDate(payment.paymentDate) ??
      this.optionalDate(payment.dueDate) ??
      new Date()
    );
  }

  private addMonth(value: Date): Date {
    const result = new Date(value);
    result.setUTCMonth(result.getUTCMonth() + 1);
    return result;
  }

  private optionalDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private relationId(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return this.isRecord(value) ? this.optionalString(value, "id") : null;
  }

  private requiredString(record: JsonRecord, key: string): string {
    const value = this.optionalString(record, key);
    if (!value) {
      throw new PackageAsaasError(
        `asaas_invalid_response_${key}`,
        null,
        false
      );
    }
    return value;
  }

  private optionalString(record: JsonRecord, key: string): string | null {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private optionalNumber(record: JsonRecord, key: string): number | null {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private hashEvent(
    eventType: string,
    resourceType: string,
    resourceId: string | null,
    body: JsonRecord
  ): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          eventType,
          resourceType,
          resourceId,
          dateCreated: this.optionalString(body, "dateCreated")
        })
      )
      .digest("hex");
  }

  private errorCode(error: unknown): string {
    if (error instanceof PackageAsaasError) return error.code;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
    ) {
      return `prisma_${error.code}`;
    }
    return error instanceof Error ? error.name : "unknown_error";
  }

  private readonly isRecord = (value: unknown): value is JsonRecord =>
    typeof value === "object" && value !== null && !Array.isArray(value);
}
