import type {
  InboundWebhookProvider,
  WhatsappSeatProvider,
  WorkspaceSubscriptionContractStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  ExternalChannelBillingAccessError,
  ExternalChannelBillingAccessService,
} from "../src/billing/external-channel-billing-access.service";

type SeatRow = {
  id: string;
  workspaceId: string;
  subscriptionId: string;
  provider: WhatsappSeatProvider;
  status: string;
  normalizedPhone: string | null;
  whatsappInstanceId: string | null;
  inboundWebhookChannelId: string | null;
};

type ChannelRow = {
  whatsappInstanceId: string | null;
  connectedPhone: string;
  connection: { provider: InboundWebhookProvider };
};

const seatScalarKeys = [
  "workspaceId",
  "subscriptionId",
  "provider",
  "status",
  "normalizedPhone",
  "whatsappInstanceId",
  "inboundWebhookChannelId",
] as const;

/**
 * Minimal Prisma `where` evaluator so the tests assert on the seat rows the
 * gate would really match instead of on a canned findFirst return value.
 */
function seatMatches(seat: SeatRow, where: Record<string, unknown>): boolean {
  for (const key of seatScalarKeys) {
    if (where[key] !== undefined && where[key] !== seat[key]) {
      return false;
    }
  }

  const or = where.OR as Record<string, unknown>[] | undefined;
  if (or && !or.some((clause) => seatMatches(seat, clause))) {
    return false;
  }

  return true;
}

function seat(overrides: Partial<SeatRow> = {}): SeatRow {
  return {
    id: "seat_1",
    workspaceId: "workspace_1",
    subscriptionId: "contract_1",
    provider: "uazapi",
    status: "active",
    normalizedPhone: null,
    whatsappInstanceId: null,
    inboundWebhookChannelId: null,
    ...overrides,
  };
}

function createHarness(
  input: {
    packageBillingEnabled?: boolean;
    externalEnforcementEnabled?: boolean;
    contractStatus?: WorkspaceSubscriptionContractStatus;
    accessEndsAt?: Date | null;
    seats?: SeatRow[];
    channel?: ChannelRow | null;
  } = {},
) {
  const seats = input.seats ?? [seat({ inboundWebhookChannelId: "channel_1" })];
  const workspaceSubscription = {
    findFirst: vi.fn(async () => ({
      id: "contract_1",
      contractStatus: input.contractStatus ?? "active",
      accessEndsAt: input.accessEndsAt ?? null,
    })),
  };
  const whatsappSeat = {
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const found = seats.find((row) => seatMatches(row, args.where));

      return found ? { id: found.id } : null;
    }),
  };
  const inboundWebhookChannel = {
    findFirst: vi.fn(async () => input.channel ?? null),
  };
  const prisma = { inboundWebhookChannel, workspaceSubscription, whatsappSeat };
  const configuration = {
    isPackageBillingEnabled: vi.fn(() => input.packageBillingEnabled ?? true),
    isExternalChannelEnforcementEnabled: vi.fn(
      () => input.externalEnforcementEnabled ?? true,
    ),
  };
  const service = new ExternalChannelBillingAccessService(
    prisma as never,
    configuration as never,
  );

  return {
    configuration,
    inboundWebhookChannel,
    service,
    whatsappSeat,
    workspaceSubscription,
  };
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
      expect(harness.inboundWebhookChannel.findFirst).not.toHaveBeenCalled();
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
    const harness = createHarness({ seats: [] });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).rejects.toEqual(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      ),
    );
  });

  it("accepts the UAZAPI instance seat linked to the channel instance", async () => {
    const harness = createHarness({
      channel: {
        whatsappInstanceId: "instance_1",
        connectedPhone: "555484020000",
        connection: { provider: "uazapi" },
      },
      seats: [
        seat({
          id: "instance_seat",
          whatsappInstanceId: "instance_1",
          inboundWebhookChannelId: null,
        }),
      ],
    });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).resolves.toBeUndefined();
  });

  it("accepts a UAZAPI instance seat matched by phone when the channel has no instance link", async () => {
    const harness = createHarness({
      channel: {
        whatsappInstanceId: null,
        connectedPhone: "+55 (54) 8402-0000",
        connection: { provider: "uazapi" },
      },
      seats: [
        seat({
          id: "instance_seat",
          whatsappInstanceId: "instance_1",
          normalizedPhone: "555484020000",
        }),
      ],
    });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).resolves.toBeUndefined();
  });

  it("blocks a UAZAPI channel whose instance seat is suspended", async () => {
    const harness = createHarness({
      channel: {
        whatsappInstanceId: "instance_1",
        connectedPhone: "555484020000",
        connection: { provider: "uazapi" },
      },
      seats: [
        seat({
          id: "instance_seat",
          status: "suspended",
          whatsappInstanceId: "instance_1",
          normalizedPhone: "555484020000",
        }),
      ],
    });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).rejects.toEqual(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      ),
    );
  });

  it("blocks a UAZAPI channel whose only active seat belongs to another instance and phone", async () => {
    const harness = createHarness({
      channel: {
        whatsappInstanceId: "instance_1",
        connectedPhone: "555484020000",
        connection: { provider: "uazapi" },
      },
      seats: [
        seat({
          id: "other_seat",
          whatsappInstanceId: "instance_2",
          normalizedPhone: "555199990000",
        }),
      ],
    });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).rejects.toEqual(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      ),
    );
  });

  it("blocks a UAZAPI channel whose instance seat belongs to another subscription", async () => {
    const harness = createHarness({
      channel: {
        whatsappInstanceId: "instance_1",
        connectedPhone: "555484020000",
        connection: { provider: "uazapi" },
      },
      seats: [
        seat({
          id: "stale_seat",
          subscriptionId: "contract_previous",
          whatsappInstanceId: "instance_1",
        }),
      ],
    });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).rejects.toEqual(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      ),
    );
  });

  it("still requires a channel-linked seat for non-UAZAPI providers", async () => {
    const harness = createHarness({
      channel: {
        whatsappInstanceId: null,
        connectedPhone: "555484020000",
        connection: { provider: "umbler" },
      },
      seats: [
        seat({
          id: "instance_seat",
          provider: "umbler",
          normalizedPhone: "555484020000",
        }),
      ],
    });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).rejects.toEqual(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_seat_inactive",
      ),
    );
  });

  it("blocks an inactive contract before falling back to the instance seat", async () => {
    const harness = createHarness({
      contractStatus: "suspended",
      channel: {
        whatsappInstanceId: "instance_1",
        connectedPhone: "555484020000",
        connection: { provider: "uazapi" },
      },
      seats: [seat({ whatsappInstanceId: "instance_1" })],
    });

    await expect(
      harness.service.assertProductionAccess("workspace_1", "channel_1"),
    ).rejects.toEqual(
      new ExternalChannelBillingAccessError(
        "external_channel_billing_contract_inactive",
      ),
    );

    expect(harness.inboundWebhookChannel.findFirst).not.toHaveBeenCalled();
  });
});
