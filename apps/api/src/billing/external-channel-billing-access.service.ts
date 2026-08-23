import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { normalizePhoneIdentityWithCountry } from "../common/phone/phone-identity";
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

    if (seat) {
      return;
    }

    const instanceSeat = await this.findActiveInstanceSeat(
      workspaceId,
      contract.id,
      channelId,
    );

    if (!instanceSeat) {
      throw new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      );
    }
  }

  /**
   * UAZAPI/NOD channels never get an "external channel" seat: activation skips
   * it on purpose because the number is already billed as a WhatsappInstance
   * seat (see inbound-webhook-production-activation.ts), and creating a second
   * seat would double-charge the workspace. So for those channels the instance
   * seat itself is the paid entitlement — as long as it is active, on the same
   * workspace + current subscription, and points at this channel's instance or
   * connected phone. Anything looser (or a non-UAZAPI provider) stays blocked.
   */
  private async findActiveInstanceSeat(
    workspaceId: string,
    subscriptionId: string,
    channelId: string,
  ): Promise<{ id: string } | null> {
    const channel = await this.prisma.inboundWebhookChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        whatsappInstanceId: true,
        connectedPhone: true,
        connection: { select: { provider: true } },
      },
    });

    if (!channel || channel.connection.provider !== "uazapi") {
      return null;
    }

    const identityMatches: Prisma.WhatsappSeatWhereInput[] = [];

    if (channel.whatsappInstanceId) {
      identityMatches.push({ whatsappInstanceId: channel.whatsappInstanceId });
    }

    const normalizedPhone = normalizePhoneIdentityWithCountry(
      channel.connectedPhone || undefined,
    );

    if (normalizedPhone) {
      identityMatches.push({ normalizedPhone });
    }

    if (identityMatches.length === 0) {
      return null;
    }

    return this.prisma.whatsappSeat.findFirst({
      where: {
        workspaceId,
        subscriptionId,
        provider: "uazapi",
        status: "active",
        OR: identityMatches,
      },
      select: { id: true },
    });
  }
}
