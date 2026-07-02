import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { WhatsappInstanceConnectionDto } from "@wpptrack/shared";
import type { WhatsappInstanceSummaryDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  UazapiAdapter,
  type UazapiConnectionResult
} from "./uazapi/uazapi.adapter";

type WhatsappInstanceRecord = {
  id: string;
  workspaceId: string;
  name: string;
  provider: "uazapi" | "cloud_api";
  status: "pending_payment" | "active" | "disconnected" | "suspended" | "error";
  providerInstanceId: string | null;
  activations?: Array<{
    paymentCharge: {
      checkoutUrl: string | null;
    };
  }>;
};

type UazapiOperation =
  | "uazapi.instance.status"
  | "uazapi.instance.connect"
  | "uazapi.instance.qr";

@Injectable()
export class WhatsappConnectionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UazapiAdapter) private readonly uazapiAdapter: UazapiAdapter
  ) {}

  async listInstances(workspaceId: string): Promise<WhatsappInstanceSummaryDto[]> {
    const instances = (await this.prisma.whatsappInstance.findMany({
      where: { workspaceId },
      include: {
        activations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            paymentCharge: {
              select: {
                checkoutUrl: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    })) as Array<WhatsappInstanceRecord & { createdAt: Date }>;

    return instances.map((instance) => ({
      id: instance.id,
      name: instance.name,
      provider: instance.provider,
      billingStatus: instance.status,
      providerInstanceId: instance.providerInstanceId,
      checkoutUrl: instance.activations?.[0]?.paymentCharge.checkoutUrl ?? null,
      createdAt: instance.createdAt.toISOString()
    }));
  }

  async getStatus(
    workspaceId: string,
    whatsappInstanceId: string
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(workspaceId, whatsappInstanceId);
    const result = await this.callUazapiInstance(
      instance,
      "uazapi.instance.status",
      () =>
        this.uazapiAdapter.getInstanceStatus(
          instance.providerInstanceId ?? instance.id
        )
    );

    return this.toDto(instance, result);
  }

  async connectInstance(
    workspaceId: string,
    whatsappInstanceId: string,
    actorUserId?: string
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(workspaceId, whatsappInstanceId);
    const beforeProviderInstanceId = instance.providerInstanceId;
    const result = await this.callUazapiInstance(
      instance,
      "uazapi.instance.connect",
      () =>
        this.uazapiAdapter.connectInstance(instance.providerInstanceId ?? instance.id)
    );

    if (result.providerInstanceId && result.providerInstanceId !== instance.providerInstanceId) {
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { providerInstanceId: result.providerInstanceId }
      });
      instance.providerInstanceId = result.providerInstanceId;
    }

    if (actorUserId) {
      await this.recordConnectAudit({
        instance,
        actorUserId,
        result,
        beforeProviderInstanceId
      });
    }

    return this.toDto(instance, result);
  }

  async getQr(
    workspaceId: string,
    whatsappInstanceId: string
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(workspaceId, whatsappInstanceId);
    const result = await this.callUazapiInstance(
      instance,
      "uazapi.instance.qr",
      () => this.uazapiAdapter.getQr(instance.providerInstanceId ?? instance.id)
    );

    return this.toDto(instance, result);
  }

  private async callUazapiInstance(
    instance: WhatsappInstanceRecord,
    operation: UazapiOperation,
    callback: () => Promise<UazapiConnectionResult>
  ): Promise<UazapiConnectionResult> {
    const startedAt = new Date();

    try {
      const result = await callback();
      await this.recordUazapiIntegrationLog(instance, operation, startedAt, result);

      return result;
    } catch (error) {
      await this.recordUazapiIntegrationLog(instance, operation, startedAt, {
        providerInstanceId: instance.providerInstanceId ?? instance.id,
        connectionStatus: "error",
        qrCode: null,
        message: error instanceof Error ? error.message : "Erro ao chamar Uazapi"
      });

      throw error;
    }
  }

  private async recordUazapiIntegrationLog(
    instance: WhatsappInstanceRecord,
    operation: UazapiOperation,
    startedAt: Date,
    result: UazapiConnectionResult
  ): Promise<void> {
    const finishedAt = new Date();
    const status =
      result.connectionStatus === "error"
        ? "error"
        : result.connectionStatus === "not_configured"
          ? "blocked"
          : "success";

    try {
      await this.prisma.integrationLog.create({
        data: {
          workspaceId: instance.workspaceId,
          source: "uazapi",
          operation,
          status,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          providerRequestId: result.providerInstanceId,
          providerErrorMessage:
            status === "error" || status === "blocked" ? result.message : null,
          jobId: instance.id,
          requestSummary: {
            whatsappInstanceId: instance.id,
            providerInstanceId: instance.providerInstanceId
          } as Prisma.InputJsonValue,
          responseSummary: {
            connectionStatus: result.connectionStatus,
            message: result.message,
            hasQrCode: Boolean(result.qrCode)
          } as Prisma.InputJsonValue
        }
      });
    } catch {
      return;
    }
  }

  private async recordConnectAudit(input: {
    instance: WhatsappInstanceRecord;
    actorUserId: string;
    result: UazapiConnectionResult;
    beforeProviderInstanceId: string | null;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.instance.workspaceId,
          actorUserId: input.actorUserId,
          actorType: "user",
          action: "whatsapp_instance.connect_requested",
          targetType: "WhatsappInstance",
          targetId: input.instance.id,
          reason: null,
          sourceIp: null,
          resultStatus: input.result.connectionStatus,
          beforeSummary: this.connectionAuditSummary({
            instance: input.instance,
            providerInstanceId: input.beforeProviderInstanceId
          }),
          afterSummary: {
            ...(this.connectionAuditSummary({
              instance: input.instance,
              providerInstanceId: input.instance.providerInstanceId
            }) as Record<string, unknown>),
            connectionStatus: input.result.connectionStatus,
            hasQrCode: Boolean(input.result.qrCode)
          } as Prisma.InputJsonValue
        }
      });
    } catch {
      return;
    }
  }

  private connectionAuditSummary(input: {
    instance: WhatsappInstanceRecord;
    providerInstanceId: string | null;
  }): Prisma.InputJsonValue {
    return {
      provider: input.instance.provider,
      billingStatus: input.instance.status,
      providerInstanceConfigured: Boolean(input.providerInstanceId),
      providerInstanceIdHash: input.providerInstanceId
        ? this.hashSensitiveValue(input.providerInstanceId)
        : null
    } as Prisma.InputJsonValue;
  }

  private hashSensitiveValue(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private async getActiveInstance(
    workspaceId: string,
    whatsappInstanceId: string
  ): Promise<WhatsappInstanceRecord> {
    const instance = (await this.prisma.whatsappInstance.findFirst({
      where: {
        id: whatsappInstanceId,
        workspaceId
      }
    })) as WhatsappInstanceRecord | null;

    if (!instance) {
      throw new NotFoundException("Instancia WhatsApp nao encontrada");
    }

    if (instance.status !== "active") {
      throw new ForbiddenException(
        "Instancia WhatsApp ainda nao foi liberada por pagamento"
      );
    }

    if (instance.provider !== "uazapi") {
      throw new ForbiddenException("Provider WhatsApp ainda nao suportado");
    }

    return instance;
  }

  private toDto(
    instance: WhatsappInstanceRecord,
    result: UazapiConnectionResult
  ): WhatsappInstanceConnectionDto {
    return {
      whatsappInstanceId: instance.id,
      provider: instance.provider,
      billingStatus: instance.status,
      connectionStatus: result.connectionStatus,
      qrCode: result.qrCode,
      message: result.message
    };
  }
}
