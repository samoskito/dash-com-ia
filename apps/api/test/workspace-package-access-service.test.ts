import { describe, expect, it, vi } from "vitest";
import { WorkspacePackageAccessService } from "../src/billing/workspace-package-access.service";

function createHarness(options?: {
  contract?: {
    accessEndsAt: Date | null;
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
  it("fails open without querying contracts while enforcement is disabled", async () => {
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
    expect(findFirst).not.toHaveBeenCalled();
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
});
