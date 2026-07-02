import { describe, expect, it, vi } from "vitest";
import { DiagnosticProcessor } from "../src/common/queue/diagnostic.processor";

describe("diagnostic processor", () => {
  it("reprocesses linked conversion events through the conversion event service", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => ({
        conversionEventLogId: "conversion_1",
        status: "sent"
      }))
    };
    const processor = new DiagnosticProcessor(conversionEventsService as never);

    await expect(
      processor.process({
        data: {
          diagnosticEventId: "diag_1",
          workspaceId: "workspace_1",
          source: "meta",
          message: "Meta recusou evento",
          occurredAt: "2026-07-02T03:00:00.000Z",
          conversionEventLogId: "conversion_1",
          retryReason: "Cliente relatou conversao ausente"
        }
      } as never)
    ).resolves.toEqual({
      diagnosticEventId: "diag_1",
      action: "conversion_event_retry",
      result: {
        conversionEventLogId: "conversion_1",
        status: "sent"
      }
    });

    expect(conversionEventsService.sendReadyEvent).toHaveBeenCalledWith(
      "conversion_1"
    );
  });

  it("skips unsupported diagnostic retries without calling providers", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn()
    };
    const processor = new DiagnosticProcessor(conversionEventsService as never);

    await expect(
      processor.process({
        data: {
          diagnosticEventId: "diag_1",
          workspaceId: "workspace_1",
          source: "uazapi",
          message: "Webhook recebido",
          occurredAt: "2026-07-02T03:00:00.000Z"
        }
      } as never)
    ).resolves.toEqual({
      diagnosticEventId: "diag_1",
      action: "skipped",
      reason: "unsupported_diagnostic_event"
    });

    expect(conversionEventsService.sendReadyEvent).not.toHaveBeenCalled();
  });
});
