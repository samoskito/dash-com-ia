export const DIAGNOSTIC_QUEUE = "diagnostic-events";
export const CONVERSION_EVENTS_QUEUE = "conversion-events";
export const META_REPORT_SYNC_QUEUE = "meta-report-sync";
export const EXTERNAL_DATA_SYNC_QUEUE = "external-data-sync";

export interface DiagnosticJobPayload {
  diagnosticEventId: string;
  workspaceId: string;
  source: "meta" | "uazapi" | "asaas" | "external_mysql" | "internal";
  message: string;
  occurredAt: string;
  conversionEventLogId?: string;
  retryReason?: string;
}

export interface ConversionEventJobPayload {
  conversionEventLogId: string;
  workspaceId: string;
}

export interface MetaReportSyncJobPayload {
  workspaceId: string;
  since: string;
  until: string;
}

export interface ExternalDataSyncJobPayload {
  connectorId: string;
  workspaceId: string;
  streams: Array<"leads" | "events">;
  projectionRefresh?: boolean;
  requestedByUserId?: string;
}
