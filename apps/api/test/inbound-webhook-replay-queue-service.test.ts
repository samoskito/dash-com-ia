import { describe, expect, it, vi } from "vitest";
import type { InboundWebhookReplayJobPayload } from "../src/common/queue/queue.constants";
import { InboundWebhookReplayQueueService } from "../src/inbound-webhook-replay/inbound-webhook-replay-queue.service";

describe("inbound webhook replay queue service", () => {
  it("queues only batch scope with a deterministic job id", async () => {
    const queue = {
      getJob: vi.fn(async () => undefined),
      add: vi.fn(
        async (
          _name: string,
          _payload: InboundWebhookReplayJobPayload,
          options: { jobId: string },
        ) => ({ id: options.jobId }),
      ),
    };
    const service = new InboundWebhookReplayQueueService(queue as never);

    await expect(
      service.enqueueBatch({
        batchId: "batch:umbler:1",
        workspaceId: "workspace_1",
      }),
    ).resolves.toEqual({
      jobId: "inbound-webhook-replay_batch_umbler_1",
      status: "queued",
    });

    expect(queue.add).toHaveBeenCalledWith(
      "process-inbound-webhook-replay",
      {
        batchId: "batch:umbler:1",
        workspaceId: "workspace_1",
      },
      {
        jobId: "inbound-webhook-replay_batch_umbler_1",
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30_000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    expect(JSON.stringify(queue.add.mock.calls[0]?.[1])).not.toContain(
      "payload",
    );
    expect(JSON.stringify(queue.add.mock.calls[0]?.[1])).not.toContain(
      "phone",
    );
  });

  it("does not publish a second active batch job", async () => {
    const existing = {
      getState: vi.fn(async () => "active"),
      remove: vi.fn(async () => undefined),
    };
    const queue = {
      getJob: vi.fn(async () => existing),
      add: vi.fn(),
    };
    const service = new InboundWebhookReplayQueueService(queue as never);

    await expect(
      service.enqueueBatch({
        batchId: "batch_1",
        workspaceId: "workspace_1",
      }),
    ).resolves.toEqual({
      jobId: "inbound-webhook-replay_batch_1",
      status: "existing",
    });
    expect(queue.add).not.toHaveBeenCalled();
    expect(existing.remove).not.toHaveBeenCalled();
  });
});
