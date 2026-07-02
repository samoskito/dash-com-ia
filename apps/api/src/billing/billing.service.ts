import { Inject, Injectable, Optional } from "@nestjs/common";
import type {
  WhatsappInstanceCheckoutDto,
  WhatsappInstanceCheckoutInputDto,
  WhatsappInstanceQuoteDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { AsaasAdapter } from "./asaas.adapter";

type AsaasPaymentWebhookPayload = Record<string, unknown>;

export type AsaasPaymentProcessingResult = {
  processed: boolean;
  status: "ignored" | "paid";
  chargeId?: string;
  activationId?: string;
  whatsappInstanceId?: string;
};

type PaymentChargeWithActivation = {
  id: string;
  status: string;
  externalChargeId: string | null;
  activation: {
    id: string;
    whatsappInstanceId: string;
  } | null;
};

type WorkspaceBillingRecord = {
  asaasCustomerId: string | null;
};

type SplitReceiverRecord = {
  walletId: string;
  percentageBps: number;
};

@Injectable()
export class BillingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AsaasAdapter) private readonly asaasAdapter: AsaasAdapter,
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

  async createWhatsappInstanceCheckout(
    workspaceId: string,
    input: WhatsappInstanceCheckoutInputDto
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
    const asaasPayment = await this.asaasAdapter.createPayment({
      customerId: workspace?.asaasCustomerId ?? null,
      localChargeId: records.charge.id,
      amountCents,
      description,
      splitReceivers
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

  async processAsaasPaymentWebhook(
    payload: AsaasPaymentWebhookPayload
  ): Promise<AsaasPaymentProcessingResult> {
    if (!this.isPaidAsaasPayload(payload)) {
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
        activation: true
      }
    })) as PaymentChargeWithActivation | null;

    if (!charge?.activation) {
      return {
        processed: false,
        status: "ignored"
      };
    }

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
          status: "active"
        }
      });
    });

    return {
      processed: true,
      status: "paid",
      chargeId: charge.id,
      activationId: charge.activation.id,
      whatsappInstanceId: charge.activation.whatsappInstanceId
    };
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

  private isPaidAsaasPayload(payload: AsaasPaymentWebhookPayload): boolean {
    const event = this.firstString(payload.event)?.toUpperCase();
    const payment = this.getPaymentPayload(payload);
    const paymentStatus = this.firstString(payment.status)?.toUpperCase();

    return (
      event === "PAYMENT_RECEIVED" ||
      event === "PAYMENT_CONFIRMED" ||
      paymentStatus === "RECEIVED" ||
      paymentStatus === "CONFIRMED"
    );
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
