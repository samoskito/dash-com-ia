import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";

const PARSER_VERSION = "v1";

/** Seat states that mean the workspace is really paying for that number. */
const OCCUPYING_SEAT_STATUSES = ["active", "suspended"] as const;

export type UazapiBridgeInstance = {
  id: string;
  workspaceId: string;
  name: string;
  providerInstanceId: string | null;
  providerTokenEncrypted?: string | null;
  providerTokenIv?: string | null;
  providerTokenTag?: string | null;
};

export type UazapiBridgeResult = {
  connectionId: string;
  channelId: string;
};

export type UazapiBridgeRetirement = {
  whatsappInstanceId: string;
  connectionId: string;
  channelId: string;
  migratedToConnectionId: string | null;
  migratedRuleIds: string[];
};

type BridgeMigrationTarget = {
  connectionId: string;
  channelId: string;
};

/**
 * U2c: bridges a UAZAPI/NOD WhatsappInstance into an InboundWebhookConnection +
 * InboundWebhookChannel pair so it shows up in the same "Gatilhos" builder
 * (Settings) that Umbler/Gupshup use, and so message_phrase provider-conversion
 * rules can be scoped to it via ProviderConversionRuleConfig.channels.
 *
 * One instance <-> one connection <-> one channel (InboundWebhookChannel.
 * whatsappInstanceId is unique). Idempotent: safe to call on every webhook and
 * on every Settings load.
 */
@Injectable()
export class UazapiConversionBridgeService {
  private readonly logger = new Logger(UazapiConversionBridgeService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ensureBridge(
    instance: UazapiBridgeInstance,
  ): Promise<UazapiBridgeResult> {
    const existing = await this.findExisting(instance);
    if (existing) return existing;

    return this.prisma.$transaction(async (transaction) => {
      // Re-check inside the transaction: two concurrent webhooks for the same
      // instance must not create two connections.
      const current = await transaction.inboundWebhookChannel.findUnique({
        where: { whatsappInstanceId: instance.id },
        select: { id: true, connectionId: true, workspaceId: true },
      });
      if (current && current.workspaceId === instance.workspaceId) {
        return { connectionId: current.connectionId, channelId: current.id };
      }

      const release = await transaction.inboundWebhookParserRelease.upsert({
        where: {
          provider_version: {
            provider: "uazapi",
            version: PARSER_VERSION,
          },
        },
        create: {
          provider: "uazapi",
          version: PARSER_VERSION,
          // UAZAPI messages are evaluated straight off the decision engine
          // (no reparse step), so there is no separate parser certification
          // workflow to gate on here.
          status: "certified",
          certifiedAt: new Date(),
        },
        update: {},
      });

      const connection = await transaction.inboundWebhookConnection.create({
        data: {
          workspaceId: instance.workspaceId,
          provider: "uazapi",
          displayName: instance.name?.trim() || "UAZAPI",
          parserReleaseId: release.id,
          status: "observation",
        },
        select: { id: true },
      });

      const channel = await transaction.inboundWebhookChannel.create({
        data: {
          workspaceId: instance.workspaceId,
          connectionId: connection.id,
          organizationId: instance.id,
          providerChannelId: instance.providerInstanceId || instance.id,
          // The business's own WhatsApp number isn't captured by the uazapi
          // parser yet; fall back to a stable non-empty identifier so the
          // channel DTO stays valid until it's known.
          connectedPhone: instance.providerInstanceId?.trim() || instance.id,
          channelName: instance.name,
          whatsappInstanceId: instance.id,
        },
        select: { id: true },
      });

      this.logger.log(
        JSON.stringify({
          event: "uazapi_conversion_bridge_provisioned",
          workspaceId: instance.workspaceId,
          whatsappInstanceId: instance.id,
          connectionId: connection.id,
          channelId: channel.id,
        }),
      );

      return { connectionId: connection.id, channelId: channel.id };
    });
  }

  /**
   * Soft-removes the inbound connection bridged to a UAZAPI instance that is no
   * longer a live number (removed by the user, or an abandoned QR attempt that
   * never activated a seat). The channel row and every execution/decision that
   * references it are kept — only the connection is marked `removedAt` so it
   * stops being listed as an active origin.
   *
   * When `migrateTo` is given, the provider-conversion rules scoped to the
   * retired connection are re-pointed at the live bridge so a superseded
   * connection does not silently take the workspace's rules down with it.
   * Migration is additive: the live channel is added to each rule's scope and
   * nothing is deleted.
   */
  async retireBridge(input: {
    workspaceId: string;
    whatsappInstanceId: string;
    reason: string;
    actorUserId?: string | null;
    migrateTo?: BridgeMigrationTarget | null;
  }): Promise<UazapiBridgeRetirement | null> {
    return this.prisma.$transaction(async (transaction) => {
      const channel = await transaction.inboundWebhookChannel.findFirst({
        where: {
          workspaceId: input.workspaceId,
          whatsappInstanceId: input.whatsappInstanceId,
        },
        select: {
          id: true,
          connectionId: true,
          connection: {
            select: { status: true, productionActivatedAt: true },
          },
        },
      });
      if (!channel) return null;

      // Fail closed: a connection that was promoted to production is never
      // retired automatically — an operator has to decide.
      if (
        channel.connection.status === "production" ||
        channel.connection.productionActivatedAt !== null
      ) {
        return null;
      }

      const removedAt = new Date();
      const claimed = await transaction.inboundWebhookConnection.updateMany({
        where: {
          id: channel.connectionId,
          workspaceId: input.workspaceId,
          removedAt: null,
        },
        data: {
          status: "paused",
          secretHash: null,
          productionActivatedAt: null,
          removedAt,
          updatedAt: removedAt,
        },
      });
      // Already retired, or claimed by a concurrent reconcile.
      if (claimed.count !== 1) return null;

      const migratedRuleIds = input.migrateTo
        ? await this.migrateRuleScopes(transaction, {
            workspaceId: input.workspaceId,
            fromConnectionId: channel.connectionId,
            fromChannelId: channel.id,
            target: input.migrateTo,
          })
        : [];

      const retirement: UazapiBridgeRetirement = {
        whatsappInstanceId: input.whatsappInstanceId,
        connectionId: channel.connectionId,
        channelId: channel.id,
        migratedToConnectionId: input.migrateTo?.connectionId ?? null,
        migratedRuleIds,
      };

      await transaction.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId ?? null,
          actorType: input.actorUserId ? "user" : "system",
          action: "inbound_webhook.uazapi_bridge_retired",
          targetType: "InboundWebhookConnection",
          targetId: channel.connectionId,
          reason: input.reason,
          resultStatus: "removed",
          afterSummary: {
            whatsappInstanceId: input.whatsappInstanceId,
            channelId: channel.id,
            migratedToConnectionId: retirement.migratedToConnectionId,
            migratedRuleIds,
          },
        },
      });

      this.logger.log(
        JSON.stringify({
          event: "uazapi_conversion_bridge_retired",
          workspaceId: input.workspaceId,
          reason: input.reason,
          ...retirement,
        }),
      );

      return retirement;
    });
  }

  /**
   * Collapses the duplicate origins a workspace accumulates when the NOD QR
   * flow is started more than once: every extra attempt creates its own
   * WhatsappInstance, and `ensureBridge` keys off that id, so each attempt gets
   * its own connection card even though only one number was ever connected.
   *
   * A bridge is superseded when its instance never activated a seat and has no
   * QR reservation still running, while exactly one sibling bridge does hold a
   * seat. Anything ambiguous (no live seat, or two live seats — a genuine
   * multi-number workspace) is left untouched.
   */
  async reconcileWorkspaceBridges(
    workspaceId: string,
    now = new Date(),
  ): Promise<UazapiBridgeRetirement[]> {
    const channels = await this.prisma.inboundWebhookChannel.findMany({
      where: {
        workspaceId,
        whatsappInstanceId: { not: null },
        connection: { provider: "uazapi", removedAt: null },
      },
      select: {
        id: true,
        connectionId: true,
        whatsappInstanceId: true,
        connection: { select: { status: true, productionActivatedAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    if (channels.length < 2) return [];

    const instanceIds = channels.map((channel) => channel.whatsappInstanceId!);
    const seats = await this.prisma.whatsappSeat.findMany({
      where: { workspaceId, whatsappInstanceId: { in: instanceIds } },
      select: {
        whatsappInstanceId: true,
        status: true,
        activatedAt: true,
        reservationExpiresAt: true,
      },
    });

    const seatsByInstance = new Map<string, typeof seats>();
    for (const seat of seats) {
      if (!seat.whatsappInstanceId) continue;
      const bucket = seatsByInstance.get(seat.whatsappInstanceId) ?? [];
      bucket.push(seat);
      seatsByInstance.set(seat.whatsappInstanceId, bucket);
    }

    const live = channels.filter((channel) =>
      (seatsByInstance.get(channel.whatsappInstanceId!) ?? []).some((seat) =>
        (OCCUPYING_SEAT_STATUSES as readonly string[]).includes(seat.status),
      ),
    );
    // Exactly one live number is the only unambiguous case: with none we cannot
    // tell which bridge is real, and with several the workspace legitimately
    // runs multiple numbers.
    if (live.length !== 1) return [];

    const target: BridgeMigrationTarget = {
      connectionId: live[0].connectionId,
      channelId: live[0].id,
    };
    const retirements: UazapiBridgeRetirement[] = [];

    for (const channel of channels) {
      if (channel.connectionId === target.connectionId) continue;
      if (
        channel.connection.status === "production" ||
        channel.connection.productionActivatedAt !== null
      ) {
        continue;
      }

      const instanceSeats =
        seatsByInstance.get(channel.whatsappInstanceId!) ?? [];
      const everConnected = instanceSeats.some(
        (seat) => seat.activatedAt !== null,
      );
      const qrStillRunning = instanceSeats.some(
        (seat) =>
          seat.status === "reserved" &&
          seat.reservationExpiresAt !== null &&
          seat.reservationExpiresAt.getTime() > now.getTime(),
      );
      if (everConnected || qrStillRunning) continue;

      const retirement = await this.retireBridge({
        workspaceId,
        whatsappInstanceId: channel.whatsappInstanceId!,
        reason: "uazapi_bridge_superseded_by_connected_instance",
        migrateTo: target,
      });
      if (retirement) retirements.push(retirement);
    }

    return retirements;
  }

  private async migrateRuleScopes(
    transaction: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      fromConnectionId: string;
      fromChannelId: string;
      target: BridgeMigrationTarget;
    },
  ): Promise<string[]> {
    const configs = await transaction.providerConversionRuleConfig.findMany({
      where: {
        workspaceId: input.workspaceId,
        connectionId: input.fromConnectionId,
        removedAt: null,
      },
      select: { id: true },
    });
    if (configs.length === 0) return [];

    for (const config of configs) {
      await transaction.providerConversionRuleConfig.update({
        where: { id: config.id },
        data: { connectionId: input.target.connectionId },
      });
      // Additive: the live channel joins the rule scope, the stale scope row is
      // left alone. The retired channel receives no traffic, so it cannot match.
      await transaction.providerConversionRuleChannel.createMany({
        data: [
          {
            workspaceId: input.workspaceId,
            providerRuleId: config.id,
            channelId: input.target.channelId,
          },
        ],
        skipDuplicates: true,
      });
    }

    return configs.map((config) => config.id);
  }

  private async findExisting(
    instance: UazapiBridgeInstance,
  ): Promise<UazapiBridgeResult | null> {
    const channel = await this.prisma.inboundWebhookChannel.findUnique({
      where: { whatsappInstanceId: instance.id },
      select: { id: true, connectionId: true, workspaceId: true },
    });

    return channel && channel.workspaceId === instance.workspaceId
      ? { connectionId: channel.connectionId, channelId: channel.id }
      : null;
  }
}
