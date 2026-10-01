import {
  ForbiddenException,
  Inject,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { WhatsappInstanceConnectionDto } from "@wpptrack/shared";
import type { WhatsappInstanceActivityDto } from "@wpptrack/shared";
import type { WhatsappLabelDto } from "@wpptrack/shared";
import type { WhatsappInstanceSummaryDto } from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  UazapiAdapter,
  type UazapiConnectionResult,
  type UazapiLabelListResult,
} from "./uazapi/uazapi.adapter";
import { MetaTokenEncryptionService } from "./meta/meta-token-encryption.service";

type WhatsappInstanceRecord = {
  id: string;
  workspaceId: string;
  name: string;
  provider: "uazapi" | "cloud_api";
  status: "pending_payment" | "active" | "disconnected" | "suspended" | "error";
  providerInstanceId: string | null;
  providerTokenEncrypted: string | null;
  providerTokenIv: string | null;
  providerTokenTag: string | null;
  activations?: Array<{
    paymentCharge: {
      checkoutUrl: string | null;
    };
  }>;
};

type UazapiOperation =
  | "uazapi.instance.status"
  | "uazapi.instance.connect"
  | "uazapi.instance.qr"
  | "uazapi.labels.list";

type CloudApiOperation =
  | "whatsapp.cloud_api.status"
  | "whatsapp.cloud_api.connect"
  | "whatsapp.cloud_api.qr"
  | "whatsapp.cloud_api.labels.list";

const INSTANCE_ACTIVITY_QUERY_ERROR =
  "Nao foi possivel consultar a atividade da instancia";

@Injectable()
export class WhatsappConnectionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UazapiAdapter) private readonly uazapiAdapter: UazapiAdapter,
    @Inject(MetaTokenEncryptionService)
    private readonly tokenEncryption: MetaTokenEncryptionService,
  ) {}

  async listInstances(
    workspaceId: string,
  ): Promise<WhatsappInstanceSummaryDto[]> {
    const instances = (await this.prisma.whatsappInstance.findMany({
      where: { workspaceId },
      include: {
        activations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            paymentCharge: {
              select: {
                checkoutUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })) as Array<WhatsappInstanceRecord & { createdAt: Date }>;

    return instances.map((instance) => ({
      id: instance.id,
      name: instance.name,
      provider: instance.provider,
      billingStatus: instance.status,
      providerInstanceId: instance.providerInstanceId,
      checkoutUrl: instance.activations?.[0]?.paymentCharge.checkoutUrl ?? null,
      createdAt: instance.createdAt.toISOString(),
    }));
  }

  async getStatus(
    workspaceId: string,
    whatsappInstanceId: string,
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(
      workspaceId,
      whatsappInstanceId,
    );
    if (instance.provider === "cloud_api") {
      return this.handleCloudApiInstance(instance, "whatsapp.cloud_api.status");
    }

    const result = await this.callUazapiInstance(
      instance,
      "uazapi.instance.status",
      () =>
        this.uazapiAdapter.getInstanceStatus(
          instance.providerInstanceId ?? instance.id,
          this.getProviderToken(instance),
        ),
    );

    return this.toDto(instance, result);
  }

  /**
   * Lead.whatsappInstanceId is the lead's current association, not immutable
   * message history. Activity therefore follows the instance currently stored
   * on each lead.
   */
  async getActivity(
    workspaceId: string,
    whatsappInstanceId: string,
    now = new Date(),
  ): Promise<WhatsappInstanceActivityDto> {
    let instance: WhatsappInstanceRecord;
    try {
      instance = await this.getWorkspaceInstance(
        workspaceId,
        whatsappInstanceId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(INSTANCE_ACTIVITY_QUERY_ERROR);
    }

    if (instance.provider !== "uazapi") {
      throw new ForbiddenException(
        "Atividade disponivel apenas para instancias UAZAPI",
      );
    }

    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const leadScope = {
      workspaceId,
      whatsappInstanceId: instance.id,
      source: "uazapi",
      ctwaClid: { not: null },
    };
    const window = (since: Date) => ({
      OR: [
        { firstMessageAt: { gte: since, lte: now } },
        { firstMessageAt: null, createdAt: { gte: since, lte: now } },
      ],
    });

    try {
      const [
        leads24h,
        leads7d,
        leadsTotal,
        lastFirstMessageLead,
        lastCreatedLead,
        lastWebhook,
      ] = await Promise.all([
        this.prisma.lead.count({ where: { ...leadScope, ...window(since24h) } }),
        this.prisma.lead.count({ where: { ...leadScope, ...window(since7d) } }),
        this.prisma.lead.count({ where: leadScope }),
        this.prisma.lead.findFirst({
          where: { ...leadScope, firstMessageAt: { not: null } },
          orderBy: { firstMessageAt: "desc" },
          select: { firstMessageAt: true },
        }),
        this.prisma.lead.findFirst({
          where: { ...leadScope, firstMessageAt: null },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        this.prisma.webhookLog.findFirst({
          where: {
            workspaceId,
            whatsappInstanceId: instance.id,
            source: "uazapi",
          },
          orderBy: { receivedAt: "desc" },
          select: { receivedAt: true },
        }),
      ]);
      const lastLeadAt = [
        lastFirstMessageLead?.firstMessageAt ?? null,
        lastCreatedLead?.createdAt ?? null,
      ].reduce<Date | null>(
        (latest, candidate) =>
          !candidate || (latest && latest >= candidate) ? latest : candidate,
        null,
      );

      return {
        leads24h,
        leads7d,
        leadsTotal,
        lastLeadAt: lastLeadAt?.toISOString() ?? null,
        lastWebhookAt: lastWebhook?.receivedAt.toISOString() ?? null,
      };
    } catch {
      throw new InternalServerErrorException(INSTANCE_ACTIVITY_QUERY_ERROR);
    }
  }

  async connectInstance(
    workspaceId: string,
    whatsappInstanceId: string,
    actorUserId?: string,
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(
      workspaceId,
      whatsappInstanceId,
    );
    const beforeProviderInstanceId = instance.providerInstanceId;
    if (instance.provider === "cloud_api") {
      const result = await this.handleCloudApiConnection(
        instance,
        "whatsapp.cloud_api.connect",
      );

      if (actorUserId) {
        await this.recordConnectAudit({
          instance,
          actorUserId,
          result,
          beforeProviderInstanceId,
        });
      }

      return this.toDto(instance, result);
    }

    const result = await this.callUazapiInstance(
      instance,
      "uazapi.instance.connect",
      () =>
        this.uazapiAdapter.connectInstance(
          instance.providerInstanceId ?? instance.id,
          this.getProviderToken(instance),
        ),
    );

    if (
      result.providerInstanceId &&
      result.providerInstanceId !== instance.providerInstanceId
    ) {
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { providerInstanceId: result.providerInstanceId },
      });
      instance.providerInstanceId = result.providerInstanceId;
    }

    if (actorUserId) {
      await this.recordConnectAudit({
        instance,
        actorUserId,
        result,
        beforeProviderInstanceId,
      });
    }

    return this.toDto(instance, result);
  }

  async getQr(
    workspaceId: string,
    whatsappInstanceId: string,
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(
      workspaceId,
      whatsappInstanceId,
    );
    if (instance.provider === "cloud_api") {
      return this.handleCloudApiInstance(instance, "whatsapp.cloud_api.qr");
    }

    const result = await this.callUazapiInstance(
      instance,
      "uazapi.instance.qr",
      () =>
        this.uazapiAdapter.getQr(
          instance.providerInstanceId ?? instance.id,
          this.getProviderToken(instance),
        ),
    );

    return this.toDto(instance, result);
  }

  async listLabels(
    workspaceId: string,
    whatsappInstanceId: string,
  ): Promise<WhatsappLabelDto[]> {
    const instance = await this.getActiveInstance(
      workspaceId,
      whatsappInstanceId,
    );
    if (instance.provider === "cloud_api") {
      await this.recordCloudApiIntegrationLog(
        instance,
        "whatsapp.cloud_api.labels.list",
        new Date(),
        this.cloudApiPendingResult(instance),
      );

      return [];
    }

    const startedAt = new Date();
    const result = await this.uazapiAdapter.listLabels(
      instance.providerInstanceId ?? instance.id,
      this.getProviderToken(instance),
    );
    await this.recordUazapiLabelLog(instance, startedAt, result);

    return result.labels;
  }

  private async callUazapiInstance(
    instance: WhatsappInstanceRecord,
    operation: UazapiOperation,
    callback: () => Promise<UazapiConnectionResult>,
  ): Promise<UazapiConnectionResult> {
    const startedAt = new Date();

    try {
      const result = await callback();
      await this.recordUazapiIntegrationLog(
        instance,
        operation,
        startedAt,
        result,
      );

      return result;
    } catch (error) {
      await this.recordUazapiIntegrationLog(instance, operation, startedAt, {
        providerInstanceId: instance.providerInstanceId ?? instance.id,
        connectionStatus: "error",
        qrCode: null,
        connectedPhone: null,
        message:
          error instanceof Error ? error.message : "Erro ao chamar NOD API",
      });

      throw error;
    }
  }

  private async handleCloudApiInstance(
    instance: WhatsappInstanceRecord,
    operation: CloudApiOperation,
  ): Promise<WhatsappInstanceConnectionDto> {
    const result = await this.handleCloudApiConnection(instance, operation);

    return this.toDto(instance, result);
  }

  private async handleCloudApiConnection(
    instance: WhatsappInstanceRecord,
    operation: CloudApiOperation,
  ): Promise<UazapiConnectionResult> {
    const startedAt = new Date();
    const result = this.cloudApiPendingResult(instance);

    await this.recordCloudApiIntegrationLog(
      instance,
      operation,
      startedAt,
      result,
    );

    return result;
  }

  private cloudApiPendingResult(
    instance: WhatsappInstanceRecord,
  ): UazapiConnectionResult {
    return {
      providerInstanceId: instance.providerInstanceId,
      connectionStatus: "not_configured",
      qrCode: null,
      connectedPhone: null,
      message:
        "WhatsApp Cloud API oficial ainda nao configurada para esta instancia",
    };
  }

  private async recordCloudApiIntegrationLog(
    instance: WhatsappInstanceRecord,
    operation: CloudApiOperation,
    startedAt: Date,
    result: UazapiConnectionResult,
  ): Promise<void> {
    const finishedAt = new Date();

    try {
      await this.prisma.integrationLog.create({
        data: {
          workspaceId: instance.workspaceId,
          source: "meta",
          operation,
          status: "blocked",
          startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          providerRequestId: instance.providerInstanceId,
          providerErrorMessage: result.message,
          jobId: instance.id,
          requestSummary: {
            whatsappInstanceId: instance.id,
            provider: instance.provider,
            providerInstanceConfigured: Boolean(instance.providerInstanceId),
          } as Prisma.InputJsonValue,
          responseSummary: {
            connectionStatus: result.connectionStatus,
            message: result.message,
            hasQrCode: false,
          } as Prisma.InputJsonValue,
        },
      });
    } catch {
      return;
    }
  }

  private async recordUazapiIntegrationLog(
    instance: WhatsappInstanceRecord,
    operation: UazapiOperation,
    startedAt: Date,
    result: UazapiConnectionResult,
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
            providerInstanceId: instance.providerInstanceId,
          } as Prisma.InputJsonValue,
          responseSummary: {
            connectionStatus: result.connectionStatus,
            message: result.message,
            hasQrCode: Boolean(result.qrCode),
          } as Prisma.InputJsonValue,
        },
      });
    } catch {
      return;
    }
  }

  private async recordUazapiLabelLog(
    instance: WhatsappInstanceRecord,
    startedAt: Date,
    result: UazapiLabelListResult,
  ): Promise<void> {
    const finishedAt = new Date();
    const status =
      result.status === "success"
        ? "success"
        : result.status === "not_configured"
          ? "blocked"
          : "error";

    try {
      await this.prisma.integrationLog.create({
        data: {
          workspaceId: instance.workspaceId,
          source: "uazapi",
          operation: "uazapi.labels.list",
          status,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          providerRequestId: instance.providerInstanceId ?? instance.id,
          providerErrorMessage: status === "success" ? null : result.message,
          jobId: instance.id,
          requestSummary: {
            whatsappInstanceId: instance.id,
            providerInstanceId: instance.providerInstanceId,
          } as Prisma.InputJsonValue,
          responseSummary: {
            labelsCount: result.labels.length,
            message: result.message,
          } as Prisma.InputJsonValue,
        },
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
            providerInstanceId: input.beforeProviderInstanceId,
          }),
          afterSummary: {
            ...(this.connectionAuditSummary({
              instance: input.instance,
              providerInstanceId: input.instance.providerInstanceId,
            }) as Record<string, unknown>),
            connectionStatus: input.result.connectionStatus,
            hasQrCode: Boolean(input.result.qrCode),
          } as Prisma.InputJsonValue,
        },
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
        : null,
    } as Prisma.InputJsonValue;
  }

  private hashSensitiveValue(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private getProviderToken(
    instance: WhatsappInstanceRecord,
  ): string | undefined {
    if (
      !instance.providerTokenEncrypted ||
      !instance.providerTokenIv ||
      !instance.providerTokenTag
    ) {
      return undefined;
    }

    return this.tokenEncryption.decrypt({
      encryptedAccessToken: instance.providerTokenEncrypted,
      tokenIv: instance.providerTokenIv,
      tokenTag: instance.providerTokenTag,
    });
  }

  private async getActiveInstance(
    workspaceId: string,
    whatsappInstanceId: string,
  ): Promise<WhatsappInstanceRecord> {
    const instance = await this.getWorkspaceInstance(
      workspaceId,
      whatsappInstanceId,
    );

    if (instance.status !== "active") {
      throw new ForbiddenException(
        "Instancia WhatsApp ainda nao foi liberada por pagamento",
      );
    }

    return instance;
  }

  private async getWorkspaceInstance(
    workspaceId: string,
    whatsappInstanceId: string,
  ): Promise<WhatsappInstanceRecord> {
    const instance = (await this.prisma.whatsappInstance.findFirst({
      where: {
        id: whatsappInstanceId,
        workspaceId,
      },
    })) as WhatsappInstanceRecord | null;

    if (!instance) {
      throw new NotFoundException("Instancia WhatsApp nao encontrada");
    }

    return instance;
  }

  private toDto(
    instance: WhatsappInstanceRecord,
    result: UazapiConnectionResult,
  ): WhatsappInstanceConnectionDto {
    return {
      whatsappInstanceId: instance.id,
      provider: instance.provider,
      billingStatus: instance.status,
      connectionStatus: result.connectionStatus,
      providerStatusText: result.providerStatusText ?? null,
      qrCode: result.qrCode,
      connectedPhone: result.connectedPhone,
      message: result.message,
    };
  }
}
