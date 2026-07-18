import { describe, expect, it } from "vitest";
import {
  CONVERSION_EVENTS_QUEUE,
  DIAGNOSTIC_QUEUE,
  INBOUND_WEBHOOK_QUEUE,
  META_REPORT_SYNC_QUEUE,
  type ConversionEventJobPayload,
  type DiagnosticJobPayload,
  type InboundWebhookJobPayload,
  type MetaReportSyncJobPayload,
} from "../src/common/queue/queue.constants";

describe("diagnostic queue contract", () => {
  it("uses the diagnostic events queue name", () => {
    expect(DIAGNOSTIC_QUEUE).toBe("diagnostic-events");
  });

  it("accepts the expected diagnostic payload source", () => {
    const payload: DiagnosticJobPayload = {
      diagnosticEventId: "diag_1",
      workspaceId: "workspace_123",
      source: "meta",
      message: "Lead attribution captured",
      occurredAt: "2026-07-01T12:00:00.000Z",
      conversionEventLogId: "conversion_1",
      retryReason: "Cliente relatou conversao ausente",
    };

    expect(payload.source).toBe("meta");
    expect(payload.conversionEventLogId).toBe("conversion_1");
  });

  it("uses the conversion events queue contract", () => {
    const payload: ConversionEventJobPayload = {
      conversionEventLogId: "conversion_1",
      workspaceId: "workspace_1",
    };

    expect(CONVERSION_EVENTS_QUEUE).toBe("conversion-events");
    expect(payload.conversionEventLogId).toBe("conversion_1");
    expect(payload.workspaceId).toBe("workspace_1");
  });

  it("uses the Meta report sync queue contract", () => {
    const payload: MetaReportSyncJobPayload = {
      workspaceId: "workspace_1",
      businessConnectionId: null,
      reportingAccountId: null,
      since: "2026-07-01",
      until: "2026-07-02",
    };

    expect(META_REPORT_SYNC_QUEUE).toBe("meta-report-sync");
    expect(payload.workspaceId).toBe("workspace_1");
  });

  it("uses the minimal inbound webhook queue contract", () => {
    const payload: InboundWebhookJobPayload = {
      deliveryId: "delivery_1",
      connectionId: "connection_1",
      workspaceId: "workspace_1",
    };

    expect(INBOUND_WEBHOOK_QUEUE).toBe("inbound-webhooks");
    expect(payload).toEqual({
      deliveryId: "delivery_1",
      connectionId: "connection_1",
      workspaceId: "workspace_1",
    });
    expect(Object.keys(payload).sort()).toEqual([
      "connectionId",
      "deliveryId",
      "workspaceId",
    ]);
  });
});
