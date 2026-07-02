import { describe, expect, it, vi } from "vitest";
import { ConversionEventProcessor } from "../src/common/queue/conversion-event.processor";

describe("conversion event processor", () => {
  it("sends ready conversion events by log id", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => ({
        conversionEventLogId: "conversion_1",
        status: "sent"
      }))
    };
    const processor = new ConversionEventProcessor(conversionEventsService as never);

    await expect(
      processor.process({
        data: {
          conversionEventLogId: "conversion_1"
        }
      } as never)
    ).resolves.toEqual({
      conversionEventLogId: "conversion_1",
      status: "sent"
    });

    expect(conversionEventsService.sendReadyEvent).toHaveBeenCalledWith(
      "conversion_1"
    );
  });
});
