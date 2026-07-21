import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
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
import { InboundWebhookPayloadEncryptionService } from "./inbound-webhook-payload-encryption.service";
import { InboundWebhookQueueService } from "./inbound-webhook-queue.service";
import {
  rawBodyDeliveryIdentity,
  type InboundWebhookDeliveryIdentity,
} from "./providers/inbound-webhook-delivery-identity";
import { extractUmblerV1DeliveryIdentity } from "./providers/umbler/umbler-v1-delivery-identity";

export const MAX_INBOUND_WEBHOOK_PAYLOAD_BYTES = 96 * 1024;

const publicConnectionNotFoundMessage = "Webhook nao encontrado";
const publicPersistenceFailureMessage = "Webhook temporariamente indisponivel";
const dummySecretHash = Buffer.alloc(32);

type PublicInboundWebhookConnection =
  Prisma.InboundWebhookConnectionGetPayload<{
    include: { parserRelease: true };
  }>;

export type InboundWebhookIngestionResult = {
  status: "accepted";
  deliveryId: string;
  duplicate: boolean;
  queueStatus: "queued" | "pending" | "existing";
};

export type InboundWebhookIngestionInput = {
  connectionId: string;
  token: unknown;
  contentType: string | undefined;
  providerAttempt: unknown;
  rawBody: Buffer | undefined;
};

export function matchesInboundWebhookSecret(
  storedHash: string | null | undefined,
  candidateSecret: unknown,
): boolean {
  const expected =
    storedHash && /^[a-f0-9]{64}$/i.test(storedHash)
      ? Buffer.from(storedHash, "hex")
      : dummySecretHash;
  const received = createHash("sha256")
    .update(typeof candidateSecret === "string" ? candidateSecret : "", "utf8")
    .digest();

  return timingSafeEqual(expected, received);
}

export function parseInboundWebhookProviderAttempt(
  value: unknown,
): number | null {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!/^[1-9]\d{0,5}$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

@Injectable()
export class InboundWebhookIngestionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
    @Inject(InboundWebhookPayloadEncryptionService)
    private readonly encryption: InboundWebhookPayloadEncryptionService,
    @Inject(InboundWebhookQueueService)
    private readonly queue: InboundWebhookQueueService,
  ) {}

  async ingest(
    input: InboundWebhookIngestionInput,
  ): Promise<InboundWebhookIngestionResult> {
    this.assertFeatureEnabled();
    const connection = await this.authenticateConnection(
      input.connectionId,
      input.token,
    );
    const rawBody = this.requireJsonBody(input.contentType, input.rawBody);
    const providerAttempt = parseInboundWebhookProviderAttempt(
      input.providerAttempt,
    );
    const identity = this.extractIdentity(connection, rawBody);
    const existing = await this.findExistingDelivery(connection.id, identity);

    if (existing) {
      const deliveryId = await this.recordDuplicate(
        connection,
        identity,
        providerAttempt,
      );

      return {
        status: "accepted",
        deliveryId,
        duplicate: true,
        queueStatus: "existing",
      };
    }

    const deliveryId = randomUUID();
    const receivedAt = new Date();
    const encrypted = this.encryption.encrypt(rawBody, {
      workspaceId: connection.workspaceId,
      connectionId: connection.id,
      deliveryId,
    });

    try {
      await this.persistNewDelivery({
        connection,
        deliveryId,
        encrypted,
        identity,
        providerAttempt,
        rawBodyLength: rawBody.length,
        receivedAt,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const duplicateDeliveryId = await this.recordDuplicate(
          connection,
          identity,
          providerAttempt,
        );

        return {
          status: "accepted",
          deliveryId: duplicateDeliveryId,
          duplicate: true,
          queueStatus: "existing",
        };
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }

    let queueStatus: InboundWebhookIngestionResult["queueStatus"] = "pending";

    try {
      await this.queue.enqueueDelivery({
        deliveryId,
        connectionId: connection.id,
        workspaceId: connection.workspaceId,
      });
      await this.prisma.inboundWebhookDelivery.updateMany({
        where: {
          id: deliveryId,
          connectionId: connection.id,
          workspaceId: connection.workspaceId,
          status: "pending",
        },
        data: {
          status: "queued",
          queuedAt: new Date(),
        },
      });
      queueStatus = "queued";
    } catch {
      queueStatus = "pending";
    }

    return {
      status: "accepted",
      deliveryId,
      duplicate: false,
      queueStatus,
    };
  }

  private assertFeatureEnabled(): void {
    if (!parseInboundWebhooksConfig(this.env).enabled) {
      throw new NotFoundException(publicConnectionNotFoundMessage);
    }
  }

  private async authenticateConnection(
    connectionId: string,
    token: unknown,
  ): Promise<PublicInboundWebhookConnection> {
    let connection: PublicInboundWebhookConnection | null;

    try {
      connection = await this.prisma.inboundWebhookConnection.findUnique({
        where: {
          id: connectionId,
        },
        include: {
          parserRelease: true,
        },
      });
    } catch {
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }

    const tokenMatches = matchesInboundWebhookSecret(
      connection?.secretHash,
      token,
    );

    if (
      !connection ||
      !tokenMatches ||
      connection.removedAt !== null ||
      !["observation", "production"].includes(connection.status)
    ) {
      throw new NotFoundException(publicConnectionNotFoundMessage);
    }

    return connection;
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

  private extractIdentity(
    connection: PublicInboundWebhookConnection,
    rawBody: Buffer,
  ): InboundWebhookDeliveryIdentity {
    if (
      connection.provider === "umbler" &&
      connection.parserRelease.version === "v1"
    ) {
      return extractUmblerV1DeliveryIdentity(rawBody);
    }

    return rawBodyDeliveryIdentity(rawBody);
  }

  private async findExistingDelivery(
    connectionId: string,
    identity: InboundWebhookDeliveryIdentity,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.inboundWebhookDelivery.findUnique({
        where: {
          connectionId_ingressKey: {
            connectionId,
            ingressKey: identity.ingressKey,
          },
        },
        select: {
          id: true,
        },
      });
    } catch {
      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }
  }

  private async recordDuplicate(
    connection: PublicInboundWebhookConnection,
    identity: InboundWebhookDeliveryIdentity,
    providerAttempt: number | null,
  ): Promise<string> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.revalidateConnection(transaction, connection);
        const delivery = await transaction.inboundWebhookDelivery.update({
          where: {
            connectionId_ingressKey: {
              connectionId: connection.id,
              ingressKey: identity.ingressKey,
            },
          },
          data: {
            attemptCount: {
              increment: 1,
            },
            lastReceivedAt: new Date(),
            providerAttempt: providerAttempt ?? undefined,
          },
          select: {
            id: true,
          },
        });
        await this.touchConnection(transaction, connection, new Date());

        return delivery.id;
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException(publicPersistenceFailureMessage);
    }
  }

  private async persistNewDelivery(input: {
    connection: PublicInboundWebhookConnection;
    deliveryId: string;
    encrypted: {
      encryptedPayload: string;
      payloadIv: string;
      payloadTag: string;
      encryptionKeyVersion: number;
    };
    identity: InboundWebhookDeliveryIdentity;
    providerAttempt: number | null;
    rawBodyLength: number;
    receivedAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.revalidateConnection(transaction, input.connection);
      await transaction.inboundWebhookDelivery.create({
        data: {
          id: input.deliveryId,
          workspaceId: input.connection.workspaceId,
          connectionId: input.connection.id,
          provider: input.connection.provider,
          ingressKey: input.identity.ingressKey,
          externalDeliveryId: input.identity.externalDeliveryId,
          providerEventType: input.identity.providerEventType,
          parserVersion: input.connection.parserRelease.version,
          status: "pending",
          firstReceivedAt: input.receivedAt,
          lastReceivedAt: input.receivedAt,
          providerAttempt: input.providerAttempt,
          ...input.encrypted,
          payloadExpiresAt: new Date(
            input.receivedAt.getTime() +
              INBOUND_WEBHOOK_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
          ),
          normalizedSummary: {
            identitySource: input.identity.identitySource,
            rawBodyLength: input.rawBodyLength,
          },
        },
      });
      await this.touchConnection(
        transaction,
        input.connection,
        input.receivedAt,
      );
    });
  }

  private async revalidateConnection(
    transaction: Prisma.TransactionClient,
    connection: PublicInboundWebhookConnection,
  ): Promise<void> {
    const current = await transaction.inboundWebhookConnection.findFirst({
      where: {
        id: connection.id,
        workspaceId: connection.workspaceId,
        secretHash: connection.secretHash,
        status: { in: ["observation", "production"] },
        removedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      throw new NotFoundException(publicConnectionNotFoundMessage);
    }
  }

  private async touchConnection(
    transaction: Prisma.TransactionClient,
    connection: PublicInboundWebhookConnection,
    lastDeliveryAt: Date,
  ): Promise<void> {
    const updated = await transaction.inboundWebhookConnection.updateMany({
      where: {
        id: connection.id,
        workspaceId: connection.workspaceId,
        secretHash: connection.secretHash,
        status: { in: ["observation", "production"] },
        removedAt: null,
      },
      data: {
        lastDeliveryAt,
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException(publicConnectionNotFoundMessage);
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
