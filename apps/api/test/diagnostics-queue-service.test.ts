import { describe, expect, it, vi } from "vitest";
import { DiagnosticsQueueService } from "../src/common/queue/diagnostics-queue.service";

describe("diagnostics queue service", () => {
  it("enqueues diagnostic retry jobs with stable metadata", async () => {
    const queue = {
      add: vi.fn(async () => ({
        id: "bull_job_1"
      }))
    };
    const service = new DiagnosticsQueueService(queue as never);

    const result = await service.enqueueRetry({
      diagnosticEventId: "diag_1",
      workspaceId: "workspace_1",
      source: "meta",
      message: "Meta recusou evento",
      occurredAt: "2026-07-02T03:00:00.000Z",
      conversionEventLogId: "conversion_1",
      retryReason: "Cliente relatou conversao ausente"
    });

    expect(queue.add).toHaveBeenCalledWith(
      "retry-diagnostic-event",
      {
        diagnosticEventId: "diag_1",
        workspaceId: "workspace_1",
        source: "meta",
        message: "Meta recusou evento",
        occurredAt: "2026-07-02T03:00:00.000Z",
        conversionEventLogId: "conversion_1",
        retryReason: "Cliente relatou conversao ausente"
      },
      expect.objectContaining({
        attempts: 3,
        removeOnComplete: 100
      })
    );
    expect(result).toEqual({
      diagnosticEventId: "diag_1",
      jobId: "bull_job_1",
      status: "queued"
    });
  });
});
