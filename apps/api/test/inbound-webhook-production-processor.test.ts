import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { InboundWebhookProductionProcessor } from "../src/inbound-webhook-production/inbound-webhook-production.processor";
import {
  ProviderConversionProductionFailure,
  type ProviderConversionProductionService,
} from "../src/inbound-webhook-production/provider-conversion-production.service";
import type { InboundWebhookProductionService } from "../src/inbound-webhook-production/inbound-webhook-production.service";

function providerJob() {
  return {
    data: {
      providerConversionExecutionId: "execution_1",
      workspaceId: "workspace_1",
    },
  };
}

describe("inbound webhook production processor", () => {
  it("stops BullMQ retries for permanent provider conversion failures", async () => {
    const providerConversions = {
      processExecution: vi.fn(async () => {
        throw new ProviderConversionProductionFailure(
          "provider_conversion_frozen_decision_mismatch",
        );
      }),
    };
    const processor = new InboundWebhookProductionProcessor(
      {} as InboundWebhookProductionService,
      providerConversions as unknown as ProviderConversionProductionService,
    );

    await expect(processor.process(providerJob() as never)).rejects.toThrow(
      UnrecoverableError,
    );
    await expect(processor.process(providerJob() as never)).rejects.toThrow(
      "provider_conversion_frozen_decision_mismatch",
    );
  });

  it("lets BullMQ retry transient provider conversion failures", async () => {
    const failure = new ProviderConversionProductionFailure(
      "provider_conversion_production_unexpected",
      true,
    );
    const providerConversions = {
      processExecution: vi.fn(async () => {
        throw failure;
      }),
    };
    const processor = new InboundWebhookProductionProcessor(
      {} as InboundWebhookProductionService,
      providerConversions as unknown as ProviderConversionProductionService,
    );

    await expect(processor.process(providerJob() as never)).rejects.toBe(
      failure,
    );
  });

  it("keeps legacy production items on their existing processor", async () => {
    const production = {
      processItem: vi.fn(async () => ({ status: "sent" })),
    };
    const providerConversions = {
      processExecution: vi.fn(),
    };
    const processor = new InboundWebhookProductionProcessor(
      production as unknown as InboundWebhookProductionService,
      providerConversions as unknown as ProviderConversionProductionService,
    );

    await expect(
      processor.process({
        data: {
          productionItemId: "production_item_1",
          workspaceId: "workspace_1",
        },
      } as never),
    ).resolves.toEqual({ status: "sent" });
    expect(production.processItem).toHaveBeenCalledOnce();
    expect(providerConversions.processExecution).not.toHaveBeenCalled();
  });
});
