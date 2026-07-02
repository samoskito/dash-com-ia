import { describe, expect, it, vi } from "vitest";
import { ConversionEventProcessor } from "../src/common/queue/conversion-event.processor";

function createPrismaHarness() {
  return {
    jobAttempt: {
      create: vi.fn(async ({ data }) => ({ id: "job_attempt_1", ...data }))
    }
  };
}

describe("conversion event processor", () => {
  it("sends ready conversion events by log id and records the worker attempt", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => ({
        conversionEventLogId: "conversion_1",
        status: "sent"
      }))
    };
    const prisma = createPrismaHarness();
    const processor = new ConversionEventProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_1",
        name: "send-conversion-event",
        attemptsMade: 0,
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
    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: null,
        queueName: "conversion-events",
        jobId: "bull_job_1",
        jobName: "send-conversion-event",
        attemptNumber: 1,
        status: "sent",
        source: "meta",
        relatedEntityType: "ConversionEventLog",
        relatedEntityId: "conversion_1",
        errorCode: null,
        errorMessage: null,
        summaryPayload: {
          conversionEventLogId: "conversion_1",
          resultStatus: "sent"
        }
      })
    });
  });

  it("does not fail a completed conversion job when attempt logging fails", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => ({
        conversionEventLogId: "conversion_1",
        status: "sent"
      }))
    };
    const prisma = {
      jobAttempt: {
        create: vi.fn(async () => {
          throw new Error("database unavailable");
        })
      }
    };
    const processor = new ConversionEventProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_1",
        name: "send-conversion-event",
        attemptsMade: 0,
        data: {
          conversionEventLogId: "conversion_1"
        }
      } as never)
    ).resolves.toEqual({
      conversionEventLogId: "conversion_1",
      status: "sent"
    });

    expect(conversionEventsService.sendReadyEvent).toHaveBeenCalledTimes(1);
    expect(prisma.jobAttempt.create).toHaveBeenCalledTimes(1);
  });

  it("records failed conversion worker attempts and rethrows the error", async () => {
    const conversionEventsService = {
      sendReadyEvent: vi.fn(async () => {
        throw new Error("Meta CAPI indisponivel");
      })
    };
    const prisma = createPrismaHarness();
    const processor = new ConversionEventProcessor(
      conversionEventsService as never,
      prisma as never
    );

    await expect(
      processor.process({
        id: "bull_job_2",
        name: "send-conversion-event",
        attemptsMade: 1,
        data: {
          conversionEventLogId: "conversion_1"
        }
      } as never)
    ).rejects.toThrow("Meta CAPI indisponivel");

    expect(prisma.jobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: null,
        queueName: "conversion-events",
        jobId: "bull_job_2",
        jobName: "send-conversion-event",
        attemptNumber: 2,
        status: "failed",
        source: "meta",
        relatedEntityType: "ConversionEventLog",
        relatedEntityId: "conversion_1",
        errorCode: null,
        errorMessage: "Meta CAPI indisponivel",
        summaryPayload: {
          conversionEventLogId: "conversion_1"
        }
      })
    });
  });
});
