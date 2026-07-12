import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  canonicalTrackingEventTypes,
  externalConnectorProviderSchema,
  externalConnectorReconciliationSchema,
  externalConnectorSslModeSchema,
  externalConnectorStatusSchema,
  externalConnectorHealthSchema,
  externalDataConnectorSchema,
  externalMysqlCredentialsInputSchema,
  type CanonicalTrackingEventTypeDto,
  type ExternalConnectionTestResultDto,
  type ExternalConnectorHealthDto,
  type ExternalConnectorReconciliationDto,
  type ExternalDataConnectorCreateInputDto,
  type ExternalDataConnectorDto,
  type ExternalDataConnectorUpdateInputDto,
  type ExternalSyncInputDto,
  type ExternalSyncQueuedResultDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { ExternalCredentialEncryptionService } from "./external-credential-encryption.service";
import { ExternalMysqlAdapter } from "./external-mysql.adapter";
import { ExternalSyncQueueService } from "./external-sync-queue.service";

type ConnectorWithCursors = {
  id: string;
  workspaceId: string;
  name: string;
  provider: string;
  status: string;
  timezone: string;
  sslMode: string;
  credentialsEncrypted: string;
  credentialsIv: string;
  credentialsTag: string;
  syncEnabled: boolean;
  shadowMode: boolean;
  capiSendEnabled: boolean;
  purchaseAverageValueCents: number | null;
  defaultCurrency: string | null;
  lastConnectionTestAt: Date | null;
  lastConnectionStatus: string | null;
  lastSyncStartedAt: Date | null;
  lastSyncCompletedAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  cursors: Array<{
    stream: string;
    lastExternalId: string | null;
    lastUpdatedAt: Date | null;
    lastSyncedAt: Date | null;
  }>;
};

@Injectable()
export class ExternalDataService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExternalCredentialEncryptionService)
    private readonly credentialEncryption: ExternalCredentialEncryptionService,
    @Inject(ExternalMysqlAdapter)
    private readonly mysqlAdapter: ExternalMysqlAdapter,
    @Inject(ExternalSyncQueueService)
    private readonly syncQueue: ExternalSyncQueueService
  ) {}

  async listConnectors(
    workspaceId?: string,
    includeHealth = false
  ): Promise<ExternalDataConnectorDto[] | ExternalConnectorHealthDto[]> {
    const connectors = (await this.prisma.externalDataConnector.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      include: { cursors: { orderBy: { stream: "asc" } } },
      orderBy: [{ workspaceId: "asc" }, { createdAt: "desc" }]
    })) as ConnectorWithCursors[];

    if (!includeHealth) {
      return connectors.map((connector) => this.toDto(connector));
    }

    const totalsByConnector = await this.ingestionTotals(
      connectors.map((connector) => connector.id)
    );
    const reconciliationByConnector = await this.buildReconciliations(connectors);

    return connectors.map((connector) =>
      externalConnectorHealthSchema.parse({
        connector: this.toDto(connector),
        totals: totalsByConnector.get(connector.id) ?? this.emptyIngestionTotals(),
        reconciliation: reconciliationByConnector.get(connector.id)
      })
    );
  }

  async createConnector(
    input: ExternalDataConnectorCreateInputDto,
    actorUserId: string
  ): Promise<ExternalDataConnectorDto> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { id: true }
    });

    if (!workspace) {
      throw new NotFoundException("Workspace nao encontrado");
    }

    const encrypted = this.credentialEncryption.encrypt(input.credentials);
    const connector = (await this.prisma.externalDataConnector.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        provider: input.provider,
        timezone: input.timezone,
        sslMode: input.sslMode,
        ...encrypted,
        syncEnabled: input.syncEnabled,
        shadowMode: input.shadowMode,
        capiSendEnabled: input.capiSendEnabled,
        purchaseAverageValueCents: input.purchaseAverageValueCents ?? null,
        defaultCurrency: input.defaultCurrency
      },
      include: { cursors: true }
    })) as ConnectorWithCursors;
    const dto = this.toDto(connector);

    await this.createAudit({
      workspaceId: connector.workspaceId,
      actorUserId,
      action: "external_connector.created",
      targetId: connector.id,
      afterSummary: this.auditSummary(dto)
    });

    return dto;
  }

  async updateConnector(
    connectorId: string,
    input: ExternalDataConnectorUpdateInputDto,
    actorUserId: string
  ): Promise<ExternalDataConnectorDto> {
    const current = await this.getConnector(connectorId);
    const before = this.toDto(current);
    const enablesReading = input.status === "active" || input.syncEnabled === true;

    if (enablesReading && current.lastConnectionStatus !== "connected") {
      throw new BadRequestException("Teste a conexao e as views antes de ativar a sincronizacao");
    }

    const data: Prisma.ExternalDataConnectorUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.sslMode !== undefined ? { sslMode: input.sslMode } : {}),
      ...(input.syncEnabled !== undefined ? { syncEnabled: input.syncEnabled } : {}),
      ...(input.shadowMode !== undefined ? { shadowMode: input.shadowMode } : {}),
      ...(input.capiSendEnabled !== undefined ? { capiSendEnabled: input.capiSendEnabled } : {}),
      ...(input.purchaseAverageValueCents !== undefined
        ? { purchaseAverageValueCents: input.purchaseAverageValueCents }
        : {}),
      ...(input.defaultCurrency !== undefined ? { defaultCurrency: input.defaultCurrency } : {})
    };

    if (input.credentials) {
      const existing = this.credentialEncryption.decrypt(current);
      const credentials = externalMysqlCredentialsInputSchema.parse({
        ...existing,
        ...input.credentials
      });
      Object.assign(data, this.credentialEncryption.encrypt(credentials));
    }

    if (input.status === "disabled") {
      data.syncEnabled = false;
      data.capiSendEnabled = false;
    }

    const updated = (await this.prisma.externalDataConnector.update({
      where: { id: connectorId },
      data,
      include: { cursors: { orderBy: { stream: "asc" } } }
    })) as ConnectorWithCursors;
    const dto = this.toDto(updated);

    await this.createAudit({
      workspaceId: updated.workspaceId,
      actorUserId,
      action: "external_connector.updated",
      targetId: updated.id,
      beforeSummary: this.auditSummary(before),
      afterSummary: this.auditSummary(dto)
    });

    return dto;
  }

  async testConnection(
    connectorId: string,
    actorUserId: string
  ): Promise<ExternalConnectionTestResultDto> {
    const connector = await this.getConnector(connectorId);
    const credentials = this.credentialEncryption.decrypt(connector);
    const sslMode = externalConnectorSslModeSchema.parse(connector.sslMode);
    const result = await this.mysqlAdapter.testConnection(credentials, sslMode);

    await this.prisma.externalDataConnector.update({
      where: { id: connector.id },
      data: {
        lastConnectionTestAt: new Date(),
        lastConnectionStatus: result.status,
        ...(result.ok ? { lastSyncErrorCode: null } : {})
      }
    });
    await this.createAudit({
      workspaceId: connector.workspaceId,
      actorUserId,
      action: "external_connector.connection_tested",
      targetId: connector.id,
      resultStatus: result.ok ? "success" : "failed",
      afterSummary: {
        status: result.status,
        latencyMs: result.latencyMs,
        leadsViewAvailable: result.leadsViewAvailable,
        eventsViewAvailable: result.eventsViewAvailable,
        errorCode: result.errorCode
      }
    });

    return result;
  }

  async enqueueSync(
    connectorId: string,
    input: ExternalSyncInputDto,
    actorUserId: string
  ): Promise<ExternalSyncQueuedResultDto> {
    const connector = await this.getConnector(connectorId);

    if (connector.status !== "active") {
      throw new BadRequestException("Ative o conector antes de sincronizar");
    }

    const result = await this.syncQueue.enqueueSync({
      connectorId,
      streams: input.streams,
      requestedByUserId: actorUserId
    });
    await this.createAudit({
      workspaceId: connector.workspaceId,
      actorUserId,
      action: "external_connector.sync_requested",
      targetId: connector.id,
      afterSummary: { streams: result.streams, jobId: result.jobId }
    });

    return result;
  }

  async enqueueLeadsReimport(
    connectorId: string,
    actorUserId: string
  ): Promise<ExternalSyncQueuedResultDto> {
    const connector = await this.getConnector(connectorId);

    if (connector.status !== "active") {
      throw new BadRequestException("Ative o conector antes de reimportar");
    }

    if (connector.lastSyncStatus === "running") {
      throw new BadRequestException("Aguarde a sincronizacao atual terminar");
    }

    const result = await this.syncQueue.enqueueSync({
      connectorId,
      streams: ["leads"],
      projectionRefresh: true,
      requestedByUserId: actorUserId
    });
    await this.createAudit({
      workspaceId: connector.workspaceId,
      actorUserId,
      action: "external_connector.leads_reimport_requested",
      targetId: connector.id,
      afterSummary: { streams: result.streams, jobId: result.jobId }
    });

    return result;
  }

  async getHealth(connectorId: string): Promise<ExternalConnectorHealthDto> {
    const connector = await this.getConnector(connectorId);
    const [totalsByConnector, reconciliations] = await Promise.all([
      this.ingestionTotals([connectorId]),
      this.buildReconciliations([connector])
    ]);

    return externalConnectorHealthSchema.parse({
      connector: this.toDto(connector),
      totals: totalsByConnector.get(connectorId) ?? this.emptyIngestionTotals(),
      reconciliation: reconciliations.get(connectorId)
    });
  }

  private async buildReconciliations(
    connectors: ConnectorWithCursors[]
  ): Promise<Map<string, ExternalConnectorReconciliationDto>> {
    const reconciliations = new Map<string, ExternalConnectorReconciliationDto>();
    if (!connectors.length) {
      return reconciliations;
    }

    const connectorIds = connectors.map((connector) => connector.id);
    const workspaceIds = [...new Set(connectors.map((connector) => connector.workspaceId))];
    const eventNames = ["LeadSubmitted", "QualifiedLead", "Purchase"];
    const activeConversionLinks = await this.prisma.externalIngestionRecord.findMany({
      where: {
        connectorId: { in: connectorIds },
        stream: "events",
        eventType: { in: [...canonicalTrackingEventTypes] },
        status: { not: "removed" },
        conversionEventLogId: { not: null }
      },
      select: { connectorId: true, conversionEventLogId: true }
    });
    const activeConversionIdsByConnector = new Map<string, Set<string>>();
    for (const link of activeConversionLinks) {
      if (!link.conversionEventLogId) {
        continue;
      }
      const ids = activeConversionIdsByConnector.get(link.connectorId) ?? new Set<string>();
      ids.add(link.conversionEventLogId);
      activeConversionIdsByConnector.set(link.connectorId, ids);
    }
    const activeDeliveryFilters = [...activeConversionIdsByConnector.entries()].map(
      ([externalConnectorId, ids]) => ({
        externalConnectorId,
        id: { in: [...ids] }
      })
    );
    const [
      ingestionGroups,
      historicalGroups,
      deliveryGroups,
      metaConnections,
      metaDestinations
    ] = await Promise.all([
      this.prisma.externalIngestionRecord.groupBy({
        by: ["connectorId", "eventType", "status"],
        where: {
          connectorId: { in: connectorIds },
          stream: "events",
          eventType: { in: [...canonicalTrackingEventTypes] },
          status: { not: "removed" }
        },
        _count: { _all: true },
        _sum: { duplicateCount: true },
        _min: { occurredAt: true },
        _max: { occurredAt: true }
      }),
      this.prisma.externalIngestionRecord.groupBy({
        by: ["connectorId", "eventType"],
        where: {
          connectorId: { in: connectorIds },
          stream: "events",
          eventType: { in: [...canonicalTrackingEventTypes] },
          externalRowId: { startsWith: "historical-lead:" },
          status: { not: "removed" }
        },
        _count: { _all: true }
      }),
      activeDeliveryFilters.length
        ? this.prisma.conversionEventLog.groupBy({
            by: ["externalConnectorId", "eventName", "status", "businessSource"],
            where: {
              OR: activeDeliveryFilters,
              eventName: { in: eventNames }
            },
            _count: { _all: true }
          })
        : Promise.resolve([]),
      this.prisma.metaIntegration.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { workspaceId: true, status: true, encryptedAccessToken: true }
      }),
      this.prisma.metaConversionDestination.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { workspaceId: true, status: true, pixelId: true, pageId: true }
      })
    ]);
    const eventsByConnector = new Map<
      string,
      Map<
        CanonicalTrackingEventTypeDto,
        ExternalConnectorReconciliationDto["events"][number]
      >
    >();
    for (const connector of connectors) {
      const events = new Map<
        CanonicalTrackingEventTypeDto,
        ExternalConnectorReconciliationDto["events"][number]
      >();
      for (const eventType of canonicalTrackingEventTypes) {
        events.set(eventType, {
          eventType,
          sourceRows: 0,
          operationalRows: 0,
          historicalRows: 0,
          matchedRows: 0,
          duplicateDeliveries: 0,
          rejectedRows: 0,
          pendingRows: 0,
          readyToSendRows: 0,
          sentRows: 0,
          importedRows: 0,
          blockedDeliveryRows: 0,
          firstOccurredAt: null,
          lastOccurredAt: null
        });
      }
      eventsByConnector.set(connector.id, events);
    }

    for (const group of ingestionGroups) {
      const event = group.eventType
        ? eventsByConnector
            .get(group.connectorId)
            ?.get(group.eventType as CanonicalTrackingEventTypeDto)
        : undefined;
      if (!event) {
        continue;
      }

      event.sourceRows += group._count._all;
      event.duplicateDeliveries += Math.max(0, group._sum.duplicateCount ?? 0);
      event.firstOccurredAt = this.earlierDate(
        event.firstOccurredAt,
        group._min.occurredAt
      );
      event.lastOccurredAt = this.laterDate(event.lastOccurredAt, group._max.occurredAt);

      if (group.status === "rejected") {
        event.rejectedRows += group._count._all;
      } else if (["pending", "pending_delivery"].includes(group.status)) {
        event.pendingRows += group._count._all;
      }
    }

    for (const group of historicalGroups) {
      const event = group.eventType
        ? eventsByConnector
            .get(group.connectorId)
            ?.get(group.eventType as CanonicalTrackingEventTypeDto)
        : undefined;
      if (event) {
        event.historicalRows += group._count._all;
      }
    }

    const eventTypeByName = new Map<string, CanonicalTrackingEventTypeDto>([
      ["LeadSubmitted", "conversation_started"],
      ["QualifiedLead", "qualified_lead"],
      ["Purchase", "purchase"]
    ]);
    const acceptedPaidStatuses = new Set(["ready_to_send", "sent", "imported"]);

    for (const group of deliveryGroups) {
      const eventType = eventTypeByName.get(group.eventName);
      const event =
        eventType && group.externalConnectorId
          ? eventsByConnector.get(group.externalConnectorId)?.get(eventType)
          : undefined;
      if (!event) {
        continue;
      }

      event.matchedRows += group._count._all;
      if (group.status === "ready_to_send") {
        event.readyToSendRows += group._count._all;
      } else if (group.status === "sent") {
        event.sentRows += group._count._all;
      } else if (group.status === "imported") {
        event.importedRows += group._count._all;
      }

      if (group.businessSource === "paid" && !acceptedPaidStatuses.has(group.status)) {
        event.blockedDeliveryRows += group._count._all;
      }
    }

    const metaConnectionByWorkspace = new Map<
      string,
      (typeof metaConnections)[number]
    >();
    for (const connection of metaConnections) {
      metaConnectionByWorkspace.set(connection.workspaceId, connection);
    }
    const metaDestinationByWorkspace = new Map<
      string,
      (typeof metaDestinations)[number]
    >();
    for (const destination of metaDestinations) {
      metaDestinationByWorkspace.set(destination.workspaceId, destination);
    }

    const generatedAt = new Date().toISOString();
    for (const connector of connectors) {
      const eventMap = eventsByConnector.get(connector.id);
      if (!eventMap) {
        continue;
      }

      const reconciledEvents = [...eventMap.values()].map((event) => ({
        ...event,
        operationalRows: Math.max(0, event.sourceRows - event.historicalRows)
      }));
      const blockers: ExternalConnectorReconciliationDto["blockers"] = [];
      const addBlocker = (code: string, message: string) => {
        blockers.push({ code, message });
      };

      if (connector.status !== "active") {
        addBlocker("CONNECTOR_INACTIVE", "Ative o conector externo antes do corte CAPI.");
      }
      if (!connector.syncEnabled) {
        addBlocker("SYNC_DISABLED", "Ative a sincronizacao automatica do conector.");
      }
      if (connector.lastConnectionStatus !== "connected") {
        addBlocker("CONNECTION_NOT_VALIDATED", "Valide novamente a conexao MySQL.");
      }
      if (connector.lastSyncStatus !== "completed") {
        addBlocker("SYNC_NOT_COMPLETED", "Conclua uma sincronizacao sem falhas.");
      }
      if (
        !connector.cursors.some(
          (cursor) => cursor.stream === "events" && cursor.lastSyncedAt
        )
      ) {
        addBlocker("EVENT_CURSOR_MISSING", "Sincronize o fluxo de eventos ao menos uma vez.");
      }
      if (connector.shadowMode === connector.capiSendEnabled) {
        addBlocker(
          "CAPI_MODE_INCONSISTENT",
          "O conector deve estar em sombra sem CAPI ou ativo com CAPI."
        );
      }

      const metaConnection = metaConnectionByWorkspace.get(connector.workspaceId);
      const metaDestination = metaDestinationByWorkspace.get(connector.workspaceId);
      const connectionConfigured =
        metaConnection?.status === "connected" &&
        Boolean(metaConnection.encryptedAccessToken);
      const destinationConfigured =
        metaDestination?.status === "configured" &&
        Boolean(metaDestination.pixelId) &&
        Boolean(metaDestination.pageId);

      if (!connectionConfigured) {
        addBlocker("META_CONNECTION_MISSING", "Conecte a conta Meta deste workspace.");
      }
      if (!destinationConfigured) {
        addBlocker("META_DESTINATION_MISSING", "Configure Pixel e Pagina do destino CAPI.");
      }

      for (const event of reconciledEvents) {
        if (event.operationalRows === 0) {
          addBlocker(
            `EVENT_NOT_OBSERVED_${event.eventType.toUpperCase()}`,
            `Aguarde o primeiro evento real de ${event.eventType}.`
          );
        }
        if (event.rejectedRows > 0) {
          addBlocker(
            `REJECTED_${event.eventType.toUpperCase()}`,
            `${event.rejectedRows} evento(s) de ${event.eventType} foram rejeitados.`
          );
        }
        if (event.pendingRows > 0) {
          addBlocker(
            `PENDING_${event.eventType.toUpperCase()}`,
            `${event.pendingRows} evento(s) de ${event.eventType} estao pendentes.`
          );
        }

        const expectedMatches = event.sourceRows - event.rejectedRows - event.pendingRows;
        if (event.matchedRows < expectedMatches) {
          addBlocker(
            `UNMATCHED_${event.eventType.toUpperCase()}`,
            `${expectedMatches - event.matchedRows} evento(s) de ${event.eventType} nao possuem conversao vinculada.`
          );
        }
        if (event.blockedDeliveryRows > 0) {
          addBlocker(
            `DELIVERY_BLOCKED_${event.eventType.toUpperCase()}`,
            `${event.blockedDeliveryRows} evento(s) pagos de ${event.eventType} nao estao prontos para CAPI.`
          );
        }
      }

      const liveMode = !connector.shadowMode && connector.capiSendEnabled;
      const readyForCutover =
        connector.shadowMode && !connector.capiSendEnabled && blockers.length === 0;
      const onlyWaitingForSamples =
        blockers.length > 0 &&
        blockers.every((blocker) => blocker.code.startsWith("EVENT_NOT_OBSERVED_"));
      const state =
        liveMode && blockers.length === 0
          ? "live"
          : readyForCutover
            ? "ready"
            : onlyWaitingForSamples
              ? "collecting"
              : "blocked";

      const reconciliation = externalConnectorReconciliationSchema.parse({
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        generatedAt,
        state,
        readyForCutover,
        meta: {
          connectionConfigured,
          destinationConfigured,
          pixelId: metaDestination?.pixelId ?? null,
          pageId: metaDestination?.pageId ?? null
        },
        events: reconciledEvents,
        blockers
      });
      reconciliations.set(connector.id, reconciliation);
    }

    return reconciliations;
  }

  private earlierDate(current: string | null, candidate: Date | null): string | null {
    if (!candidate) {
      return current;
    }
    if (!current || candidate.getTime() < new Date(current).getTime()) {
      return candidate.toISOString();
    }
    return current;
  }

  private laterDate(current: string | null, candidate: Date | null): string | null {
    if (!candidate) {
      return current;
    }
    if (!current || candidate.getTime() > new Date(current).getTime()) {
      return candidate.toISOString();
    }
    return current;
  }

  private async ingestionTotals(
    connectorIds: string[]
  ): Promise<Map<string, ExternalConnectorHealthDto["totals"]>> {
    const totalsByConnector = new Map<string, ExternalConnectorHealthDto["totals"]>();

    if (!connectorIds.length) {
      return totalsByConnector;
    }

    const groups = await this.prisma.externalIngestionRecord.groupBy({
      by: ["connectorId", "status"],
      where: { connectorId: { in: connectorIds } },
      _count: { _all: true },
      _sum: { duplicateCount: true }
    });

    for (const group of groups) {
      const totals = totalsByConnector.get(group.connectorId) ?? this.emptyIngestionTotals();
      if (group.status !== "removed") {
        totals.duplicates += Math.max(0, group._sum.duplicateCount ?? 0);
      }

      if (group.status === "imported") {
        totals.imported += group._count._all;
      } else if (group.status === "duplicate") {
        totals.duplicates += group._count._all;
      } else if (group.status === "rejected") {
        totals.rejected += group._count._all;
      } else if (["pending", "pending_delivery"].includes(group.status)) {
        totals.pending += group._count._all;
      }

      totalsByConnector.set(group.connectorId, totals);
    }

    return totalsByConnector;
  }

  private emptyIngestionTotals(): ExternalConnectorHealthDto["totals"] {
    return {
      imported: 0,
      duplicates: 0,
      rejected: 0,
      pending: 0
    };
  }

  private async getConnector(connectorId: string): Promise<ConnectorWithCursors> {
    const connector = (await this.prisma.externalDataConnector.findUnique({
      where: { id: connectorId },
      include: { cursors: { orderBy: { stream: "asc" } } }
    })) as ConnectorWithCursors | null;

    if (!connector) {
      throw new NotFoundException("Conector externo nao encontrado");
    }

    return connector;
  }

  private toDto(connector: ConnectorWithCursors): ExternalDataConnectorDto {
    return externalDataConnectorSchema.parse({
      id: connector.id,
      workspaceId: connector.workspaceId,
      name: connector.name,
      provider: externalConnectorProviderSchema.parse(connector.provider),
      status: externalConnectorStatusSchema.parse(connector.status),
      timezone: connector.timezone,
      sslMode: externalConnectorSslModeSchema.parse(connector.sslMode),
      syncEnabled: connector.syncEnabled,
      shadowMode: connector.shadowMode,
      capiSendEnabled: connector.capiSendEnabled,
      purchaseAverageValueCents: connector.purchaseAverageValueCents,
      defaultCurrency: connector.defaultCurrency,
      hasCredentials: true,
      lastConnectionTestAt: connector.lastConnectionTestAt?.toISOString() ?? null,
      lastConnectionStatus: connector.lastConnectionStatus,
      lastSyncStartedAt: connector.lastSyncStartedAt?.toISOString() ?? null,
      lastSyncCompletedAt: connector.lastSyncCompletedAt?.toISOString() ?? null,
      lastSyncStatus: connector.lastSyncStatus,
      lastSyncErrorCode: connector.lastSyncErrorCode,
      cursors: connector.cursors.map((cursor) => ({
        stream: cursor.stream,
        lastExternalId: cursor.lastExternalId,
        lastUpdatedAt: cursor.lastUpdatedAt?.toISOString() ?? null,
        lastSyncedAt: cursor.lastSyncedAt?.toISOString() ?? null
      })),
      createdAt: connector.createdAt.toISOString(),
      updatedAt: connector.updatedAt.toISOString()
    });
  }

  private auditSummary(connector: ExternalDataConnectorDto): Prisma.InputJsonValue {
    return {
      name: connector.name,
      provider: connector.provider,
      status: connector.status,
      timezone: connector.timezone,
      sslMode: connector.sslMode,
      syncEnabled: connector.syncEnabled,
      shadowMode: connector.shadowMode,
      capiSendEnabled: connector.capiSendEnabled,
      purchaseAverageValueCents: connector.purchaseAverageValueCents,
      defaultCurrency: connector.defaultCurrency,
      hasCredentials: true
    } as Prisma.InputJsonValue;
  }

  private async createAudit(input: {
    workspaceId: string;
    actorUserId: string;
    action: string;
    targetId: string;
    resultStatus?: string;
    beforeSummary?: Prisma.InputJsonValue;
    afterSummary?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        actorType: "platform_admin",
        action: input.action,
        targetType: "ExternalDataConnector",
        targetId: input.targetId,
        resultStatus: input.resultStatus ?? "success",
        beforeSummary: input.beforeSummary ?? Prisma.JsonNull,
        afterSummary: input.afterSummary ?? Prisma.JsonNull
      }
    });
  }
}
