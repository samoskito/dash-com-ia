import type {
  WorkspacePackageSubscriptionDto,
  WorkspaceSubscriptionContractStatus,
} from "@wpptrack/shared";

export const DEFAULT_END_CONTRACT_REASON = "encerrar contrato antigo";

/**
 * `canCancel` and `isCurrent` are not exposed by the backoffice contract DTO
 * yet. They are declared optional here so that the day the API starts sending
 * them this module switches to the authoritative value without a refactor:
 * `canCancel` short-circuits everything, `isCurrent` replaces the positional
 * guess made by `resolveCurrentContractIds`.
 */
type EndableContract = Pick<WorkspacePackageSubscriptionDto, "id" | "status"> & {
  canCancel?: boolean;
  isCurrent?: boolean;
};

type EndableEntry = {
  workspace: { id: string };
  contract: EndableContract;
};

const STALE_BEFORE_PAYMENT: WorkspaceSubscriptionContractStatus[] = [
  "draft",
  "awaiting_payment",
];

const PLATFORM_MANAGED: WorkspaceSubscriptionContractStatus[] = [
  "exempt",
  "legacy_protected",
];

export function contractConsumesCapacity(
  status: WorkspaceSubscriptionContractStatus,
): boolean {
  return !["draft", "awaiting_payment", "canceled"].includes(status);
}

/**
 * The row that is actually holding the workspace capacity today. The API sends
 * contracts newest first, so without `isCurrent` the first capacity-consuming
 * row of a workspace is the live one and every older sibling is clutter.
 */
function resolveCurrentContractIds(entries: EndableEntry[]): Map<string, string> {
  const current = new Map<string, string>();
  const flaggedByApi = new Set<string>();

  for (const { workspace, contract } of entries) {
    if (contract.isCurrent === true) {
      if (!flaggedByApi.has(workspace.id)) {
        current.set(workspace.id, contract.id);
        flaggedByApi.add(workspace.id);
      }
      continue;
    }

    if (
      !flaggedByApi.has(workspace.id) &&
      !current.has(workspace.id) &&
      contractConsumesCapacity(contract.status)
    ) {
      current.set(workspace.id, contract.id);
    }
  }

  return current;
}

/**
 * Contracts that may be ended from the backoffice table: drafts and contracts
 * still awaiting their first payment, plus platform-managed contracts (isento
 * and legado protegido) that lost the capacity row to a newer contract. The
 * live contract of a workspace is never endable, and neither is an already
 * canceled one.
 */
export function selectEndableContractIds(entries: EndableEntry[]): Set<string> {
  const endable = new Set<string>();
  const currentByWorkspace = resolveCurrentContractIds(entries);

  for (const { workspace, contract } of entries) {
    if (typeof contract.canCancel === "boolean") {
      if (contract.canCancel) {
        endable.add(contract.id);
      }
      continue;
    }

    if (STALE_BEFORE_PAYMENT.includes(contract.status)) {
      endable.add(contract.id);
      continue;
    }

    if (
      PLATFORM_MANAGED.includes(contract.status) &&
      currentByWorkspace.get(workspace.id) !== contract.id
    ) {
      endable.add(contract.id);
    }
  }

  return endable;
}
