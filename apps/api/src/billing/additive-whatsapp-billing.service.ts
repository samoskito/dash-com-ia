import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { Prisma, type WorkspaceSubscription } from "@prisma/client";
import type { WorkspaceAddWhatsappNumberDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageAsaasAdapter } from "./package-asaas.adapter";

const INDIVIDUAL_NUMBER_PRICE_CENTS = 3_000;
const INDIVIDUAL_NUMBER_KEY = "individual-whatsapp-number";

type AdditiveItem = {
  id: string;
  workspaceId: string;
  subscriptionId: string;
  status: string;
  providerSyncStatus: string;
  paymentChargeId: string | null;
  capacityPerUnit: number;
  monthlyPriceCentsPerUnit: number;
  quantity: number;
  paymentCharge?: {
    id: string;
    status: string;
    amountCents: number;
    externalChargeId: string | null;
    checkoutUrl: string | null;
  } | null;
};

@Injectable()
export class AdditiveWhatsappBillingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageAsaasAdapter) private readonly asaas: PackageAsaasAdapter,
  ) {}

  /**
   * Creates exactly one R$30 payment intent per idempotency key. Until an
   * authenticated Asaas confirmation arrives, it grants no capacity at all.
   */
  async addIndividualNumber(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<WorkspaceAddWhatsappNumberDto> {
    this.assertIdempotencyKey(idempotencyKey);

    const prepared = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockWorkspace(transaction, workspaceId);
        const contract = await transaction.workspaceSubscription.findFirst({
          where: {
            workspaceId,
            isCurrent: true,
            contractStatus: "active",
            planNameSnapshot: { not: null },
            asaasSubscriptionId: { not: null },
          },
          orderBy: { createdAt: "desc" },
        });
        this.assertIndividualContract(contract);

        const profile = await transaction.workspaceBillingProfile.findUnique({
          where: { workspaceId },
        });
        if (!profile?.asaasCustomerId) {
          throw new ConflictException("Dados de cobranca Asaas incompletos");
        }

        let item = await transaction.workspaceSubscriptionItem.findFirst({
          where: {
            workspaceId,
            subscriptionId: contract.id,
            idempotencyKey,
          },
        });
        if (!item) {
          const charge = await transaction.paymentCharge.create({
            data: {
              workspaceId,
              subscriptionId: contract.id,
              provider: "asaas",
              status: "pending",
              amountCents: INDIVIDUAL_NUMBER_PRICE_CENTS,
              description: "Numero WhatsApp adicional — R$ 30,00",
            },
          });
          item = await transaction.workspaceSubscriptionItem.create({
            data: {
              workspaceId,
              subscriptionId: contract.id,
              key: INDIVIDUAL_NUMBER_KEY,
              nameSnapshot: "Numero WhatsApp adicional",
              quantity: 1,
              capacityPerUnit: 1,
              monthlyPriceCentsPerUnit: INDIVIDUAL_NUMBER_PRICE_CENTS,
              status: "pending_payment",
              providerSyncStatus: "not_required",
              idempotencyKey,
              addedByUserId: actorUserId,
              paymentChargeId: charge.id,
            },
          });
          await transaction.billingContractAudit.create({
            data: {
              workspaceId,
              subscriptionId: contract.id,
              actorUserId,
              actorType: "user",
              action: "contract.additive_capacity_payment_requested",
              reason: INDIVIDUAL_NUMBER_KEY,
              beforeSnapshot: this.contractSnapshot(contract),
              afterSnapshot: this.contractSnapshot(contract),
              providerReferences: { paymentChargeId: charge.id },
            },
          });
        }

        const charge = item.paymentChargeId
          ? await transaction.paymentCharge.findUnique({
              where: { id: item.paymentChargeId },
            })
          : null;
        if (!charge) {
          throw new ConflictException("Cobranca adicional indisponivel");
        }
        return { contract, customerId: profile.asaasCustomerId, item, charge };
      },
      { isolationLevel: "Serializable" },
    );

    if (prepared.item.status === "active") {
      return this.result(prepared.contract, prepared.item, prepared.charge);
    }

    const charge = await this.ensureProviderPayment(prepared);
    return this.result(prepared.contract, prepared.item, charge);
  }

  /** Called only from the trusted Asaas PAYMENT_CONFIRMED/RECEIVED path. */
  async recordPaidCheckout(
    paymentId: string,
    paymentValueCents: number,
  ): Promise<boolean> {
    const item = await this.prisma.$transaction(
      async (transaction) => {
        const charge = await transaction.paymentCharge.findFirst({
          where: { provider: "asaas", externalChargeId: paymentId },
          include: { additiveItem: true },
        });
        if (
          !charge?.additiveItem ||
          charge.additiveItem.status === "active" ||
          charge.amountCents !== INDIVIDUAL_NUMBER_PRICE_CENTS ||
          paymentValueCents !== INDIVIDUAL_NUMBER_PRICE_CENTS
        ) {
          return null;
        }
        const additive = charge.additiveItem;
        await this.lockWorkspace(transaction, additive.workspaceId);
        const claimed = await transaction.workspaceSubscriptionItem.updateMany({
          where: {
            id: additive.id,
            workspaceId: additive.workspaceId,
            subscriptionId: additive.subscriptionId,
            status: "pending_payment",
            paymentChargeId: charge.id,
          },
          data: {
            providerSyncStatus: "pending",
            providerSyncLastError: null,
          },
        });
        if (claimed.count === 0) {
          return null;
        }
        await transaction.paymentCharge.update({
          where: { id: charge.id },
          data: { status: "paid", paidAt: new Date() },
        });
        return additive;
      },
      { isolationLevel: "Serializable" },
    );
    if (!item) return false;

    await this.syncPaidItems(item.workspaceId, item.subscriptionId);
    return true;
  }

  /** Reconciles only payments already verified and durably marked paid. */
  async retryProviderSyncs(limit = 50): Promise<number> {
    const items = await this.prisma.workspaceSubscriptionItem.findMany({
      where: {
        status: "pending_payment",
        providerSyncStatus: { in: ["pending", "failed"] },
        paymentCharge: { status: "paid" },
      },
      select: { workspaceId: true, subscriptionId: true },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    const groups = new Set(
      items.map((item) => `${item.workspaceId}:${item.subscriptionId}`),
    );
    let synced = 0;
    for (const group of groups) {
      const separator = group.indexOf(":");
      try {
        synced += await this.syncPaidItems(
          group.slice(0, separator),
          group.slice(separator + 1),
        );
      } catch {
        // The failed status is durable and will be retried on a later pass.
      }
    }
    return synced;
  }

  private async ensureProviderPayment(input: {
    contract: WorkspaceSubscription;
    customerId: string;
    item: AdditiveItem;
    charge: {
      id: string;
      externalChargeId: string | null;
      checkoutUrl: string | null;
      amountCents: number;
      description: string;
    };
  }) {
    if (input.charge.externalChargeId && input.charge.checkoutUrl) {
      return input.charge;
    }

    // Keep the advisory lock through the provider call. A retry after an
    // ambiguous network result first recovers by the immutable item reference.
    return this.prisma.$transaction(
      async (transaction) => {
        await this.lockWorkspace(transaction, input.contract.workspaceId);
        const item = await transaction.workspaceSubscriptionItem.findUnique({
          where: { id: input.item.id },
          include: { paymentCharge: true },
        });
        if (!item?.paymentCharge) {
          throw new ConflictException("Cobranca adicional indisponivel");
        }
        if (
          item.workspaceId !== input.contract.workspaceId ||
          item.subscriptionId !== input.contract.id
        ) {
          throw new ConflictException("Cobranca adicional fora do workspace");
        }
        if (
          item.paymentCharge.externalChargeId &&
          item.paymentCharge.checkoutUrl
        ) {
          return item.paymentCharge;
        }

        const reference = this.asaas.additiveItemExternalReference(
          item.workspaceId,
          item.subscriptionId,
          item.id,
        );
        const recovered =
          await this.asaas.findPaymentByExternalReference(reference);
        const payment =
          recovered ??
          (await this.asaas.createAdditivePayment({
            customerId: input.customerId,
            workspaceId: item.workspaceId,
            subscriptionId: item.subscriptionId,
            itemId: item.id,
            amountCents: INDIVIDUAL_NUMBER_PRICE_CENTS,
            description: item.paymentCharge.description,
          }));
        if (!payment.invoiceUrl) {
          throw new ConflictException("Checkout adicional indisponivel");
        }
        return transaction.paymentCharge.update({
          where: { id: item.paymentCharge.id },
          data: {
            externalChargeId: payment.id,
            checkoutUrl: payment.invoiceUrl,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  }

  /**
   * The workspace lock covers provider update and local activation together.
   * This prevents two independently paid additions from calculating the same
   * next recurring value and losing one capacity increase.
   */
  private async syncPaidItems(
    workspaceId: string,
    subscriptionId: string,
  ): Promise<number> {
    let itemIds: string[] = [];
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await this.lockWorkspace(transaction, workspaceId);
          const contract = await transaction.workspaceSubscription.findFirst({
            where: {
              id: subscriptionId,
              workspaceId,
              isCurrent: true,
              contractStatus: "active",
              asaasSubscriptionId: { not: null },
            },
          });
          this.assertIndividualContract(contract);

          const items = await transaction.workspaceSubscriptionItem.findMany({
            where: {
              workspaceId,
              subscriptionId,
              status: "pending_payment",
              providerSyncStatus: { in: ["pending", "failed"] },
              paymentCharge: {
                status: "paid",
                amountCents: INDIVIDUAL_NUMBER_PRICE_CENTS,
              },
            },
            include: { paymentCharge: true },
            orderBy: { createdAt: "asc" },
          });
          if (items.length === 0) return 0;

          itemIds = items.map((item) => item.id);
          const monthlyIncrease = items.reduce(
            (total, item) =>
              total + item.monthlyPriceCentsPerUnit * item.quantity,
            0,
          );
          const capacityIncrease = items.reduce(
            (total, item) => total + item.capacityPerUnit * item.quantity,
            0,
          );
          const initialMonthlyPrice = contract.monthlyPriceCentsSnapshot ?? 0;
          const initialCapacity = contract.includedWhatsappNumbersSnapshot ?? 0;
          const targetMonthlyPrice = initialMonthlyPrice + monthlyIncrease;

          await this.asaas.updateSubscriptionValue(
            contract.asaasSubscriptionId!,
            targetMonthlyPrice,
          );

          await transaction.workspaceSubscription.update({
            where: { id: contract.id },
            data: {
              monthlyPriceCentsSnapshot: targetMonthlyPrice,
              includedWhatsappNumbersSnapshot:
                initialCapacity + capacityIncrease,
            },
          });
          await transaction.workspaceSubscriptionItem.updateMany({
            where: { id: { in: itemIds }, status: "pending_payment" },
            data: {
              status: "active",
              providerSyncStatus: "synced",
              providerSyncLastError: null,
              providerSyncAttempts: { increment: 1 },
            },
          });
          let auditMonthlyPrice = initialMonthlyPrice;
          let auditCapacity = initialCapacity;
          for (const item of items) {
            const beforeSnapshot = this.contractSnapshot(
              contract,
              auditMonthlyPrice,
              auditCapacity,
            );
            auditMonthlyPrice += item.monthlyPriceCentsPerUnit * item.quantity;
            auditCapacity += item.capacityPerUnit * item.quantity;
            await transaction.billingContractAudit.create({
              data: {
                workspaceId,
                subscriptionId: contract.id,
                actorType: "provider",
                action: "contract.additive_capacity_activated",
                reason: item.id,
                beforeSnapshot,
                afterSnapshot: this.contractSnapshot(
                  contract,
                  auditMonthlyPrice,
                  auditCapacity,
                ),
                providerReferences: {
                  paymentChargeId: item.paymentChargeId,
                  asaasSubscriptionId: contract.asaasSubscriptionId,
                },
              },
            });
          }
          return items.length;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (itemIds.length > 0) {
        await this.prisma.workspaceSubscriptionItem.updateMany({
          where: { id: { in: itemIds }, status: "pending_payment" },
          data: {
            providerSyncStatus: "failed",
            providerSyncAttempts: { increment: 1 },
            providerSyncLastError: this.errorCode(error),
          },
        });
      }
      throw error;
    }
  }

  private assertIndividualContract(
    contract: WorkspaceSubscription | null,
  ): asserts contract is WorkspaceSubscription {
    const capacity = contract?.includedWhatsappNumbersSnapshot ?? 0;
    const monthlyPrice = contract?.monthlyPriceCentsSnapshot ?? 0;
    if (
      !contract ||
      !contract.asaasSubscriptionId ||
      capacity < 1 ||
      monthlyPrice < INDIVIDUAL_NUMBER_PRICE_CENTS ||
      monthlyPrice !== capacity * INDIVIDUAL_NUMBER_PRICE_CENTS
    ) {
      throw new ConflictException(
        "Workspace sem contrato individual ativo com capacidade",
      );
    }
  }

  private result(
    contract: WorkspaceSubscription,
    item: AdditiveItem,
    charge: {
      id: string;
      amountCents: number;
      externalChargeId: string | null;
      checkoutUrl: string | null;
    },
  ): WorkspaceAddWhatsappNumberDto {
    if (!charge.externalChargeId || !charge.checkoutUrl) {
      throw new ConflictException("Checkout adicional pendente de criacao");
    }
    return {
      subscriptionId: contract.id,
      itemId: item.id,
      chargeId: charge.id,
      addedCapacity: item.status === "active" ? item.capacityPerUnit : 0,
      capacity: contract.includedWhatsappNumbersSnapshot ?? 1,
      monthlyPriceCents: contract.monthlyPriceCentsSnapshot ?? 0,
      paymentAmountCents: charge.amountCents,
      checkoutUrl: charge.checkoutUrl,
      externalPaymentId: charge.externalChargeId,
      status: item.status === "active" ? "active" : "awaiting_payment",
    };
  }

  private async lockWorkspace(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`,
    );
  }

  private contractSnapshot(
    contract: WorkspaceSubscription,
    monthlyPriceCentsSnapshot = contract.monthlyPriceCentsSnapshot,
    includedWhatsappNumbersSnapshot = contract.includedWhatsappNumbersSnapshot,
  ): Prisma.InputJsonObject {
    return {
      id: contract.id,
      workspaceId: contract.workspaceId,
      monthlyPriceCentsSnapshot,
      includedWhatsappNumbersSnapshot,
    };
  }

  private assertIdempotencyKey(idempotencyKey: string): void {
    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.length > 128
    ) {
      throw new ConflictException("Header Idempotency-Key é obrigatório");
    }
  }

  private errorCode(error: unknown): string {
    return error instanceof Error && error.name ? error.name : "provider_error";
  }
}
