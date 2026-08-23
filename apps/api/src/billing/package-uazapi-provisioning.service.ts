import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, WhatsappInstance, WhatsappSeat } from "@prisma/client";
import type {
  UazapiPackageInstanceRemovalDto,
  UazapiPackageProvisionDto,
  WhatsappSeatDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { UazapiConversionBridgeService } from "../inbound-webhooks/uazapi-conversion-bridge.service";
import { MetaTokenEncryptionService } from "../integrations/meta/meta-token-encryption.service";
import {
  UazapiAdapter,
  type UazapiConnectionResult,
} from "../integrations/uazapi/uazapi.adapter";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { PackageContractService } from "./package-contract.service";
import { WhatsappSeatService } from "./whatsapp-seat.service";

@Injectable()
export class PackageUazapiProvisioningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(PackageContractService)
    private readonly contracts: PackageContractService,
    @Inject(WhatsappSeatService)
    private readonly seats: WhatsappSeatService,
    @Inject(UazapiAdapter)
    private readonly uazapi: UazapiAdapter,
    @Inject(MetaTokenEncryptionService)
    private readonly tokenEncryption: MetaTokenEncryptionService,
    @Inject(UazapiConversionBridgeService)
    private readonly uazapiBridge: UazapiConversionBridgeService,
  ) {}

  async provision(
    workspaceId: string,
    instanceName: string,
    actorUserId: string,
  ): Promise<UazapiPackageProvisionDto> {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isUazapiProvisioningEnabled()
    ) {
      throw new ConflictException(
        "Provisionamento NOD API por pacote ainda nao habilitado",
      );
    }

    await this.assertNoQrFlowInProgress(workspaceId);
    await this.contracts.getCurrentAccessContract(workspaceId);
    const instance = await this.prisma.whatsappInstance.create({
      data: {
        workspaceId,
        name: instanceName,
        provider: "uazapi",
        status: "pending_payment",
      },
    });

    let seat: WhatsappSeatDto;
    try {
      seat = await this.seats.reserveSeat(
        workspaceId,
        {
          provider: "uazapi",
          whatsappInstanceId: instance.id,
          inboundWebhookChannelId: null,
          normalizedPhone: null,
        },
        actorUserId,
      );
    } catch (error) {
      await this.prisma.whatsappInstance.delete({
        where: { id: instance.id },
      });
      throw error;
    }

    const startedAt = new Date();
    try {
      const created = await this.uazapi.createInstance({
        name: instanceName,
        localInstanceId: instance.id,
        workspaceId,
      });
      if (
        created.status !== "created" ||
        !created.providerInstanceId ||
        !created.instanceToken
      ) {
        throw new Error(created.message ?? "uazapi_instance_not_created");
      }

      const webhookToken = randomBytes(32).toString("base64url");
      const webhookUrl = this.instanceWebhookUrl(instance.id, webhookToken);
      const configured = await this.uazapi.configureInstanceWebhook({
        instanceToken: created.instanceToken,
        webhookUrl,
      });
      if (configured.status !== "configured") {
        throw new Error(configured.message ?? "uazapi_webhook_not_configured");
      }

      const encrypted = this.tokenEncryption.encrypt(created.instanceToken);
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: "active",
          providerInstanceId: created.providerInstanceId,
          providerTokenEncrypted: encrypted.encryptedAccessToken,
          providerTokenIv: encrypted.tokenIv,
          providerTokenTag: encrypted.tokenTag,
          webhookTokenHash: this.hashToken(webhookToken),
        },
      });

      const connection = await this.uazapi.connectInstance(
        created.providerInstanceId,
        created.instanceToken,
      );
      if (
        connection.connectionStatus === "error" ||
        connection.connectionStatus === "not_configured"
      ) {
        throw new Error(connection.message ?? "uazapi_connection_not_started");
      }
      if (connection.connectionStatus === "connected") {
        seat = await this.seats.activateSeat(
          workspaceId,
          seat.id,
          connection.connectedPhone,
          actorUserId,
        );
      }
      await this.recordLog({
        workspaceId,
        instanceId: instance.id,
        seatId: seat.id,
        actorUserId,
        startedAt,
        status: "success",
        providerInstanceId: created.providerInstanceId,
        message: connection.message,
      });

      return {
        seat,
        connection: {
          whatsappInstanceId: instance.id,
          provider: "uazapi",
          billingStatus: "active",
          connectionStatus: connection.connectionStatus,
          qrCode: connection.qrCode,
          connectedPhone: connection.connectedPhone,
          message: connection.message,
        },
      };
    } catch (error) {
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { status: "error" },
      });
      await this.seats.releaseSeat(
        workspaceId,
        seat.id,
        "uazapi_provisioning_failed",
        actorUserId,
      );
      await this.recordLog({
        workspaceId,
        instanceId: instance.id,
        seatId: seat.id,
        actorUserId,
        startedAt,
        status: "error",
        providerInstanceId: null,
        message: this.errorMessage(error),
      });
      throw new ConflictException("Nao foi possivel preparar a conexao NOD API");
    }
  }

  async getProvisioningStatus(
    workspaceId: string,
    whatsappInstanceId: string,
    actorUserId: string,
  ): Promise<UazapiPackageProvisionDto> {
    this.assertProvisioningEnabled();
    const instance = await this.getProvisioningInstance(
      workspaceId,
      whatsappInstanceId,
    );
    const seat = await this.ensureProvisioningSeat(
      workspaceId,
      whatsappInstanceId,
      actorUserId,
    );
    const instanceToken = this.decryptInstanceToken(instance);
    const connection = await this.uazapi.getInstanceStatus(
      instance.providerInstanceId!,
      instanceToken,
    );

    return this.toProvisioningResult(
      workspaceId,
      whatsappInstanceId,
      seat,
      connection,
      actorUserId,
    );
  }

  async refreshProvisioningQr(
    workspaceId: string,
    whatsappInstanceId: string,
    actorUserId: string,
  ): Promise<UazapiPackageProvisionDto> {
    this.assertProvisioningEnabled();
    const startedAt = new Date();
    const instance = await this.getProvisioningInstance(
      workspaceId,
      whatsappInstanceId,
    );
    const seat = await this.ensureProvisioningSeat(
      workspaceId,
      whatsappInstanceId,
      actorUserId,
    );
    const instanceToken = this.decryptInstanceToken(instance);

    try {
      const current = await this.uazapi.getInstanceStatus(
        instance.providerInstanceId!,
        instanceToken,
      );
      const connection =
        current.connectionStatus === "connected"
          ? current
          : await this.uazapi.connectInstance(
              instance.providerInstanceId!,
              instanceToken,
            );

      if (
        connection.connectionStatus === "error" ||
        connection.connectionStatus === "not_configured"
      ) {
        throw new Error(connection.message ?? "uazapi_qr_not_refreshed");
      }

      if (
        connection.providerInstanceId &&
        connection.providerInstanceId !== instance.providerInstanceId
      ) {
        await this.prisma.whatsappInstance.update({
          where: { id: whatsappInstanceId },
          data: { providerInstanceId: connection.providerInstanceId },
        });
      }

      const result = await this.toProvisioningResult(
        workspaceId,
        whatsappInstanceId,
        seat,
        connection,
        actorUserId,
      );

      await this.recordLog({
        workspaceId,
        instanceId: whatsappInstanceId,
        seatId: result.seat.id,
        actorUserId,
        startedAt,
        status: "success",
        providerInstanceId:
          connection.providerInstanceId ?? instance.providerInstanceId,
        message: connection.message,
        operation: "uazapi.package.refresh_qr",
        auditAction: "billing.uazapi_package_refresh_qr",
      });

      return result;
    } catch (error) {
      await this.recordLog({
        workspaceId,
        instanceId: whatsappInstanceId,
        seatId: seat.id,
        actorUserId,
        startedAt,
        status: "error",
        providerInstanceId: instance.providerInstanceId,
        message: this.errorMessage(error),
        operation: "uazapi.package.refresh_qr",
        auditAction: "billing.uazapi_package_refresh_qr",
      });
      throw new ConflictException("Nao foi possivel gerar um novo QR code");
    }
  }

  async removeInstance(
    workspaceId: string,
    whatsappInstanceId: string,
    confirmation: string,
    actorUserId: string,
  ): Promise<UazapiPackageInstanceRemovalDto> {
    this.assertProvisioningEnabled();
    const startedAt = new Date();
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: {
        id: whatsappInstanceId,
        workspaceId,
        provider: "uazapi",
      },
    });
    if (!instance) {
      throw new NotFoundException("Instancia NOD API nao encontrada");
    }
    if (confirmation.trim() !== instance.name) {
      throw new BadRequestException(
        "Digite o nome exato da instancia para confirmar a remocao",
      );
    }

    const seat = await this.prisma.whatsappSeat.findFirst({
      where: {
        workspaceId,
        whatsappInstanceId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (
      instance.status === "disconnected" &&
      (!seat || seat.status === "released")
    ) {
      // Idempotent replay: the number is already gone, but a bridge created
      // before this cleanup existed may still be listed as a live origin.
      try {
        await this.uazapiBridge.retireBridge({
          workspaceId,
          whatsappInstanceId: instance.id,
          reason: "uazapi_instance_removed_by_user",
          actorUserId,
        });
      } catch {
        // best-effort; see the removal path below
      }

      return {
        whatsappInstanceId,
        instanceName: instance.name,
        releasedSeatId: seat?.id ?? null,
        removedAt: (
          seat?.releasedAt ??
          instance.updatedAt ??
          new Date()
        ).toISOString(),
        providerAlreadyMissing: true,
      };
    }

    if (
      !instance.providerTokenEncrypted ||
      !instance.providerTokenIv ||
      !instance.providerTokenTag
    ) {
      throw new ConflictException(
        "A credencial da instancia nao esta disponivel para remocao segura",
      );
    }

    const deletion = await this.uazapi.deleteInstance(
      this.decryptInstanceToken(instance),
    );
    if (deletion.status !== "deleted") {
      await this.recordLog({
        workspaceId,
        instanceId: instance.id,
        seatId: seat?.id ?? "seat_not_found",
        actorUserId,
        startedAt,
        status: "error",
        providerInstanceId: instance.providerInstanceId,
        message: deletion.message,
        operation: "uazapi.package.remove",
        auditAction: "billing.uazapi_package_remove",
      });
      throw new ConflictException(
        "A NOD API nao confirmou a remocao. O numero continua conectado e ocupando a vaga",
      );
    }

    const removedAt = new Date();
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (seat && seat.status !== "released") {
      const releasedSeat = {
        ...seat,
        status: "released" as const,
        releasedAt: removedAt,
        releaseReason: "uazapi_instance_removed_by_user",
        reservationExpiresAt: null,
      };
      operations.push(
        this.prisma.whatsappSeat.update({
          where: { id: seat.id },
          data: {
            status: "released",
            releasedAt: removedAt,
            releaseReason: "uazapi_instance_removed_by_user",
            reservationExpiresAt: null,
          },
        }),
        this.prisma.billingContractAudit.create({
          data: {
            workspaceId,
            subscriptionId: seat.subscriptionId,
            actorUserId,
            actorType: "user",
            action: "seat.released",
            reason: "uazapi_instance_removed_by_user",
            beforeSnapshot: this.seatSnapshot(seat),
            afterSnapshot: this.seatSnapshot(releasedSeat),
          },
        }),
      );
    }

    operations.push(
      this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: "disconnected",
          providerTokenEncrypted: null,
          providerTokenIv: null,
          providerTokenTag: null,
          webhookTokenHash: null,
        },
      }),
      this.prisma.integrationLog.create({
        data: {
          workspaceId,
          source: "uazapi",
          operation: "uazapi.package.remove",
          status: "success",
          startedAt,
          finishedAt: removedAt,
          durationMs: Math.max(0, removedAt.getTime() - startedAt.getTime()),
          providerRequestId: instance.providerInstanceId,
          jobId: instance.id,
          requestSummary: {
            whatsappInstanceId: instance.id,
            seatId: seat?.id ?? null,
          } as Prisma.InputJsonValue,
          responseSummary: {
            providerAlreadyMissing: deletion.alreadyMissing,
            message: deletion.message,
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          workspaceId,
          actorUserId,
          actorType: "user",
          action: "billing.uazapi_package_remove",
          targetType: "WhatsappInstance",
          targetId: instance.id,
          reason: "Numero removido pelo usuario",
          resultStatus: "success",
          beforeSummary: {
            name: instance.name,
            status: instance.status,
            seatId: seat?.id ?? null,
          },
          afterSummary: {
            name: instance.name,
            status: "disconnected",
            seatId: seat?.id ?? null,
            seatStatus: seat ? "released" : null,
            providerAlreadyMissing: deletion.alreadyMissing,
          },
        },
      }),
    );
    await this.prisma.$transaction(operations);

    // The number is gone, so its bridged origin must stop being listed as a
    // live connection. Soft-remove only: the channel and every execution or
    // decision recorded against it stay untouched, and the rules scoped to it
    // are not re-pointed at another number the user never configured.
    try {
      await this.uazapiBridge.retireBridge({
        workspaceId,
        whatsappInstanceId: instance.id,
        reason: "uazapi_instance_removed_by_user",
        actorUserId,
      });
    } catch {
      // Best-effort: the number is already removed and the seat released, so a
      // stale origin card must not fail the removal. The reconcile pass on the
      // next connections list picks it up.
    }

    return {
      whatsappInstanceId: instance.id,
      instanceName: instance.name,
      releasedSeatId: seat?.id ?? null,
      removedAt: removedAt.toISOString(),
      providerAlreadyMissing: deletion.alreadyMissing,
    };
  }

  /**
   * Every provision creates a fresh WhatsappInstance, and the conversion bridge
   * keys its InboundWebhookConnection off that instance id — so a second
   * provision started while the first QR is still on screen leaves the
   * workspace with two "active-looking" origin cards for a single number.
   * Reserved seats expire on their own (reservationTtlMinutes), so this only
   * blocks a QR flow that is genuinely still running.
   */
  private async assertNoQrFlowInProgress(workspaceId: string): Promise<void> {
    const pending = await this.prisma.whatsappSeat.findFirst({
      where: {
        workspaceId,
        provider: "uazapi",
        status: "reserved",
        whatsappInstanceId: { not: null },
        reservationExpiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { whatsappInstanceId: true },
    });
    if (!pending) return;

    throw new ConflictException(
      "Ja existe uma conexao NOD API aguardando a leitura do QR code. Conclua ou aguarde a expiracao antes de criar outra",
    );
  }

  private assertProvisioningEnabled(): void {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isUazapiProvisioningEnabled()
    ) {
      throw new ConflictException(
        "Provisionamento NOD API por pacote ainda nao habilitado",
      );
    }
  }

  private async getProvisioningInstance(
    workspaceId: string,
    whatsappInstanceId: string,
  ): Promise<WhatsappInstance> {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: {
        id: whatsappInstanceId,
        workspaceId,
        provider: "uazapi",
      },
    });
    if (
      !instance ||
      instance.status !== "active" ||
      !instance.providerInstanceId ||
      !instance.providerTokenEncrypted ||
      !instance.providerTokenIv ||
      !instance.providerTokenTag
    ) {
      throw new NotFoundException("Instancia NOD API nao encontrada");
    }

    return instance;
  }

  private async ensureProvisioningSeat(
    workspaceId: string,
    whatsappInstanceId: string,
    actorUserId: string,
  ): Promise<WhatsappSeat> {
    let seat = await this.findCurrentSeat(workspaceId, whatsappInstanceId);
    if (
      seat?.status === "reserved" &&
      seat.reservationExpiresAt &&
      seat.reservationExpiresAt.getTime() <= Date.now()
    ) {
      await this.seats.releaseSeat(
        workspaceId,
        seat.id,
        "uazapi_qr_reservation_expired",
        actorUserId,
      );
      seat = null;
    }
    if (!seat) {
      await this.contracts.getCurrentAccessContract(workspaceId);
      const reserved = await this.seats.reserveSeat(
        workspaceId,
        {
          provider: "uazapi",
          whatsappInstanceId,
          inboundWebhookChannelId: null,
          normalizedPhone: null,
        },
        actorUserId,
      );
      seat = await this.findSeatById(workspaceId, reserved.id);
    }

    return seat;
  }

  private decryptInstanceToken(instance: WhatsappInstance): string {
    return this.tokenEncryption.decrypt({
      encryptedAccessToken: instance.providerTokenEncrypted!,
      tokenIv: instance.providerTokenIv!,
      tokenTag: instance.providerTokenTag!,
    });
  }

  private async toProvisioningResult(
    workspaceId: string,
    whatsappInstanceId: string,
    seat: WhatsappSeat,
    connection: UazapiConnectionResult,
    actorUserId: string,
  ): Promise<UazapiPackageProvisionDto> {
    let seatDto = this.seats.mapSeat(seat);
    if (connection.connectionStatus === "connected") {
      seatDto = await this.seats.activateSeat(
        workspaceId,
        seat.id,
        connection.connectedPhone,
        actorUserId,
      );
    }

    return {
      seat: seatDto,
      connection: {
        whatsappInstanceId,
        provider: "uazapi",
        billingStatus: "active",
        connectionStatus:
          connection.connectionStatus === "not_configured"
            ? "error"
            : connection.connectionStatus,
        qrCode: connection.qrCode,
        connectedPhone: connection.connectedPhone,
        message: connection.message,
      },
    };
  }

  private instanceWebhookUrl(
    whatsappInstanceId: string,
    webhookToken: string,
  ): string {
    const publicApiUrl = process.env.API_PUBLIC_URL?.replace(/\/+$/, "");
    if (!publicApiUrl) {
      throw new Error("api_public_url_not_configured");
    }

    return `${publicApiUrl}/webhooks/uazapi/instances/${encodeURIComponent(
      whatsappInstanceId,
    )}?token=${encodeURIComponent(webhookToken)}`;
  }

  private async recordLog(input: {
    workspaceId: string;
    instanceId: string;
    seatId: string;
    actorUserId: string;
    startedAt: Date;
    status: "success" | "error";
    providerInstanceId: string | null;
    message: string | null;
    operation?: string;
    auditAction?: string;
  }): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.integrationLog.create({
        data: {
          workspaceId: input.workspaceId,
          source: "uazapi",
          operation: input.operation ?? "uazapi.package.provision",
          status: input.status,
          startedAt: input.startedAt,
          finishedAt,
          durationMs: Math.max(
            0,
            finishedAt.getTime() - input.startedAt.getTime(),
          ),
          providerRequestId: input.providerInstanceId,
          providerErrorMessage: input.status === "error" ? input.message : null,
          jobId: input.instanceId,
          requestSummary: {
            whatsappInstanceId: input.instanceId,
            seatId: input.seatId,
          } as Prisma.InputJsonValue,
          responseSummary: {
            providerInstanceConfigured: Boolean(input.providerInstanceId),
            message: input.message,
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          actorType: "user",
          action: input.auditAction ?? "billing.uazapi_package_provision",
          targetType: "WhatsappInstance",
          targetId: input.instanceId,
          reason: input.message,
          resultStatus: input.status,
          afterSummary: {
            seatId: input.seatId,
            providerInstanceConfigured: Boolean(input.providerInstanceId),
          },
        },
      }),
    ]);
  }

  private hashToken(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "unknown_error";
  }

  private seatSnapshot(
    seat: Pick<
      WhatsappSeat,
      | "id"
      | "provider"
      | "status"
      | "normalizedPhone"
      | "whatsappInstanceId"
      | "inboundWebhookChannelId"
      | "reservationExpiresAt"
      | "activatedAt"
      | "suspendedAt"
      | "releasedAt"
      | "releaseReason"
    >,
  ): Prisma.InputJsonValue {
    return {
      id: seat.id,
      provider: seat.provider,
      status: seat.status,
      normalizedPhone: seat.normalizedPhone,
      whatsappInstanceId: seat.whatsappInstanceId,
      inboundWebhookChannelId: seat.inboundWebhookChannelId,
      reservationExpiresAt: seat.reservationExpiresAt?.toISOString() ?? null,
      activatedAt: seat.activatedAt?.toISOString() ?? null,
      suspendedAt: seat.suspendedAt?.toISOString() ?? null,
      releasedAt: seat.releasedAt?.toISOString() ?? null,
      releaseReason: seat.releaseReason,
    };
  }

  private async findCurrentSeat(
    workspaceId: string,
    whatsappInstanceId: string,
  ): Promise<WhatsappSeat | null> {
    return this.prisma.whatsappSeat.findFirst({
      where: {
        workspaceId,
        whatsappInstanceId,
        status: { in: ["reserved", "active", "suspended"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async findSeatById(
    workspaceId: string,
    seatId: string,
  ): Promise<WhatsappSeat> {
    const seat = await this.prisma.whatsappSeat.findFirst({
      where: { id: seatId, workspaceId },
    });
    if (!seat) {
      throw new NotFoundException("Vaga de WhatsApp nao encontrada");
    }

    return seat;
  }
}
