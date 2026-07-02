export const DIAGNOSTIC_QUEUE = "diagnostic-events";
export const CONVERSION_EVENTS_QUEUE = "conversion-events";

export interface DiagnosticJobPayload {
  workspaceId: string;
  source: "meta" | "uazapi" | "asaas" | "internal";
  message: string;
  occurredAt: string;
}

export interface ConversionEventJobPayload {
  conversionEventLogId: string;
}
