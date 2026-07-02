export type IntegrationEnv = Record<string, string | undefined>;
export type IntegrationProvider = "meta" | "uazapi" | "asaas";
export type IntegrationStatus =
  | "connected"
  | "disconnected"
  | "syncing"
  | "error"
  | "pending_payment"
  | "needs_reconnect";

export interface IntegrationHealthDto {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  checkedAt: string;
  message?: string;
}

export interface IntegrationAdapter {
  readonly provider: IntegrationProvider;
  getHealth(): Promise<IntegrationHealthDto>;
}
