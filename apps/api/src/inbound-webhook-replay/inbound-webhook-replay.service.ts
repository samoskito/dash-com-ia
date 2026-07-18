import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  BackofficeInboundWebhookReplayBatchDto,
  BackofficeInboundWebhookReplayPreviewDto,
  InboundWebhookParserReleaseDto,
} from "@wpptrack/shared";
import type { PlatformAdminUser } from "../auth/platform-admin.service";
import {
  hashPhoneIdentity,
  normalizePhoneIdentity,
} from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsQueueService } from "../common/queue/conversion-events-queue.service";
import type { InboundWebhookReplayJobPayload } from "../common/queue/queue.constants";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";
import { ConversionEventsService } from "../conversion-events/conversion-events.service";
import { InboundWebhookPayloadEncryptionService } from "../inbound-webhooks/inbound-webhook-payload-encryption.service";
import type { ParsedInboundWebhookEvent } from "../inbound-webhooks/providers/inbound-webhook-parser";
import { InboundWebhookParserRegistry } from "../inbound-webhooks/providers/inbound-webhook-parser.registry";
import { LeadsService } from "../leads/leads.service";
import { InboundWebhookReplayQueueService } from "./inbound-webhook-replay-queue.service";

const REPLAY_BATCH_LIMIT = 500;
const REPLAY_CANDIDATE_SCAN_LIMIT = REPLAY_BATCH_LIMIT * 5;
const terminalItemStatuses = new Set([
  "materialized",
  "duplicate",
  "skipped",
  "failed",
]);
const replayItemInclude = {
  event: {
    include: {
      delivery: true,
      connection: {
        include: {
          parserRelease: true,
        },
      },
      channel: {
        include: {
          routes: {
            where: {
              active: true,
              validationStatus: "valid",
            },
          },
        },
      },
      resolvedBusinessConnection: {
        include: {
          credential: true,
        },
      },
      resolvedReportingAccount: true,
      resolvedConversionDestination: true,
    },
  },
} satisfies Prisma.InboundWebhookReplayItemInclude;

type ReplayItemRecord = Prisma.InboundWebhookReplayItemGetPayload<{
  include: typeof replayItemInclude;
}>;

class ReplayItemFailure extends Error {
  constructor(readonly code: string) {
    super("Inbound webhook replay item failed");
    this.name = "ReplayItemFailure";
  }
}

@Injectable()
export class InboundWebhookReplayService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(InboundWebhookPayloadEncryptionService)
    private readonly payloadEncryption: InboundWebhookPayloadEncryptionService,
    @Inject(InboundWebhookParserRegistry)
    private readonly parserRegistry: InboundWebhookParserRegistry,
    @Inject(LeadsService)
    private readonly leads: LeadsService,
    @Inject(ConversionEventsService)
    private readonly conversions: ConversionEventsService,
    @Inject(ConversionEventsQueueService)
    private readonly conversionQueue: ConversionEventsQueueService,
    @Inject(InboundWebhookReplayQueueService)
    private readonly replayQueue: InboundWebhookReplayQueueService,
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  async certifyParserRelease(
    releaseId: string,
    actor: PlatformAdminUser,
    sourceIp: string | null,
  ): Promise<InboundWebhookParserReleaseDto> {
    const release =
      await this.prisma.inboundWebhookParserRelease.findUnique({
        where: { id: releaseId },
      });

    if (!release) {
      throw new NotFoundException("Parser nao encontrado");
    }

    if (release.status === "retired") {
      throw new ConflictException("Parser retirado nao pode ser certificado");
    }

    if (release.status !== "certified") {
      const evidence =
        await this.prisma.inboundWebhookDelivery.count({
          where: {
            provider: release.provider,
            parserVersion: release.version,
            status: "processed",
            connection: {
              parserReleaseId: release.id,
              removedAt: null,
            },
            events: {
              some: {
                hasCtwa: true,
              },
            },
          },
        });

      if (evidence === 0) {
        throw new BadRequestException(
          "O parser precisa de um payload CTWA real processado antes da certificacao",
        );
      }
    }

    const certifiedAt = release.certifiedAt ?? new Date();
    const certified =
      release.status === "certified"
        ? release
        : await this.prisma.$transaction(async (tx) => {
            const updated = await tx.inboundWebhookParserRelease.update({
              where: { id: release.id },
              data: {
                status: "certified",
                certifiedByUserId: actor.id,
                certifiedAt,
              },
            });

            await tx.auditLog.create({
              data: {
                workspaceId: null,
                actorUserId: actor.id,
                actorType: actor.role,
                action: "inbound_webhook.parser.certify",
                targetType: "inbound_webhook_parser_release",
                targetId: release.id,
                sourceIp: this.sourceIp(sourceIp),
                resultStatus: "success",
                beforeSummary: {
                  provider: release.provider,
                  version: release.version,
                  status: release.status,
                },
                afterSummary: {
                  provider: release.provider,
                  version: release.version,
                  status: "certified",
                },
              },
            });

            return updated;
          });

    return this.parserReleaseDto(certified);
  }

  async getPreview(
    connectionId: string,
  ): Promise<BackofficeInboundWebhookReplayPreviewDto> {
    const connection = await this.loadConnection(connectionId);
    const now = new Date();
    const [events, latestBatch] = await Promise.all([
      this.prisma.inboundWebhookEvent.findMany({
        where: {
          workspaceId: connection.workspaceId,
          connectionId: connection.id,
          hasCtwa: true,
        },
        select: {
          occurredAt: true,
          adId: true,
          classification: true,
          resolvedBusinessConnectionId: true,
          resolvedReportingAccountId: true,
          resolvedConversionDestinationId: true,
          resolvedBusinessConnection: {
            select: {
              status: true,
              credential: {
                select: {
                  status: true,
                },
              },
            },
          },
          resolvedReportingAccount: {
            select: {
              active: true,
              adAccountId: true,
              businessConnectionId: true,
            },
          },
          resolvedConversionDestination: {
            select: {
              status: true,
            },
          },
          channel: {
            select: {
              routes: {
                where: {
                  active: true,
                  validationStatus: "valid",
                },
                select: {
                  metaBusinessConnectionId: true,
                  metaReportingAccountId: true,
                  metaConversionDestinationId: true,
                },
              },
            },
          },
          replayItem: {
            select: { id: true },
          },
          delivery: {
            select: {
              payloadExpiresAt: true,
              encryptedPayload: true,
              payloadIv: true,
              payloadTag: true,
              encryptionKeyVersion: true,
            },
          },
        },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      }),
      this.prisma.inboundWebhookReplayBatch.findFirst({
        where: {
          workspaceId: connection.workspaceId,
          connectionId: connection.id,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);
    const ads = await this.prisma.metaAd.findMany({
      where: {
        workspaceId: connection.workspaceId,
        adId: {
          in: [
            ...new Set(
              events
                .map((event) => event.adId)
                .filter((adId): adId is string => adId !== null),
            ),
          ],
        },
      },
      select: {
        adId: true,
        adAccountId: true,
      },
    });
    const adAccountsByAd = new Map(
      ads.map((ad) => [ad.adId, ad.adAccountId]),
    );
    const payloadAvailable = (event: (typeof events)[number]) =>
      this.payloadAvailable(event.delivery, now);
    const routeResolved = (event: (typeof events)[number]) =>
      this.routeReady(
        event,
        event.adId ? adAccountsByAd.get(event.adId) ?? null : null,
      );

    return {
      connection: {
        id: connection.id,
        workspaceId: connection.workspaceId,
        provider: connection.provider,
        displayName: connection.displayName,
        parserVersion: connection.parserRelease.version,
        parserReleaseStatus: connection.parserRelease.status,
        status: connection.status,
        lastDeliveryAt: connection.lastDeliveryAt?.toISOString() ?? null,
        lastSuccessfulParseAt:
          connection.lastSuccessfulParseAt?.toISOString() ?? null,
        createdAt: connection.createdAt.toISOString(),
        updatedAt: connection.updatedAt.toISOString(),
      },
      parserRelease: this.parserReleaseDto(connection.parserRelease),
      replayEnabled: this.replayEnabled(),
      counts: {
        totalCtwa: events.length,
        routeResolved: events.filter(routeResolved).length,
        routeUnresolved: events.filter((event) => !routeResolved(event))
          .length,
        payloadAvailable: events.filter(payloadAvailable).length,
        payloadExpired: events.filter(
          (event) =>
            event.delivery.payloadExpiresAt.getTime() <= now.getTime(),
        ).length,
        payloadUnavailable: events.filter(
          (event) =>
            event.delivery.payloadExpiresAt.getTime() > now.getTime() &&
            !payloadAvailable(event),
        ).length,
        alreadyMaterialized: events.filter(
          (event) => event.replayItem !== null,
        ).length,
        eligible: events.filter(
          (event) =>
            event.adId !== null &&
            routeResolved(event) &&
            payloadAvailable(event) &&
            event.replayItem === null,
        ).length,
      },
      oldestOccurredAt: events[0]?.occurredAt.toISOString() ?? null,
      newestOccurredAt:
        events[events.length - 1]?.occurredAt.toISOString() ?? null,
      latestBatch: latestBatch ? this.batchDto(latestBatch) : null,
    };
  }

  async authorizeReplay(
    connectionId: string,
    confirmation: string,
    actor: PlatformAdminUser,
    sourceIp: string | null,
  ): Promise<BackofficeInboundWebhookReplayBatchDto> {
    this.assertReplayEnabled();
    const connection = await this.loadConnection(connectionId);

    if (confirmation !== connection.displayName) {
      throw new BadRequestException(
        "Digite exatamente o nome da conexao para autorizar",
      );
    }

    if (connection.status !== "observation") {
      throw new ConflictException(
        "A conexao precisa estar em observacao para o replay controlado",
      );
    }

    if (connection.parserRelease.status !== "certified") {
      throw new ConflictException(
        "Certifique o parser antes de autorizar o replay",
      );
    }

    const now = new Date();
    const batch = await this.prisma.$transaction(async (tx) => {
      const activeBatch =
        await tx.inboundWebhookReplayBatch.findFirst({
          where: {
            workspaceId: connection.workspaceId,
            connectionId: connection.id,
            status: {
              in: ["queued", "processing"],
            },
          },
          select: { id: true },
        });

      if (activeBatch) {
        throw new ConflictException(
          "Esta conexao ja possui um replay em andamento",
        );
      }

      const candidates = await tx.inboundWebhookEvent.findMany({
        where: {
          workspaceId: connection.workspaceId,
          connectionId: connection.id,
          hasCtwa: true,
          adId: { not: null },
          classification: "eligible_route_resolved",
          resolvedBusinessConnectionId: { not: null },
          resolvedReportingAccountId: { not: null },
          resolvedConversionDestinationId: { not: null },
          replayItem: { is: null },
          delivery: {
            payloadExpiresAt: { gt: now },
            encryptedPayload: { not: null },
            payloadIv: { not: null },
            payloadTag: { not: null },
            encryptionKeyVersion: { not: null },
          },
        },
        select: {
          id: true,
          adId: true,
          classification: true,
          resolvedBusinessConnectionId: true,
          resolvedReportingAccountId: true,
          resolvedConversionDestinationId: true,
          resolvedBusinessConnection: {
            select: {
              status: true,
              credential: {
                select: {
                  status: true,
                },
              },
            },
          },
          resolvedReportingAccount: {
            select: {
              active: true,
              adAccountId: true,
              businessConnectionId: true,
            },
          },
          resolvedConversionDestination: {
            select: {
              status: true,
            },
          },
          channel: {
            select: {
              routes: {
                where: {
                  active: true,
                  validationStatus: "valid",
                },
                select: {
                  metaBusinessConnectionId: true,
                  metaReportingAccountId: true,
                  metaConversionDestinationId: true,
                },
              },
            },
          },
        },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        take: REPLAY_CANDIDATE_SCAN_LIMIT,
      });
      const ads = await tx.metaAd.findMany({
        where: {
          workspaceId: connection.workspaceId,
          adId: {
            in: candidates
              .map((event) => event.adId)
              .filter((adId): adId is string => adId !== null),
          },
        },
        select: {
          adId: true,
          adAccountId: true,
        },
      });
      const adAccountsByAd = new Map(
        ads.map((ad) => [ad.adId, ad.adAccountId]),
      );
      const events = candidates
        .filter((event) =>
          this.routeReady(
            event,
            event.adId ? adAccountsByAd.get(event.adId) ?? null : null,
          ),
        )
        .slice(0, REPLAY_BATCH_LIMIT);

      if (events.length === 0) {
        throw new BadRequestException(
          "Nenhum evento possui rota completa e payload disponivel",
        );
      }

      const created = await tx.inboundWebhookReplayBatch.create({
        data: {
          workspaceId: connection.workspaceId,
          connectionId: connection.id,
          requestedByUserId: actor.id,
          status: "queued",
        },
      });
      const inserted = await tx.inboundWebhookReplayItem.createMany({
        data: events.map((event) => ({
          workspaceId: connection.workspaceId,
          batchId: created.id,
          eventId: event.id,
          status: "queued" as const,
        })),
        skipDuplicates: true,
      });

      if (inserted.count === 0) {
        throw new ConflictException(
          "Os eventos elegiveis ja pertencem a outro replay",
        );
      }

      const updated = await tx.inboundWebhookReplayBatch.update({
        where: { id: created.id },
        data: { totalItems: inserted.count },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: connection.workspaceId,
          actorUserId: actor.id,
          actorType: actor.role,
          action: "inbound_webhook.replay.authorize",
          targetType: "inbound_webhook_replay_batch",
          targetId: created.id,
          sourceIp: this.sourceIp(sourceIp),
          resultStatus: "queued",
          afterSummary: {
            connectionId: connection.id,
            parserReleaseId: connection.parserRelease.id,
            itemCount: inserted.count,
            batchLimit: REPLAY_BATCH_LIMIT,
          },
        },
      });

      return updated;
    });

    try {
      await this.replayQueue.enqueueBatch({
        workspaceId: batch.workspaceId,
        batchId: batch.id,
      });
    } catch {
      await this.removeUnqueuedBatch(batch.id, batch.workspaceId);
      throw new ServiceUnavailableException(
        "Nao foi possivel iniciar o replay; tente novamente",
      );
    }

    return this.batchDto(batch);
  }

  async processBatch(
    input: Readonly<InboundWebhookReplayJobPayload>,
  ): Promise<BackofficeInboundWebhookReplayBatchDto> {
    this.assertJobPayload(input);

    if (!this.replayEnabled()) {
      return this.failEntireBatch(
        input,
        "inbound_webhook_replay_disabled",
      );
    }

    const batch =
      await this.prisma.inboundWebhookReplayBatch.findFirst({
        where: {
          id: input.batchId,
          workspaceId: input.workspaceId,
        },
      });

    if (!batch) {
      throw new ReplayItemFailure(
        "inbound_webhook_replay_batch_not_found",
      );
    }

    if (
      ["completed", "completed_with_failures", "failed"].includes(
        batch.status,
      )
    ) {
      return this.batchDto(batch);
    }

    await this.prisma.inboundWebhookReplayBatch.update({
      where: { id: batch.id },
      data: {
        status: "processing",
        startedAt: batch.startedAt ?? new Date(),
      },
    });

    const items = await this.prisma.inboundWebhookReplayItem.findMany({
      where: {
        workspaceId: batch.workspaceId,
        batchId: batch.id,
        status: {
          in: ["queued", "processing"],
        },
      },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    for (const item of items) {
      await this.processItem(batch.id, batch.workspaceId, item.id);
    }

    return this.finishBatch(batch.id, batch.workspaceId);
  }

  private async processItem(
    batchId: string,
    workspaceId: string,
    itemId: string,
  ): Promise<void> {
    const item =
      await this.prisma.inboundWebhookReplayItem.findFirst({
        where: {
          id: itemId,
          batchId,
          workspaceId,
        },
        include: replayItemInclude,
      });

    if (!item || terminalItemStatuses.has(item.status)) {
      return;
    }

    await this.prisma.inboundWebhookReplayItem.update({
      where: { id: item.id },
      data: {
        status: "processing",
        errorCode: null,
      },
    });

    try {
      const result = await this.materialize(item);

      await this.prisma.inboundWebhookReplayItem.update({
        where: { id: item.id },
        data: {
          status: result.duplicate ? "duplicate" : "materialized",
          leadId: result.leadId,
          conversionEventLogId: result.conversionEventLogId,
          errorCode: null,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.inboundWebhookReplayItem.update({
        where: { id: item.id },
        data: {
          status: "failed",
          errorCode: this.replayErrorCode(error),
          processedAt: new Date(),
        },
      });
    }
  }

  private async materialize(item: ReplayItemRecord): Promise<{
    leadId: string;
    conversionEventLogId: string;
    duplicate: boolean;
  }> {
    const event = item.event;
    const connection = event.connection;
    const delivery = event.delivery;
    const business = event.resolvedBusinessConnection;
    const reporting = event.resolvedReportingAccount;
    const destination = event.resolvedConversionDestination;
    const routeStillActive = event.channel.routes.some(
      (route) =>
        route.metaBusinessConnectionId ===
          event.resolvedBusinessConnectionId &&
        route.metaReportingAccountId === event.resolvedReportingAccountId &&
        route.metaConversionDestinationId ===
          event.resolvedConversionDestinationId,
    );
    const now = new Date();

    if (
      event.classification !== "eligible_route_resolved" ||
      !event.hasCtwa ||
      !event.adId
    ) {
      throw new ReplayItemFailure("inbound_webhook_replay_event_ineligible");
    }

    if (
      connection.removedAt ||
      connection.status !== "observation" ||
      connection.parserRelease.status !== "certified" ||
      connection.parserRelease.version !== delivery.parserVersion
    ) {
      throw new ReplayItemFailure("inbound_webhook_replay_context_changed");
    }

    if (
      !business ||
      business.status !== "active" ||
      business.credential.status !== "active" ||
      !reporting ||
      !reporting.active ||
      reporting.businessConnectionId !== business.id ||
      !destination ||
      destination.status !== "configured" ||
      !routeStillActive
    ) {
      throw new ReplayItemFailure("inbound_webhook_replay_route_invalid");
    }

    if (!this.payloadAvailable(delivery, now)) {
      throw new ReplayItemFailure("inbound_webhook_replay_payload_unavailable");
    }

    const parsedEvent = this.reparseEvent(item);
    const phone = normalizePhoneIdentity(parsedEvent.contact.phoneNumber);
    const phoneHash = hashPhoneIdentity(parsedEvent.contact.phoneNumber);

    if (!phone || !phoneHash || !parsedEvent.ctwaClid || !parsedEvent.adId) {
      throw new ReplayItemFailure("inbound_webhook_replay_identity_invalid");
    }

    const ad = await this.prisma.metaAd.findFirst({
      where: {
        workspaceId: event.workspaceId,
        adId: event.adId,
      },
      select: {
        campaignId: true,
        adSetId: true,
        adAccountId: true,
      },
    });

    if (!ad || ad.adAccountId !== reporting.adAccountId) {
      throw new ReplayItemFailure("inbound_webhook_replay_route_invalid");
    }

    const lead = await this.leads.upsertFromWhatsappWebhook({
      workspaceId: event.workspaceId,
      name: parsedEvent.contact.name ?? undefined,
      phone,
      source: "umbler",
      preserveExistingSource: true,
      preserveEarliestFirstMessageAt: true,
      campaignId: ad.campaignId ?? undefined,
      adSetId: ad.adSetId ?? undefined,
      adId: event.adId,
      ctwaClid: parsedEvent.ctwaClid,
      ctwaSourceUrl: parsedEvent.ad?.sourceUrl ?? undefined,
      ctwaThumbnailUrl: parsedEvent.ad?.thumbnailUrl ?? undefined,
      occurredAt: event.occurredAt,
      firstMessageAt: event.occurredAt,
      lastMessageAt: event.occurredAt,
    });

    if (!lead) {
      throw new ReplayItemFailure("inbound_webhook_replay_lead_invalid");
    }

    const conversion = await this.conversions.recordExternalConversion({
      workspaceId: event.workspaceId,
      externalConnectorId: null,
      sourceEventId: event.externalMessageId ?? event.id,
      sourceTrigger: "inbound_webhook:umbler",
      eventName: "LeadSubmitted",
      eventId: this.metaEventId(connection.id, event.dedupeKey),
      dedupeKey: `inbound-webhook:${connection.id}:${event.dedupeKey}`,
      leadId: lead.id,
      phoneHash,
      businessSource: "paid",
      metaAccountId: reporting.adAccountId,
      metaBusinessConnectionId: business.id,
      metaConversionDestinationId: destination.id,
      campaignId: ad.campaignId ?? null,
      adSetId: ad.adSetId ?? null,
      adId: event.adId,
      ctwaClid: parsedEvent.ctwaClid,
      eventOccurredAt: event.occurredAt,
      sourcePayload: {
        provider: "umbler",
        connectionId: connection.id,
        inboundEventId: event.id,
        channelId: event.channelId,
        classification: event.classification,
        hasCtwa: true,
        adId: event.adId,
      },
    });

    if (conversion.deliveryStatus === "ready_to_send") {
      await this.conversionQueue.enqueueSend(
        conversion.conversionEventLogId,
        event.workspaceId,
      );
    }

    return {
      leadId: lead.id,
      conversionEventLogId: conversion.conversionEventLogId,
      duplicate: conversion.status === "duplicate",
    };
  }

  private reparseEvent(item: ReplayItemRecord): ParsedInboundWebhookEvent {
    const { delivery, connection } = item.event;
    const decrypted = this.payloadEncryption.decrypt(
      {
        encryptedPayload: delivery.encryptedPayload!,
        payloadIv: delivery.payloadIv!,
        payloadTag: delivery.payloadTag!,
        encryptionKeyVersion: delivery.encryptionKeyVersion!,
      },
      {
        workspaceId: delivery.workspaceId,
        connectionId: delivery.connectionId,
        deliveryId: delivery.id,
      },
    );
    let payload: unknown;

    try {
      payload = JSON.parse(decrypted.toString("utf8"));
    } catch {
      throw new ReplayItemFailure("inbound_webhook_replay_payload_invalid");
    }

    const parser = this.parserRegistry.resolve({
      provider: connection.provider,
      parserVersion: connection.parserRelease.version,
      parserReleaseStatus: connection.parserRelease.status,
    });
    const result = parser.parse(payload);
    const parsedEvent = result.events.find(
      (candidate) => candidate.dedupeKey === item.event.dedupeKey,
    );

    if (
      result.error ||
      !parsedEvent ||
      parsedEvent.provider !== item.event.provider ||
      parsedEvent.externalMessageId !== item.event.externalMessageId
    ) {
      throw new ReplayItemFailure("inbound_webhook_replay_event_mismatch");
    }

    return parsedEvent;
  }

  private async finishBatch(
    batchId: string,
    workspaceId: string,
  ): Promise<BackofficeInboundWebhookReplayBatchDto> {
    const [materializedCount, duplicateCount, skippedCount, failedCount] =
      await Promise.all([
        this.itemCount(batchId, workspaceId, "materialized"),
        this.itemCount(batchId, workspaceId, "duplicate"),
        this.itemCount(batchId, workspaceId, "skipped"),
        this.itemCount(batchId, workspaceId, "failed"),
      ]);
    const status =
      skippedCount > 0 || failedCount > 0
        ? "completed_with_failures"
        : "completed";
    const completed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.inboundWebhookReplayBatch.update({
        where: { id: batchId },
        data: {
          status,
          materializedCount,
          duplicateCount,
          skippedCount,
          failedCount,
          completedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorUserId: null,
          actorType: "system",
          action: "inbound_webhook.replay.materialize",
          targetType: "inbound_webhook_replay_batch",
          targetId: batchId,
          resultStatus: status,
          afterSummary: {
            totalItems: updated.totalItems,
            materializedCount,
            duplicateCount,
            skippedCount,
            failedCount,
          },
        },
      });

      return updated;
    });

    return this.batchDto(completed);
  }

  private async failEntireBatch(
    input: Readonly<InboundWebhookReplayJobPayload>,
    errorCode: string,
  ): Promise<BackofficeInboundWebhookReplayBatchDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.inboundWebhookReplayBatch.findFirst({
        where: {
          id: input.batchId,
          workspaceId: input.workspaceId,
        },
      });

      if (!batch) {
        throw new ReplayItemFailure(
          "inbound_webhook_replay_batch_not_found",
        );
      }

      await tx.inboundWebhookReplayItem.updateMany({
        where: {
          workspaceId: batch.workspaceId,
          batchId: batch.id,
          status: {
            in: ["queued", "processing"],
          },
        },
        data: {
          status: "failed",
          errorCode,
          processedAt: new Date(),
        },
      });
      const failedCount = await tx.inboundWebhookReplayItem.count({
        where: {
          workspaceId: batch.workspaceId,
          batchId: batch.id,
          status: "failed",
        },
      });

      return tx.inboundWebhookReplayBatch.update({
        where: { id: batch.id },
        data: {
          status: "failed",
          failedCount,
          completedAt: new Date(),
        },
      });
    });

    return this.batchDto(result);
  }

  private itemCount(
    batchId: string,
    workspaceId: string,
    status: "materialized" | "duplicate" | "skipped" | "failed",
  ): Promise<number> {
    return this.prisma.inboundWebhookReplayItem.count({
      where: { batchId, workspaceId, status },
    });
  }

  private async removeUnqueuedBatch(
    batchId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.inboundWebhookReplayItem.deleteMany({
        where: { batchId, workspaceId },
      });
      await tx.inboundWebhookReplayBatch.deleteMany({
        where: { id: batchId, workspaceId, status: "queued" },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorUserId: null,
          actorType: "system",
          action: "inbound_webhook.replay.enqueue",
          targetType: "inbound_webhook_replay_batch",
          targetId: batchId,
          resultStatus: "failed",
          reason: "inbound_webhook_replay_queue_unavailable",
        },
      });
    });
  }

  private async loadConnection(connectionId: string) {
    const connection =
      await this.prisma.inboundWebhookConnection.findFirst({
        where: {
          id: connectionId,
          removedAt: null,
        },
        include: {
          parserRelease: true,
        },
      });

    if (!connection) {
      throw new NotFoundException("Conexao nao encontrada");
    }

    return connection;
  }

  private parserReleaseDto(release: {
    id: string;
    provider: "umbler";
    version: string;
    status: "observation_only" | "certified" | "retired";
    certifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): InboundWebhookParserReleaseDto {
    return {
      id: release.id,
      provider: release.provider,
      version: release.version,
      status: release.status,
      certifiedAt: release.certifiedAt?.toISOString() ?? null,
      createdAt: release.createdAt.toISOString(),
      updatedAt: release.updatedAt.toISOString(),
    };
  }

  private batchDto(batch: {
    id: string;
    workspaceId: string;
    connectionId: string;
    requestedByUserId: string;
    status:
      | "queued"
      | "processing"
      | "completed"
      | "completed_with_failures"
      | "failed";
    totalItems: number;
    materializedCount: number;
    duplicateCount: number;
    skippedCount: number;
    failedCount: number;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): BackofficeInboundWebhookReplayBatchDto {
    return {
      id: batch.id,
      workspaceId: batch.workspaceId,
      connectionId: batch.connectionId,
      requestedByUserId: batch.requestedByUserId,
      status: batch.status,
      totalItems: batch.totalItems,
      materializedCount: batch.materializedCount,
      duplicateCount: batch.duplicateCount,
      skippedCount: batch.skippedCount,
      failedCount: batch.failedCount,
      startedAt: batch.startedAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  }

  private routeReady(
    event: {
    classification: string;
    resolvedBusinessConnectionId: string | null;
    resolvedReportingAccountId: string | null;
    resolvedConversionDestinationId: string | null;
      resolvedBusinessConnection: {
        status: string;
        credential: {
          status: string;
        };
      } | null;
      resolvedReportingAccount: {
        active: boolean;
        adAccountId: string;
        businessConnectionId: string | null;
      } | null;
      resolvedConversionDestination: {
        status: string;
      } | null;
      channel: {
        routes: Array<{
          metaBusinessConnectionId: string | null;
          metaReportingAccountId: string | null;
          metaConversionDestinationId: string | null;
        }>;
      };
    },
    currentAdAccountId: string | null,
  ): boolean {
    const business = event.resolvedBusinessConnection;
    const reporting = event.resolvedReportingAccount;
    const destination = event.resolvedConversionDestination;

    return Boolean(
      event.classification === "eligible_route_resolved" &&
        event.resolvedBusinessConnectionId &&
        event.resolvedReportingAccountId &&
        event.resolvedConversionDestinationId &&
        business?.status === "active" &&
        business.credential.status === "active" &&
        reporting?.active &&
        reporting.businessConnectionId ===
          event.resolvedBusinessConnectionId &&
        currentAdAccountId &&
        reporting.adAccountId === currentAdAccountId &&
        destination?.status === "configured" &&
        event.channel.routes.some(
          (route) =>
            route.metaBusinessConnectionId ===
              event.resolvedBusinessConnectionId &&
            route.metaReportingAccountId ===
              event.resolvedReportingAccountId &&
            route.metaConversionDestinationId ===
              event.resolvedConversionDestinationId,
        ),
    );
  }

  private payloadAvailable(
    delivery: {
      payloadExpiresAt: Date;
      encryptedPayload: string | null;
      payloadIv: string | null;
      payloadTag: string | null;
      encryptionKeyVersion: number | null;
    },
    now: Date,
  ): boolean {
    return Boolean(
      delivery.payloadExpiresAt.getTime() > now.getTime() &&
        delivery.encryptedPayload &&
        delivery.payloadIv &&
        delivery.payloadTag &&
        delivery.encryptionKeyVersion,
    );
  }

  private replayEnabled(): boolean {
    const config = parseInboundWebhooksConfig(this.env);

    return config.enabled && config.replayEnabled;
  }

  private assertReplayEnabled(): void {
    if (!this.replayEnabled()) {
      throw new ServiceUnavailableException(
        "Replay controlado desativado neste ambiente",
      );
    }
  }

  private assertJobPayload(
    input: Readonly<InboundWebhookReplayJobPayload>,
  ): void {
    if (
      !input ||
      !this.identifier(input.batchId) ||
      !this.identifier(input.workspaceId)
    ) {
      throw new ReplayItemFailure("inbound_webhook_replay_context_invalid");
    }
  }

  private identifier(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= 255 &&
      !value.includes("\0")
    );
  }

  private replayErrorCode(error: unknown): string {
    return error instanceof ReplayItemFailure &&
      /^[a-z0-9_]{1,120}$/u.test(error.code)
      ? error.code
      : "inbound_webhook_replay_unexpected";
  }

  private metaEventId(connectionId: string, dedupeKey: string): string {
    const digest = createHash("sha256")
      .update(`${connectionId}\0${dedupeKey}`, "utf8")
      .digest("hex");

    return `umbler_lead_${digest}`;
  }

  private sourceIp(value: string | null): string | null {
    const normalized = value?.trim();

    return normalized &&
      normalized.length <= 128 &&
      !/[\u0000-\u001f\u007f]/u.test(normalized)
      ? normalized
      : null;
  }
}
