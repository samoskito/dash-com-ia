import { describe, expect, it, vi } from "vitest";
import { countOccupiedSeats } from "../src/billing/package-billing.policy";
import { PackageTrialAutoconvertService } from "../src/billing/package-trial-autoconvert.service";

function trialFixture() {
  return {
    id: "trial_1",
    workspaceId: "workspace_1",
    planId: null,
    status: "active",
    contractStatus: "exempt",
    isCurrent: true,
    trialAutoconvertDisabled: false,
    trialEndsAt: new Date("2026-08-25T12:00:00.000Z"),
    graceEndsAt: null,
    accessEndsAt: new Date("2026-08-25T12:00:00.000Z"),
    includedWhatsappNumbersSnapshot: 3,
    monthlyPriceCentsSnapshot: 0,
  };
}

function createHarness(occupied = 2, optOut = false) {
  let trial = { ...trialFixture(), trialAutoconvertDisabled: optOut };
  let draft: Record<string, unknown> | null = null;
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    workspaceSubscription: {
      findUnique: vi.fn().mockImplementation(() => trial),
      findFirst: vi.fn().mockImplementation(() => draft),
      create: vi.fn().mockImplementation(({ data }) => {
        draft = { id: "draft_1", ...data };
        return draft;
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        if (where.id === trial.id) {
          trial = { ...trial, ...data };
          return trial;
        }
        return { ...draft, ...data };
      }),
    },
    whatsappSeat: { count: vi.fn().mockResolvedValue(occupied) },
    subscriptionPlan: {
      upsert: vi.fn().mockImplementation(({ create }) => ({
        id: "dynamic_plan_2",
        ...create,
      })),
    },
    billingContractAudit: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "audit_1" }),
    },
  };
  const prisma = {
    workspaceSubscription: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (
          trial.isCurrent &&
          trial.contractStatus === "exempt" &&
          (!where.trialAutoconvertDisabled || !trial.trialAutoconvertDisabled)
        ) {
          return [{ id: trial.id }];
        }
        return [];
      }),
    },
    $transaction: vi.fn().mockImplementation((callback) => callback(transaction)),
  };
  const configuration = { isTrialAutoconvertEnabled: () => true };
  const service = new PackageTrialAutoconvertService(
    prisma as never,
    configuration as never,
  );
  return { prisma, service, transaction, getDraft: () => draft, getTrial: () => trial };
}

describe("PackageTrialAutoconvertService", () => {
  it("counts capacity-consuming instance and external seats once", () => {
    expect(
      countOccupiedSeats([
        { status: "active", provider: "uazapi", whatsappInstanceId: "instance_1" },
      ] as never),
    ).toBe(1);
    expect(
      countOccupiedSeats([
        { status: "active", provider: "umbler", inboundWebhookChannelId: "umbler_1" },
        { status: "suspended", provider: "gupshup", inboundWebhookChannelId: "gupshup_1" },
      ] as never),
    ).toBe(2);
    // UAZAPI's instance row is the seat; no synthetic channel row is added.
    expect(
      countOccupiedSeats([
        { status: "reserved", provider: "uazapi", whatsappInstanceId: "instance_1" },
        { status: "active", provider: "umbler", inboundWebhookChannelId: "umbler_1" },
        { status: "released", provider: "gupshup", inboundWebhookChannelId: "old" },
      ] as never),
    ).toBe(2);
  });

  it("creates a R$60 two-seat draft and retains the trial as current through grace", async () => {
    const { service, transaction, getDraft, getTrial } = createHarness(2);
    const result = await service.processDueTrials(
      new Date("2026-08-25T12:00:00.000Z"),
    );

    expect(result).toMatchObject({ notices: 1, draftsCreated: 1 });
    expect(getDraft()).toMatchObject({
      contractStatus: "draft",
      isCurrent: false,
      includedWhatsappNumbersSnapshot: 2,
      monthlyPriceCentsSnapshot: 6000,
    });
    expect(getTrial()).toMatchObject({
      isCurrent: true,
      contractStatus: "grace_period",
      graceEndsAt: new Date("2026-08-28T12:00:00.000Z"),
    });
    expect(transaction.subscriptionPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          monthlyPriceCents: 6000,
          includedWhatsappNumbers: 2,
        }),
      }),
    );
  });

  it("ends a zero-seat trial as historical exempt without a paid draft", async () => {
    const { service, transaction, getDraft, getTrial } = createHarness(0);
    const result = await service.processDueTrials(
      new Date("2026-08-25T12:00:00.000Z"),
    );

    expect(result.trialsExpiredWithoutUsage).toBe(1);
    expect(getDraft()).toBeNull();
    expect(getTrial()).toMatchObject({
      contractStatus: "exempt",
      isCurrent: false,
    });
    expect(transaction.subscriptionPlan.upsert).not.toHaveBeenCalled();
  });

  it("honors opt-out and never creates a paid draft", async () => {
    const { service, transaction, getDraft, getTrial } = createHarness(2, true);
    const result = await service.processDueTrials(
      new Date("2026-08-25T12:00:00.000Z"),
    );

    expect(result.draftsCreated).toBe(0);
    expect(getDraft()).toBeNull();
    expect(getTrial().contractStatus).toBe("exempt");
    expect(transaction.whatsappSeat.count).not.toHaveBeenCalled();
  });

  it("does nothing while the feature flag is off", async () => {
    const { prisma, transaction } = createHarness(2);
    const service = new PackageTrialAutoconvertService(
      prisma as never,
      { isTrialAutoconvertEnabled: () => false } as never,
    );

    await expect(
      service.processDueTrials(new Date("2026-08-25T12:00:00.000Z")),
    ).resolves.toEqual({ notices: 0, draftsCreated: 0, trialsExpiredWithoutUsage: 0 });
    expect(transaction.whatsappSeat.count).not.toHaveBeenCalled();
  });

  it("is idempotent on a second job run", async () => {
    const { service, transaction } = createHarness(2);
    const now = new Date("2026-08-25T12:00:00.000Z");
    await service.processDueTrials(now);
    await service.processDueTrials(now);

    expect(transaction.workspaceSubscription.create).toHaveBeenCalledOnce();
    expect(transaction.billingContractAudit.create).toHaveBeenCalledTimes(3);
  });
});
