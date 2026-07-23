import { describe, expect, it, vi } from "vitest";
import type { InboundWebhookJobPayload } from "../src/common/queue/queue.constants";
import { InboundWebhookQueueService } from "../src/inbound-webhooks/inbound-webhook-queue.service";

describe("inbound webhook queue service", () => {
  it("queues only delivery identifiers with a colon-free deterministic job id", async () => {
    const queue = {
      getJob: vi.fn(async () => undefined),
      add: vi.fn(
        async (
          _name: string,
          _payload: InboundWebhookJobPayload,
          options: { jobId: string },
        ) => ({ id: options.jobId }),
      ),
    };
    const service = new InboundWebhookQueueService(queue as never);
    const input = {
      deliveryId: "delivery:umbler:1",
      connectionId: "connection_1",
      workspaceId: "workspace_1",
      rawPayload: {
        message: "mensagem privada",
        phone: "+5511999999999",
      },
    };

    await expect(service.enqueueDelivery(input)).resolves.toEqual({
      jobId: "inbound-webhook_delivery_umbler_1",
      status: "queued",
    });

    expect(queue.getJob).toHaveBeenCalledWith(
      "inbound-webhook_delivery_umbler_1",
    );
    expect(queue.add).toHaveBeenCalledWith(
      "process-inbound-webhook",
      {
        deliveryId: "delivery:umbler:1",
        connectionId: "connection_1",
        workspaceId: "workspace_1",
      },
      {
        jobId: "inbound-webhook_delivery_umbler_1",
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30_000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    const [, payload, options] = queue.add.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual([
      "connectionId",
      "deliveryId",
      "workspaceId",
    ]);
    expect(options.jobId).not.toContain(":");
    expect(JSON.stringify(payload)).not.toContain("mensagem privada");
    expect(JSON.stringify(payload)).not.toContain("+5511999999999");
  });

  it("returns the same waiting or active job instead of publishing twice", async () => {
    let state = "waiting";
    let currentJob:
      | {
          id: string;
          getState: ReturnType<typeof vi.fn>;
          remove: ReturnType<typeof vi.fn>;
        }
      | undefined;
    const queue = {
      getJob: vi.fn(async () => currentJob),
      add: vi.fn(
        async (
          _name: string,
          _payload: InboundWebhookJobPayload,
          options: { jobId: string },
        ) => {
          currentJob = {
            id: options.jobId,
            getState: vi.fn(async () => state),
            remove: vi.fn(async () => undefined),
          };

          return currentJob;
        },
      ),
    };
    const service = new InboundWebhookQueueService(queue as never);
    const input: InboundWebhookJobPayload = {
      deliveryId: "delivery_1",
      connectionId: "connection_1",
      workspaceId: "workspace_1",
    };

    await expect(service.enqueueDelivery(input)).resolves.toEqual({
      jobId: "inbound-webhook_delivery_1",
      status: "queued",
    });
    await expect(service.enqueueDelivery(input)).resolves.toEqual({
      jobId: "inbound-webhook_delivery_1",
      status: "existing",
    });

    state = "active";
    await expect(service.enqueueDelivery(input)).resolves.toEqual({
      jobId: "inbound-webhook_delivery_1",
      status: "existing",
    });

    expect(queue.add).toHaveBeenCalledOnce();
    expect(currentJob?.remove).not.toHaveBeenCalled();
  });

  it("uses an isolated job for explicit provider conversion recovery", async () => {
    const queue = {
      getJob: vi.fn(async () => undefined),
      add: vi.fn(
        async (
          _name: string,
          _payload: InboundWebhookJobPayload,
          options: { jobId: string },
        ) => ({ id: options.jobId }),
      ),
    };
    const service = new InboundWebhookQueueService(queue as never);

    await expect(
      service.enqueueDelivery({
        deliveryId: "delivery_1",
        connectionId: "connection_1",
        workspaceId: "workspace_1",
        forceProviderConversions: true,
      }),
    ).resolves.toEqual({
      jobId: "inbound-webhook-provider-conversion-recovery_delivery_1",
      status: "queued",
    });
    expect(queue.add).toHaveBeenCalledWith(
      "process-inbound-webhook",
      {
        deliveryId: "delivery_1",
        connectionId: "connection_1",
        workspaceId: "workspace_1",
        forceProviderConversions: true,
      },
      expect.objectContaining({
        jobId: "inbound-webhook-provider-conversion-recovery_delivery_1",
      }),
    );
  });

  it("removes and recreates a failed job for recovery", async () => {
    const failedJob = {
      getState: vi.fn(async () => "failed"),
      remove: vi.fn(async () => undefined),
    };
    const queue = {
      getJob: vi.fn(async () => failedJob),
      add: vi.fn(
        async (
          _name: string,
          _payload: InboundWebhookJobPayload,
          options: { jobId: string },
        ) => ({ id: options.jobId }),
      ),
    };
    const service = new InboundWebhookQueueService(queue as never);

    await expect(
      service.enqueueDelivery({
        deliveryId: "delivery_1",
        connectionId: "connection_1",
        workspaceId: "workspace_1",
      }),
    ).resolves.toEqual({
      jobId: "inbound-webhook_delivery_1",
      status: "queued",
    });

    expect(failedJob.remove).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledOnce();
    expect(failedJob.remove.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0],
    );
  });
});
