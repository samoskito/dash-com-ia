import { createHash, randomBytes } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { Prisma, WhatsappSeat } from "@prisma/client";
import type {
  UazapiPackageProvisionDto,
  WhatsappSeatDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MetaTokenEncryptionService } from "../integrations/meta/meta-token-encryption.service";
import { UazapiAdapter } from "../integrations/uazapi/uazapi.adapter";
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
    private readonly tokenEncryption: MetaTokenEncryptionService
  ) {}

  async provision(
    workspaceId: string,
    instanceName: string,
    actorUserId: string
  ): Promise<UazapiPackageProvisionDto> {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isUazapiProvisioningEnabled()
    ) {
      throw new ConflictException(
        "Provisionamento Uazapi por pacote ainda nao habilitado"
      );
    }

    await this.contracts.getCurrentAccessContract(workspaceId);
    const instance = await this.prisma.whatsappInstance.create({
      data: {
        workspaceId,
        name: instanceName,
        provider: "uazapi",
        status: "pending_payment"
      }
    });

    let seat: WhatsappSeatDto;
    try {
      seat = await this.seats.reserveSeat(
        workspaceId,
        {
          provider: "uazapi",
          whatsappInstanceId: instance.id,
          inboundWebhookChannelId: null,
          normalizedPhone: null
        },
        actorUserId
      );
    } catch (error) {
      await this.prisma.whatsappInstance.delete({
        where: { id: instance.id }
      });
      throw error;
    }

    const startedAt = new Date();
    try {
      const created = await this.uazapi.createInstance({
        name: instanceName,
        localInstanceId: instance.id,
        workspaceId
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
        webhookUrl
      });
      if (configured.status !== "configured") {
        throw new Error(
          configured.message ?? "uazapi_webhook_not_configured"
        );
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
          webhookTokenHash: this.hashToken(webhookToken)
        }
      });

      const connection = await this.uazapi.connectInstance(
        created.providerInstanceId,
        created.instanceToken
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
          null,
          actorUserId
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
        message: connection.message
      });

      return {
        seat,
        connection: {
          whatsappInstanceId: instance.id,
          provider: "uazapi",
          billingStatus: "active",
          connectionStatus: connection.connectionStatus,
          qrCode: connection.qrCode,
          message: connection.message
        }
      };
    } catch (error) {
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { status: "error" }
      });
      await this.seats.releaseSeat(
        workspaceId,
        seat.id,
        "uazapi_provisioning_failed",
        actorUserId
      );
      await this.recordLog({
        workspaceId,
        instanceId: instance.id,
        seatId: seat.id,
        actorUserId,
        startedAt,
        status: "error",
        providerInstanceId: null,
        message: this.errorMessage(error)
      });
      throw new ConflictException(
        "Nao foi possivel preparar a conexao Uazapi"
      );
    }
  }

  async getProvisioningStatus(
    workspaceId: string,
    whatsappInstanceId: string,
    actorUserId: string
  ): Promise<UazapiPackageProvisionDto> {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isUazapiProvisioningEnabled()
    ) {
      throw new ConflictException(
        "Provisionamento Uazapi por pacote ainda nao habilitado"
      );
    }

    const instance = await this.prisma.whatsappInstance.findFirst({
      where: {
        id: whatsappInstanceId,
        workspaceId,
        provider: "uazapi"
      }
    });
    if (
      !instance ||
      instance.status !== "active" ||
      !instance.providerInstanceId ||
      !instance.providerTokenEncrypted ||
      !instance.providerTokenIv ||
      !instance.providerTokenTag
    ) {
      throw new NotFoundException("Instancia Uazapi nao encontrada");
    }

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
        actorUserId
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
          normalizedPhone: null
        },
        actorUserId
      );
      seat = await this.findSeatById(workspaceId, reserved.id);
    }

    const instanceToken = this.tokenEncryption.decrypt({
      encryptedAccessToken: instance.providerTokenEncrypted,
      tokenIv: instance.providerTokenIv,
      tokenTag: instance.providerTokenTag
    });
    const connection = await this.uazapi.getInstanceStatus(
      instance.providerInstanceId,
      instanceToken
    );

    let seatDto = this.seats.mapSeat(seat);
    if (connection.connectionStatus === "connected" && seat.status === "reserved") {
      seatDto = await this.seats.activateSeat(
        workspaceId,
        seat.id,
        null,
        actorUserId
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
        message: connection.message
      }
    };
  }

  private instanceWebhookUrl(
    whatsappInstanceId: string,
    webhookToken: string
  ): string {
    const publicApiUrl = process.env.API_PUBLIC_URL?.replace(/\/+$/, "");
    if (!publicApiUrl) {
      throw new Error("api_public_url_not_configured");
    }

    return `${publicApiUrl}/webhooks/uazapi/instances/${encodeURIComponent(
      whatsappInstanceId
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
  }): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.integrationLog.create({
        data: {
          workspaceId: input.workspaceId,
          source: "uazapi",
          operation: "uazapi.package.provision",
          status: input.status,
          startedAt: input.startedAt,
          finishedAt,
          durationMs: Math.max(
            0,
            finishedAt.getTime() - input.startedAt.getTime()
          ),
          providerRequestId: input.providerInstanceId,
          providerErrorMessage:
            input.status === "error" ? input.message : null,
          jobId: input.instanceId,
          requestSummary: {
            whatsappInstanceId: input.instanceId,
            seatId: input.seatId
          } as Prisma.InputJsonValue,
          responseSummary: {
            providerInstanceConfigured: Boolean(input.providerInstanceId),
            message: input.message
          } as Prisma.InputJsonValue
        }
      }),
      this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          actorType: "user",
          action: "billing.uazapi_package_provision",
          targetType: "WhatsappInstance",
          targetId: input.instanceId,
          reason: input.message,
          resultStatus: input.status,
          afterSummary: {
            seatId: input.seatId,
            providerInstanceConfigured: Boolean(input.providerInstanceId)
          }
        }
      })
    ]);
  }

  private hashToken(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "unknown_error";
  }

  private async findCurrentSeat(
    workspaceId: string,
    whatsappInstanceId: string
  ): Promise<WhatsappSeat | null> {
    return this.prisma.whatsappSeat.findFirst({
      where: {
        workspaceId,
        whatsappInstanceId,
        status: { in: ["reserved", "active", "suspended"] }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  private async findSeatById(
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
}
