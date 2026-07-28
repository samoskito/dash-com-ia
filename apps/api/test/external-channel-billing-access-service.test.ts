import type { WorkspaceSubscriptionContractStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  ExternalChannelBillingAccessError,
  ExternalChannelBillingAccessService,
} from "../src/billing/external-channel-billing-access.service";

function createHarness(input: {
  packageBillingEnabled?: boolean;
  externalEnforcementEnabled?: boolean;
  contractStatus?: WorkspaceSubscriptionContractStatus;
  accessEndsAt?: Date | null;
  seatFound?: boolean;
} = {}) {
  const workspaceSubscription = {
    findFirst: vi.fn(async () => ({
      id: "contract_1",
      contractStatus: input.contractStatus ?? "active",
      accessEndsAt: input.accessEndsAt ?? null,
    })),
  };
  const whatsappSeat = {
    findFirst: vi.fn(async () =>
      input.seatFound === false ? null : { id: "seat_1" },
    ),
  };
  const prisma = { workspaceSubscription, whatsappSeat };
  const configuration = {
    isPackageBillingEnabled: vi.fn(
      () => input.packageBillingEnabled ?? true,
    ),
    isExternalChannelEnforcementEnabled: vi.fn(
      () => input.externalEnforcementEnabled ?? true,
    ),
  };
  const service = new ExternalChannelBillingAccessService(
    prisma as never,
    configuration as never,
  );

  return { configuration, service, whatsappSeat, workspaceSubscription };
}

describe("ExternalChannelBillingAccessService", () => {
  it("bypasses billing reads while the external rollout flag is disabled", async () => {
    const harness = createHarness({ externalEnforcementEnabled: false });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).resolves.toBeUndefined();

    expect(harness.workspaceSubscription.findFirst).not.toHaveBeenCalled();
    expect(harness.whatsappSeat.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    "active",
    "grace_period",
    "cancel_at_period_end",
    "exempt",
    "legacy_protected",
  ] satisfies WorkspaceSubscriptionContractStatus[])(
    "allows %s contracts with an active seat",
    async (contractStatus) => {
      const harness = createHarness({ contractStatus });

      await expect(
        harness.service.assertProductionAccess("workspace_1", "channel_1"),
      ).resolves.toBeUndefined();

      expect(harness.whatsappSeat.findFirst).toHaveBeenCalledWith({
        where: {
          workspaceId: "workspace_1",
          subscriptionId: "contract_1",
          inboundWebhookChannelId: "channel_1",
          status: "active",
        },
        select: { id: true },
      });
    },
  );

  it("blocks a suspended contract before checking the seat", async () => {
    const harness = createHarness({ contractStatus: "suspended" });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).rejects.toEqual(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_contract_inactive",
      ),
    );

    expect(harness.whatsappSeat.findFirst).not.toHaveBeenCalled();
  });

  it("blocks materialization when the channel has no active seat", async () => {
    const harness = createHarness({ seatFound: false });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).rejects.toEqual(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      ),
    );
  });
});
