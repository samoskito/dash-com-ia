import { describe, expect, it } from "vitest";
import {
  canDisableTrialAutoconvert,
  isTrialContract,
  selectTrialEligibleWorkspaces,
  trialBadge,
} from "../src/app/(backoffice)/backoffice/billing/trial-eligibility";

const NOW = new Date("2026-09-18T12:00:00.000Z");

function trial(overrides: Record<string, unknown> = {}) {
  return {
    status: "exempt" as const,
    trialEndsAt: "2026-10-18T12:00:00.000Z",
    trialDaysRemaining: 30,
    canAutoconvert: true,
    graceEndsAt: null,
    accessEndsAt: "2026-10-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("isTrialContract", () => {
  it("recognizes an exempt contract with a trial deadline", () => {
    expect(isTrialContract(trial())).toBe(true);
  });

  it("ignores exempt contracts without a trial deadline", () => {
    expect(isTrialContract(trial({ trialEndsAt: null }))).toBe(false);
  });

  it("ignores paid contracts even when a trial date leaked in", () => {
    expect(isTrialContract(trial({ status: "active" }))).toBe(false);
  });
});

describe("trialBadge", () => {
  it("counts the remaining days reported by the API", () => {
    expect(trialBadge(trial({ trialDaysRemaining: 7 }), NOW)).toEqual({
      label: "Trial · 7d",
      detail: "Ate 18/10/2026",
    });
  });

  it("derives the remaining days when the API omits them", () => {
    expect(
      trialBadge(
        trial({
          trialDaysRemaining: null,
          trialEndsAt: "2026-09-21T12:00:00.000Z",
        }),
        NOW,
      ),
    ).toEqual({ label: "Trial · 3d", detail: "Ate 21/09/2026" });
  });

  it("says the trial is over instead of showing zero days", () => {
    expect(
      trialBadge(
        trial({
          trialDaysRemaining: 0,
          trialEndsAt: "2026-09-10T12:00:00.000Z",
        }),
        NOW,
      ),
    ).toEqual({ label: "Trial · terminou", detail: "Em 10/09/2026" });
  });

  it("shows the tolerance deadline once the trial moved to grace", () => {
    expect(
      trialBadge(
        trial({
          status: "grace_period",
          trialDaysRemaining: 0,
          trialEndsAt: "2026-09-16T12:00:00.000Z",
          graceEndsAt: "2026-09-19T12:00:00.000Z",
        }),
        NOW,
      ),
    ).toEqual({
      label: "Trial · tolerancia",
      detail: "Acesso ate 19/09/2026",
    });
  });

  it("has nothing to show for a contract that never was a trial", () => {
    expect(trialBadge(trial({ trialEndsAt: null }), NOW)).toBeNull();
    expect(trialBadge(trial({ status: "active" }), NOW)).toBeNull();
  });
});

describe("canDisableTrialAutoconvert", () => {
  it("offers the opt-out while the trial can still convert", () => {
    expect(canDisableTrialAutoconvert(trial())).toBe(true);
  });

  it("hides the opt-out once it was already disabled", () => {
    expect(canDisableTrialAutoconvert(trial({ canAutoconvert: false }))).toBe(
      false,
    );
  });

  it("hides the opt-out for contracts that are not a running trial", () => {
    expect(canDisableTrialAutoconvert(trial({ status: "grace_period" }))).toBe(
      false,
    );
    expect(canDisableTrialAutoconvert(trial({ trialEndsAt: null }))).toBe(
      false,
    );
  });
});

describe("selectTrialEligibleWorkspaces", () => {
  const workspaces = [
    { id: "workspace_1", name: "Sem contrato" },
    { id: "workspace_2", name: "Com trial" },
    { id: "workspace_3", name: "Rascunho apenas" },
  ];

  it("keeps only workspaces without a live contract", () => {
    const eligible = selectTrialEligibleWorkspaces(workspaces, [
      {
        workspace: { id: "workspace_2" },
        contract: { id: "c_2", status: "exempt", isCurrent: true },
      },
      {
        workspace: { id: "workspace_3" },
        contract: { id: "c_3", status: "draft", isCurrent: false },
      },
    ]);

    expect(eligible.map((workspace) => workspace.id)).toEqual([
      "workspace_1",
      "workspace_3",
    ]);
  });

  it("falls back to the contract status when isCurrent is absent", () => {
    const eligible = selectTrialEligibleWorkspaces(workspaces, [
      {
        workspace: { id: "workspace_2" },
        contract: { id: "c_2", status: "active" },
      },
      {
        workspace: { id: "workspace_3" },
        contract: { id: "c_3", status: "awaiting_payment" },
      },
    ]);

    expect(eligible.map((workspace) => workspace.id)).toEqual([
      "workspace_1",
      "workspace_3",
    ]);
  });
});
