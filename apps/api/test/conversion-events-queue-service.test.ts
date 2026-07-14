import { describe, expect, it, vi } from "vitest";
import { ConversionEventsQueueService } from "../src/common/queue/conversion-events-queue.service";

describe("conversion events queue service", () => {
  it("enqueues ready conversion event sends with a stable job id", async () => {
    const queue = {
      add: vi.fn(
        async (_name: string, _data: unknown, options: { jobId: string }) => ({
          id: options.jobId
        })
      )
    };
    const service = new ConversionEventsQueueService(queue as never);

    await expect(
      service.enqueueSend("conversion_1", "workspace_1")
    ).resolves.toEqual({
      conversionEventLogId: "conversion_1",
      jobId: "conversion-send_conversion_1",
      status: "queued"
    });

    expect(queue.add).toHaveBeenCalledWith(
      "send-ready-event",
      {
        conversionEventLogId: "conversion_1",
        workspaceId: "workspace_1"
      },
      expect.objectContaining({
        jobId: "conversion-send_conversion_1",
        attempts: 3
      })
    );
    expect(queue.add.mock.calls[0]?.[2]?.jobId).not.toContain(":");
  });

  it("rejects a new conversion job without a workspace", async () => {
    const queue = { add: vi.fn() };
    const service = new ConversionEventsQueueService(queue as never);

    await expect(service.enqueueSend("conversion_1", " ")).rejects.toThrow(
      "ConversionEventWorkspaceRequired"
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("recreates a finished failed job before a manual retry", async () => {
    const existing = {
      getState: vi.fn(async () => "failed"),
      promote: vi.fn(),
      remove: vi.fn(async () => undefined)
    };
    const queue = {
      getJob: vi.fn(async () => existing),
      add: vi.fn(
        async (_name: string, _data: unknown, options: { jobId: string }) => ({
          id: options.jobId
        })
      )
    };
    const service = new ConversionEventsQueueService(queue as never);

    await expect(
      service.retrySend("conversion_1", "workspace_1")
    ).resolves.toEqual({
      conversionEventLogId: "conversion_1",
      jobId: "conversion-send_conversion_1",
      status: "queued"
    });

    expect(existing.remove).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it("promotes an automatic retry that is still delayed", async () => {
    const existing = {
      getState: vi.fn(async () => "delayed"),
      promote: vi.fn(async () => undefined),
      remove: vi.fn()
    };
    const queue = {
      getJob: vi.fn(async () => existing),
      add: vi.fn()
    };
    const service = new ConversionEventsQueueService(queue as never);

    await service.retrySend("conversion_1", "workspace_1");

    expect(existing.promote).toHaveBeenCalledOnce();
    expect(existing.remove).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
