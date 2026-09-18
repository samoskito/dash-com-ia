import { describe, expect, it, vi } from "vitest";
import { WorkspacePackageAccessService } from "../src/billing/workspace-package-access.service";

function createHarness(options?: {
  contract?: {
    accessEndsAt: Date | null;
    graceEndsAt: Date | null;
    contractStatus:
      | "active"
      | "awaiting_payment"
      | "cancel_at_period_end"
      | "exempt"
      | "grace_period"
      | "legacy_protected"
      | "suspended";
  } | null;
  enforcementEnabled?: boolean;
  packageBillingEnabled?: boolean;
}) {
  const findFirst = vi
    .fn()
    .mockResolvedValue(
      options?.contract === undefined ? null : options.contract,
    );
  const prisma = {
    workspaceSubscription: {
      findFirst,
    },
  };
  const configuration = {
    isPackageBillingEnabled: vi
      .fn()
      .mockReturnValue(options?.packageBillingEnabled ?? true),
    isEnforcementEnabled: vi
      .fn()
      .mockReturnValue(options?.enforcementEnabled ?? true),
  };
  const service = new WorkspacePackageAccessService(
    prisma as never,
    configuration as never,
  );

  return { configuration, findFirst, service };
}

describe("WorkspacePackageAccessService", () => {
  it("keeps ordinary access open while enforcement is disabled", async () => {
    const { findFirst, service } = createHarness({
      enforcementEnabled: false,
    });

    await expect(
      service.getWorkspaceAccessState("workspace_1"),
    ).resolves.toEqual({
      enforcementEnabled: false,
      allowed: true,
      reason: "enforcement_disabled",
      contractStatus: null,
      accessEndsAt: null,
    });
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it.each([
    "active",
    "grace_period",
    "cancel_at_period_end",
    "exempt",
    "legacy_protected",
  ] as const)("allows a current %s contract", async (contractStatus) => {
    const { service } = createHarness({
      contract: {
        contractStatus,
        accessEndsAt: new Date("2026-08-30T12:00:00.000Z"),
        graceEndsAt:
          contractStatus === "grace_period"
            ? new Date("2026-08-30T12:00:00.000Z")
            : null,
      },
    });

    const result = await service.getWorkspaceAccessState(
      "workspace_1",
      new Date("2026-07-28T12:00:00.000Z"),
    );

    expect(result).toMatchObject({
      enforcementEnabled: true,
      allowed: true,
      reason: "active_contract",
      contractStatus,
    });
  });

  it("blocks a workspace without a current package contract", async () => {
    const { service } = createHarness({ contract: null });

    await expect(
      service.getWorkspaceAccessState("workspace_1"),
    ).resolves.toEqual({
      enforcementEnabled: true,
      allowed: false,
      reason: "missing_contract",
      contractStatus: null,
      accessEndsAt: null,
    });
  });

  it("blocks inactive contracts", async () => {
    const { service } = createHarness({
      contract: {
        contractStatus: "suspended",
        accessEndsAt: null,
        graceEndsAt: null,
      },
    });

    await expect(
      service.getWorkspaceAccessState("workspace_1"),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "contract_inactive",
      contractStatus: "suspended",
    });
  });

  it("blocks an otherwise allowed contract after access expires", async () => {
    const { service } = createHarness({
      contract: {
        contractStatus: "cancel_at_period_end",
        accessEndsAt: new Date("2026-07-28T11:59:59.000Z"),
        graceEndsAt: null,
      },
    });

    await expect(
      service.getWorkspaceAccessState(
        "workspace_1",
        new Date("2026-07-28T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "access_expired",
      contractStatus: "cancel_at_period_end",
    });
  });

  it("fails closed when grace has expired even if accessEndsAt is still current", async () => {
    const { service } = createHarness({
      contract: {
        contractStatus: "grace_period",
        graceEndsAt: new Date("2026-07-28T12:00:00.000Z"),
        accessEndsAt: new Date("2026-08-30T12:00:00.000Z"),
      },
    });

    await expect(
      service.getWorkspaceAccessState(
        "workspace_1",
        new Date("2026-07-28T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "access_expired",
      contractStatus: "grace_period",
    });
  });

  it("fails closed for expired grace even when the rollout gate is disabled", async () => {
    const { service } = createHarness({
      enforcementEnabled: false,
      contract: {
        contractStatus: "grace_period",
        graceEndsAt: new Date("2026-07-28T12:00:00.000Z"),
        accessEndsAt: new Date("2026-08-30T12:00:00.000Z"),
      },
    });

    await expect(
      service.getWorkspaceAccessState(
        "workspace_1",
        new Date("2026-07-28T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      enforcementEnabled: true,
      allowed: false,
      reason: "access_expired",
    });
  });
});
