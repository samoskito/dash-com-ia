import { Inject, Injectable } from "@nestjs/common";
import type {
  WhatsappInstanceCheckoutDto,
  WhatsappInstanceCheckoutInputDto,
  WhatsappInstanceQuoteDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

type BillingEnv = Record<string, string | undefined>;

@Injectable()
export class BillingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly env: BillingEnv = process.env
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

    return this.prisma.$transaction(async (tx) => {
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
          status: "pending",
          amountCents,
          description: `Ativacao da instancia WhatsApp ${input.instanceName}`,
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
        workspaceId,
        whatsappInstanceId: whatsappInstance.id,
        activationId: activation.id,
        chargeId: charge.id,
        status: "pending_payment",
        amountCents,
        checkoutUrl: charge.checkoutUrl
      };
    });
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
}
