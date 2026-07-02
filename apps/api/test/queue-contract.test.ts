import { describe, expect, it } from "vitest";
import {
  CONVERSION_EVENTS_QUEUE,
  DIAGNOSTIC_QUEUE,
  type ConversionEventJobPayload,
  type DiagnosticJobPayload
} from "../src/common/queue/queue.constants";

describe("diagnostic queue contract", () => {
  it("uses the diagnostic events queue name", () => {
    expect(DIAGNOSTIC_QUEUE).toBe("diagnostic-events");
  });

  it("accepts the expected diagnostic payload source", () => {
    const payload: DiagnosticJobPayload = {
      workspaceId: "workspace_123",
      source: "meta",
      message: "Lead attribution captured",
      occurredAt: "2026-07-01T12:00:00.000Z"
    };

    expect(payload.source).toBe("meta");
  });

  it("uses the conversion events queue contract", () => {
    const payload: ConversionEventJobPayload = {
      conversionEventLogId: "conversion_1"
    };

    expect(CONVERSION_EVENTS_QUEUE).toBe("conversion-events");
    expect(payload.conversionEventLogId).toBe("conversion_1");
  });
});
