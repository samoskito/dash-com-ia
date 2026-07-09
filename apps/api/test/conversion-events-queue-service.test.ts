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

    await expect(service.enqueueSend("conversion_1")).resolves.toEqual({
      conversionEventLogId: "conversion_1",
      jobId: "conversion-send_conversion_1",
      status: "queued"
    });

    expect(queue.add).toHaveBeenCalledWith(
      "send-ready-event",
      {
        conversionEventLogId: "conversion_1"
      },
      expect.objectContaining({
        jobId: "conversion-send_conversion_1",
        attempts: 3
      })
    );
    expect(queue.add.mock.calls[0]?.[2]?.jobId).not.toContain(":");
  });
});
