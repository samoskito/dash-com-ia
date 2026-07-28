import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { contractAllowsWhatsappAccess } from "./package-billing.policy";

export const externalChannelBillingErrorCodes = [
  "external_channel_billing_contract_inactive",
  "external_channel_billing_seat_inactive",
] as const;

export type ExternalChannelBillingErrorCode =
  (typeof externalChannelBillingErrorCodes)[number];

export class ExternalChannelBillingAccessError extends Error {
  constructor(readonly code: ExternalChannelBillingErrorCode) {
    super("External WhatsApp channel billing access denied");
    this.name = "ExternalChannelBillingAccessError";
  }
}

@Injectable()
export class ExternalChannelBillingAccessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
  ) {}

  isEnforced(): boolean {
    return (
      this.configuration.isPackageBillingEnabled() &&
      this.configuration.isExternalChannelEnforcementEnabled()
    );
  }

  async assertProductionAccess(
    workspaceId: string,
    channelId: string,
  ): Promise<void> {
    if (!this.isEnforced()) {
      return;
    }

    const contract = await this.prisma.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        isCurrent: true,
        planNameSnapshot: { not: null },
      },
      select: {
        id: true,
        contractStatus: true,
        accessEndsAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (
      !contract ||
      !contractAllowsWhatsappAccess(
        contract.contractStatus,
        new Date(),
        contract.accessEndsAt,
      )
    ) {
      throw new ExternalChannelBillingAccessError(
        "external_channel_billing_contract_inactive",
      );
    }

    const seat = await this.prisma.whatsappSeat.findFirst({
      where: {
        workspaceId,
        subscriptionId: contract.id,
        inboundWebhookChannelId: channelId,
        status: "active",
      },
      select: { id: true },
    });

    if (!seat) {
      throw new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      );
    }
  }
}
