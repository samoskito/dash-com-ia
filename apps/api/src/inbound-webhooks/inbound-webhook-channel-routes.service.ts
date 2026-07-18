import { createHash } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  InboundWebhookChannelDto,
  InboundWebhookChannelRouteDto,
  InboundWebhookChannelRouteInputDto,
  InboundWebhookChannelRoutesUpdateInputDto,
  InboundWebhookChannelStatusUpdateInputDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  type InboundWebhookMetaRoutePreview,
  InboundWebhookMetaRouteReaderService,
} from "./inbound-webhook-meta-route-reader.service";

const resourceNotFoundMessage = "Recurso de webhook nao encontrado";
const validRouteStatus = "valid";
const removedRouteStatus = "inactive";
const removedRouteReason = "route_removed";

const channelInclude = {
  connection: {
    select: {
      id: true,
      workspaceId: true,
      status: true,
      removedAt: true,
    },
  },
  routes: {
    where: {
      active: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.InboundWebhookChannelInclude;

type PersistedChannel = Prisma.InboundWebhookChannelGetPayload<{
  include: typeof channelInclude;
}>;

type PersistedRoute = Prisma.InboundWebhookChannelRouteGetPayload<object>;

type NormalizedRouteInput = {
  routeKey: string;
  metaBusinessConnectionId: string;
  metaReportingAccountId: string | null;
  metaConversionDestinationId: string | null;
};

type RouteDecision =
  | {
      classification: "eligible_route_resolved";
      reason: "route_resolved";
      preview: InboundWebhookMetaRoutePreview & {
        status: "resolved";
        businessConnectionId: string;
        reportingAccountId: string;
        conversionDestinationId: string;
      };
    }
  | {
      classification: "eligible_route_unresolved";
      reason: string;
      conflict: boolean;
    };

export type InboundWebhookRouteReevaluationResult = {
  examinedCount: number;
  updatedCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  conflictCount: number;
};

@Injectable()
export class InboundWebhookChannelRoutesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(InboundWebhookMetaRouteReaderService)
    private readonly metaRouteReader: InboundWebhookMetaRouteReaderService,
  ) {}

  async listChannels(
    workspaceId: string,
    connectionId: string,
  ): Promise<InboundWebhookChannelDto[]> {
    await this.requireConnection(this.prisma, workspaceId, connectionId);

    const channels = await this.prisma.inboundWebhookChannel.findMany({
      where: {
        workspaceId,
        connectionId,
      },
      include: channelInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return channels.map((channel) => this.toChannelDto(channel));
  }

  async replaceRoutes(
    workspaceId: string,
    channelId: string,
    input: InboundWebhookChannelRoutesUpdateInputDto,
    actorUserId: string,
  ): Promise<InboundWebhookChannelRouteDto[]> {
    const routes = await this.prisma.$transaction(async (transaction) => {
      const channel = await this.requireChannel(
        transaction,
        workspaceId,
        channelId,
      );
      const before = await transaction.inboundWebhookChannelRoute.findMany({
        where: {
          workspaceId,
          channelId,
          active: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const normalizedRoutes = this.uniqueRouteInputs(input.routes);

      for (const route of normalizedRoutes) {
        await this.validateRouteReferences(transaction, workspaceId, route);
      }

      const validatedAt = new Date();
      const routeKeys = normalizedRoutes.map((route) => route.routeKey);
      await transaction.inboundWebhookChannelRoute.updateMany({
        where: {
          workspaceId,
          channelId,
          active: true,
          ...(routeKeys.length > 0
            ? {
                routeKey: {
                  notIn: routeKeys,
                },
              }
            : {}),
        },
        data: {
          active: false,
          validationStatus: removedRouteStatus,
          validationErrorCode: removedRouteReason,
          lastValidatedAt: validatedAt,
        },
      });

      for (const route of normalizedRoutes) {
        await transaction.inboundWebhookChannelRoute.upsert({
          where: {
            channelId_routeKey: {
              channelId,
              routeKey: route.routeKey,
            },
          },
          create: {
            workspaceId,
            channelId,
            routeKey: route.routeKey,
            metaBusinessConnectionWorkspaceId: workspaceId,
            metaBusinessConnectionId: route.metaBusinessConnectionId,
            metaReportingAccountWorkspaceId: route.metaReportingAccountId
              ? workspaceId
              : null,
            metaReportingAccountId: route.metaReportingAccountId,
            metaConversionDestinationWorkspaceId:
              route.metaConversionDestinationId ? workspaceId : null,
            metaConversionDestinationId: route.metaConversionDestinationId,
            active: true,
            validationStatus: validRouteStatus,
            validationErrorCode: null,
            lastValidatedAt: validatedAt,
            createdByUserId: actorUserId,
          },
          update: {
            metaBusinessConnectionWorkspaceId: workspaceId,
            metaBusinessConnectionId: route.metaBusinessConnectionId,
            metaReportingAccountWorkspaceId: route.metaReportingAccountId
              ? workspaceId
              : null,
            metaReportingAccountId: route.metaReportingAccountId,
            metaConversionDestinationWorkspaceId:
              route.metaConversionDestinationId ? workspaceId : null,
            metaConversionDestinationId: route.metaConversionDestinationId,
            active: true,
            validationStatus: validRouteStatus,
            validationErrorCode: null,
            lastValidatedAt: validatedAt,
          },
        });
      }

      const after = await transaction.inboundWebhookChannelRoute.findMany({
        where: {
          workspaceId,
          channelId,
          active: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "inbound_webhook.channel_routes_replaced",
        targetType: "InboundWebhookChannel",
        targetId: channel.id,
        resultStatus: "updated",
        beforeSummary: this.channelRoutesAuditSummary(channel, before),
        afterSummary: this.channelRoutesAuditSummary(channel, after),
      });

      return after;
    });

    await this.reevaluateUnresolvedEvents(workspaceId, channelId);
    return routes.map((route) => this.toRouteDto(route));
  }

  async removeRoute(
    workspaceId: string,
    channelId: string,
    routeId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const channel = await this.requireChannel(
        transaction,
        workspaceId,
        channelId,
      );
      const route = await transaction.inboundWebhookChannelRoute.findFirst({
        where: {
          id: routeId,
          workspaceId,
          channelId,
          active: true,
        },
      });

      if (!route) {
        this.throwNotFound();
      }

      const changed = await transaction.inboundWebhookChannelRoute.updateMany({
        where: {
          id: routeId,
          workspaceId,
          channelId,
          active: true,
        },
        data: {
          active: false,
          validationStatus: removedRouteStatus,
          validationErrorCode: removedRouteReason,
          lastValidatedAt: new Date(),
        },
      });

      if (changed.count !== 1) {
        this.throwNotFound();
      }

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "inbound_webhook.channel_route_removed",
        targetType: "InboundWebhookChannelRoute",
        targetId: route.id,
        resultStatus: "removed",
        beforeSummary: this.routeAuditSummary(route),
        afterSummary: this.routeAuditSummary({
          ...route,
          active: false,
          validationStatus: removedRouteStatus,
          validationErrorCode: removedRouteReason,
        }),
      });

      void channel;
    });

    await this.reevaluateUnresolvedEvents(workspaceId, channelId);
  }

  async updateChannelStatus(
    workspaceId: string,
    channelId: string,
    input: InboundWebhookChannelStatusUpdateInputDto,
    actorUserId: string,
  ): Promise<InboundWebhookChannelDto> {
    const channel = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireChannel(
        transaction,
        workspaceId,
        channelId,
      );
      const updatedAt = new Date(
        Math.max(Date.now(), current.updatedAt.getTime() + 1),
      );
      const changed = await transaction.inboundWebhookChannel.updateMany({
        where: {
          id: channelId,
          workspaceId,
          updatedAt: current.updatedAt,
        },
        data: {
          status: input.status,
          updatedAt,
        },
      });

      if (changed.count !== 1) {
        this.throwNotFound();
      }

      const updated = await this.requireChannel(
        transaction,
        workspaceId,
        channelId,
      );
      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action:
          input.status === "paused"
            ? "inbound_webhook.channel_paused"
            : "inbound_webhook.channel_activated",
        targetType: "InboundWebhookChannel",
        targetId: channelId,
        resultStatus: input.status,
        beforeSummary: this.channelStatusAuditSummary(current),
        afterSummary: this.channelStatusAuditSummary(updated),
      });

      return updated;
    });

    await this.reevaluateUnresolvedEvents(workspaceId, channelId);
    return this.toChannelDto(channel);
  }

  async reevaluateUnresolvedEvents(
    workspaceId: string,
    channelId: string,
  ): Promise<InboundWebhookRouteReevaluationResult> {
    const channel = await this.requireChannel(
      this.prisma,
      workspaceId,
      channelId,
    );
    const events = await this.prisma.inboundWebhookEvent.findMany({
      where: {
        workspaceId,
        channelId,
        classification: "eligible_route_unresolved",
      },
      select: {
        id: true,
        adId: true,
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });

    const decisions: Array<{
      eventId: string;
      decision: RouteDecision;
    }> = [];
    for (const event of events) {
      decisions.push({
        eventId: event.id,
        decision: await this.evaluateEventRoute(channel, event.adId),
      });
    }

    let updatedCount = 0;
    let resolvedCount = 0;
    let unresolvedCount = 0;
    let conflictCount = 0;

    if (decisions.length > 0) {
      await this.prisma.$transaction(async (transaction) => {
        for (const { eventId, decision } of decisions) {
          const changed = await transaction.inboundWebhookEvent.updateMany({
            where: {
              id: eventId,
              workspaceId,
              channelId,
              classification: "eligible_route_unresolved",
            },
            data: this.eventRouteUpdate(workspaceId, decision),
          });

          if (changed.count !== 1) {
            continue;
          }

          updatedCount += 1;
          if (decision.classification === "eligible_route_resolved") {
            resolvedCount += 1;
          } else {
            unresolvedCount += 1;
            conflictCount += decision.conflict ? 1 : 0;
          }
        }
      });
    }

    return {
      examinedCount: events.length,
      updatedCount,
      resolvedCount,
      unresolvedCount,
      conflictCount,
    };
  }

  private async evaluateEventRoute(
    channel: PersistedChannel,
    adIdValue: string | null,
  ): Promise<RouteDecision> {
    if (channel.connection.status === "paused") {
      return this.unresolvedDecision("route_connection_paused");
    }

    if (channel.status === "paused") {
      return this.unresolvedDecision("route_channel_paused");
    }

    const adId = adIdValue?.trim();
    if (!adId) {
      return this.unresolvedDecision("route_ad_missing");
    }

    if (channel.routes.length === 0) {
      return this.unresolvedDecision("route_not_configured");
    }

    const previews: Array<
      | {
          status: "resolved";
          preview: InboundWebhookMetaRoutePreview & {
            status: "resolved";
            businessConnectionId: string;
            reportingAccountId: string;
            conversionDestinationId: string;
          };
        }
      | {
          status: "unresolved";
          reason: string;
        }
    > = [];

    for (const route of channel.routes) {
      if (!route.metaBusinessConnectionId) {
        previews.push({
          status: "unresolved",
          reason: "route_reference_missing",
        });
        continue;
      }

      try {
        const preview = await this.metaRouteReader.previewRoute({
          workspaceId: channel.workspaceId,
          adId,
          businessConnectionId: route.metaBusinessConnectionId,
          reportingAccountId: route.metaReportingAccountId,
          conversionDestinationId: route.metaConversionDestinationId,
        });

        if (this.previewMatchesRoute(preview, route)) {
          previews.push({
            status: "resolved",
            preview,
          });
        } else {
          previews.push({
            status: "unresolved",
            reason:
              preview.status === "unresolved"
                ? this.safeReason(preview.reason, "route_unresolved")
                : "route_preview_mismatch",
          });
        }
      } catch {
        previews.push({
          status: "unresolved",
          reason: "route_preview_failed",
        });
      }
    }

    const resolved = previews.filter(
      (
        preview,
      ): preview is Extract<
        (typeof previews)[number],
        { status: "resolved" }
      > => preview.status === "resolved",
    );

    if (resolved.length === 1) {
      return {
        classification: "eligible_route_resolved",
        reason: "route_resolved",
        preview: resolved[0].preview,
      };
    }

    if (resolved.length > 1) {
      return this.unresolvedDecision("route_conflict", true);
    }

    const reasons = new Set(
      previews
        .filter(
          (
            preview,
          ): preview is Extract<
            (typeof previews)[number],
            { status: "unresolved" }
          > => preview.status === "unresolved",
        )
        .map((preview) => preview.reason),
    );

    return this.unresolvedDecision(
      reasons.size === 1 ? [...reasons][0] : "route_unresolved",
    );
  }

  private previewMatchesRoute(
    preview: InboundWebhookMetaRoutePreview,
    route: PersistedRoute,
  ): preview is InboundWebhookMetaRoutePreview & {
    status: "resolved";
    businessConnectionId: string;
    reportingAccountId: string;
    conversionDestinationId: string;
  } {
    return (
      preview.status === "resolved" &&
      preview.businessConnectionId === route.metaBusinessConnectionId &&
      preview.reportingAccountId !== null &&
      preview.conversionDestinationId !== null &&
      (route.metaReportingAccountId === null ||
        preview.reportingAccountId === route.metaReportingAccountId) &&
      (route.metaConversionDestinationId === null ||
        preview.conversionDestinationId === route.metaConversionDestinationId)
    );
  }

  private eventRouteUpdate(
    workspaceId: string,
    decision: RouteDecision,
  ): Prisma.InboundWebhookEventUncheckedUpdateManyInput {
    if (decision.classification === "eligible_route_resolved") {
      return {
        classification: decision.classification,
        classificationReason: decision.reason,
        resolvedBusinessConnectionWorkspaceId: workspaceId,
        resolvedBusinessConnectionId: decision.preview.businessConnectionId,
        resolvedReportingAccountWorkspaceId: workspaceId,
        resolvedReportingAccountId: decision.preview.reportingAccountId,
        resolvedConversionDestinationWorkspaceId: workspaceId,
        resolvedConversionDestinationId:
          decision.preview.conversionDestinationId,
      };
    }

    return {
      classification: decision.classification,
      classificationReason: decision.reason,
      resolvedBusinessConnectionWorkspaceId: null,
      resolvedBusinessConnectionId: null,
      resolvedReportingAccountWorkspaceId: null,
      resolvedReportingAccountId: null,
      resolvedConversionDestinationWorkspaceId: null,
      resolvedConversionDestinationId: null,
    };
  }

  private unresolvedDecision(reason: string, conflict = false): RouteDecision {
    return {
      classification: "eligible_route_unresolved",
      reason: this.safeReason(reason, "route_unresolved"),
      conflict,
    };
  }

  private safeReason(value: string, fallback: string): string {
    return /^[a-z0-9_]{1,120}$/u.test(value) ? value : fallback;
  }

  private uniqueRouteInputs(
    routes: InboundWebhookChannelRouteInputDto[],
  ): NormalizedRouteInput[] {
    const unique = new Map<string, NormalizedRouteInput>();

    for (const input of routes) {
      const metaBusinessConnectionId = input.metaBusinessConnectionId.trim();
      const metaReportingAccountId = this.normalizeOptionalId(
        input.metaReportingAccountId,
      );
      const metaConversionDestinationId = this.normalizeOptionalId(
        input.metaConversionDestinationId,
      );
      const routeKey = this.routeKey({
        metaBusinessConnectionId,
        metaReportingAccountId,
        metaConversionDestinationId,
      });

      unique.set(routeKey, {
        routeKey,
        metaBusinessConnectionId,
        metaReportingAccountId,
        metaConversionDestinationId,
      });
    }

    return [...unique.values()];
  }

  private normalizeOptionalId(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = value.trim();
    return normalized || null;
  }

  private routeKey(input: Omit<NormalizedRouteInput, "routeKey">): string {
    return createHash("sha256")
      .update(
        JSON.stringify([
          "v1",
          input.metaBusinessConnectionId,
          input.metaReportingAccountId,
          input.metaConversionDestinationId,
        ]),
        "utf8",
      )
      .digest("hex");
  }

  private async validateRouteReferences(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    route: NormalizedRouteInput,
  ): Promise<void> {
    const business = await transaction.metaBusinessConnection.findFirst({
      where: {
        id: route.metaBusinessConnectionId,
        workspaceId,
      },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        credential: {
          select: {
            workspaceId: true,
            status: true,
          },
        },
      },
    });

    if (
      !business ||
      business.workspaceId !== workspaceId ||
      business.status !== "active" ||
      business.credential.workspaceId !== workspaceId ||
      business.credential.status !== "active"
    ) {
      this.throwNotFound();
    }

    if (route.metaReportingAccountId) {
      const account = await transaction.metaReportingAccount.findFirst({
        where: {
          id: route.metaReportingAccountId,
          workspaceId,
        },
        select: {
          id: true,
          workspaceId: true,
          businessConnectionId: true,
          active: true,
        },
      });

      if (
        !account ||
        account.workspaceId !== workspaceId ||
        !account.active ||
        account.businessConnectionId !== business.id
      ) {
        this.throwNotFound();
      }
    }

    if (route.metaConversionDestinationId) {
      const destination = await transaction.metaConversionDestination.findFirst(
        {
          where: {
            id: route.metaConversionDestinationId,
            workspaceId,
          },
          select: {
            id: true,
            workspaceId: true,
            status: true,
          },
        },
      );

      if (
        !destination ||
        destination.workspaceId !== workspaceId ||
        destination.status !== "configured"
      ) {
        this.throwNotFound();
      }
    }
  }

  private async requireConnection(
    client: Pick<PrismaService, "inboundWebhookConnection">,
    workspaceId: string,
    connectionId: string,
  ): Promise<void> {
    const connection = await client.inboundWebhookConnection.findFirst({
      where: {
        id: connectionId,
        workspaceId,
        removedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!connection) {
      this.throwNotFound();
    }
  }

  private async requireChannel(
    client: Pick<PrismaService, "inboundWebhookChannel">,
    workspaceId: string,
    channelId: string,
  ): Promise<PersistedChannel> {
    const channel = await client.inboundWebhookChannel.findFirst({
      where: {
        id: channelId,
        workspaceId,
        connection: {
          is: {
            workspaceId,
            removedAt: null,
          },
        },
      },
      include: channelInclude,
    });

    if (
      !channel ||
      channel.workspaceId !== workspaceId ||
      channel.connection.workspaceId !== workspaceId ||
      channel.connection.removedAt !== null
    ) {
      this.throwNotFound();
    }

    return channel;
  }

  private throwNotFound(): never {
    throw new NotFoundException(resourceNotFoundMessage);
  }

  private toChannelDto(channel: PersistedChannel): InboundWebhookChannelDto {
    return {
      id: channel.id,
      connectionId: channel.connectionId,
      organizationId: channel.organizationId,
      providerChannelId: channel.providerChannelId,
      connectedPhone: channel.connectedPhone,
      channelName: channel.channelName,
      status: channel.status,
      firstSeenAt: channel.firstSeenAt.toISOString(),
      lastSeenAt: channel.lastSeenAt.toISOString(),
      routes: channel.routes.map((route) => this.toRouteDto(route)),
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
    };
  }

  private toRouteDto(route: PersistedRoute): InboundWebhookChannelRouteDto {
    return {
      id: route.id,
      channelId: route.channelId,
      metaBusinessConnectionId: route.metaBusinessConnectionId,
      metaReportingAccountId: route.metaReportingAccountId,
      metaConversionDestinationId: route.metaConversionDestinationId,
      active: route.active,
      validationStatus: route.validationStatus,
      validationErrorCode: route.validationErrorCode,
      lastValidatedAt: route.lastValidatedAt?.toISOString() ?? null,
      createdAt: route.createdAt.toISOString(),
      updatedAt: route.updatedAt.toISOString(),
    };
  }

  private channelRoutesAuditSummary(
    channel: Pick<PersistedChannel, "id" | "connectionId" | "status">,
    routes: PersistedRoute[],
  ): Prisma.InputJsonObject {
    return {
      channelId: channel.id,
      connectionId: channel.connectionId,
      channelStatus: channel.status,
      routeCount: routes.length,
      routes: routes.map((route) => this.routeAuditSummary(route)),
    };
  }

  private channelStatusAuditSummary(
    channel: Pick<PersistedChannel, "id" | "connectionId" | "status">,
  ): Prisma.InputJsonObject {
    return {
      channelId: channel.id,
      connectionId: channel.connectionId,
      status: channel.status,
    };
  }

  private routeAuditSummary(
    route: Pick<
      PersistedRoute,
      | "id"
      | "channelId"
      | "metaBusinessConnectionId"
      | "metaReportingAccountId"
      | "metaConversionDestinationId"
      | "active"
      | "validationStatus"
      | "validationErrorCode"
    >,
  ): Prisma.InputJsonObject {
    return {
      routeId: route.id,
      channelId: route.channelId,
      metaBusinessConnectionId: route.metaBusinessConnectionId,
      metaReportingAccountId: route.metaReportingAccountId,
      metaConversionDestinationId: route.metaConversionDestinationId,
      active: route.active,
      validationStatus: route.validationStatus,
      validationErrorCode: route.validationErrorCode,
    };
  }

  private async createAudit(
    transaction: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      actorUserId: string;
      action: string;
      targetType: string;
      targetId: string;
      resultStatus: string;
      beforeSummary: Prisma.InputJsonObject;
      afterSummary: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        actorType: "user",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: null,
        sourceIp: null,
        resultStatus: input.resultStatus,
        beforeSummary: input.beforeSummary,
        afterSummary: input.afterSummary,
      },
    });
  }
}

export { resourceNotFoundMessage };
