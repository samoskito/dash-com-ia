import { describe, expect, it, vi } from "vitest";
import type { ProviderConversionProductionJobPayload } from "../src/common/queue/queue.constants";
import { InboundWebhookProductionQueueService } from "../src/inbound-webhooks/inbound-webhook-production-queue.service";

describe("inbound webhook production queue service", () => {
  it("publishes a manual provider retry independently from an older deterministic job", async () => {
    const queue = {
      getJob: vi.fn(async () => undefined),
      add: vi.fn(
        async (
          _name: string,
          _payload: ProviderConversionProductionJobPayload,
          options: { jobId: string },
        ) => ({ id: options.jobId }),
      ),
    };
    const service = new InboundWebhookProductionQueueService(queue as never);
    const input: ProviderConversionProductionJobPayload = {
      providerConversionExecutionId: "execution:qualified:1",
      workspaceId: "workspace_1",
    };

    await expect(
      service.enqueueProviderConversion(input, {
        attemptKey: "manual-1784779200000",
      }),
    ).resolves.toEqual({
      jobId:
        "provider-conversion-production_execution_qualified_1_manual-1784779200000",
      status: "queued",
    });

    expect(queue.getJob).toHaveBeenCalledWith(
      "provider-conversion-production_execution_qualified_1_manual-1784779200000",
    );
    expect(queue.add).toHaveBeenCalledWith(
      "process-provider-conversion-production",
      input,
      expect.objectContaining({
        jobId:
          "provider-conversion-production_execution_qualified_1_manual-1784779200000",
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: false,
      }),
    );
  });

  it("keeps automatic provider jobs deterministic", async () => {
    const existing = {
      getState: vi.fn(async () => "waiting"),
      remove: vi.fn(),
    };
    const queue = {
      getJob: vi.fn(async () => existing),
      add: vi.fn(),
    };
    const service = new InboundWebhookProductionQueueService(queue as never);

    await expect(
      service.enqueueProviderConversion({
        providerConversionExecutionId: "execution_1",
        workspaceId: "workspace_1",
      }),
    ).resolves.toEqual({
      jobId: "provider-conversion-production_execution_1",
      status: "existing",
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(existing.remove).not.toHaveBeenCalled();
  });
});
