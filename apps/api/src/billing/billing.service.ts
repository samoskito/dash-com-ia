import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  BackofficeSubscriptionPlanCreateInputDto,
  BackofficeSubscriptionPlanDto,
  BackofficeSubscriptionPlanUpdateInputDto,
  BackofficePaymentChargeDto,
  WhatsappInstanceCheckoutDto,
  WhatsappInstanceCheckoutInputDto,
  WhatsappInstanceQuoteDto,
  WorkspaceSubscriptionSummaryDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { MetaTokenEncryptionService } from "../integrations/meta/meta-token-encryption.service";
import {
  UazapiAdapter,
  type UazapiCreateInstanceResult
} from "../integrations/uazapi/uazapi.adapter";
import { AsaasAdapter } from "./asaas.adapter";

type AsaasPaymentWebhookPayload = Record<string, unknown>;

export type AsaasPaymentProcessingResult = {
  processed: boolean;
  status: "ignored" | "paid" | "failed";
  chargeId?: string;
  activationId?: string;
  whatsappInstanceId?: string;
};

type PaymentChargeWithActivation = {
  id: string;
  workspaceId: string;
  status: string;
  externalChargeId: string | null;
  activation: {
    id: string;
    whatsappInstanceId: string;
    whatsappInstance: {
      id: string;
      workspaceId: string;
      name: string;
      provider: string;
      providerInstanceId: string | null;
      providerTokenEncrypted?: string | null;
      providerTokenIv?: string | null;
      providerTokenTag?: string | null;
    };
  } | null;
};

type BackofficePaymentChargeRecord = {
  id: string;
  workspaceId: string;
  provider: string;
  externalChargeId: string | null;
  status: string;
  amountCents: number;
  description: string;
  checkoutUrl: string | null;
  dueAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  workspace: {
    name: string;
  };
  activation: {
    whatsappInstance: {
      id: string;
      name: string;
    };
  } | null;
};

type WorkspaceBillingRecord = {
  asaasCustomerId: string | null;
};

type SplitReceiverRecord = {
  walletId: string;
  percentageBps: number;
};

type WorkspaceSubscriptionRecord = {
  workspaceId: string;
  status: string;
  activeInstances: number;
  asaasSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  plan: {
    name: string;
    pricePerWhatsappInstanceCents: number;
  } | null;
};

type SubscriptionPlanRecord = {
  id: string;
  name: string;
  slug: string;
  pricePerWhatsappInstanceCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BackofficePaymentChargeFilters = {
  status?: string;
  workspaceId?: string;
};

@Injectable()
export class BillingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AsaasAdapter) private readonly asaasAdapter: AsaasAdapter,
    @Optional()
    @Inject(UazapiAdapter)
    private readonly uazapiAdapter?: UazapiAdapter,
    @Optional()
    @Inject(MetaTokenEncryptionService)
    private readonly tokenEncryption?: MetaTokenEncryptionService,
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env
  ) {}

  async getWhatsappInstanceQuote(
    workspaceId: string
  ): Promise<WhatsappInstanceQuoteDto> {
    const activeInstances = await this.prisma.whatsappInstance.count({
      where: {
        workspaceId,
        status: "active"
      }
    });
    const pricePerInstanceCents = this.getPricePerInstanceCents();

    return {
      workspaceId,
      activeInstances,
      pricePerInstanceCents,
      nextInstanceAmountCents: pricePerInstanceCents,
      currency: "BRL"
    };
  }

  async getWorkspaceSubscriptionSummary(
    workspaceId: string
  ): Promise<WorkspaceSubscriptionSummaryDto> {
    const subscription = (await this.prisma.workspaceSubscription.findFirst({
      where: { workspaceId },
      include: {
        plan: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    })) as WorkspaceSubscriptionRecord | null;

    if (!subscription) {
      const quote = await this.getWhatsappInstanceQuote(workspaceId);

      return {
        workspaceId,
        status: "not_configured",
        planName: null,
        activeInstances: quote.activeInstances,
        pricePerWhatsappInstanceCents: quote.pricePerInstanceCents,
        monthlyAmountCents: quote.activeInstances * quote.pricePerInstanceCents,
        currentPeriodEnd: null,
        asaasSubscriptionId: null
      };
    }

    const pricePerWhatsappInstanceCents =
      subscription.plan?.pricePerWhatsappInstanceCents ??
      this.getPricePerInstanceCents();

    return {
      workspaceId,
      status: this.toSubscriptionStatus(subscription.status),
      planName: subscription.plan?.name ?? null,
      activeInstances: subscription.activeInstances,
      pricePerWhatsappInstanceCents,
      monthlyAmountCents:
        subscription.activeInstances * pricePerWhatsappInstanceCents,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      asaasSubscriptionId: subscription.asaasSubscriptionId
    };
  }

  async listBackofficeSubscriptionPlans(): Promise<
    BackofficeSubscriptionPlanDto[]
  > {
    const plans = (await this.prisma.subscriptionPlan.findMany({
      orderBy: {
        createdAt: "desc"
      }
    })) as SubscriptionPlanRecord[];

    return plans.map((plan) => this.toBackofficeSubscriptionPlanDto(plan));
  }

  async createBackofficeSubscriptionPlan(
    input: BackofficeSubscriptionPlanCreateInputDto,
    actorUserId?: string
  ): Promise<BackofficeSubscriptionPlanDto> {
    const plan = (await this.prisma.subscriptionPlan.create({
      data: {
        name: input.name,
        slug: input.slug,
        pricePerWhatsappInstanceCents: input.pricePerWhatsappInstanceCents,
        active: input.active
      }
    })) as SubscriptionPlanRecord;

    await this.prisma.auditLog.create({
      data: {
        workspaceId: null,
        actorUserId: actorUserId ?? null,
        actorType: "platform_operator",
        action: "billing.plan_created",
        targetType: "SubscriptionPlan",
        targetId: plan.id,
        reason: "Plano de assinatura criado no backoffice da plataforma.",
        resultStatus: "created",
        afterSummary: {
          name: plan.name,
          slug: plan.slug,
          pricePerWhatsappInstanceCents: plan.pricePerWhatsappInstanceCents,
          active: plan.active
        } as Prisma.InputJsonValue
      }
    });

    return this.toBackofficeSubscriptionPlanDto(plan);
  }

  async updateBackofficeSubscriptionPlan(
    id: string,
    input: BackofficeSubscriptionPlanUpdateInputDto,
    actorUserId?: string
  ): Promise<BackofficeSubscriptionPlanDto> {
    const existing = (await this.prisma.subscriptionPlan.findUnique({
      where: { id }
    })) as SubscriptionPlanRecord | null;

    if (!existing) {
      throw new NotFoundException("Plano nao encontrado");
    }

    const plan = (await this.prisma.subscriptionPlan.update({
      where: { id },
      data: input
    })) as SubscriptionPlanRecord;

    await this.prisma.auditLog.create({
      data: {
        workspaceId: null,
        actorUserId: actorUserId ?? null,
        actorType: "platform_operator",
        action: "billing.plan_updated",
        targetType: "SubscriptionPlan",
        targetId: plan.id,
        reason: "Plano de assinatura atualizado no backoffice da plataforma.",
        resultStatus: "updated",
        beforeSummary: {
          name: existing.name,
          slug: existing.slug,
          pricePerWhatsappInstanceCents:
            existing.pricePerWhatsappInstanceCents,
          active: existing.active
        } as Prisma.InputJsonValue,
        afterSummary: {
          name: plan.name,
          slug: plan.slug,
          pricePerWhatsappInstanceCents: plan.pricePerWhatsappInstanceCents,
          active: plan.active
        } as Prisma.InputJsonValue
      }
    });

    return this.toBackofficeSubscriptionPlanDto(plan);
  }

  async listBackofficePaymentCharges(
    filters: BackofficePaymentChargeFilters = {}
  ): Promise<BackofficePaymentChargeDto[]> {
    const where = {
      ...(this.isPaymentChargeStatus(filters.status)
        ? { status: filters.status }
        : {}),
      ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {})
    };
    const charges = (await this.prisma.paymentCharge.findMany({
      where,
      include: {
        workspace: {
          select: {
            name: true
          }
        },
        activation: {
          include: {
            whatsappInstance: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    })) as BackofficePaymentChargeRecord[];

    return charges.map((charge) => ({
      id: charge.id,
      workspaceId: charge.workspaceId,
      workspaceName: charge.workspace.name,
      provider: charge.provider,
      externalChargeId: charge.externalChargeId,
      status: this.toPaymentChargeStatus(charge.status),
      amountCents: charge.amountCents,
      description: charge.description,
      checkoutUrl: charge.checkoutUrl,
      dueAt: charge.dueAt?.toISOString() ?? null,
      paidAt: charge.paidAt?.toISOString() ?? null,
      createdAt: charge.createdAt?.toISOString() ?? new Date(0).toISOString(),
      whatsappInstanceId: charge.activation?.whatsappInstance.id ?? null,
      whatsappInstanceName: charge.activation?.whatsappInstance.name ?? null
    }));
  }

  async createWhatsappInstanceCheckout(
    workspaceId: string,
    input: WhatsappInstanceCheckoutInputDto,
    actorUserId?: string
  ): Promise<WhatsappInstanceCheckoutDto> {
    const amountCents = this.getPricePerInstanceCents();
    const description = `Ativacao da instancia WhatsApp ${input.instanceName}`;

    const records = await this.prisma.$transaction(async (tx) => {
      const whatsappInstance = await tx.whatsappInstance.create({
        data: {
          workspaceId,
          name: input.instanceName,
          provider: input.provider,
          status: "pending_payment"
        }
      });
      const charge = await tx.paymentCharge.create({
        data: {
          workspaceId,
          provider: "asaas",
          status: "pending",
          externalChargeId: null,
          amountCents,
          description,
          checkoutUrl: null
        }
      });
      const activation = await tx.whatsappInstanceActivation.create({
        data: {
          workspaceId,
          whatsappInstanceId: whatsappInstance.id,
          paymentChargeId: charge.id,
          status: "pending_payment",
          amountCents
        }
      });

      return {
        activation,
        charge,
        whatsappInstance
      };
    });

    const workspace = (await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        asaasCustomerId: true
      }
    })) as WorkspaceBillingRecord | null;
    const splitReceivers = (await this.prisma.splitReceiver.findMany({
      where: {
        active: true
      },
      select: {
        walletId: true,
        percentageBps: true
      }
    })) as SplitReceiverRecord[];
    const asaasStartedAt = new Date();
    const asaasPayment = await this.asaasAdapter.createPayment({
      customerId: workspace?.asaasCustomerId ?? null,
      localChargeId: records.charge.id,
      amountCents,
      description,
      splitReceivers
    });
    await this.recordAsaasPaymentCreateLog({
      workspaceId,
      chargeId: records.charge.id,
      whatsappInstanceId: records.whatsappInstance.id,
      amountCents,
      description,
      customerConfigured: Boolean(workspace?.asaasCustomerId),
      splitReceiversCount: splitReceivers.length,
      startedAt: asaasStartedAt,
      result: asaasPayment
    });

    if (asaasPayment.status === "created") {
      await this.prisma.paymentCharge.update({
        where: { id: records.charge.id },
        data: {
          externalChargeId: asaasPayment.externalChargeId,
          checkoutUrl: asaasPayment.checkoutUrl
        }
      });
    }

    if (actorUserId) {
      await this.recordBillingAudit({
        workspaceId,
        actorUserId,
        actorType: "user",
        action: "billing.whatsapp_instance_checkout_created",
        targetType: "PaymentCharge",
        targetId: records.charge.id,
        resultStatus: "pending_payment",
        reason: "Usuario solicitou ativacao paga de uma instancia WhatsApp.",
        afterSummary: {
          whatsappInstanceId: records.whatsappInstance.id,
          activationId: records.activation.id,
          amountCents,
          paymentProvider: "asaas",
          paymentProviderStatus: asaasPayment.status,
          externalChargeConfigured: Boolean(asaasPayment.externalChargeId),
          hasCheckoutUrl: Boolean(asaasPayment.checkoutUrl)
        } as Prisma.InputJsonValue
      });
    }

    return {
      workspaceId,
      whatsappInstanceId: records.whatsappInstance.id,
      activationId: records.activation.id,
      chargeId: records.charge.id,
      status: "pending_payment",
      amountCents,
      checkoutUrl: asaasPayment.checkoutUrl,
      paymentProvider: "asaas",
      paymentProviderStatus: asaasPayment.status,
      externalChargeId: asaasPayment.externalChargeId
    };
  }

  private async recordAsaasPaymentCreateLog(input: {
    workspaceId: string;
    chargeId: string;
    whatsappInstanceId: string;
    amountCents: number;
    description: string;
    customerConfigured: boolean;
    splitReceiversCount: number;
    startedAt: Date;
    result: {
      status: "not_configured" | "created";
      externalChargeId: string | null;
      checkoutUrl: string | null;
    };
  }): Promise<void> {
    const finishedAt = new Date();

    try {
      await this.prisma.integrationLog.create({
        data: {
          workspaceId: input.workspaceId,
          source: "asaas",
          operation: "asaas.payment.create",
          status: input.result.status === "created" ? "success" : "blocked",
          startedAt: input.startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
          providerRequestId: input.result.externalChargeId,
          providerErrorMessage:
            input.result.status === "created"
              ? null
              : "Asaas nao configurado para criar cobranca",
          jobId: input.chargeId,
          requestSummary: {
            chargeId: input.chargeId,
            whatsappInstanceId: input.whatsappInstanceId,
            amountCents: input.amountCents,
            description: input.description,
            customerConfigured: input.customerConfigured,
            splitReceiversCount: input.splitReceiversCount
          } as Prisma.InputJsonValue,
          responseSummary: {
            status: input.result.status,
            externalChargeId: input.result.externalChargeId,
            hasCheckoutUrl: Boolean(input.result.checkoutUrl)
          } as Prisma.InputJsonValue
        }
      });
    } catch {
      return;
    }
  }

  private async recordBillingAudit(input: {
    workspaceId: string;
    actorUserId?: string | null;
    actorType?: string;
    action: string;
    targetType: string;
    targetId: string;
    resultStatus: string;
    reason?: string;
    beforeSummary?: Prisma.InputJsonValue;
    afterSummary?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId ?? null,
          actorType: input.actorType ?? "system",
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason ?? null,
          sourceIp: null,
          resultStatus: input.resultStatus,
          beforeSummary: input.beforeSummary,
          afterSummary: input.afterSummary
        }
      });
    } catch {
      return;
    }
  }

  async processAsaasPaymentWebhook(
    payload: AsaasPaymentWebhookPayload
  ): Promise<AsaasPaymentProcessingResult> {
    const paymentStatus = this.getAsaasPaymentStatus(payload);

    if (paymentStatus === "ignored") {
      return {
        processed: false,
        status: "ignored"
      };
    }

    const paymentId = this.getAsaasPaymentId(payload);

    if (!paymentId) {
      return {
        processed: false,
        status: "ignored"
      };
    }

    const charge = (await this.prisma.paymentCharge.findFirst({
      where: {
        OR: [
          {
            externalChargeId: paymentId
          },
          {
            id: paymentId
          }
        ]
      },
      include: {
        activation: {
          include: {
            whatsappInstance: true
          }
        }
      }
    })) as PaymentChargeWithActivation | null;

    if (!charge?.activation) {
      return {
        processed: false,
        status: "ignored"
      };
    }

    if (paymentStatus === "failed") {
      await this.prisma.paymentCharge.update({
        where: { id: charge.id },
        data: {
          status: "failed"
        }
      });
      await this.recordBillingAudit({
        workspaceId: charge.workspaceId,
        action: "billing.payment_failed",
        targetType: "PaymentCharge",
        targetId: charge.id,
        resultStatus: "failed",
        reason: "Asaas informou falha ou inadimplencia da cobranca.",
        beforeSummary: {
          previousStatus: charge.status,
          externalChargeId: charge.externalChargeId
        } as Prisma.InputJsonValue,
        afterSummary: {
          paymentStatus,
          activationId: charge.activation.id,
          whatsappInstanceId: charge.activation.whatsappInstanceId
        } as Prisma.InputJsonValue
      });

      return {
        processed: true,
        status: "failed",
        chargeId: charge.id,
        activationId: charge.activation.id,
        whatsappInstanceId: charge.activation.whatsappInstanceId
      };
    }

    const providerActivation = await this.prepareProviderActivation(
      charge.activation.whatsappInstance
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentCharge.update({
        where: { id: charge.id },
        data: {
          status: "paid",
          paidAt: new Date()
        }
      });
      await tx.whatsappInstanceActivation.update({
        where: { id: charge.activation!.id },
        data: {
          status: "active",
          activatedAt: new Date()
        }
      });
      await tx.whatsappInstance.update({
        where: { id: charge.activation!.whatsappInstanceId },
        data: {
          status: "active",
          ...providerActivation.updateData
        }
      });
      const activeInstances = await tx.whatsappInstance.count({
        where: {
          workspaceId: charge.workspaceId,
          status: "active"
        }
      });
      const subscription = await tx.workspaceSubscription.findFirst({
        where: {
          workspaceId: charge.workspaceId
        },
        orderBy: {
          updatedAt: "desc"
        }
      });

      if (subscription) {
        await tx.workspaceSubscription.update({
          where: { id: subscription.id },
          data: {
            status: "active",
            activeInstances
          }
        });
      } else {
        await tx.workspaceSubscription.create({
          data: {
            workspaceId: charge.workspaceId,
            status: "active",
            activeInstances
          }
        });
      }
    });
    await this.recordBillingAudit({
      workspaceId: charge.workspaceId,
      action: "billing.payment_confirmed",
      targetType: "PaymentCharge",
      targetId: charge.id,
      resultStatus: "paid",
      reason: "Asaas confirmou o pagamento da cobranca.",
      beforeSummary: {
        previousStatus: charge.status,
        externalChargeId: charge.externalChargeId
      } as Prisma.InputJsonValue,
      afterSummary: {
        paymentStatus,
        activationId: charge.activation.id,
        whatsappInstanceId: charge.activation.whatsappInstanceId
      } as Prisma.InputJsonValue
    });
    await this.recordBillingAudit({
      workspaceId: charge.workspaceId,
      action: "billing.whatsapp_instance_activated",
      targetType: "WhatsappInstance",
      targetId: charge.activation.whatsappInstanceId,
      resultStatus: "active",
      reason: "Instancia liberada apos confirmacao de pagamento Asaas.",
      beforeSummary: {
        activationStatus: "pending_payment",
        chargeId: charge.id
      } as Prisma.InputJsonValue,
      afterSummary: {
        activationStatus: "active",
        activationId: charge.activation.id,
        chargeId: charge.id
      } as Prisma.InputJsonValue
    });

    return {
      processed: true,
      status: "paid",
      chargeId: charge.id,
      activationId: charge.activation.id,
      whatsappInstanceId: charge.activation.whatsappInstanceId
    };
  }

  private async prepareProviderActivation(instance: {
    id: string;
    workspaceId: string;
    name: string;
    provider: string;
    providerInstanceId: string | null;
    providerTokenEncrypted?: string | null;
    providerTokenIv?: string | null;
    providerTokenTag?: string | null;
  }): Promise<{
    updateData: Prisma.WhatsappInstanceUpdateInput;
  }> {
    if (
      instance.provider !== "uazapi" ||
      instance.providerInstanceId ||
      instance.providerTokenEncrypted
    ) {
      return { updateData: {} };
    }

    const startedAt = new Date();
    const result = this.uazapiAdapter
      ? await this.uazapiAdapter.createInstance({
          name: instance.name,
          localInstanceId: instance.id,
          workspaceId: instance.workspaceId
        })
      : ({
          status: "not_configured",
          providerInstanceId: null,
          instanceToken: null,
          message: "Uazapi adapter nao configurado"
        } satisfies UazapiCreateInstanceResult);
    await this.recordUazapiInstanceCreateLog(instance, startedAt, result);

    if (
      result.status !== "created" ||
      !result.providerInstanceId ||
      !result.instanceToken ||
      !this.tokenEncryption
    ) {
      return { updateData: {} };
    }

    const encrypted = this.tokenEncryption.encrypt(result.instanceToken);

    return {
      updateData: {
        providerInstanceId: result.providerInstanceId,
        providerTokenEncrypted: encrypted.encryptedAccessToken,
        providerTokenIv: encrypted.tokenIv,
        providerTokenTag: encrypted.tokenTag
      }
    };
  }

  private async recordUazapiInstanceCreateLog(
    instance: {
      id: string;
      workspaceId: string;
      name: string;
    },
    startedAt: Date,
    result: UazapiCreateInstanceResult
  ): Promise<void> {
    const finishedAt = new Date();
    const createdWithCredentials =
      result.status === "created" &&
      Boolean(result.providerInstanceId) &&
      Boolean(result.instanceToken);
    const status =
      createdWithCredentials
        ? "success"
        : result.status === "not_configured"
          ? "blocked"
          : "error";

    try {
      await this.prisma.integrationLog.create({
        data: {
          workspaceId: instance.workspaceId,
          source: "uazapi",
          operation: "uazapi.instance.create",
          status,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          providerRequestId: result.providerInstanceId,
          providerErrorMessage:
            status === "success"
              ? null
              : result.message ?? "Uazapi nao retornou id/token da instancia",
          jobId: instance.id,
          requestSummary: {
            whatsappInstanceId: instance.id,
            instanceName: instance.name
          } as Prisma.InputJsonValue,
          responseSummary: {
            status: result.status,
            providerInstanceConfigured: Boolean(result.providerInstanceId),
            instanceTokenReceived: Boolean(result.instanceToken),
            message: result.message
          } as Prisma.InputJsonValue
        }
      });
    } catch {
      return;
    }
  }

  private getPricePerInstanceCents(): number {
    const configured = Number(
      this.env.WPPTRACK_WHATSAPP_INSTANCE_PRICE_CENTS ?? "9900"
    );

    if (!Number.isInteger(configured) || configured <= 0) {
      return 9900;
    }

    return configured;
  }

  private toSubscriptionStatus(
    status: string
  ): WorkspaceSubscriptionSummaryDto["status"] {
    if (
      status === "active" ||
      status === "pending" ||
      status === "overdue" ||
      status === "cancelled"
    ) {
      return status;
    }

    return "pending";
  }

  private toPaymentChargeStatus(
    status: string
  ): BackofficePaymentChargeDto["status"] {
    if (
      status === "pending" ||
      status === "paid" ||
      status === "failed" ||
      status === "canceled" ||
      status === "expired"
    ) {
      return status;
    }

    return "pending";
  }

  private toBackofficeSubscriptionPlanDto(
    plan: SubscriptionPlanRecord
  ): BackofficeSubscriptionPlanDto {
    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      pricePerWhatsappInstanceCents: plan.pricePerWhatsappInstanceCents,
      active: plan.active,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString()
    };
  }

  private isPaymentChargeStatus(
    status: string | undefined
  ): status is BackofficePaymentChargeDto["status"] {
    return (
      status === "pending" ||
      status === "paid" ||
      status === "failed" ||
      status === "canceled" ||
      status === "expired"
    );
  }

  private getAsaasPaymentStatus(
    payload: AsaasPaymentWebhookPayload
  ): "ignored" | "paid" | "failed" {
    const event = this.firstString(payload.event)?.toUpperCase();
    const payment = this.getPaymentPayload(payload);
    const paymentStatus = this.firstString(payment.status)?.toUpperCase();

    if (
      event === "PAYMENT_RECEIVED" ||
      event === "PAYMENT_CONFIRMED" ||
      paymentStatus === "RECEIVED" ||
      paymentStatus === "CONFIRMED"
    ) {
      return "paid";
    }

    if (
      event === "PAYMENT_OVERDUE" ||
      event === "PAYMENT_DELETED" ||
      event === "PAYMENT_REFUNDED" ||
      event === "PAYMENT_CHARGEBACK_REQUESTED" ||
      event === "PAYMENT_CHARGEBACK_DISPUTE" ||
      event === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL" ||
      paymentStatus === "OVERDUE" ||
      paymentStatus === "DELETED" ||
      paymentStatus === "REFUNDED" ||
      paymentStatus === "CHARGEBACK_REQUESTED" ||
      paymentStatus === "CHARGEBACK_DISPUTE" ||
      paymentStatus === "AWAITING_CHARGEBACK_REVERSAL"
    ) {
      return "failed";
    }

    return "ignored";
  }

  private getAsaasPaymentId(
    payload: AsaasPaymentWebhookPayload
  ): string | undefined {
    const payment = this.getPaymentPayload(payload);

    return (
      this.firstString(payment.id) ??
      this.firstString(payment.paymentId) ??
      this.firstString(payload.paymentId)
    );
  }

  private getPaymentPayload(
    payload: AsaasPaymentWebhookPayload
  ): Record<string, unknown> {
    return payload.payment &&
      typeof payload.payment === "object" &&
      !Array.isArray(payload.payment)
      ? (payload.payment as Record<string, unknown>)
      : {};
  }

  private firstString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }
}
