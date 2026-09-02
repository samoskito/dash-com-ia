// WAHA relays can include media metadata that exceeds the former 2 MiB cap.
// Keep Express and the durable-ingestion validation at the same finite limit.
export const INBOUND_WEBHOOK_BODY_LIMIT = "10mb";
export const MAX_INBOUND_WEBHOOK_PAYLOAD_BYTES = 10 * 1024 * 1024;
