import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  type WhatsappSeat,
  type WhatsappSeatProvider
} from "@prisma/client";
import type {
  WhatsappSeatDto,
  WhatsappSeatReservationInputDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import {
  assertPackageCapacity,
  contractAllowsWhatsappAccess
} from "./package-billing.policy";

type TransactionClient = Prisma.TransactionClient;

type ExternalChannelSeatInput = {
  workspaceId: string;
  channelId: string;
  provider: Extract<WhatsappSeatProvider, "umbler" | "gupshup">;
  normalizedPhone: string | null;
  actorUserId?: string;
};

@Injectable()
export class WhatsappSeatService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration
  ) {}

  async listWorkspaceSeats(workspaceId: string): Promise<WhatsappSeatDto[]> {
    const seats = await this.prisma.whatsappSeat.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" }
    });

    return seats.map((seat) => this.mapSeat(seat));
  }

  async reserveSeat(
    workspaceId: string,
    input: WhatsappSeatReservationInputDto,
    actorUserId?: string
  ): Promise<WhatsappSeatDto> {
    try {
      const seat = await this.prisma.$transaction(
        async (transaction) => {
          await this.lockWorkspace(transaction, workspaceId);
          await this.expireReservations(
            transaction,
            workspaceId,
            new Date(),
            actorUserId
          );

          const existing = await transaction.whatsappSeat.findFirst({
            where: {
              workspaceId,
              status: { in: ["reserved", "active", "suspended"] },
              ...(input.whatsappInstanceId
                ? { whatsappInstanceId: input.whatsappInstanceId }
                : {
                    inboundWebhookChannelId: input.inboundWebhookChannelId
                  })
            },
            orderBy: { createdAt: "desc" }
          });

          if (existing) {
            return existing;
          }

          const contract =
            await transaction.workspaceSubscription.findFirst({
              where: {
                workspaceId,
                isCurrent: true,
                planNameSnapshot: { not: null }
              },
              orderBy: { createdAt: "desc" }
            });

          if (
            !contract ||
            !contractAllowsWhatsappAccess(
              contract.contractStatus,
              new Date(),
              contract.accessEndsAt
            )
          ) {
            throw new Error("workspace_without_active_contract");
          }

          const occupied = await transaction.whatsappSeat.count({
            where: {
              workspaceId,
              subscriptionId: contract.id,
              status: { in: ["reserved", "active", "suspended"] }
            }
          });
          assertPackageCapacity(
            contract.includedWhatsappNumbersSnapshot ?? 0,
            occupied
          );

          const reservationExpiresAt = new Date(
            Date.now() +
              this.configuration.reservationTtlMinutes() * 60 * 1000
          );

          const created = await transaction.whatsappSeat.create({
            data: {
              workspaceId,
              subscriptionId: contract.id,
              provider: input.provider,
              normalizedPhone: input.normalizedPhone ?? null,
              whatsappInstanceId: input.whatsappInstanceId ?? null,
              inboundWebhookChannelId:
                input.inboundWebhookChannelId ?? null,
              status: "reserved",
              reservationExpiresAt
            }
          });

          await transaction.billingContractAudit.create({
            data: {
              workspaceId,
              subscriptionId: contract.id,
              actorUserId,
              actorType: actorUserId ? "user" : "system",
              action: "seat.reserved",
              reason: input.provider,
              afterSnapshot: this.seatSnapshot(created)
            }
          });

          return created;
        },
        { isolationLevel: "Serializable" }
      );

      return this.mapSeat(seat);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "workspace_without_active_contract"
      ) {
        throw new ConflictException(
          "Workspace sem contrato com acesso ativo"
        );
      }

      if (
        error instanceof Error &&
        error.message === "package_capacity_exhausted"
      ) {
        throw new ConflictException("Todas as vagas do pacote estao ocupadas");
      }

      throw error;
    }
  }

  async activateSeat(
    workspaceId: string,
    seatId: string,
    normalizedPhone?: string | null,
    actorUserId?: string
  ): Promise<WhatsappSeatDto> {
    const seat = await this.requireWorkspaceSeat(workspaceId, seatId);

    if (seat.status === "released") {
      throw new ConflictException("Vaga ja liberada");
    }

    if (
      seat.status === "active" &&
      (normalizedPhone == null || normalizedPhone === seat.normalizedPhone)
    ) {
      return this.mapSeat(seat);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const activated = await transaction.whatsappSeat.update({
        where: { id: seat.id },
        data: {
          status: "active",
          normalizedPhone: normalizedPhone ?? seat.normalizedPhone,
          activatedAt: seat.activatedAt ?? new Date(),
          reservationExpiresAt: null,
          suspendedAt: null,
          releasedAt: null,
          releaseReason: null
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId,
          subscriptionId: seat.subscriptionId,
          actorUserId,
          actorType: actorUserId ? "user" : "system",
          action: "seat.activated",
          reason: seat.status === "reserved" ? "provider_connected" : "reactivated",
          beforeSnapshot: this.seatSnapshot(seat),
          afterSnapshot: this.seatSnapshot(activated)
        }
      });

      return activated;
    });

    return this.mapSeat(updated);
  }

  async activateExternalChannelSeat(
    transaction: TransactionClient,
    input: ExternalChannelSeatInput
  ): Promise<WhatsappSeat> {
    await this.lockWorkspace(transaction, input.workspaceId);
    await this.expireReservations(
      transaction,
      input.workspaceId,
      new Date(),
      input.actorUserId
    );

    const existing = await transaction.whatsappSeat.findFirst({
      where: {
        workspaceId: input.workspaceId,
        inboundWebhookChannelId: input.channelId,
        status: { in: ["reserved", "active", "suspended"] }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      if (existing.status === "active") {
        return existing;
      }

      const reactivated = await transaction.whatsappSeat.update({
        where: { id: existing.id },
        data: {
          provider: input.provider,
          normalizedPhone: input.normalizedPhone,
          status: "active",
          activatedAt: existing.activatedAt ?? new Date(),
          reservationExpiresAt: null,
          suspendedAt: null,
          releasedAt: null,
          releaseReason: null
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId: input.workspaceId,
          subscriptionId: reactivated.subscriptionId,
          actorUserId: input.actorUserId,
          actorType: input.actorUserId ? "user" : "system",
          action: "seat.external_channel_reactivated",
          reason: input.provider,
          beforeSnapshot: this.seatSnapshot(existing),
          afterSnapshot: this.seatSnapshot(reactivated)
        }
      });

      return reactivated;
    }

    const contract = await transaction.workspaceSubscription.findFirst({
      where: {
        workspaceId: input.workspaceId,
        isCurrent: true,
        planNameSnapshot: { not: null }
      },
      orderBy: { createdAt: "desc" }
    });

    if (
      !contract ||
      !contractAllowsWhatsappAccess(
        contract.contractStatus,
        new Date(),
        contract.accessEndsAt
      )
    ) {
      throw new ConflictException("Workspace sem contrato com acesso ativo");
    }

    const occupied = await transaction.whatsappSeat.count({
      where: {
        workspaceId: input.workspaceId,
        subscriptionId: contract.id,
        status: { in: ["reserved", "active", "suspended"] }
      }
    });

    try {
      assertPackageCapacity(
        contract.includedWhatsappNumbersSnapshot ?? 0,
        occupied
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "package_capacity_exhausted"
      ) {
        throw new ConflictException("Todas as vagas do pacote estao ocupadas");
      }
      throw error;
    }

    const created = await transaction.whatsappSeat.create({
      data: {
        workspaceId: input.workspaceId,
        subscriptionId: contract.id,
        provider: input.provider,
        normalizedPhone: input.normalizedPhone,
        inboundWebhookChannelId: input.channelId,
        status: "active",
        activatedAt: new Date()
      }
    });

    await transaction.billingContractAudit.create({
      data: {
        workspaceId: input.workspaceId,
        subscriptionId: contract.id,
        actorUserId: input.actorUserId,
        actorType: input.actorUserId ? "user" : "system",
        action: "seat.external_channel_activated",
        reason: input.provider,
        afterSnapshot: this.seatSnapshot(created)
      }
    });

    return created;
  }

  async releaseExternalChannelSeat(
    transaction: TransactionClient,
    input: Pick<
      ExternalChannelSeatInput,
      "workspaceId" | "channelId" | "actorUserId"
    > & { reason: string }
  ): Promise<WhatsappSeat | null> {
    await this.lockWorkspace(transaction, input.workspaceId);

    const existing = await transaction.whatsappSeat.findFirst({
      where: {
        workspaceId: input.workspaceId,
        inboundWebhookChannelId: input.channelId,
        status: { in: ["reserved", "active", "suspended"] }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!existing) {
      return null;
    }

    const released = await transaction.whatsappSeat.update({
      where: { id: existing.id },
      data: {
        status: "released",
        releasedAt: new Date(),
        releaseReason: input.reason,
        reservationExpiresAt: null
      }
    });

    await transaction.billingContractAudit.create({
      data: {
        workspaceId: input.workspaceId,
        subscriptionId: existing.subscriptionId,
        actorUserId: input.actorUserId,
        actorType: input.actorUserId ? "user" : "system",
        action: "seat.external_channel_released",
        reason: input.reason,
        beforeSnapshot: this.seatSnapshot(existing),
        afterSnapshot: this.seatSnapshot(released)
      }
    });

    return released;
  }

  async suspendSeat(
    workspaceId: string,
    seatId: string,
    reason: string
  ): Promise<WhatsappSeatDto> {
    const seat = await this.requireWorkspaceSeat(workspaceId, seatId);

    if (seat.status === "released") {
      return this.mapSeat(seat);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const suspended = await transaction.whatsappSeat.update({
        where: { id: seat.id },
        data: {
          status: "suspended",
          suspendedAt: seat.suspendedAt ?? new Date(),
          reservationExpiresAt: null
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId,
          subscriptionId: seat.subscriptionId,
          actorType: "system",
          action: "seat.suspended",
          reason,
          beforeSnapshot: this.seatSnapshot(seat),
          afterSnapshot: this.seatSnapshot(suspended)
        }
      });

      return suspended;
    });

    return this.mapSeat(updated);
  }

  async reactivateSeat(
    workspaceId: string,
    seatId: string,
    actorUserId?: string
  ): Promise<WhatsappSeatDto> {
    const seat = await this.requireWorkspaceSeat(workspaceId, seatId);

    if (seat.status !== "suspended") {
      return this.mapSeat(seat);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const reactivated = await transaction.whatsappSeat.update({
        where: { id: seat.id },
        data: {
          status: "active",
          suspendedAt: null,
          activatedAt: seat.activatedAt ?? new Date()
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId,
          subscriptionId: seat.subscriptionId,
          actorUserId,
          actorType: actorUserId ? "user" : "system",
          action: "seat.reactivated",
          reason: "contract_access_restored",
          beforeSnapshot: this.seatSnapshot(seat),
          afterSnapshot: this.seatSnapshot(reactivated)
        }
      });

      return reactivated;
    });

    return this.mapSeat(updated);
  }

  async releaseSeat(
    workspaceId: string,
    seatId: string,
    reason: string,
    actorUserId?: string
  ): Promise<WhatsappSeatDto> {
    const seat = await this.requireWorkspaceSeat(workspaceId, seatId);

    if (seat.status === "released") {
      return this.mapSeat(seat);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const released = await transaction.whatsappSeat.update({
        where: { id: seat.id },
        data: {
          status: "released",
          releasedAt: new Date(),
          releaseReason: reason,
          reservationExpiresAt: null
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId,
          subscriptionId: seat.subscriptionId,
          actorUserId,
          actorType: actorUserId ? "user" : "system",
          action: "seat.released",
          reason,
          beforeSnapshot: this.seatSnapshot(seat),
          afterSnapshot: this.seatSnapshot(released)
        }
      });

      return released;
    });

    return this.mapSeat(updated);
  }

  async expireAllReservations(now = new Date()): Promise<number> {
    const workspaces = await this.prisma.whatsappSeat.findMany({
      where: {
        status: "reserved",
        reservationExpiresAt: { lte: now }
      },
      distinct: ["workspaceId"],
      select: { workspaceId: true }
    });

    let expired = 0;
    for (const workspace of workspaces) {
      expired += await this.prisma.$transaction(
        async (transaction) => {
          await this.lockWorkspace(transaction, workspace.workspaceId);
          return this.expireReservations(
            transaction,
            workspace.workspaceId,
            now
          );
        },
        { isolationLevel: "Serializable" }
      );
    }

    return expired;
  }

  async suspendSubscriptionSeats(
    transaction: TransactionClient,
    subscriptionId: string,
    reason: string,
    now: Date
  ): Promise<number> {
    const seats = await transaction.whatsappSeat.findMany({
      where: {
        subscriptionId,
        status: { in: ["active", "reserved"] }
      }
    });

    for (const seat of seats) {
      const suspended = await transaction.whatsappSeat.update({
        where: { id: seat.id },
        data: {
          status: "suspended",
          suspendedAt: now,
          reservationExpiresAt: null
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId: seat.workspaceId,
          subscriptionId: seat.subscriptionId,
          actorType: "system",
          action: "seat.suspended",
          reason,
          beforeSnapshot: this.seatSnapshot(seat),
          afterSnapshot: this.seatSnapshot(suspended)
        }
      });
    }

    return seats.length;
  }

  async bindWorkspaceSeatsToContract(
    transaction: TransactionClient,
    workspaceId: string,
    subscriptionId: string,
    reason: string,
    now: Date
  ): Promise<number> {
    const seats = await transaction.whatsappSeat.findMany({
      where: {
        workspaceId,
        status: { in: ["reserved", "active", "suspended"] }
      }
    });

    let changed = 0;
    for (const seat of seats) {
      const nextStatus = seat.status === "reserved" ? "reserved" : "active";
      if (
        seat.subscriptionId === subscriptionId &&
        seat.status === nextStatus
      ) {
        continue;
      }

      const rebound = await transaction.whatsappSeat.update({
        where: { id: seat.id },
        data: {
          subscriptionId,
          status: nextStatus,
          activatedAt:
            nextStatus === "active" ? seat.activatedAt ?? now : seat.activatedAt,
          suspendedAt: nextStatus === "active" ? null : seat.suspendedAt
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId,
          subscriptionId,
          actorType: "system",
          action:
            seat.status === "suspended"
              ? "seat.reactivated"
              : "seat.contract_rebound",
          reason,
          beforeSnapshot: this.seatSnapshot(seat),
          afterSnapshot: this.seatSnapshot(rebound)
        }
      });
      changed += 1;
    }

    return changed;
  }

  mapSeat(seat: WhatsappSeat): WhatsappSeatDto {
    return {
      id: seat.id,
      workspaceId: seat.workspaceId,
      subscriptionId: seat.subscriptionId,
      provider: seat.provider,
      status: seat.status,
      normalizedPhone: seat.normalizedPhone,
      whatsappInstanceId: seat.whatsappInstanceId,
      inboundWebhookChannelId: seat.inboundWebhookChannelId,
      reservationExpiresAt:
        seat.reservationExpiresAt?.toISOString() ?? null,
      activatedAt: seat.activatedAt?.toISOString() ?? null,
      suspendedAt: seat.suspendedAt?.toISOString() ?? null,
      releasedAt: seat.releasedAt?.toISOString() ?? null
    };
  }

  private async requireWorkspaceSeat(
    workspaceId: string,
    seatId: string
  ): Promise<WhatsappSeat> {
    const seat = await this.prisma.whatsappSeat.findFirst({
      where: { id: seatId, workspaceId }
    });

    if (!seat) {
      throw new NotFoundException("Vaga de WhatsApp nao encontrada");
    }

    return seat;
  }

  private async expireReservations(
    transaction: TransactionClient,
    workspaceId: string,
    now = new Date(),
    actorUserId?: string
  ): Promise<number> {
    const seats = await transaction.whatsappSeat.findMany({
      where: {
        workspaceId,
        status: "reserved",
        reservationExpiresAt: { lte: now }
      }
    });

    for (const seat of seats) {
      const released = await transaction.whatsappSeat.update({
        where: { id: seat.id },
        data: {
          status: "released",
          releasedAt: now,
          releaseReason: "reservation_expired",
          reservationExpiresAt: null
        }
      });

      await transaction.billingContractAudit.create({
        data: {
          workspaceId,
          subscriptionId: seat.subscriptionId,
          actorUserId,
          actorType: actorUserId ? "user" : "system",
          action: "seat.reservation_expired",
          reason: "reservation_expired",
          beforeSnapshot: this.seatSnapshot(seat),
          afterSnapshot: this.seatSnapshot(released)
        }
      });
    }

    return seats.length;
  }

  private async lockWorkspace(
    transaction: TransactionClient,
    workspaceId: string
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`
    );
  }

  private seatSnapshot(seat: WhatsappSeat): Prisma.InputJsonObject {
    return {
      id: seat.id,
      provider: seat.provider,
      status: seat.status,
      normalizedPhone: seat.normalizedPhone,
      whatsappInstanceId: seat.whatsappInstanceId,
      inboundWebhookChannelId: seat.inboundWebhookChannelId,
      reservationExpiresAt:
        seat.reservationExpiresAt?.toISOString() ?? null,
      activatedAt: seat.activatedAt?.toISOString() ?? null,
      suspendedAt: seat.suspendedAt?.toISOString() ?? null,
      releasedAt: seat.releasedAt?.toISOString() ?? null
    };
  }
}
