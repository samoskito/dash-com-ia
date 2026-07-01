export const integrationStatuses = [
  "connected",
  "disconnected",
  "syncing",
  "error",
  "pending_payment",
  "needs_reconnect"
] as const;

export type IntegrationStatus = (typeof integrationStatuses)[number];

export const eventStatuses = ["pending", "sent", "failed", "retrying"] as const;

export type EventStatus = (typeof eventStatuses)[number];

export const whatsappInstanceStatuses = [
  "pending_payment",
  "active",
  "disconnected",
  "suspended",
  "error"
] as const;

export type WhatsappInstanceStatus = (typeof whatsappInstanceStatuses)[number];
