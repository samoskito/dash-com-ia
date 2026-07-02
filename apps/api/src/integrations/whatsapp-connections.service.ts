import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { WhatsappInstanceConnectionDto } from "@wpptrack/shared";
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
  status: "pending_payment" | "active" | "suspended" | "cancelled";
  providerInstanceId: string | null;
};

@Injectable()
export class WhatsappConnectionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UazapiAdapter) private readonly uazapiAdapter: UazapiAdapter
  ) {}

  async getStatus(
    workspaceId: string,
    whatsappInstanceId: string
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(workspaceId, whatsappInstanceId);
    const result = await this.uazapiAdapter.getInstanceStatus(
      instance.providerInstanceId ?? instance.id
    );

    return this.toDto(instance, result);
  }

  async connectInstance(
    workspaceId: string,
    whatsappInstanceId: string
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(workspaceId, whatsappInstanceId);
    const result = await this.uazapiAdapter.connectInstance(
      instance.providerInstanceId ?? instance.id
    );

    if (result.providerInstanceId && result.providerInstanceId !== instance.providerInstanceId) {
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { providerInstanceId: result.providerInstanceId }
      });
      instance.providerInstanceId = result.providerInstanceId;
    }

    return this.toDto(instance, result);
  }

  async getQr(
    workspaceId: string,
    whatsappInstanceId: string
  ): Promise<WhatsappInstanceConnectionDto> {
    const instance = await this.getActiveInstance(workspaceId, whatsappInstanceId);
    const result = await this.uazapiAdapter.getQr(
      instance.providerInstanceId ?? instance.id
    );

    return this.toDto(instance, result);
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
