import { describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_QUEUE,
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
});
