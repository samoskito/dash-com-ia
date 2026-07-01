export const DIAGNOSTIC_QUEUE = "diagnostic-events";

export interface DiagnosticJobPayload {
  workspaceId: string;
  source: "meta" | "uazapi" | "asaas" | "internal";
  message: string;
  occurredAt: string;
}
