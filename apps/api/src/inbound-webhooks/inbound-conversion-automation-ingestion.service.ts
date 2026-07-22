import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import {
  INBOUND_WEBHOOK_RAW_RETENTION_DAYS,
  parseInboundWebhooksConfig,
} from "../config/deployment-config";
import {
  MAX_INBOUND_WEBHOOK_PAYLOAD_BYTES,
  matchesInboundWebhookSecret,
  parseInboundWebhookProviderAttempt,
} from "./inbound-webhook-ingestion.service";
import { InboundWebhookPayloadEncryptionService } from "./inbound-webhook-payload-encryption.service";

const publicEndpointNotFoundMessage = "Webhook nao encontrado";
const publicPersistenceFailureMessage = "Webhook temporariamente indisponivel";
const fallbackDedupeWindowMs = 5 * 60 * 1_000;

const publicEndpointInclude = {
  providerRule: {
    include: {
      conversionRule: true,
      connection: true,
      parserRelease: true,
    },
  },
} satisfies Prisma.ProviderConversionRuleEndpointInclude;

type PublicConversionEndpoint =
  Prisma.ProviderConversionRuleEndpointGetPayload<{
    include: typeof publicEndpointInclude;
  }>;

export type InboundConversionAutomationIngestionInput = {
  endpointId: string;
  token: unknown;
  contentType: string | undefined;
  providerAttempt: unknown;
  rawBody: Buffer | undefined;
};

export type InboundConversionAutomationIngestionResult = {
  status: "accepted";
  deliveryId: string;
  duplicate: boolean;
  observationStatus: "parser_pending_certification";
};

@Injectable()
export class InboundConversionAutomationIngestionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
    @Inject(InboundWebhookPayloadEncryptionService)
    private readonly encryption: InboundWebhookPayloadEncryptionService,
  ) {}

  async ingest(
    input: InboundConversionAutomationIngestionInput,
  ): Promise<InboundConversionAutomationIngestionResult> {
    this.assertFeatureEnabled();
    const endpoint = await this.authenticateEndpoint(
      input.endpointId,
      input.token,
    );
    const rawBody = this.requireJsonBody(input.contentType, input.rawBody);
    const providerAttempt = parseInboundWebhookProviderAttempt(
      input.providerAttempt,
    );
    const receivedAt = new Date();
    const ingressKey = this.fallbackIngressKey(
      endpoint.id,
      rawBody,
      receivedAt,
    );
    const existing = await this.findExistingDelivery(
      endpoint.providerRule.connectionId,
      ingressKey,
    );

    if (existing) {
      await this.recordDuplicate(
        endpoint,
        existing.id,
        providerAttempt,
        receivedAt,
      );
      return {
        status: "accepted",
        deliveryId: existing.id,
        duplicate: true,
        observationStatus: "parser_pending_certification",
      };
    }

    const deliveryId = randomUUID();
    const encrypted = this.encryption.encrypt(rawBody, {
      workspaceId: endpoint.workspaceId,
      connectionId: endpoint.providerRule.connectionId,
      deliveryId,
    });

    try {
      await this.persistDelivery({
        endpoint,
        deliveryId,
        ingressKey,
        providerAttempt,
        rawBodyLength: rawBody.length,
        receivedAt,
        encrypted,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.findExistingDelivery(
          endpoint.providerRule.connectionId,
          ingressKey,
        );
        if (duplicate) {
          await this.recordDuplicate(
            endpoint,
            duplicate.id,
            providerAttempt,
            receivedAt,
          );
          return {
            status: "accepted",
            deliveryId: duplicate.id,
            duplicate: true,
            observationStatus: "parser_pending_certification",
          };
        }
      }
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }

    return {
      status: "accepted",
      deliveryId,
      duplicate: false,
      observationStatus: "parser_pending_certification",
    };
  }

  private assertFeatureEnabled(): void {
    const config = parseInboundWebhooksConfig(this.env);
    if (!config.enabled || !config.conversionRulesEnabled) {
      throw new NotFoundException(publicEndpointNotFoundMessage);
    }
  }

  private async authenticateEndpoint(
    endpointId: string,
    token: unknown,
  ): Promise<PublicConversionEndpoint> {
    let endpoint: PublicConversionEndpoint | null;
    try {
      endpoint = await this.prisma.providerConversionRuleEndpoint.findUnique({
        where: { id: endpointId },
        include: publicEndpointInclude,
      });
    } catch {
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }

    const tokenMatches = matchesInboundWebhookSecret(
      endpoint?.secretHash,
      token,
    );
    const rule = endpoint?.providerRule;

    if (
      !endpoint ||
      !rule ||
      !tokenMatches ||
      endpoint.removedAt !== null ||
      rule.removedAt !== null ||
      !rule.conversionRule.active ||
      rule.conversionRule.triggerType !== "provider_automation" ||
      rule.connection.provider !== "umbler" ||
      rule.connection.removedAt !== null ||
      !["observation", "production"].includes(rule.connection.status) ||
      rule.parserRelease.status === "retired"
    ) {
      throw new NotFoundException(publicEndpointNotFoundMessage);
    }

    return endpoint;
  }

  private requireJsonBody(
    contentType: string | undefined,
    rawBody: Buffer | undefined,
  ): Buffer {
    const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      throw new UnsupportedMediaTypeException(
        "Webhook requer Content-Type application/json",
      );
    }
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException("Payload JSON obrigatorio");
    }
    if (rawBody.length > MAX_INBOUND_WEBHOOK_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException("Payload do webhook excede o limite");
    }
    try {
      JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new BadRequestException("Payload JSON invalido");
    }
    return rawBody;
  }

  private fallbackIngressKey(
    endpointId: string,
    rawBody: Buffer,
    receivedAt: Date,
  ): string {
    const bucket = Math.floor(receivedAt.getTime() / fallbackDedupeWindowMs);
    return createHash("sha256")
      .update("umbler-automation-fallback-v1\0", "utf8")
      .update(endpointId, "utf8")
      .update("\0", "utf8")
      .update(String(bucket), "utf8")
      .update("\0", "utf8")
      .update(rawBody)
      .digest("hex");
  }

  private async findExistingDelivery(
    connectionId: string,
    ingressKey: string,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.inboundWebhookDelivery.findUnique({
        where: {
          connectionId_ingressKey: { connectionId, ingressKey },
        },
        select: { id: true },
      });
    } catch {
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }
  }

  private async persistDelivery(input: {
    endpoint: PublicConversionEndpoint;
    deliveryId: string;
    ingressKey: string;
    providerAttempt: number | null;
    rawBodyLength: number;
    receivedAt: Date;
    encrypted: {
      encryptedPayload: string;
      payloadIv: string;
      payloadTag: string;
      encryptionKeyVersion: number;
    };
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.revalidateEndpoint(transaction, input.endpoint);
      await transaction.inboundWebhookDelivery.create({
        data: {
          id: input.deliveryId,
          workspaceId: input.endpoint.workspaceId,
          connectionId: input.endpoint.providerRule.connectionId,
          provider: "umbler",
          ingressKey: input.ingressKey,
          externalDeliveryId: null,
          providerEventType: "automation_callback",
          parserVersion: input.endpoint.providerRule.parserRelease.version,
          purpose: "conversion_automation",
          providerRuleEndpointWorkspaceId: input.endpoint.workspaceId,
          providerRuleEndpointId: input.endpoint.id,
          status: "processed",
          classification: "unsupported_event",
          firstReceivedAt: input.receivedAt,
          lastReceivedAt: input.receivedAt,
          providerAttempt: input.providerAttempt,
          ...input.encrypted,
          payloadExpiresAt: new Date(
            input.receivedAt.getTime() +
              INBOUND_WEBHOOK_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
          ),
          normalizedSummary: {
            purpose: "conversion_automation",
            parserStatus: "pending_certification",
            rawBodyLength: input.rawBodyLength,
          },
          parseErrorCode: "automation_parser_pending_certification",
          processedAt: input.receivedAt,
        },
      });
      await this.touchEndpointAndConnection(
        transaction,
        input.endpoint,
        input.receivedAt,
      );
    });
  }

  private async recordDuplicate(
    endpoint: PublicConversionEndpoint,
    deliveryId: string,
    providerAttempt: number | null,
    receivedAt: Date,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.revalidateEndpoint(transaction, endpoint);
        const updated = await transaction.inboundWebhookDelivery.updateMany({
          where: {
            id: deliveryId,
            workspaceId: endpoint.workspaceId,
            connectionId: endpoint.providerRule.connectionId,
            purpose: "conversion_automation",
            providerRuleEndpointId: endpoint.id,
          },
          data: {
            attemptCount: { increment: 1 },
            lastReceivedAt: receivedAt,
            providerAttempt: providerAttempt ?? undefined,
          },
        });
        if (updated.count !== 1) {
          throw new NotFoundException(publicEndpointNotFoundMessage);
        }
        await this.touchEndpointAndConnection(
          transaction,
          endpoint,
          receivedAt,
        );
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }
  }

  private async revalidateEndpoint(
    transaction: Prisma.TransactionClient,
    endpoint: PublicConversionEndpoint,
  ): Promise<void> {
    const current = await transaction.providerConversionRuleEndpoint.findFirst({
      where: {
        id: endpoint.id,
        workspaceId: endpoint.workspaceId,
        secretHash: endpoint.secretHash,
        removedAt: null,
        providerRule: {
          removedAt: null,
          conversionRule: {
            active: true,
            triggerType: "provider_automation",
          },
          connection: {
            removedAt: null,
            status: { in: ["observation", "production"] },
          },
        },
      },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundException(publicEndpointNotFoundMessage);
    }
  }

  private async touchEndpointAndConnection(
    transaction: Prisma.TransactionClient,
    endpoint: PublicConversionEndpoint,
    receivedAt: Date,
  ): Promise<void> {
    const [endpointUpdate, connectionUpdate] = await Promise.all([
      transaction.providerConversionRuleEndpoint.updateMany({
        where: {
          id: endpoint.id,
          workspaceId: endpoint.workspaceId,
          secretHash: endpoint.secretHash,
          removedAt: null,
        },
        data: { lastDeliveryAt: receivedAt },
      }),
      transaction.inboundWebhookConnection.updateMany({
        where: {
          id: endpoint.providerRule.connectionId,
          workspaceId: endpoint.workspaceId,
          removedAt: null,
          status: { in: ["observation", "production"] },
        },
        data: { lastDeliveryAt: receivedAt },
      }),
    ]);

    if (endpointUpdate.count !== 1 || connectionUpdate.count !== 1) {
      throw new NotFoundException(publicEndpointNotFoundMessage);
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
