import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import type { InboundWebhookEventClassification } from "./providers/inbound-webhook-parser";

type ObservationRouteStatus =
  | "resolved"
  | "unresolved"
  | "not_applicable"
  | "not_evaluated";

export type InboundWebhookObservationDiagnosticInput = {
  workspaceId: string;
  deliveryId: string;
  connectionId: string;
  eventType: string;
  parserVersion: string;
  classification: InboundWebhookEventClassification | null;
  routeStatus: ObservationRouteStatus;
  processingStatus: "processed" | "failed";
  eventCount: number;
  errorCode: string | null;
  events: Array<{
    channelId: string;
    connectedPhoneSuffix: string | null;
    adId: string | null;
    hasCtwa: boolean;
    classification: InboundWebhookEventClassification;
    routeStatus: ObservationRouteStatus;
  }>;
};

export type InboundWebhookMaintenanceDiagnosticInput = {
  workspaceId?: string;
  deliveryId?: string;
  connectionId?: string;
  errorCode: string;
  operation: string;
  severity: "warning" | "error";
  status: "requires_review" | "failed";
  title: string;
  message: string;
};

@Injectable()
export class InboundWebhookDiagnosticsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async recordObservation(
    input: InboundWebhookObservationDiagnosticInput,
  ): Promise<void> {
    const idempotencyKey = `inbound-webhook-observation:${input.deliveryId}`;
    const summaryPayload = this.json({
      provider: "umbler",
      connectionId: input.connectionId,
      eventType: input.eventType,
      parserVersion: input.parserVersion,
      classification: input.classification,
      routeStatus: input.routeStatus,
      processingStatus: input.processingStatus,
      eventCount: input.eventCount,
      errorCode: input.errorCode,
      events: input.events,
    });

    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.webhookLog.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          workspaceId: true,
          source: true,
        },
      });

      if (existing) {
        if (
          existing.workspaceId !== input.workspaceId ||
          existing.source !== "umbler"
        ) {
          throw new Error("Inbound webhook diagnostic context mismatch");
        }

        return;
      }

      const webhook = await transaction.webhookLog.create({
        data: {
          workspaceId: input.workspaceId,
          source: "umbler",
          eventType: input.eventType,
          status: "received",
          idempotencyKey,
          summaryPayload,
        },
        select: { id: true },
      });

      await transaction.diagnosticEvent.create({
        data: {
          workspaceId: input.workspaceId,
          source: "umbler",
          eventType: input.eventType,
          severity: "info",
          status: "received",
          title: "Webhook umbler recebido",
          message: `Evento ${input.eventType} recebido para observacao`,
          webhookLogId: webhook.id,
          summaryPayload,
        },
      });
    });
  }

  async recordMaintenance(
    input: InboundWebhookMaintenanceDiagnosticInput,
  ): Promise<void> {
    await this.prisma.diagnosticEvent.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        source: "umbler",
        eventType: "inbound_webhook_maintenance",
        severity: input.severity,
        status: input.status,
        title: input.title,
        message: input.message,
        errorCode: input.errorCode,
        summaryPayload: this.json({
          deliveryId: input.deliveryId ?? null,
          connectionId: input.connectionId ?? null,
          operation: input.operation,
          errorCode: input.errorCode,
        }),
      },
    });
  }

  private json(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
