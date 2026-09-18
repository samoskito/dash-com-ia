import type { WorkspaceSubscriptionContractStatus } from "@wpptrack/shared";
import { contractConsumesCapacity } from "./end-contract-eligibility";

export const DEFAULT_DISABLE_AUTOCONVERT_REASON =
  "cliente pediu para nao cobrar apos o trial";

const DAY_IN_MS = 86_400_000;

/**
 * Trial fields arrive on the contract DTO (`trialEndsAt`, `canAutoconvert`,
 * `trialDaysRemaining`). They are optional here so an older API response that
 * omits them simply renders no trial affordance instead of crashing the table.
 */
export type TrialAwareContract = {
  status: WorkspaceSubscriptionContractStatus;
  trialEndsAt?: string | null;
  trialDaysRemaining?: number | null;
  canAutoconvert?: boolean;
  graceEndsAt?: string | null;
  accessEndsAt?: string | null;
};

export type TrialBadge = {
  label: string;
  detail: string;
};

/** A trial is an exempt contract carrying a trial deadline. */
export function isTrialContract(contract: TrialAwareContract): boolean {
  return contract.status === "exempt" && Boolean(contract.trialEndsAt);
}

/** The same trial after the conversion job moved it into the grace window. */
function isTrialInGrace(contract: TrialAwareContract): boolean {
  return contract.status === "grace_period" && Boolean(contract.trialEndsAt);
}

export function trialBadge(
  contract: TrialAwareContract,
  now: Date = new Date(),
): TrialBadge | null {
  if (isTrialInGrace(contract)) {
    return {
      label: "Trial · tolerancia",
      detail: `Acesso ate ${dateLabel(
        contract.graceEndsAt ?? contract.accessEndsAt,
      )}`,
    };
  }

  if (!isTrialContract(contract)) {
    return null;
  }

  const days = remainingDays(contract, now);

  if (days === null) {
    return { label: "Trial", detail: `Ate ${dateLabel(contract.trialEndsAt)}` };
  }

  return days > 0
    ? {
        label: `Trial · ${days}d`,
        detail: `Ate ${dateLabel(contract.trialEndsAt)}`,
      }
    : {
        label: "Trial · terminou",
        detail: `Em ${dateLabel(contract.trialEndsAt)}`,
      };
}

/**
 * The opt-out only exists while the trial is still running and the API says it
 * would convert into a paid draft. `canAutoconvert` already turns false once the
 * opt-out was applied, so the button never shows twice.
 */
export function canDisableTrialAutoconvert(
  contract: TrialAwareContract,
): boolean {
  return isTrialContract(contract) && contract.canAutoconvert === true;
}

type TrialEligibleWorkspace = {
  id: string;
  name: string;
};

type WorkspaceContractEntry = {
  workspace: { id: string };
  contract: { status: WorkspaceSubscriptionContractStatus; isCurrent?: boolean };
};

/**
 * The API refuses a trial for a workspace that already has a live contract, so
 * the form only offers the workspaces where the operation can succeed.
 */
export function selectTrialEligibleWorkspaces<
  T extends TrialEligibleWorkspace,
>(workspaces: T[], entries: WorkspaceContractEntry[]): T[] {
  const withLiveContract = new Set<string>();

  for (const { workspace, contract } of entries) {
    const isLive =
      typeof contract.isCurrent === "boolean"
        ? contract.isCurrent
        : contractConsumesCapacity(contract.status);

    if (isLive) {
      withLiveContract.add(workspace.id);
    }
  }

  return workspaces.filter((workspace) => !withLiveContract.has(workspace.id));
}

function remainingDays(
  contract: TrialAwareContract,
  now: Date,
): number | null {
  if (typeof contract.trialDaysRemaining === "number") {
    return Math.max(0, contract.trialDaysRemaining);
  }

  if (!contract.trialEndsAt) {
    return null;
  }

  const endsAt = new Date(contract.trialEndsAt).getTime();
  if (Number.isNaN(endsAt)) {
    return null;
  }

  return Math.max(0, Math.ceil((endsAt - now.getTime()) / DAY_IN_MS));
}

function dateLabel(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "data indefinida";
}
