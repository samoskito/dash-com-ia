export const DIAGNOSTIC_QUEUE = "diagnostic-events";
export const CONVERSION_EVENTS_QUEUE = "conversion-events";
export const META_REPORT_SYNC_QUEUE = "meta-report-sync";

export interface DiagnosticJobPayload {
  workspaceId: string;
  source: "meta" | "uazapi" | "asaas" | "internal";
  message: string;
  occurredAt: string;
}

export interface ConversionEventJobPayload {
  conversionEventLogId: string;
}

export interface MetaReportSyncJobPayload {
  workspaceId: string;
  since: string;
  until: string;
}
